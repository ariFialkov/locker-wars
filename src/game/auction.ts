/**
 * Quick-fire auction state machine. Time is advanced with update(dt) so the
 * render loop drives it; everything observable is emitted as events.
 *
 * Rival limits are derived from the locker's *apparent* value (what a buyer
 * would guess from the door), never from the RTP outcome — see economy.ts.
 */
import type { RNG } from '../core/rng';
import { increment, snap, snapDown, fmt } from '../core/money';
import type { Bot } from './bots';

export type Bidder = 'player' | string;

export interface RivalState {
  bot: Bot;
  limit: number;
  dropped: boolean;
  bids: number;
}

export type AuctionEvent =
  | { type: 'open'; ask: number; text: string }
  | { type: 'bid'; who: Bidder; amount: number; jump: boolean; line: string }
  | { type: 'chant'; text: string }
  | { type: 'going'; count: 1 | 2; text: string }
  | { type: 'drop'; who: string; line: string }
  | { type: 'sold'; who: Bidder | null; amount: number; text: string };

export type AuctionPhase = 'idle' | 'opening' | 'live' | 'sold';

export interface AuctionConfig {
  apparentValue: number;
  bots: Bot[];
  rng: RNG;
  playerBalance: () => number;
}

const CHANTS = [
  "I've got {price}, now {ask}, who'll give me {ask}?",
  '{ask}! {ask}! Do I hear {ask}?',
  '{price} bid, looking for {ask}, {ask} anywhere?',
  "Who'll go {ask}? {ask} now, {ask}!",
  '{price} going, {ask} to beat it, {ask}?',
  "Don't be shy, {ask}! {ask} folks!",
];

export class Auction {
  phase: AuctionPhase = 'idle';
  price = 0;
  high: Bidder | null = null;
  rivals: RivalState[] = [];
  reserve = 0;
  opening = 0;
  playerFolded = false;
  playerBids = 0;
  private t = 0;
  private sinceBid = 0;
  private nextBotAt = Infinity;
  private nextBot: RivalState | null = null;
  private nextChantAt = 0;
  private goingStage = 0;
  private events: AuctionEvent[] = [];
  private rng: RNG;
  private playerBalance: () => number;
  /** speed multiplier once the player folds so the crowd wraps up fast */
  timeScale = 1;

  constructor(cfg: AuctionConfig) {
    this.rng = cfg.rng;
    this.playerBalance = cfg.playerBalance;
    const r = this.rng;
    // Rival ceiling (top bot's limit). Loosely tied to what the locker LOOKS like.
    const f = Math.min(1.9, Math.max(0.18, r.lognormal(0.62, 0.42)));
    this.reserve = snap(Math.max(30, cfg.apparentValue * f));
    this.opening = snapDown(Math.max(increment(0), Math.min(this.reserve * 0.5, cfg.apparentValue * r.range(0.15, 0.3))));
    if (this.opening >= this.reserve) this.opening = snapDown(this.reserve * 0.5);
    const leaderIdx = r.weighted(cfg.bots.map((_, i) => i), (i) => 0.4 + cfg.bots[i].aggression);
    this.rivals = cfg.bots.map((bot, i) => {
      const limit = i === leaderIdx ? this.reserve : Math.max(this.opening, snapDown(this.reserve * r.range(0.45, 0.93)));
      return { bot, limit, dropped: false, bids: 0 };
    });
  }

  get ask(): number { return this.price === 0 ? this.opening : this.price + increment(this.price); }
  get playerCanBid(): boolean { return this.phase !== 'sold' && this.phase !== 'idle' && !this.playerFolded && this.high !== 'player' && this.playerBalance() >= this.ask; }
  get activeRivals(): RivalState[] { return this.rivals.filter((x) => !x.dropped); }
  /** Highest amount a rival would still pay (for the post-round "you could have had it for" stat). */
  get topRivalLimit(): number { return Math.max(...this.rivals.map((x) => x.limit)); }

  start(): void {
    this.phase = 'opening';
    this.t = 0; this.sinceBid = 0;
    this.emit({ type: 'open', ask: this.opening, text: `Alright folks, who'll start me at ${fmt(this.opening)}? ${fmt(this.opening)} to open!` });
    this.scheduleBot(0.9, 2.2);
    this.nextChantAt = 2.4;
  }

  drain(): AuctionEvent[] { const e = this.events; this.events = []; return e; }
  private emit(e: AuctionEvent) { this.events.push(e); }

  /** Player places a bid at `amount` (must be >= ask). */
  playerBid(amount: number): boolean {
    if (!this.playerCanBid || amount < this.ask || amount > this.playerBalance()) return false;
    const jump = amount > this.ask;
    this.playerBids++;
    this.placeBid('player', snap(amount), jump, '');
    return true;
  }

  playerFold(): void {
    if (this.phase === 'sold') return;
    this.playerFolded = true;
    this.timeScale = 2.2;
  }

  private placeBid(who: Bidder, amount: number, jump: boolean, line: string) {
    this.price = amount;
    this.high = who;
    this.sinceBid = 0;
    this.goingStage = 0;
    this.phase = 'live';
    this.emit({ type: 'bid', who, amount, jump, line });
    // rivals above their limit drop out (announce the first time)
    for (const rv of this.rivals) {
      if (!rv.dropped && rv.limit < this.ask && rv.bot.id !== who) {
        rv.dropped = true;
        if (rv.bids > 0 || this.rng.chance(0.4)) this.emit({ type: 'drop', who: rv.bot.id, line: this.rng.pick(rv.bot.dropLines) });
      }
    }
    this.scheduleBot(0.45, 1.5);
    this.nextChantAt = this.t + 1.1;
  }

  private scheduleBot(minDelay: number, maxDelay: number) {
    const candidates = this.activeRivals.filter((rv) => rv.limit >= this.ask && rv.bot.id !== this.high);
    if (candidates.length === 0) { this.nextBot = null; this.nextBotAt = Infinity; return; }
    // If only bots are in it and the price is already high, they slow down and sometimes let it go.
    const rv = this.rng.weighted(candidates, (c) => 0.2 + c.bot.aggression * (c.bot.id === 'rick' && this.price < this.reserve * 0.5 ? 0.3 : 1));
    const nearLimit = this.ask > rv.limit * 0.8;
    const base = this.rng.range(minDelay, maxDelay) * (0.5 + rv.bot.patience * 1.0) * (nearLimit ? 1.8 : this.ask < rv.limit * 0.5 ? 0.7 : 1);
    // Bot-vs-bot skirmishes: chance they simply don't respond when the player is out of it.
    const playerInIt = !this.playerFolded && this.playerBalance() >= this.ask;
    const hesitate = this.high !== 'player' && this.high !== null && (nearLimit || !playerInIt) && this.rng.chance(0.35);
    this.nextBot = rv;
    this.nextBotAt = this.t + base + (hesitate ? this.rng.range(2.5, 5.5) : 0);
  }

  update(dtRaw: number): void {
    if (this.phase === 'idle' || this.phase === 'sold') return;
    const dt = dtRaw * this.timeScale;
    this.t += dt;
    this.sinceBid += dt;

    if (this.nextBot && this.t >= this.nextBotAt) {
      const rv = this.nextBot;
      this.nextBot = null;
      if (!rv.dropped && rv.limit >= this.ask && this.high !== rv.bot.id) {
        let amount = this.ask;
        let jump = false;
        // Far below their ceiling, rivals push the price along in chunks; near it they creep.
        const headroom = rv.limit / Math.max(1, this.ask);
        const pJump = headroom > 2 ? 0.55 + rv.bot.jumpy * 0.4 : headroom > 1.4 ? 0.25 + rv.bot.jumpy * 0.4 : rv.bot.jumpy * 0.3;
        if (this.rng.chance(pJump)) {
          const steps = headroom > 2 ? this.rng.int(2, 3) : this.rng.int(1, 2);
          let a = amount;
          for (let i = 0; i < steps; i++) a += increment(a);
          if (a <= rv.limit) { amount = a; jump = true; }
        }
        rv.bids++;
        const line = this.rng.chance(0.5) ? this.rng.pick(rv.bot.bidLines) : fmt(amount) + '!';
        this.placeBid(rv.bot.id, amount, jump, line);
        return;
      }
      this.scheduleBot(0.4, 1.4);
    }

    // Auctioneer patter while waiting.
    if (this.t >= this.nextChantAt && this.goingStage === 0 && this.sinceBid < 3.2) {
      const text = this.rng.pick(CHANTS).replaceAll('{price}', fmt(this.price || this.opening)).replaceAll('{ask}', fmt(this.ask));
      this.emit({ type: 'chant', text });
      this.nextChantAt = this.t + this.rng.range(1.2, 1.9);
    }

    // Nobody bidding? Count it down.
    const g1 = 3.4, g2 = g1 + 1.7, g3 = g2 + 1.7;
    if (this.phase === 'opening') {
      // Opening never sells with no bids: the auctioneer just keeps hunting and a rival eventually opens.
      if (this.sinceBid > 6 && !this.nextBot) this.scheduleBot(0.2, 0.8);
      return;
    }
    if (this.sinceBid >= g1 && this.goingStage === 0) {
      this.goingStage = 1;
      this.emit({ type: 'going', count: 1, text: `${fmt(this.price)} going once...` });
    } else if (this.sinceBid >= g2 && this.goingStage === 1) {
      this.goingStage = 2;
      this.emit({ type: 'going', count: 2, text: `${fmt(this.price)} going twice...` });
    } else if (this.sinceBid >= g3 && this.goingStage === 2) {
      this.phase = 'sold';
      this.emit({ type: 'sold', who: this.high, amount: this.price, text: `SOLD! ${fmt(this.price)}!` });
    }
  }
}
