/**
 * Round orchestrator: arrival → lock cut → door up → inspection → auction →
 * sold → count-up → result → door down → next locker.
 */
import * as THREE from 'three';
import { GameScene, type Quality } from '../render/scene';
import { RollupDoor } from '../render/door';
import { Crowd } from '../render/crowd';
import { CameraRig } from '../render/cameraRig';
import { FX } from '../render/fx';
import { LockerContents } from '../render/contents';
import { Labels } from '../ui/labels';
import { HUD } from '../ui/hud';
import { makeRNG, hashString, type RNG } from '../core/rng';
import { drawOutcome, payoutTarget, type Outcome } from '../core/economy';
import { fmt, increment, snap } from '../core/money';
import { tickTweens, tween, wait, clock, cancelAllTweens, easeOut, linear } from '../core/tween';
import { loadStats, saveStats, resetStats, pushRound, BAILOUT_AMOUNT, type Stats } from '../core/stats';
import { generateLocker, resolveLocker, type Locker, type Resolution, type Appraisal } from './lockerGen';
import { Auction, type AuctionEvent } from './auction';
import { BOTS, BOT_BY_ID, type Bot } from './bots';
import { sfx } from '../audio/sfx';
import { voice } from '../audio/voice';

type Phase = 'idle' | 'arrive' | 'inspect' | 'auction' | 'sold' | 'count' | 'result';
const INSPECT_SECONDS = 15;

export class Game {
  readonly gs: GameScene;
  readonly door: RollupDoor;
  readonly crowd: Crowd;
  readonly rig: CameraRig;
  readonly fx: FX;
  readonly labels: Labels;
  readonly hud = new HUD();
  stats: Stats;
  phase: Phase = 'idle';
  private locker: Locker | null = null;
  private contents: LockerContents | null = null;
  private auction: Auction | null = null;
  private bots: Bot[] = [];
  private outcome: Outcome | null = null;
  private roundRng: RNG = makeRNG(0);
  private inspectLeft = 0;
  private nameTags = new Map<string, HTMLElement>();
  private lastHudSync = 0;
  private going: 0 | 1 | 2 = 0;
  private t = 0;
  private focus = new THREE.Vector3(0, 1.2, 0);

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.stats = loadStats();
    const url = new URL(location.href);
    const seedParam = url.searchParams.get('seed');
    if (seedParam && seedParam !== this.stats.sessionSeed) { this.stats.sessionSeed = seedParam; this.stats.round = 0; }
    this.gs = new GameScene(canvas, quality);
    this.door = new RollupDoor(this.gs.scene);
    this.crowd = new Crowd(this.gs.scene);
    this.rig = new CameraRig(this.gs.camera, canvas);
    this.fx = new FX(this.gs.scene);
    this.labels = new Labels(this.gs.camera);
    sfx.setEnabled(this.stats.settings.sound);
    voice.setEnabled(this.stats.settings.voice && this.stats.settings.sound);
    this.hud.setSound(this.stats.settings.sound);
    this.hud.setBalance(this.stats.balance, false);
    this.wireHud();
    this.rig.home(true);
    this.rig.lock();
    this.hud.showIntro(this.stats, BOTS);
    requestAnimationFrame(this.loop);
  }

  private wireHud(): void {
    const H = this.hud;
    H.onStart = () => { sfx.unlock(); this.startRound(); };
    H.onFlashlight = () => { sfx.click(); this.gs.setFlashlight(!this.gs.flashlightOn); H.setFlashlight(this.gs.flashlightOn); };
    H.onReady = () => { if (this.phase === 'inspect') this.inspectLeft = 0; };
    H.onBid = (amount) => this.playerBid(amount);
    H.onPass = () => { if (this.auction && this.phase === 'auction') { sfx.click(); this.auction.playerFold(); H.toast('You passed. Watching the crowd finish it…'); this.syncAuctionHud(); } };
    H.onFastForward = () => { clock.scale = clock.scale > 1 ? 1 : 4; H.toast(clock.scale > 1 ? 'Fast-forward ×4' : 'Normal speed', 900); };
    H.onNext = () => this.nextRound();
    H.onBailout = () => { this.stats.balance += BAILOUT_AMOUNT; this.stats.bailouts++; this.hud.setBalance(this.stats.balance); saveStats(this.stats); this.nextRound(); };
    H.onToggleSound = () => { this.stats.settings.sound = !this.stats.settings.sound; sfx.unlock(); sfx.setEnabled(this.stats.settings.sound); voice.setEnabled(this.stats.settings.sound && this.stats.settings.voice); saveStats(this.stats); return this.stats.settings.sound; };
    H.onToggleVoice = () => { this.stats.settings.voice = !this.stats.settings.voice; voice.setEnabled(this.stats.settings.voice && this.stats.settings.sound); saveStats(this.stats); return this.stats.settings.voice; };
    H.onOpenStats = () => this.stats;
    H.onReset = () => { this.stats = resetStats(); this.hud.setBalance(this.stats.balance, false); location.reload(); };
  }

  /* ------------------------------------------------------------ */
  /*                            round flow                          */
  /* ------------------------------------------------------------ */

  private async startRound(): Promise<void> {
    this.stats.round++;
    saveStats(this.stats);
    const n = this.stats.round;
    this.roundRng = makeRNG(`${this.stats.sessionSeed}#${n}:round`);
    this.locker = generateLocker(this.stats.sessionSeed, n);
    this.contents?.dispose();
    this.contents = new LockerContents(this.gs.scene, this.locker);
    this.bots = this.roundRng.fork('bots').shuffle([...BOTS]).slice(0, 4);
    // The whole round's fate, decided before anyone sees anything. (See economy.ts.)
    this.outcome = drawOutcome(this.roundRng.fork('outcome'));
    this.crowd.setRivals(this.bots);
    this.labels.clear(); this.nameTags.clear();
    for (const b of this.bots) {
      const f = this.crowd.rivals.get(b.id)!;
      this.nameTags.set(b.id, this.labels.add((o) => f.labelAnchor(o), `<span class="tag">${b.short}</span>`));
    }
    this.labels.add((o) => this.crowd.auctioneer.labelAnchor(o), '<span class="tag">Auctioneer</span>');
    this.door.resetLock(); this.door.setOpen(0);
    this.gs.setFlashlight(false); this.hud.setFlashlight(false);
    this.hud.setLocker(n, this.locker.theme.name, this.locker.theme.blurb);
    this.hud.setRivals(this.bots);
    this.hud.showPanel(null);
    this.hud.hideAuctioneer();
    this.rig.home(); this.rig.lock();
    this.phase = 'arrive';
    this.hud.showBanner(`Locker #${n}`, this.locker.theme.name);
    this.bubbleAuctioneer(n === 1 ? 'Welcome, folks! Fresh unit, no idea what\'s inside. Cut it!' : this.roundRng.pick(['Next unit! Cut it open.', 'Alright, alright, next one. Cut the lock!', 'Here we go again, folks. Open her up!', 'This one\'s been sealed for years. Cut it!']), 2.6);
    await wait(0.8);
    this.hud.showBanner('Cutting the lock', this.locker.theme.blurb);
    await this.door.cutLock(() => { this.fx.sparksAt(this.door.lockPos); });
    this.hud.showBanner('Door\'s going up…', '');
    const dustP = new THREE.Vector3(0, 0.2, 0.2);
    const dust = tween(2.2, (k) => { if (Math.random() < 0.3) this.fx.dustAt(dustP.set((Math.random() - 0.5) * 3, 0.1 + k * 1.5, 0.1), 3); }, linear);
    await this.door.open();
    await dust;
    this.beginInspection();
  }

  private beginInspection(): void {
    this.phase = 'inspect';
    this.inspectLeft = INSPECT_SECONDS;
    this.rig.home();
    this.hud.showPanel('inspect');
    this.hud.showBanner('Take a look', `${INSPECT_SECONDS}s · no stepping inside`, 1);
    this.bubbleAuctioneer(this.roundRng.pick(['Look but don\'t touch! Thirty seconds.', 'Eyes only, folks. No crossing the line!', 'Get your look in, no touching!']), 2.4);
    sfx.murmurOn();
    // crowd leans in and mutters
    for (const [id, f] of this.crowd.rivals) {
      const b = BOT_BY_ID[id];
      if (this.roundRng.chance(0.5)) setTimeout(() => this.bubbleBot(b, this.roundRng.pick(['Hmm.', 'Is that a…?', 'Junk.', 'Ooh.', 'That tarp though.', 'Nope.', 'Interesting.', 'Could be something.']), 1.6), 1500 + Math.random() * 6000);
      void f;
    }
  }

  private startAuction(): void {
    if (!this.locker) return;
    this.phase = 'auction';
    this.going = 0;
    this.auction = new Auction({ apparentValue: this.locker.apparentValue, bots: this.bots, rng: this.roundRng.fork('auction'), playerBalance: () => this.stats.balance });
    this.auction.start();
    this.hud.showPanel('auction');
    this.hud.showBanner('Auction', 'Tap BID before the hammer falls', null, true);
    this.syncAuctionHud();
  }

  private playerBid(amount: number): void {
    if (!this.auction || this.phase !== 'auction') return;
    if (this.auction.playerBid(amount)) {
      sfx.bidBlip(true);
      this.bubbleAuctioneer(this.roundRng.pick([`${fmt(this.auction.price)} from the newcomer!`, `Yes! ${fmt(this.auction.price)}!`, `${fmt(this.auction.price)} right here, thank you!`, `I've got ${fmt(this.auction.price)}!`]), 1.5, 'auctioneer');
      this.going = 0;
      this.syncAuctionHud();
    } else {
      sfx.click();
    }
  }

  private syncAuctionHud(): void {
    const a = this.auction; if (!a) return;
    const ask = a.ask;
    const j1 = snap(ask + increment(ask) * 2), j2 = snap(ask + increment(ask) * 5);
    this.hud.setAuction({ price: a.price, ask, high: a.high, canBid: a.playerCanBid, going: this.going, folded: a.playerFolded, jumps: [j1, j2], balance: this.stats.balance });
    this.hud.setRivals(this.bots, typeof a.high === 'string' && a.high !== 'player' ? a.high : null, new Set(a.rivals.filter((r) => r.dropped).map((r) => r.bot.id)));
    for (const [id, el] of this.nameTags) {
      const rv = a.rivals.find((r) => r.bot.id === id);
      const tag = el.firstElementChild as HTMLElement;
      tag.classList.toggle('leader', a.high === id);
      tag.classList.toggle('out', !!rv?.dropped);
    }
  }

  private handleAuctionEvent(e: AuctionEvent): void {
    switch (e.type) {
      case 'open':
        this.bubbleAuctioneer(e.text, 2.4, 'auctioneer');
        break;
      case 'bid': {
        this.going = 0;
        if (e.who !== 'player') {
          const bot = BOT_BY_ID[e.who];
          const f = this.crowd.rivals.get(e.who);
          f?.raise();
          this.bubbleBot(bot, e.line || fmt(e.amount) + '!', 1.5, true);
          sfx.bidBlip(false);
          sfx.crowdReact(e.jump ? 0.9 : 0.4);
          if (f) this.rig.glance(f.group.position.x);
          if (e.jump) this.hud.toast(`${bot.short} jumps to ${fmt(e.amount)}!`, 1400);
        }
        break;
      }
      case 'chant':
        this.bubbleAuctioneer(e.text, 1.6, 'auctioneer', false);
        break;
      case 'going':
        this.going = e.count;
        this.bubbleAuctioneer(e.text, 1.4, 'auctioneer');
        sfx.tick();
        break;
      case 'drop': {
        const bot = BOT_BY_ID[e.who];
        this.crowd.rivals.get(e.who)?.shrug();
        this.bubbleBot(bot, e.line, 1.8);
        break;
      }
      case 'sold':
        void this.onSold(e.who, e.amount);
        break;
    }
    this.syncAuctionHud();
  }

  private async onSold(who: string | null, amount: number): Promise<void> {
    if (!this.locker || !this.auction || !this.outcome) return;
    this.phase = 'sold';
    this.going = 0;
    voice.stopAll();
    sfx.gavel();
    this.crowd.auctioneer.gavelSwing();
    sfx.murmurOff();
    this.hud.showPanel(null);
    this.hud.hideAuctioneer();
    const playerWon = who === 'player';
    const winnerName = playerWon ? 'You' : BOT_BY_ID[who ?? '']?.name ?? 'Nobody';
    this.hud.showBanner('SOLD!', `${fmt(amount)} to ${winnerName}`, null, true);
    this.bubbleAuctioneer(playerWon ? `SOLD to the new blood for ${fmt(amount)}!` : `SOLD! ${fmt(amount)} to ${BOT_BY_ID[who ?? '']?.short ?? 'the crowd'}!`, 2.5, 'auctioneer');
    if (playerWon) {
      sfx.crowdReact(1);
      for (const [id] of this.crowd.rivals) { const b = BOT_BY_ID[id]; if (this.roundRng.chance(0.5)) setTimeout(() => this.bubbleBot(b, this.roundRng.pick(b.loseLines), 1.8), 600 + Math.random() * 1200); }
    } else if (who) {
      this.crowd.rivals.get(who)?.cheer();
      setTimeout(() => this.bubbleBot(BOT_BY_ID[who], this.roundRng.pick(BOT_BY_ID[who].winLines), 1.8), 500);
    }
    await wait(2.2);

    // ---- settle the bet ----
    let res: Resolution;
    const couldHaveHadFor = snap(this.auction.topRivalLimit + increment(this.auction.topRivalLimit));
    if (playerWon) {
      this.stats.balance -= amount;
      this.hud.setBalance(this.stats.balance);
      const { target, debtUsed } = payoutTarget(this.outcome.multiplier, amount, this.stats.debt);
      this.stats.debt -= debtUsed;
      res = resolveLocker(this.locker, target, this.roundRng.fork('resolve'));
      this.stats.debt += res.error;
      saveStats(this.stats);
      await this.countUp(res, amount, false);
    } else {
      // Nothing at stake for the player: the reveal is pure theatre, drawn from the same distribution.
      const m = drawOutcome(this.roundRng.fork('display')).multiplier;
      res = resolveLocker(this.locker, m * amount, this.roundRng.fork('resolve'));
      await this.countUp(res, amount, true);
    }
    this.finishRound(who, amount, res, couldHaveHadFor);
  }

  /** Walk through the locker appraising everything. 15–60 s for the player's own locker, ~8 s for a rival's. */
  private async countUp(res: Resolution, paid: number, quick: boolean): Promise<void> {
    this.phase = 'count';
    clock.scale = 1;
    const list = res.appraisals;
    const n = list.length;
    const total = res.total;
    const budget = quick ? Math.min(12, 3 + n * 0.7) : Math.max(15, Math.min(60, 6 + n * 2.1 + Math.log10(total + 10) * 4));
    const maxV = Math.max(1, ...list.map((a) => a.value));
    const weights = list.map((a) => 0.55 + 0.45 * Math.sqrt(a.value / maxV) + (a.revealed ? 0.35 : 0));
    const wsum = weights.reduce((s, w) => s + w, 0);
    this.hud.showPanel('count');
    this.hud.startCount(n, quick ? 0 : paid);
    this.hud.showBanner(quick ? 'What was inside' : 'Counting it up', quick ? 'Here\'s what you missed…' : 'Every item, appraised', 0);
    this.gs.interiorBulb.intensity = 6; // someone finally screwed in a bulb
    this.gs.workLight.intensity = 30;
    let running = 0;
    let bestSoFar = 0;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const dur = budget * (weights[i] / wsum);
      const p = this.contents!.worldPos(a.item.uid);
      const fp = this.contents!.footprint(a.item.uid);
      const camPos = new THREE.Vector3(THREE.MathUtils.clamp(p.x * 0.45, -1.1, 1.1), Math.min(2.3, Math.max(1.25, p.y + fp[1] * 0.45 + 0.95)), Math.min(1.2, p.z + Math.max(2.3, fp[0] * 1.0 + fp[2] * 0.7 + 1.3)));
      this.rig.flyTo(camPos, p.clone().setY(p.y + 0.05));
      this.gs.workLight.position.set(p.x, Math.min(2.4, p.y + fp[1] + 0.7), p.z + 0.5);
      this.contents!.highlight(a.item.uid);
      this.hud.showItem(a, i);
      this.hud.setBannerProgress(i / n);
      const pre = Math.min(dur * 0.35, 1.0);
      await wait(pre);
      if (a.revealed) { await this.contents!.reveal(a); }
      else { void this.contents!.bumpUid(a.item.uid); await wait(Math.min(0.35, dur * 0.15)); }
      // condition stamp
      if (a.condition.mult !== 1 || a.revealed) sfx.stamp(a.condition.tone === 'bad');
      // tick value up
      const tickDur = Math.max(0.35, Math.min(1.6, dur * 0.35));
      let lastTick = -1;
      const before = running;
      await tween(tickDur, (k) => {
        const v = Math.round(a.value * k);
        this.hud.showItemValue(v, a.condition.tone === 'bad' && a.value < a.baseValue * 0.5);
        const r = before + v;
        this.hud.setRunning(r, quick ? 0 : paid);
        if (!quick) this.hud.setBalance(this.stats.balance + r, false);
        const step = Math.floor(k * 10);
        if (step !== lastTick) { lastTick = step; sfx.cashTick(step + i); }
      }, easeOut);
      running += a.value;
      this.hud.showItemValue(a.value, a.condition.tone === 'bad' && a.value < a.baseValue * 0.5);
      this.labels.pop((o) => o.copy(p).setY(p.y + fp[1] * 0.5 + 0.2), a.value > 0 ? '+' + fmt(a.value) : fmt(0), a.condition.tone === 'bad');
      if (a.value >= 1000 || a.value > bestSoFar * 2 && a.value > 300) { sfx.kaching(a.value >= 5000); this.fx.coinsAt(p.clone().setY(p.y + fp[1] * 0.5), a.value >= 5000 ? 60 : 25); }
      else if (a.value >= 150) { sfx.kaching(false); }
      if (a.revealed && a.value >= 300) this.fx.glitterAt(p.clone().setY(p.y + fp[1] * 0.5), 30);
      bestSoFar = Math.max(bestSoFar, a.value);
      this.contents!.highlight(null);
      await wait(Math.max(0.15, dur - pre - tickDur - 0.35));
    }
    this.hud.setBannerProgress(1);
    if (!quick) { this.stats.balance += total; this.hud.setBalance(this.stats.balance, false); }
    this.gs.workLight.intensity = 0;
    // pull back for the total
    this.rig.flyTo(new THREE.Vector3(0, 1.6, 1.4), new THREE.Vector3(0, 1.0, -1.4));
    await wait(quick ? 0.8 : 1.4);
    clock.scale = 1;
  }

  private finishRound(who: string | null, amount: number, res: Resolution, couldHaveHadFor: number): void {
    if (!this.locker || !this.outcome || !this.auction) return;
    this.phase = 'result';
    const s = this.stats;
    const playerWon = who === 'player';
    const value = res.total;
    const best = res.appraisals.reduce<Appraisal | null>((b, a) => (!b || a.value > b.value ? a : b), null);
    s.rounds++;
    let quip: { who: string; text: string } | null = null;
    const record = { n: this.locker.number, theme: this.locker.theme.name, paid: amount, value, items: res.appraisals.length, couldHaveHadFor, at: Date.now(), topItem: best ? { name: best.def.name, value: best.value } : null } as const;
    if (playerWon) {
      const profit = value - amount;
      s.won++; s.totalSpent += amount; s.totalEarned += value;
      s.bestProfit = Math.max(s.bestProfit, profit); s.worstLoss = Math.min(s.worstLoss, profit);
      s.bestLockerValue = Math.max(s.bestLockerValue, value);
      s.bestMultiplier = Math.max(s.bestMultiplier, value / amount);
      s.streak = profit >= 0 ? s.streak + 1 : 0; s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (this.outcome.tier === 'jackpot') s.jackpots++;
      for (const a of res.appraisals) {
        s.itemsAppraised++;
        if (a.revealed) s.hiddenValue += a.value; else s.visibleValue += a.value;
        if (a.condition.label === 'Replica') s.replicas++;
        const c = (s.byCategory[a.def.category] ??= { items: 0, value: 0, lockers: 0, replicas: 0 });
        c.items++; c.value += a.value; if (a.condition.label === 'Replica') c.replicas++;
        const it = (s.items[a.def.id] ??= { count: 0, value: 0, best: 0, name: a.def.name, category: a.def.category });
        it.count++; it.value += a.value; it.best = Math.max(it.best, a.value);
      }
      for (const cat of new Set(res.appraisals.map((a) => a.def.category))) s.byCategory[cat]!.lockers++;
      for (const b of this.bots) { const r = (s.rivals[b.id] ??= { beatYou: 0, youBeat: 0, lockers: 0, spent: 0 }); r.youBeat++; }
      const rival = this.roundRng.pick(this.bots);
      quip = { who: rival.name, text: profit >= 0 ? this.roundRng.pick(['Beginner\'s luck.', 'Enjoy it while it lasts.', 'Okay, that was a good one.', 'I was gonna bid that.']) : this.roundRng.pick(rival.loseLines) };
      pushRound(s, { ...record, result: 'won', winner: 'player', profit, multiplier: value / amount, tier: this.outcome.tier });
      if (profit >= 0) sfx.fanfare(this.outcome.tier === 'big' || this.outcome.tier === 'jackpot'); else sfx.sad();
    } else {
      const bid = this.auction.playerBids > 0;
      if (bid) s.lost++; else s.passed++;
      s.streak = 0;
      if (who) { const r = (s.rivals[who] ??= { beatYou: 0, youBeat: 0, lockers: 0, spent: 0 }); r.lockers++; r.spent += amount; if (bid) r.beatYou++; }
      const w = who ? BOT_BY_ID[who] : null;
      if (w) quip = { who: w.name, text: value > amount ? this.roundRng.pick(w.winLines) : this.roundRng.pick(['…don\'t say anything.', 'Well. That happened.', 'It\'s an investment.']) };
      pushRound(s, { ...record, result: bid ? 'lost' : 'passed', winner: who ?? 'nobody', profit: 0, multiplier: value / Math.max(1, amount), tier: null });
    }
    saveStats(s);
    const minNeeded = 60;
    const broke = s.balance < minNeeded;
    this.hud.showPanel(null);
    this.hud.showBanner(playerWon ? (value >= amount ? 'Profit' : 'Loss') : 'Next time', '');
    this.hud.showResult({ kind: playerWon ? 'won' : this.auction.playerBids > 0 ? 'lost' : 'passed', winnerName: who ? BOT_BY_ID[who]?.name ?? 'Nobody' : 'Nobody', paid: amount, value, multiplier: value / Math.max(1, amount), tier: playerWon ? this.outcome.tier : null, best, quip, couldHaveHadFor, broke });
  }

  private async nextRound(): Promise<void> {
    this.phase = 'idle';
    cancelAllTweens();
    clock.scale = 1;
    this.gs.interiorBulb.intensity = 0;
    this.gs.workLight.intensity = 0;
    this.rig.home(); this.rig.lock();
    this.hud.showBanner('Rolling it down', '');
    await wait(0.4);
    await this.door.close();
    this.contents?.dispose(); this.contents = null;
    await wait(0.4);
    void this.startRound();
  }

  /* ------------------------------------------------------------ */
  /*                            helpers                             */
  /* ------------------------------------------------------------ */

  private bubbleAuctioneer(text: string, ttl = 1.8, cls: 'auct' | 'auctioneer' = 'auct', interrupt = true): void {
    this.labels.bubble((o) => this.crowd.auctioneer.labelAnchor(o), text, 'auct', ttl, 14);
    this.hud.auctioneer(text);
    voice.speak(text, { pitch: 1.0, rate: cls === 'auctioneer' ? 1.45 : 1.15, channel: 'auctioneer', interrupt }, 7);
  }
  private bubbleBot(bot: Bot, text: string, ttl = 1.6, loud = false): void {
    const f = this.crowd.rivals.get(bot.id); if (!f) return;
    this.labels.bubble((o) => f.labelAnchor(o), text, '', ttl, 26);
    voice.speak(text.replace(/[!]+/g, '!'), { pitch: bot.voice.pitch, rate: bot.voice.rate, volume: loud ? 1 : 0.8, channel: 'crowd' }, hashString(bot.id));
  }

  /* ------------------------------------------------------------ */
  /*                              loop                              */
  /* ------------------------------------------------------------ */

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const dt = this.gs.dt();
    this.t += dt;
    tickTweens(dt);
    if (this.phase === 'inspect') {
      this.inspectLeft -= dt;
      this.hud.setBannerProgress(this.inspectLeft / INSPECT_SECONDS, `${Math.max(0, Math.ceil(this.inspectLeft))}s · no stepping inside`);
      if (this.inspectLeft <= 0) this.startAuction();
    }
    if (this.phase === 'auction' && this.auction) {
      this.auction.update(dt);
      for (const e of this.auction.drain()) this.handleAuctionEvent(e);
      this.lastHudSync += dt;
      if (this.lastHudSync > 0.15) { this.lastHudSync = 0; this.syncAuctionHud(); }
    }
    this.rig.update(dt);
    this.focus.set(0, 1.2, this.phase === 'auction' ? 1.2 : -1.0);
    this.crowd.update(this.t, this.focus);
    this.fx.update(dt);
    this.labels.update(dt);
    this.gs.render();
  };
}
