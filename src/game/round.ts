/**
 * Round orchestrator: arrival → lock cut → door up → inspection → auction →
 * sold → count-up → result → door down → next locker.
 *
 * Characters, items, containers, cards and voices come from the asset pack.
 * Nothing on screen waits on the network mid-moment: the crowd loads before the
 * menu unlocks, a locker's models load while its lock is cut, hidden items load
 * while the auctioneer calls "sold", and the next locker loads during the count-up.
 */
import * as THREE from 'three';
import { GameScene, UNIT_PITCH, unitLabel, type Quality } from '../render/scene';
import { RollupDoor } from '../render/door';
import { Crowd, type Actor } from '../render/crowd';
import { CameraRig } from '../render/cameraRig';
import { FX } from '../render/fx';
import { LockerContents, prefetchLocker, releasePaths, warmupObjects } from '../render/contents';
import { Labels } from '../ui/labels';
import { HUD } from '../ui/hud';
import { makeRNG, type RNG } from '../core/rng';
import { drawOutcome, payoutTarget, type Outcome } from '../core/economy';
import { fmt, increment, snap } from '../core/money';
import { g } from '../core/config';
import { tickTweens, tween, wait, clock, cancelAllTweens, easeOut, easeInOut, linear } from '../core/tween';
import { loadStats, saveStats, resetStats, pushRound, BAILOUT_AMOUNT, type Stats } from '../core/stats';
import { generateLocker, resolveLocker, type Locker, type Resolution, type Appraisal } from './lockerGen';
import { Auction, type AuctionEvent } from './auction';
import { BOTS, BOT_BY_ID, type Bot } from './bots';
import { sfx } from '../audio/sfx';
import { voice } from '../audio/voice';
import { voiceLines } from '../pack/voices';
import { initPackLoader } from '../pack/loader';
import type { PackLine } from '../pack/manifest';

type Phase = 'menu' | 'idle' | 'arrive' | 'inspect' | 'auction' | 'sold' | 'count' | 'result';
const INSPECT_SECONDS = 15;
/** Unit numbers the auctioneer names in his intro lines: he only uses those at the matching unit. */
const INTRO_UNITS: Record<string, string> = { intro_1: 'B-214', intro_2: 'C-377' };
const SLIDE_SECONDS = 2.8;

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
  private talkRng: RNG = makeRNG('talk');
  private inspectLeft = 0;
  private nameTags = new Map<string, HTMLElement>();
  private lastHudSync = 0;
  private going: 0 | 1 | 2 = 0;
  private auctionClock = 0;
  private lullSaid = false;
  private playerBidsThisRound = 0;
  private prefetched: { n: number; paths: string[] } | null = null;
  private crowdReady = false;
  private shadersWarm = false;
  /** Round number whose rivals are already standing in their spots (after a walk-over). */
  private crowdPlacedFor = 0;
  private keyHintShown = false;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.stats = loadStats();
    const url = new URL(location.href);
    const seedParam = url.searchParams.get('seed');
    if (seedParam && seedParam !== this.stats.sessionSeed) { this.stats.sessionSeed = seedParam; this.stats.round = 0; }
    this.gs = new GameScene(canvas, quality);
    initPackLoader(this.gs.renderer);
    this.door = new RollupDoor(this.gs.unit);
    this.crowd = new Crowd(this.gs.scene);
    this.rig = new CameraRig(this.gs.camera, canvas);
    this.fx = new FX(this.gs.scene);
    this.labels = new Labels(this.gs.camera);
    sfx.setEnabled(this.stats.settings.sound);
    voice.setEnabled(this.stats.settings.voice && this.stats.settings.sound);
    voiceLines.enabled = this.stats.settings.voice;
    voiceLines.preload('auctioneer');
    this.hud.setSound(this.stats.settings.sound);
    this.hud.setBalance(this.stats.balance, false);
    this.wireHud();
    this.rig.home(true);
    requestAnimationFrame(this.loop);
    void this.boot();
  }

  /** First load: the crowd's models, then the showcase unit. The menu is visible (and the camera sweeping) throughout. */
  private async boot(): Promise<void> {
    this.phase = 'menu';
    this.door.setOpen(1);
    this.rig.showcase();
    this.hud.showMenu(this.stats, BOTS);
    this.hud.setMenuLoading(0);
    await this.crowd.loadCharacters((p) => this.hud.setMenuLoading(p * 0.75));
    this.crowdReady = true;
    await this.showMenu();
  }

  /**
   * Compile every shader the game will need while the menu still says "Loading", so no
   * moment mid-round (first reveal, first coin burst) stalls on shader compilation.
   */
  private async warmShaders(): Promise<void> {
    // Some drivers (and software GL) only finish a shader the first time it draws pixels, so the
    // stand-ins are drawn for a few frames, a few pixels wide, just in front of the camera.
    const cam = this.gs.camera;
    const spot = new THREE.Vector3(0, 0, -1.5).applyQuaternion(cam.quaternion).add(cam.position);
    const extra = warmupObjects();
    extra.position.copy(spot); extra.scale.setScalar(0.04); extra.lookAt(cam.position);
    this.gs.scene.add(extra);
    this.fx.warmup(spot);
    const r = this.gs.renderer;
    if (r.extensions.has('KHR_parallel_shader_compile')) { try { await r.compileAsync(this.gs.scene, cam); } catch { r.compile(this.gs.scene, cam); } }
    else r.compile(this.gs.scene, cam);
    for (let i = 0; i < 3; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
    this.gs.scene.remove(extra);
  }

  private wireHud(): void {
    const H = this.hud;
    H.onStart = () => { sfx.unlock(); voiceLines.warm(); void this.leaveMenu(); };
    H.onMenu = () => { void this.backToMenu(); };
    H.onFlashlight = () => { sfx.click(); this.gs.setFlashlight(!this.gs.flashlightOn); H.setFlashlight(this.gs.flashlightOn); };
    H.onReady = () => { if (this.phase === 'inspect') this.inspectLeft = 0; };
    H.onBid = (amount) => this.playerBid(amount);
    H.onPass = () => { if (this.auction && this.phase === 'auction') { sfx.click(); this.auction.playerFold(); H.toast('You passed. Watching the crowd finish it…'); this.syncAuctionHud(); } };
    H.onFastForward = () => { clock.scale = clock.scale > 1 ? 1 : 4; H.toast(clock.scale > 1 ? 'Fast-forward ×4' : 'Normal speed', 900); };
    H.onNext = () => this.nextRound();
    H.onBailout = () => { this.stats.balance += BAILOUT_AMOUNT; this.stats.bailouts++; this.hud.setBalance(this.stats.balance); saveStats(this.stats); this.nextRound(); };
    H.onToggleSound = () => {
      this.stats.settings.sound = !this.stats.settings.sound;
      sfx.unlock(); sfx.setEnabled(this.stats.settings.sound);
      voice.setEnabled(this.stats.settings.sound && this.stats.settings.voice);
      if (!this.stats.settings.sound) voiceLines.stop(); else voiceLines.warm();
      saveStats(this.stats); return this.stats.settings.sound;
    };
    H.onToggleVoice = () => {
      this.stats.settings.voice = !this.stats.settings.voice;
      voice.setEnabled(this.stats.settings.voice && this.stats.settings.sound);
      voiceLines.enabled = this.stats.settings.voice;
      if (!voiceLines.enabled) voiceLines.stop();
      saveStats(this.stats); return this.stats.settings.voice;
    };
    H.onOpenStats = () => this.stats;
    H.onReset = () => { this.stats = resetStats(); this.hud.setBalance(this.stats.balance, false); location.reload(); };
  }

  /* ------------------------------------------------------------ */
  /*                             main menu                          */
  /* ------------------------------------------------------------ */

  /** The menu is the live 3D scene: an open, packed unit with the crowd gathered, camera sweeping slowly. */
  private async showMenu(): Promise<void> {
    this.phase = 'menu';
    this.hud.showPanel(null); this.hud.hideAuctioneer(); this.hud.hideModals(); this.hud.hideRevealCard();
    this.rig.showcase();
    this.hud.showMenu(this.stats, BOTS);
    this.hud.setMenuLoading(this.crowdReady ? 0.8 : 0);
    this.labels.clear(); this.nameTags.clear();
    this.door.resetLock(); this.door.setOpen(1);
    this.gs.setFlashlight(false); this.hud.setFlashlight(false);
    this.gs.interiorBulb.intensity = 2.5;
    // the menu shows the unit the next round will open
    this.gs.facility.setUnit(this.stats.round + 1);
    this.gs.setUnitNumber(unitLabel(this.stats.round + 1));
    this.crowdPlacedFor = 0;
    const showcase = generateLocker('showcase-' + this.stats.sessionSeed, 9);
    this.bots = makeRNG(this.stats.sessionSeed + ':menu').shuffle([...BOTS]).slice(0, 5);
    const [contents] = await Promise.all([LockerContents.create(this.gs.scene, showcase), this.crowd.setRivals(this.bots, makeRNG(this.stats.sessionSeed + ':menu-spots'))]);
    if (this.phase !== 'menu') { contents.dispose(); return; }
    this.contents?.dispose();
    this.contents = contents;
    if (!this.shadersWarm) { this.hud.setMenuLoading(0.9); await this.warmShaders(); this.shadersWarm = true; }
    this.hud.setMenuLoading(null, this.stats.rounds > 0 ? 'Back to the lot' : 'Start bidding');
  }

  private async leaveMenu(): Promise<void> {
    if (this.phase !== 'menu') return;
    this.phase = 'idle';
    this.hud.hideMenu();
    this.rig.home(); this.rig.lock();
    this.gs.interiorBulb.intensity = 0;
    await wait(0.5);
    await this.door.close();
    this.contents?.dispose(); this.contents = null;
    await wait(0.3);
    void this.startRound();
  }

  private async backToMenu(): Promise<void> {
    this.phase = 'idle';
    cancelAllTweens(); clock.scale = 1;
    voiceLines.stop();
    this.gs.interiorBulb.intensity = 0; this.gs.workLight.intensity = 0;
    this.rig.home(); this.rig.lock();
    this.hud.showPanel(null); this.hud.hideBanner(); this.hud.hideRevealCard();
    await wait(0.3);
    await this.door.close();
    this.contents?.dispose(); this.contents = null;
    await wait(0.2);
    await this.showMenu();
  }

  /* ------------------------------------------------------------ */
  /*                            round flow                          */
  /* ------------------------------------------------------------ */

  private async startRound(): Promise<void> {
    this.stats.round++;
    saveStats(this.stats);
    const n = this.stats.round;
    this.roundRng = makeRNG(`${this.stats.sessionSeed}#${n}:round`);
    this.talkRng = makeRNG(`${this.stats.sessionSeed}#${n}:talk`);
    this.locker = generateLocker(this.stats.sessionSeed, n);
    this.bots = this.lineUp(n);
    for (const b of this.bots) for (const id of b.pack) voiceLines.preload(id);
    this.gs.facility.setUnit(n);
    this.gs.unit.visible = true;
    // The whole round's fate, decided before anyone sees anything. (See economy.ts.)
    this.outcome = drawOutcome(this.roundRng.fork('outcome'));
    this.playerBidsThisRound = 0;
    // models load while the lock is being cut
    const contentsReady = LockerContents.create(this.gs.scene, this.locker);
    const prev = this.prefetched; this.prefetched = null;
    if (this.crowdPlacedFor !== n) await this.crowd.setRivals(this.bots, this.roundRng.fork('spots'));
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
    const label = unitLabel(n);
    this.gs.setUnitNumber(label);
    const intros = voiceLines.lines('auctioneer', 'intro').filter((l) => !INTRO_UNITS[l.id] || INTRO_UNITS[l.id] === label);
    const named = intros.find((l) => INTRO_UNITS[l.id] === label);
    const intro = named ?? (intros.length ? this.talkRng.pick(intros) : null);
    this.sayAuctioneer(intro, { anim: 'wave' });
    await wait(0.8);
    this.hud.showBanner('Cutting the lock', this.locker.theme.blurb);
    await this.door.cutLock(() => { this.fx.sparksAt(this.door.lockPos); });
    const contents = await contentsReady;
    if (prev) releasePaths(prev.paths);
    this.contents?.dispose();
    this.contents = contents;
    this.hud.showBanner('Door\'s going up…', '');
    const dustP = new THREE.Vector3(0, 0.2, 0.2);
    const dust = tween(2.2, (k) => { if (Math.random() < 0.3) this.fx.dustAt(dustP.set((Math.random() - 0.5) * 3, 0.1 + k * 1.5, 0.1), 3); }, linear);
    await this.door.open();
    await dust;
    this.beginInspection();
  }

  /** Who bids in round `n` (deterministic, so the crowd can be known before the round starts). */
  private lineUp(n: number): Bot[] {
    return makeRNG(`${this.stats.sessionSeed}#${n}:round`).fork('bots').shuffle([...BOTS]).slice(0, 4);
  }

  private beginInspection(): void {
    this.phase = 'inspect';
    this.inspectLeft = INSPECT_SECONDS;
    this.rig.inspect();
    if (!this.keyHintShown && matchMedia('(pointer: fine)').matches) { this.keyHintShown = true; this.hud.toast('Look around with the mouse, or W A S D and the arrow keys', 3200); }
    this.hud.showPanel('inspect');
    this.hud.showBanner('Take a look', `${INSPECT_SECONDS}s · no stepping inside`, 1);
    this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'look'), { anim: 'gesture' });
    sfx.murmurOn();
    // one rival talks a little trash, another reacts to what they see
    const order = this.talkRng.shuffle([...this.bots]);
    const n = this.locker?.number ?? 0;
    setTimeout(() => { if (this.phase === 'inspect' && this.locker?.number === n) this.sayRival(order[0], 'flair', { anim: 'flair' }); }, 3500 + this.talkRng.range(0, 1500));
    setTimeout(() => { if (this.phase === 'inspect' && this.locker?.number === n) this.sayRival(order[1], 'react'); }, 8500 + this.talkRng.range(0, 2000));
  }

  private startAuction(): void {
    if (!this.locker) return;
    this.phase = 'auction';
    this.going = 0;
    this.auctionClock = 0;
    this.lullSaid = false;
    this.auction = new Auction({ apparentValue: this.locker.apparentValue, bots: this.bots, rng: this.roundRng.fork('auction'), playerBalance: () => this.stats.balance });
    this.auction.start();
    this.rig.home(); // step back so the bidders are in view
    this.hud.showPanel('auction');
    this.hud.showBanner('Auction', 'Tap BID before the hammer falls', null, true);
    this.syncAuctionHud();
  }

  private playerBid(amount: number): void {
    if (!this.auction || this.phase !== 'auction') return;
    if (this.auction.playerBid(amount)) {
      sfx.bidBlip(true);
      this.playerBidsThisRound++;
      const line = this.playerBidsThisRound === 1 ? voiceLines.lines('auctioneer', 'player').find((l) => l.id === 'player_2') ?? null : voiceLines.pick(this.talkRng, 'auctioneer', this.talkRng.chance(0.5) ? 'player' : 'ack');
      this.sayAuctioneer(line, { anim: 'point', hud: `${fmt(this.auction.price)} from the new face. Looking for ${fmt(this.auction.ask)}!` });
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
        this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'open'), { anim: 'gesture', hud: e.text });
        break;
      case 'bid': {
        this.going = 0;
        if (e.who !== 'player') {
          const bot = BOT_BY_ID[e.who];
          const f = this.crowd.rivals.get(e.who);
          sfx.bidBlip(false);
          sfx.crowdReact(e.jump ? 0.9 : 0.4);
          if (f) this.rig.glance(f.group.position.x);
          if (e.jump) this.hud.toast(`${bot.short} jumps to ${fmt(e.amount)}!`, 1400);
          // either the rival shouts their bid, or the auctioneer calls it
          if (!voiceLines.isBusy('crowd') && this.talkRng.chance(0.6)) this.sayRival(bot, 'bid', { anim: 'bid', fallbackText: `${fmt(e.amount)}!` });
          else {
            f?.bid();
            this.labels.bubble((o) => f!.labelAnchor(o), `${fmt(e.amount)}!`, '', 1.2, 26, bot.id);
            this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'ack'), { anim: 'gesture', interrupt: false, hud: `${fmt(e.amount)} from ${bot.short}. Looking for ${fmt(this.auction!.ask)}!` });
          }
          this.hud.auctioneer(`${fmt(e.amount)} from ${bot.short}. Looking for ${fmt(this.auction!.ask)}!`);
        }
        break;
      }
      case 'chant':
        // patter keeps the caption current; the recorded voice carries the moments that matter
        this.hud.auctioneer(e.text);
        break;
      case 'going':
        this.going = e.count;
        this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', e.count === 1 ? 'once' : 'twice'), { anim: 'gesture', hud: e.text });
        sfx.tick();
        break;
      case 'drop':
        this.sayRival(BOT_BY_ID[e.who], 'out', { anim: 'sulk' });
        break;
      case 'sold':
        void this.onSold(e.who, e.amount, e.text);
        break;
    }
    this.syncAuctionHud();
  }

  private async onSold(who: string | null, amount: number, soldText: string): Promise<void> {
    if (!this.locker || !this.auction || !this.outcome) return;
    this.phase = 'sold';
    this.going = 0;
    sfx.gavel();
    sfx.murmurOff();
    this.hud.showPanel(null);
    const playerWon = who === 'player';
    const winnerName = playerWon ? 'You' : BOT_BY_ID[who ?? '']?.name ?? 'Nobody';
    this.hud.showBanner('SOLD!', `${fmt(amount)} to ${winnerName}`, null, true);
    this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'sold'), { anim: 'point', hud: soldText });

    // ---- settle the bet now, so hidden items load while the crowd reacts ----
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
    } else {
      // Nothing at stake for the player: the reveal is pure theatre, drawn from the same distribution.
      const m = drawOutcome(this.roundRng.fork('display')).multiplier;
      res = resolveLocker(this.locker, m * amount, this.roundRng.fork('resolve'));
    }
    this.contents?.prefetchReveals(res.appraisals);

    if (playerWon) {
      sfx.crowdReact(1);
      const sore = this.talkRng.shuffle([...this.bots]).slice(0, 2);
      sore.forEach((b, i) => setTimeout(() => this.sayRival(b, 'react', { anim: 'sulk' }), 1400 + i * 1500));
    } else if (who) {
      const w = BOT_BY_ID[who];
      this.crowd.rivals.get(who)?.cheer();
      setTimeout(() => this.sayRival(w, 'win'), 1300);
    }
    await wait(2.6);
    await this.countUp(res, amount, !playerWon);
    this.finishRound(who, amount, res, couldHaveHadFor);
  }

  /** Walk through the locker appraising everything. 15–60 s for the player's own locker, ~8 s for a rival's. */
  private async countUp(res: Resolution, paid: number, quick: boolean): Promise<void> {
    this.phase = 'count';
    clock.scale = 1;
    this.prefetchNext();
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
    this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'reveal'), { anim: 'gesture' });
    this.gs.interiorBulb.intensity = 6; // someone finally screwed in a bulb
    this.gs.workLight.intensity = 30;
    let running = 0;
    let bestSoFar = 0;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const dur = budget * (weights[i] / wsum);
      const p = this.contents!.worldPos(a.item.uid);
      const fp = this.contents!.footprint(a.item.uid);
      const camPos = this.appraisalCamera(a.item.uid, p, fp);
      this.rig.flyTo(camPos, p.clone().setY(p.y + 0.05));
      this.gs.workLight.position.set(p.x, Math.min(2.4, p.y + fp[1] + 0.7), p.z + 0.5);
      this.contents!.highlight(a.item.uid);
      this.hud.showItem(a, i);
      this.hud.setBannerProgress(i / n);
      const pre = Math.min(dur * 0.35, 1.0);
      await wait(pre);
      // reveal cards: every hidden item flips from its container's card; the best visible items get one too
      const bad = a.condition.tone === 'bad' && a.value < a.baseValue * 0.5;
      if (a.revealed || (a.value >= 0.5 * maxV && a.value >= g(300))) {
        this.hud.revealCard(a.def.id, a.revealed ? a.item.cover!.kind : null, a.def.name, fmt(a.value), bad ? 'bad' : 'good', Math.min(2.4, Math.max(1.2, dur * 0.8)) / clock.scale);
      }
      if (a.revealed) { await this.contents!.reveal(a); }
      else { void this.contents!.bumpUid(a.item.uid); await wait(Math.min(0.35, dur * 0.15)); }
      // condition stamp
      if (a.condition.mult !== 1 || a.revealed) sfx.stamp(a.condition.tone === 'bad');
      // tick value up
      const tickDur = Math.max(0.35, Math.min(1.6, dur * 0.35));
      let lastTick = -1;
      const before = running;
      await tween(tickDur, (k) => {
        const v = Math.round(a.value * k * 100) / 100;
        this.hud.showItemValue(v, bad);
        const r = before + v;
        this.hud.setRunning(r, quick ? 0 : paid);
        if (!quick) this.hud.setBalance(this.stats.balance + r, false);
        const step = Math.floor(k * 10);
        if (step !== lastTick) { lastTick = step; sfx.cashTick(step + i); }
      }, easeOut);
      running += a.value;
      this.hud.showItemValue(a.value, bad);
      this.labels.pop((o) => o.copy(p).setY(p.y + fp[1] * 0.5 + 0.2), a.value > 0 ? '+' + fmt(a.value) : fmt(0), a.condition.tone === 'bad');
      if (a.value >= g(1000) || a.value > bestSoFar * 2 && a.value > g(300)) { sfx.kaching(a.value >= g(5000)); this.fx.coinsAt(p.clone().setY(p.y + fp[1] * 0.5), a.value >= g(5000) ? 60 : 25); }
      else if (a.value >= g(150)) { sfx.kaching(false); }
      if (a.revealed && a.value >= g(300)) this.fx.glitterAt(p.clone().setY(p.y + fp[1] * 0.5), 30);
      bestSoFar = Math.max(bestSoFar, a.value);
      this.contents!.highlight(null);
      await wait(Math.max(0.15, dur - pre - tickDur - 0.35));
    }
    this.hud.setBannerProgress(1);
    if (!quick) { this.stats.balance += total; this.hud.setBalance(this.stats.balance, false); }
    this.gs.workLight.intensity = 0;
    // the auctioneer calls it: a jackpot or a bust gets its own line
    const ratio = total / Math.max(0.01, paid);
    const tier = !quick ? this.outcome?.tier : null;
    if (tier === 'jackpot' || tier === 'huge' || (quick && ratio >= 2.2)) this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'jackpot'), { anim: 'point' });
    else if (tier === 'bust' || (quick && ratio < 0.3)) this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'bust'), { anim: 'gesture' });
    // pull back for the total
    this.rig.flyTo(new THREE.Vector3(0, 1.6, 1.4), new THREE.Vector3(0, 1.0, -1.4));
    await wait(quick ? 0.8 : 1.4);
    clock.scale = 1;
  }

  /**
   * Where the camera stands to show one item. The default spot is straight in front of it; if
   * something bigger blocks that view (a wardrobe in front of a small box), the camera swings
   * around the item, in toward the middle first, then up, until it can see it.
   */
  private appraisalCamera(uid: string, p: THREE.Vector3, fp: [number, number, number]): THREE.Vector3 {
    const base = new THREE.Vector3(THREE.MathUtils.clamp(p.x * 0.45, -1.1, 1.1), Math.min(2.3, Math.max(1.25, p.y + fp[1] * 0.45 + 0.95)), Math.min(1.2, p.z + Math.max(2.3, fp[0] * 1.0 + fp[2] * 0.7 + 1.3)));
    const c = this.contents!;
    let best = base, bestScore = c.visibility(uid, base);
    if (bestScore >= 0.75) return best;
    const dist = Math.hypot(base.x - p.x, base.z - p.z);
    const ang0 = Math.atan2(base.x - p.x, base.z - p.z);
    const side = p.x >= 0 ? -1 : 1; // swing toward the middle of the unit first
    const tries: [number, number, number][] = [[0.5, 0, 1], [-0.5, 0, 1], [0.9, 0.2, 0.9], [-0.9, 0.2, 0.9], [0, 0.7, 0.85], [0.5, 0.6, 0.8], [-0.5, 0.6, 0.8], [1.3, 0.3, 0.8], [-1.3, 0.3, 0.8]];
    for (const [yawOff, lift, scale] of tries) {
      const ang = ang0 + yawOff * side;
      const cand = new THREE.Vector3(p.x + Math.sin(ang) * dist * scale, Math.min(2.35, base.y + lift), p.z + Math.cos(ang) * dist * scale);
      if (Math.abs(cand.x) > 1.5 || cand.z > 1.3 || cand.z < -3.0) continue;
      const score = c.visibility(uid, cand);
      if (score > bestScore + 0.2) { best = cand; bestScore = score; if (score >= 0.99) break; }
    }
    return best;
  }

  /** The next locker is deterministic, so its models can load during this count-up. */
  private prefetchNext(): void {
    const n = this.stats.round + 1;
    if (this.prefetched?.n === n) return;
    if (this.prefetched) releasePaths(this.prefetched.paths);
    this.prefetched = { n, paths: prefetchLocker(generateLocker(this.stats.sessionSeed, n)) };
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
      const reactLine = this.rivalLine(rival, 'react');
      quip = { who: rival.name, text: reactLine?.text ?? this.roundRng.pick(rival.loseLines) };
      pushRound(s, { ...record, result: 'won', winner: 'player', profit, multiplier: value / amount, tier: this.outcome.tier });
      if (profit >= 0) sfx.fanfare(this.outcome.tier === 'huge' || this.outcome.tier === 'jackpot'); else sfx.sad();
    } else {
      const bid = this.auction.playerBids > 0;
      if (bid) s.lost++; else s.passed++;
      s.streak = 0;
      if (who) { const r = (s.rivals[who] ??= { beatYou: 0, youBeat: 0, lockers: 0, spent: 0 }); r.lockers++; r.spent += amount; if (bid) r.beatYou++; }
      const w = who ? BOT_BY_ID[who] : null;
      if (w) quip = { who: w.name, text: value > amount ? this.rivalLine(w, 'win')?.text ?? this.roundRng.pick(w.winLines) : this.roundRng.pick(['…don\'t say anything.', 'Well. That happened.', 'It\'s an investment.']) };
      pushRound(s, { ...record, result: bid ? 'lost' : 'passed', winner: who ?? 'nobody', profit: 0, multiplier: value / Math.max(1, amount), tier: null });
    }
    saveStats(s);
    const minNeeded = 3;
    const broke = s.balance < minNeeded;
    this.hud.showPanel(null);
    this.hud.showBanner(playerWon ? (value >= amount ? 'Profit' : 'Loss') : 'Next time', '');
    this.hud.showResult({ kind: playerWon ? 'won' : this.auction.playerBids > 0 ? 'lost' : 'passed', winnerName: who ? BOT_BY_ID[who]?.name ?? 'Nobody' : 'Nobody', paid: amount, value, multiplier: value / Math.max(1, amount), tier: playerWon ? this.outcome.tier : null, best, quip, couldHaveHadFor, broke });
  }

  private async nextRound(): Promise<void> {
    this.phase = 'idle';
    cancelAllTweens();
    clock.scale = 1;
    this.hud.hideRevealCard();
    this.gs.interiorBulb.intensity = 0;
    this.gs.workLight.intensity = 0;
    this.rig.home(); this.rig.lock();
    this.hud.showBanner('Rolling it down', '');
    this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'outro'), { anim: 'bow' });
    await wait(0.4);
    await this.door.close();
    this.contents?.dispose(); this.contents = null;
    await wait(0.3);
    await this.moveDownTheRow();
    void this.startRound();
  }

  /**
   * On to the next unit: the row slides one pitch past the camera while the crowd walks along
   * with it. A stand-in closed door covers our unit while it moves (every closed unit looks
   * alike), so the real door can simply reappear at the origin wearing the next number.
   */
  private async moveDownTheRow(): Promise<void> {
    const n = this.stats.round + 1;
    const F = this.gs.facility;
    this.hud.showBanner('Down the row', `Next up: unit ${unitLabel(n)}`);
    // a wider, higher shot for the move, so the crowd crosses in front of the doors rather than the lens
    this.rig.flyTo(new THREE.Vector3(0.3, 2.2, 6.6), new THREE.Vector3(0.2, 1.0, -0.6));
    this.door.resetLock();
    F.showStandIn(true);
    this.gs.unit.visible = false;
    this.labels.clear(); this.nameTags.clear();
    const nextBots = this.lineUp(n);
    for (const b of nextBots) for (const id of b.pack) voiceLines.preload(id);
    const slide = tween(SLIDE_SECONDS, (k) => F.slide(k), easeInOut);
    const walk = this.crowd.walkOver(nextBots, UNIT_PITCH, SLIDE_SECONDS, makeRNG(`${this.stats.sessionSeed}#${n}:spots`));
    await Promise.all([slide, walk]);
    F.setUnit(n); // re-bases the row: the next unit is now at the origin with its stand-in door hidden
    this.gs.setUnitNumber(unitLabel(n));
    this.gs.unit.visible = true;
    this.bots = nextBots;
    this.crowdPlacedFor = n;
  }

  /* ------------------------------------------------------------ */
  /*                         voices + bubbles                       */
  /* ------------------------------------------------------------ */

  /** The auctioneer says a recorded line: speech bubble, caption, talking animation, optional gesture. */
  private sayAuctioneer(line: PackLine | null, opts: { anim?: string; interrupt?: boolean; hud?: string } = {}): void {
    const a = this.crowd.auctioneer;
    if (opts.hud) this.hud.auctioneer(opts.hud);
    if (!line) return;
    if (opts.interrupt === false && voiceLines.isBusy('auctioneer')) return;
    this.labels.bubble((o) => a.labelAnchor(o), line.text, 'auct', Math.min(4.5, Math.max(1.6, line.seconds)), 14, 'auctioneer');
    if (!opts.hud) this.hud.auctioneer(line.text);
    if (opts.anim) a.play(opts.anim);
    a.talk(true);
    void voiceLines.play(line, 'auctioneer', { interrupt: opts.interrupt }).then((played) => {
      if (played || !voiceLines.enabled) a.talk(false);
      else setTimeout(() => a.talk(false), line.seconds * 1000);
    });
  }

  /** Pick which of a rival's models speaks (Rosa does most of the talking for the Rosa & Ray team). */
  private rivalSpeaker(bot: Bot): { member: number; packId: string } {
    if (bot.pack.length > 1 && this.talkRng.chance(0.3)) return { member: 1, packId: bot.pack[1] };
    return { member: 0, packId: bot.pack[0] };
  }
  private rivalLine(bot: Bot, kind: string): PackLine | null { return voiceLines.pick(this.talkRng, this.rivalSpeaker(bot).packId, kind); }

  private sayRival(bot: Bot, kind: string, opts: { anim?: 'bid' | 'sulk' | 'flair' | 'cheer'; fallbackText?: string } = {}): void {
    const f: Actor | undefined = this.crowd.rivals.get(bot.id);
    if (!f) return;
    const who = this.rivalSpeaker(bot);
    const line = voiceLines.pick(this.talkRng, who.packId, kind);
    if (opts.anim === 'bid') f.bid(who.member);
    else if (opts.anim === 'sulk') f.sulk(who.member);
    else if (opts.anim === 'flair') f.flair(who.member);
    else if (opts.anim === 'cheer') f.cheer();
    const text = line?.text ?? opts.fallbackText;
    if (!text) return;
    this.labels.bubble((o) => f.labelAnchor(o), text, '', Math.min(4, Math.max(1.4, line?.seconds ?? 1.6)), 26, bot.id);
    if (line) void voiceLines.play(line, 'crowd');
  }

  /* ------------------------------------------------------------ */
  /*                              loop                              */
  /* ------------------------------------------------------------ */

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const dt = this.gs.dt();
    tickTweens(dt);
    if (this.phase === 'inspect') {
      this.inspectLeft -= dt;
      this.hud.setBannerProgress(this.inspectLeft / INSPECT_SECONDS, `${Math.max(0, Math.ceil(this.inspectLeft))}s · no stepping inside`);
      if (this.inspectLeft <= 0) this.startAuction();
    }
    if (this.phase === 'auction' && this.auction) {
      this.auction.update(dt);
      this.auctionClock += dt;
      // a long silence before the first bid gets the auctioneer pleading
      if (!this.lullSaid && this.auction.price === 0 && this.auctionClock > 5.5) {
        this.lullSaid = true;
        this.sayAuctioneer(voiceLines.pick(this.talkRng, 'auctioneer', 'drop'), { anim: 'gesture', interrupt: false });
      }
      for (const e of this.auction.drain()) this.handleAuctionEvent(e);
      this.lastHudSync += dt;
      if (this.lastHudSync > 0.15) { this.lastHudSync = 0; this.syncAuctionHud(); }
    }
    this.rig.update(dt);
    this.crowd.update(dt * clock.scale, -this.gs.facility.row.position.x);
    this.fx.update(dt);
    this.labels.update(dt);
    this.gs.render();
  };
}
