/**
 * The live auction, as presentation around the math server's raises.
 *
 * The player's raises are the only real bets. Each one is settled by the server (see
 * src/math): OUTBID → a rival tops it, the bid comes back, and the player may raise again to
 * the amount the server names; WON → the rivals fold and the locker is the player's.
 * The rivals, their counter-bids, the chant and the "going once, going twice" are theatre
 * arranged around those results; nothing here decides an outcome.
 *
 * Time advances with update(dt) from the render loop; everything observable is an event.
 * Amounts are minor units (cents).
 */
import type { RNG } from '../core/rng';
import type { Bot } from './bots';
import type { RaiseResult } from '../math/types';
import { BUY_NOW, bidType } from '../math/types';

export type Bidder = 'player' | string;

export type RaiseEvent =
  | { type: 'open'; chip: number; text: string }
  | { type: 'bid'; who: Bidder; amount: number; jump: boolean; line: string }
  | { type: 'chant'; text: string }
  | { type: 'going'; count: 1 | 2; text: string }
  | { type: 'drop'; who: string; line: string }
  | { type: 'sold'; who: Bidder | null; amount: number; text: string };

/**
 * opening: waiting for the player to open (or pass); pending: a bet is with the server;
 * outbid: a rival topped the player, who may raise to `ask`; winning: the rivals are folding;
 * sold: over.
 */
export type RaisePhase = 'idle' | 'opening' | 'pending' | 'outbid' | 'winning' | 'sold';

export interface RaiseConfig {
  bots: Bot[];
  rng: RNG;
  /** Formats minor units for the auctioneer's lines. */
  money: (minor: number) => string;
}

const CHANTS = [
  "I got {price} here, do I hear {ask}? {ask}, {ask}, anybody {ask}?",
  "{price} bid now {ask}, now {ask}, would ya give me {ask}?",
  "I'm at {price}, looking for {ask}, {ask} now, {ask} bid, who's got {ask}?",
  "{price}! {price}! Gimme {ask}, {ask}, {ask} anywhere?",
  "{price} on the money, {ask} to take it, {ask}, {ask}, who'll go {ask}?",
];
const HUNT = [
  "Who'll start me at {ask}? {ask} to open, {ask}, anybody {ask}?",
  "Somebody open it up, {ask}, {ask} gets it going!",
  "Come on folks, {ask} to start, it's a steal at {ask}!",
];

/** Timings (seconds). */
const OPEN_GOING = [7, 9.5, 12] as const; // waiting for an opener: going once, twice, a rival takes it
const OUTBID_GOING = [3.4, 5.1, 6.8] as const; // after a rival tops the player
const WIN_GOING = [0.9, 1.8, 2.7] as const; // rivals fold after the server says WON
const COUNTER_DELAY: [number, number] = [0.7, 1.5]; // a rival's counter lands this long after the player's bid

export class RaiseAuction {
  phase: RaisePhase = 'idle';
  /** Price on the board, minor units. */
  price = 0;
  high: Bidder | null = null;
  /** What the player's next action costs: the opener during opening, the next raise after an outbid. */
  ask = 0;
  askType = bidType(1);
  /** Opening chip of this auction (set when the player opens). */
  opener = 0;
  /** Raises the player has placed (0 = never bid). */
  playerBids = 0;
  /** Rivals that have counter-bid, and who has folded (presentation only). */
  readonly dropped = new Set<string>();
  private readonly rng: RNG;
  private readonly bots: Bot[];
  private readonly money: (m: number) => string;
  private events: RaiseEvent[] = [];
  private t = 0;
  private sinceBid = 0;
  private going: 0 | 1 | 2 = 0;
  private nextChantAt = 0;
  private lastRival: string | null = null;
  /** A settled result waiting for its moment on stage. */
  private staged: { at: number; run: () => void } | null = null;
  private bidAt = 0;
  /** The player walked away (or passed): the crowd wraps it up faster. */
  walked = false;

  constructor(cfg: RaiseConfig) {
    this.rng = cfg.rng; this.bots = cfg.bots; this.money = cfg.money;
  }

  get goingCount(): 0 | 1 | 2 { return this.going; }
  get canAct(): boolean { return this.phase === 'opening' || this.phase === 'outbid'; }
  get activeBots(): Bot[] { return this.bots.filter((b) => !this.dropped.has(b.id)); }

  drain(): RaiseEvent[] { const e = this.events; this.events = []; return e; }
  private emit(e: RaiseEvent): void { this.events.push(e); }
  private fill(s: string): string { return s.replaceAll('{price}', this.money(this.price)).replaceAll('{ask}', this.money(this.ask)); }

  /** Open the floor with `chip` as the suggested opening bid. */
  start(chip: number): void {
    this.phase = 'opening';
    this.ask = chip; this.askType = bidType(1);
    this.t = 0; this.sinceBid = 0; this.going = 0;
    this.emit({ type: 'open', chip, text: this.fill("Alright folks, here we go! Who'll open it at {ask}? {ask}, {ask} bid, who's got {ask}?") });
    this.nextChantAt = 3;
  }

  /** The player changed the opening chip before opening. */
  setOpeningChip(chip: number): void { if (this.phase === 'opening') this.ask = chip; }

  /** The player raises (or opens) at `ask`. Returns the bet to place, or null if not allowed now. */
  playerRaise(): { amount: number; betType: string } | null {
    if (!this.canAct) return null;
    const amount = this.ask, betType = this.askType;
    if (this.playerBids === 0) this.opener = amount;
    this.playerBids++;
    this.phase = 'pending';
    this.price = amount; this.high = 'player';
    this.going = 0; this.sinceBid = 0; this.bidAt = this.t;
    this.emit({ type: 'bid', who: 'player', amount, jump: false, line: '' });
    return { amount, betType };
  }

  /** The player buys the locker outright before the bidding opens. */
  playerBuyNow(price: number): { amount: number; betType: string } | null {
    if (this.phase !== 'opening') return null;
    this.phase = 'pending';
    this.playerBids++;
    this.price = price; this.high = 'player'; this.going = 0; this.sinceBid = 0; this.bidAt = this.t;
    return { amount: price, betType: BUY_NOW };
  }

  /** The server rejected or failed the bet: nothing happened, back to where we were. */
  failed(): void {
    if (this.phase !== 'pending') return;
    this.playerBids = Math.max(0, this.playerBids - 1);
    if (this.playerBids === 0) { this.phase = 'opening'; this.price = 0; this.high = null; }
    else { this.phase = 'outbid'; this.high = this.lastRival; }
    this.sinceBid = 0; this.going = 0;
  }

  /** A rival's counter, strictly between the player's bid and the next raise the server offers. */
  counterBid(bid: number, next: number): number {
    const half = (next - bid) / 2;
    const unit = half >= 2000 ? 500 : half >= 500 ? 100 : 50;
    const c = bid + Math.max(unit, Math.round(half / unit) * unit);
    return Math.min(next - 1, Math.max(bid + 1, c));
  }

  private pickRival(): Bot {
    const pool = this.activeBots.length ? this.activeBots : this.bots;
    const others = pool.filter((b) => b.id !== this.lastRival);
    return this.rng.weighted(others.length ? others : pool, (b) => 0.3 + b.aggression);
  }

  /** Stage the server's answer to the player's bet. */
  settle(r: RaiseResult): void {
    if (this.phase !== 'pending') return;
    const at = Math.max(this.t, this.bidAt + this.rng.range(COUNTER_DELAY[0], COUNTER_DELAY[1]));
    if (r.outcome === 'OUTBID') {
      this.staged = {
        at, run: () => {
          const rival = this.pickRival();
          this.lastRival = rival.id;
          const next = r.next;
          const counter = next ? this.counterBid(r.bet, next.bid) : r.bet + Math.max(50, this.opener);
          this.price = counter; this.high = rival.id;
          this.sinceBid = 0; this.going = 0; this.nextChantAt = this.t + 1.1;
          if (next) { this.ask = next.bid; this.askType = next.betType; this.phase = 'outbid'; }
          // now and then a rival who has been quiet gives up as the price climbs
          const quiet = this.activeBots.filter((b) => b.id !== rival.id);
          if (quiet.length > 1 && this.rng.chance(0.25)) { const d = this.rng.pick(quiet); this.dropped.add(d.id); this.emit({ type: 'drop', who: d.id, line: this.rng.pick(d.dropLines) }); }
          this.emit({ type: 'bid', who: rival.id, amount: counter, jump: false, line: this.rng.chance(0.5) ? this.rng.pick(rival.bidLines) : this.money(counter) + '!' });
          if (!next) this.sell(rival.id); // the server offered no further raise: the rival keeps it
        },
      };
    } else {
      // WON / BOUGHT: the rivals look at each other and fold
      this.staged = {
        at: r.outcome === 'BOUGHT' ? this.t : at, run: () => {
          this.phase = 'winning';
          this.sinceBid = 0; this.going = 0;
          if (r.outcome === 'BOUGHT') { this.sell('player'); return; }
          const folders = this.rng.shuffle([...this.activeBots]).slice(0, this.rng.int(1, 2));
          for (const b of folders) { this.dropped.add(b.id); this.emit({ type: 'drop', who: b.id, line: this.rng.pick(b.dropLines) }); }
        },
      };
    }
  }

  /** The player walks away (or lets the clock run out). A rival keeps the locker. */
  playerWalk(): void {
    if (this.phase === 'opening' || this.phase === 'outbid') { this.walked = true; if (this.going === 0) this.sinceBid = Math.max(this.sinceBid, this.goingAt()[0] - 0.4); }
  }

  private goingAt(): readonly [number, number, number] {
    return this.phase === 'opening' ? OPEN_GOING : this.phase === 'winning' ? WIN_GOING : OUTBID_GOING;
  }

  private sell(who: Bidder): void {
    this.phase = 'sold';
    const name = who === 'player' ? 'the new face up front' : this.bots.find((b) => b.id === who)?.look ?? 'the crowd';
    this.emit({ type: 'sold', who, amount: this.price, text: `SOLD! To ${name} for ${this.money(this.price)}!` });
  }

  update(dtRaw: number): void {
    if (this.phase === 'idle' || this.phase === 'sold') return;
    const dt = dtRaw * (this.walked ? 2.2 : 1);
    this.t += dt; this.sinceBid += dt;
    if (this.staged && this.t >= this.staged.at) { const s = this.staged; this.staged = null; s.run(); return; }
    if (this.phase === 'pending') {
      if (this.t >= this.nextChantAt) { this.emit({ type: 'chant', text: this.fill("I got {price} from the new face, {price}, who'll go higher?") }); this.nextChantAt = this.t + 1.6; }
      return;
    }
    if (this.t >= this.nextChantAt && this.going === 0 && this.phase !== 'winning') {
      this.emit({ type: 'chant', text: this.fill(this.rng.pick(this.phase === 'opening' ? HUNT : CHANTS)) });
      this.nextChantAt = this.t + this.rng.range(1.6, 2.4);
    }
    const [g1, g2, g3] = this.goingAt();
    if (this.sinceBid >= g1 && this.going === 0) {
      this.going = 1;
      const text = this.phase === 'opening' ? `${this.money(this.ask)} to open, going once…` : this.phase === 'winning' ? `${this.money(this.price)} going once…` : `${this.money(this.price)} going once, do I hear ${this.money(this.ask)}?`;
      this.emit({ type: 'going', count: 1, text });
    } else if (this.sinceBid >= g2 && this.going === 1) {
      this.going = 2;
      this.emit({ type: 'going', count: 2, text: this.phase === 'winning' ? 'Going twice…' : `Going twice, one more time, ${this.money(this.ask)} anybody?` });
    } else if (this.sinceBid >= g3 && this.going === 2) {
      if (this.phase === 'winning') { this.sell('player'); return; }
      if (this.phase === 'opening') {
        // nobody opened from the floor: a rival takes it for the opener
        const rival = this.pickRival();
        this.price = this.ask; this.high = rival.id;
        this.emit({ type: 'bid', who: rival.id, amount: this.price, jump: false, line: this.rng.pick(rival.bidLines) });
        this.sell(rival.id);
        return;
      }
      this.sell(this.high ?? this.pickRival().id);
    }
  }
}
