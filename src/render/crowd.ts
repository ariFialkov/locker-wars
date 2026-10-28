/**
 * The auction crowd: the auctioneer and the rival buyers.
 *
 * Characters are the asset pack's rigged models, each driven by an AnimationMixer:
 * an idle loop with one-shot clips (bid, cheer, sulk, flair; the auctioneer has talk,
 * gesture, point, wave and bow) crossfaded on top. A rival can be played by more than
 * one model (Rosa & Ray bid as one team). If a model fails to load, a simple block
 * figure stands in so the game always runs.
 *
 * The crowd stands in a loose ring in front of the open door, each one turned toward
 * something inside, with the auctioneer given room on the left. Between rounds they
 * walk down the row to the next unit (see `walkOver`).
 */
import * as THREE from 'three';
import type { Bot } from '../game/bots';
import { box, cyl, sphere, cone, mat, mesh } from '../game/items/shapes';
import { tween, easeOut, easeInOut } from '../core/tween';
import { PACK_CHARACTERS } from '../pack/manifest';
import { character, preload } from '../pack/loader';
import { voiceLines, type Channel } from '../pack/voices';
import { addJaw } from './jaw';
import type { RNG } from '../core/rng';

/** What the round controller can ask any crowd member to do. `member` picks one model of a team. */
export interface Actor {
  readonly group: THREE.Group;
  bid(member?: number): void;
  sulk(member?: number): void;
  cheer(): void;
  flair(member?: number): void;
  /** Auctioneer moves: talk (loop while speaking), gesture, point, wave, bow. */
  play(clip: string, member?: number): void;
  talk(on: boolean): void;
  update(dt: number): void;
  labelAnchor(out: THREE.Vector3): THREE.Vector3;
}

/* ------------------------------------------------------------------ */
/*                          pack character actor                       */
/* ------------------------------------------------------------------ */

interface Member {
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  idle: THREE.AnimationAction | null;
  oneShot: THREE.AnimationAction | null;
  talk: THREE.AnimationAction | null;
  jaw: ((open: number) => void) | null;
  mouth: number;
}

class PackActor implements Actor {
  readonly group = new THREE.Group();
  private members: Member[] = [];
  private height = 1.8;
  private talking = false;
  private timers: { at: number; fn: () => void }[] = [];
  private t = 0;
  /** Which voice channel this actor's mouth follows. */
  channel: Channel = 'crowd';

  addMember(object: THREE.Object3D, clips: THREE.AnimationClip[], height: number, x: number, mouth: boolean): void {
    object.position.x = x;
    object.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    this.group.add(object);
    const mixer = new THREE.AnimationMixer(object);
    const actions = new Map(clips.map((c) => [c.name, mixer.clipAction(c)]));
    const idle = actions.get('idle') ?? null;
    if (idle) { idle.play(); idle.time = Math.random() * idle.getClip().duration; }
    let jaw: Member['jaw'] = null;
    if (mouth) { try { jaw = addJaw(object); } catch (e) { console.warn('jaw morph failed', e); } }
    const m: Member = { object, mixer, actions, idle, oneShot: null, talk: null, jaw, mouth: 0 };
    mixer.addEventListener('finished', (e) => {
      if (e.action !== m.oneShot) return;
      m.oneShot = null;
      const back = this.talking && m.actions.get('talk') ? m.actions.get('talk')! : m.idle;
      if (back) { back.reset().fadeIn(0.3).play(); e.action.fadeOut(0.3); if (back !== m.idle) m.talk = back; }
    });
    this.members.push(m);
    this.height = Math.max(this.height, height);
  }

  private targets(member?: number): Member[] { return member === undefined ? this.members : this.members.slice(member, member + 1); }

  play(clip: string, member?: number): void {
    for (const m of this.targets(member)) {
      const a = m.actions.get(clip);
      if (!a) continue;
      const from = m.oneShot ?? m.talk ?? m.idle;
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true;
      a.fadeIn(0.18).play();
      if (from && from !== a) from.fadeOut(0.18);
      m.oneShot = a; m.talk = null;
    }
  }

  /** A team reacts together, the partner a beat later. */
  private together(clip: string): void {
    this.members.forEach((m, i) => (i === 0 ? this.play(clip, 0) : this.later(0.18 + 0.12 * i, () => this.play(clip, i))));
  }
  private later(sec: number, fn: () => void): void { this.timers.push({ at: this.t + sec, fn }); }

  bid(member = 0): void { this.play('bid', member); }
  sulk(member?: number): void { if (member === undefined) this.together('sulk'); else this.play('sulk', member); }
  cheer(): void { this.together('cheer'); }
  flair(member = 0): void { this.play('flair', member); }

  talk(on: boolean): void {
    if (on === this.talking) return;
    this.talking = on;
    for (const m of this.members) {
      const talk = m.actions.get('talk');
      if (!talk || m.oneShot) continue; // a one-shot returns to talk/idle by itself
      if (on) { talk.reset().fadeIn(0.2).play(); m.idle?.fadeOut(0.2); m.talk = talk; }
      else if (m.talk) { m.idle?.reset().fadeIn(0.3).play(); m.talk.fadeOut(0.3); m.talk = null; }
    }
  }

  update(dt: number): void {
    this.t += dt;
    if (this.timers.length) { const due = this.timers.filter((x) => x.at <= this.t); this.timers = this.timers.filter((x) => x.at > this.t); for (const d of due) d.fn(); }
    // mouth: follow the recorded line's loudness; with no audio (muted, synthesiser), flap along while talking
    const level = this.talking ? voiceLines.level(this.channel) : 0;
    const audible = this.talking && voiceLines.isBusy(this.channel);
    for (const m of this.members) {
      if (!m.jaw) { m.mixer.update(dt); continue; }
      let want = 0;
      if (audible) want = THREE.MathUtils.clamp(level * 5.5 - 0.08, 0, 1);
      else if (this.talking) want = Math.max(0, 0.45 + 0.45 * Math.sin(this.t * 12.5) * (0.55 + 0.45 * Math.sin(this.t * 3.1)));
      const k = want > m.mouth ? 1 - Math.pow(0.0001, dt) : 1 - Math.pow(0.002, dt); // quick to open, softer to close
      m.mouth += (want - m.mouth) * k;
      m.jaw(m.mouth);
      m.mixer.update(dt);
    }
  }

  labelAnchor(out: THREE.Vector3): THREE.Vector3 { return out.set(0, this.height + 0.22, 0).applyMatrix4(this.group.matrixWorld); }
}

/* ------------------------------------------------------------------ */
/*                       block-figure fallback actor                    */
/* ------------------------------------------------------------------ */

class BlockActor implements Actor {
  readonly group = new THREE.Group();
  private head: THREE.Mesh;
  private rightArm: THREE.Group;
  private leftArm: THREE.Group;
  private phase = Math.random() * 10;
  private excite = 0;
  private t = 0;

  constructor(color: number, skin: number, hat: Bot['hat'] | 'auctioneer') {
    const g = this.group;
    g.add(box(0.34, 0.75, 0.24, 0x2b2f3a, { rough: 0.9 }));
    const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), mat(color, { rough: 0.85 })); torso.position.y = 1.08; g.add(torso);
    this.head = sphere(0.14, skin, { rough: 0.7 }); this.head.position.y = 1.52; g.add(this.head);
    if (hat !== 'none') { const brim = cyl(0.2, 0.2, 0.02, hat === 'auctioneer' ? 0x2b2b2b : color); brim.position.y = 1.6; g.add(brim); }
    if (hat === 'auctioneer') { const tie = cone(0.03, 0.2, 0xb02020); tie.rotation.x = Math.PI; tie.position.set(0, 1.2, 0.2); g.add(tie); }
    const mkArm = (side: number) => {
      const a = new THREE.Group();
      const upper = mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), mat(color, { rough: 0.85 })); upper.position.y = -0.16; a.add(upper);
      const hand = sphere(0.055, skin, { rough: 0.7 }); hand.position.y = -0.36; a.add(hand);
      a.position.set(side * 0.26, 1.28, 0); a.rotation.z = side * 0.15;
      return a;
    };
    this.rightArm = mkArm(1); this.leftArm = mkArm(-1);
    g.add(this.rightArm, this.leftArm);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  bid(): void { const a = this.rightArm; this.excite = 1; tween(0.18, (k) => { a.rotation.x = -2.6 * k; }, easeOut).then(() => tween(0.9, (k) => { a.rotation.x = -2.6 + 2.6 * k * k; }, easeInOut)); }
  sulk(): void { for (const a of [this.leftArm, this.rightArm]) { const s = a === this.rightArm ? 1 : -1; tween(0.25, (k) => { a.rotation.z = s * (0.15 + 1.1 * k); }, easeOut).then(() => tween(0.8, (k) => { a.rotation.z = s * (1.25 - 1.1 * k); }, easeInOut)); } }
  cheer(): void { for (const a of [this.leftArm, this.rightArm]) tween(0.2, (k) => { a.rotation.x = -2.9 * k; }, easeOut).then(() => tween(1.2, (k) => { a.rotation.x = -2.9 + 2.9 * k; }, easeInOut)); this.excite = 2; }
  flair(): void { this.bid(); }
  play(clip: string): void { if (clip === 'point' || clip === 'gesture') this.bid(); if (clip === 'bow' || clip === 'wave') this.cheer(); }
  talk(): void { /* no mouth to move */ }
  update(dt: number): void {
    this.t += dt; this.excite = Math.max(0, this.excite - dt);
    this.head.position.y = 1.52 + Math.sin(this.t * 1.7 + this.phase) * 0.008 + this.excite * Math.abs(Math.sin(this.t * 12)) * 0.02;
  }
  labelAnchor(out: THREE.Vector3): THREE.Vector3 { return out.set(0, 1.95, 0).applyMatrix4(this.group.matrixWorld); }
}

/* ------------------------------------------------------------------ */
/*                                 crowd                               */
/* ------------------------------------------------------------------ */

const AUCTIONEER = 'auctioneer';
const AUCTIONEER_SPOT = { x: -2.6, z: 0.5, ry: 0.75 };

/**
 * Standing spots: a loose ring in front of the door, each spot with a point inside the unit
 * that the rival peers at. The left side near the door stays clear for the auctioneer, and
 * the inspection camera's sweep (close to the door, up to ±0.6 rad) passes between them.
 */
const SLOTS = [
  { x: 2.3, z: 1.05, lx: 0.5, lz: -1.6 }, // right of the door, leaning in
  { x: -2.1, z: 2.95, lx: -0.3, lz: -1.2 }, // back left, behind the auctioneer's shoulder
  { x: 2.5, z: 2.9, lx: 0.3, lz: -1.0 }, // back right
  { x: 3.2, z: 1.5, lx: 0.8, lz: -1.3 }, // far right
  { x: -3.1, z: 2.4, lx: -0.6, lz: -1.0 }, // far left
  { x: 1.1, z: 3.3, lx: 0, lz: -1.0 }, // centre back (menu only)
];

interface Placed { actor: Actor; x: number; z: number; yaw: number }
interface Mover { actor: Actor; mode: 'stay' | 'walk' | 'arrive'; fromX: number; fromZ: number; toX: number; toZ: number; yawTo: number; start: number; dur: number; t: number; wobble: number }

async function buildActor(packIds: string[], fallback: () => Actor, channel: Channel): Promise<Actor> {
  try {
    const a = new PackActor();
    a.channel = channel;
    const spread = packIds.length > 1 ? 0.36 : 0;
    for (let i = 0; i < packIds.length; i++) {
      const c = PACK_CHARACTERS[packIds[i]];
      const { object, clips } = await character(c.model);
      a.addMember(object, clips, c.height_m, (i - (packIds.length - 1) / 2) * spread * 2, channel === 'auctioneer');
    }
    return a;
  } catch (e) {
    console.warn('character model failed, using block figure', e);
    return fallback();
  }
}

export class Crowd {
  readonly rivals = new Map<string, Actor>();
  auctioneer: Actor;
  private readonly root = new THREE.Group();
  private placed = new Map<string, Placed>();
  private cache = new Map<string, Actor>();
  private movers: Mover[] = [];
  private move: { seconds: number; pitch: number; t: number; resolve: () => void } | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.auctioneer = new BlockActor(0xf0e6d2, 0xe8beac, 'auctioneer');
    this.auctioneer.group.visible = false; // only shown if the real model fails to load
    this.placeAuctioneer();
  }

  private placeAuctioneer(): void {
    this.auctioneer.group.position.set(AUCTIONEER_SPOT.x, 0, AUCTIONEER_SPOT.z);
    this.auctioneer.group.rotation.set(0, AUCTIONEER_SPOT.ry, 0);
    this.root.add(this.auctioneer.group);
  }

  /** Load every character model once (they are needed all session). Reports 0..1 progress. */
  async loadCharacters(onProgress?: (p: number) => void): Promise<void> {
    const ids = Object.keys(PACK_CHARACTERS);
    let done = 0;
    await Promise.all(ids.map((id) => preload(PACK_CHARACTERS[id].model, 'char').catch(() => undefined).then(() => onProgress?.(++done / ids.length))));
    const auct = await buildActor([AUCTIONEER], () => new BlockActor(0xf0e6d2, 0xe8beac, 'auctioneer'), 'auctioneer');
    this.root.remove(this.auctioneer.group);
    this.auctioneer = auct;
    this.auctioneer.group.visible = true;
    this.placeAuctioneer();
  }

  private async actorFor(b: Bot): Promise<Actor> {
    let a = this.cache.get(b.id);
    if (!a) { a = await buildActor(b.pack, () => new BlockActor(b.color, b.skin, b.hat), 'crowd'); this.cache.set(b.id, a); }
    return a;
  }

  /** Where bot `i` of a line-up stands: its slot, roughed up a little so no two rounds look staged. */
  private spot(i: number, rng?: RNG): { x: number; z: number; yaw: number } {
    const s = SLOTS[i % SLOTS.length];
    const jx = rng ? rng.range(-0.22, 0.22) : 0, jz = rng ? rng.range(-0.2, 0.2) : 0;
    const lx = s.lx + (rng ? rng.range(-0.35, 0.35) : 0), lz = s.lz + (rng ? rng.range(-0.4, 0.3) : 0);
    const x = s.x + jx, z = s.z + jz;
    return { x, z, yaw: Math.atan2(lx - x, lz - z) }; // models face +z: turn to look at the point inside
  }

  private place(bots: Bot[], actors: Actor[], spots: { x: number; z: number; yaw: number }[]): void {
    for (const f of this.rivals.values()) this.root.remove(f.group);
    this.rivals.clear(); this.placed.clear();
    bots.forEach((b, i) => {
      const f = actors[i], p = spots[i];
      f.group.position.set(p.x, 0, p.z);
      f.group.rotation.set(0, p.yaw, 0);
      this.rivals.set(b.id, f);
      this.placed.set(b.id, { actor: f, x: p.x, z: p.z, yaw: p.yaw });
      this.root.add(f.group);
    });
  }

  /** Put this round's rivals in their spots (models already loaded are reused). */
  async setRivals(bots: Bot[], rng?: RNG): Promise<void> {
    const built = await Promise.all(bots.map((b) => this.actorFor(b)));
    this.place(bots, built, bots.map((_, i) => this.spot(i, rng)));
  }

  /**
   * The row slides one unit to the left over `seconds` (the caller reports the slide each frame
   * through `update`): the crowd walks to the next unit. Rivals in both line-ups and the
   * auctioneer cross over; rivals who are done for the day stay behind and slide out of view;
   * new faces are already waiting at the next unit. Resolves once everyone has settled.
   */
  async walkOver(next: Bot[], pitch: number, seconds: number, rng?: RNG): Promise<void> {
    const actors = await Promise.all(next.map((b) => this.actorFor(b)));
    const spots = next.map((_, i) => this.spot(i, rng));
    const movers: Mover[] = [];
    const mk = (actor: Actor, mode: Mover['mode'], fromX: number, fromZ: number, toX: number, toZ: number, yawTo: number, start: number, dur: number) =>
      movers.push({ actor, mode, fromX, fromZ, toX, toZ, yawTo, start, dur, t: 0, wobble: Math.random() * 6 });
    // the auctioneer leads the way
    mk(this.auctioneer, 'walk', AUCTIONEER_SPOT.x, AUCTIONEER_SPOT.z, AUCTIONEER_SPOT.x, AUCTIONEER_SPOT.z, AUCTIONEER_SPOT.ry, 0.05, seconds * 0.62);
    next.forEach((b, i) => {
      const was = this.placed.get(b.id), p = spots[i];
      if (was) mk(actors[i], 'walk', was.x, was.z, p.x, p.z, p.yaw, 0.15 + i * 0.16 + (rng ? rng.range(0, 0.2) : 0), seconds * (0.5 + 0.08 * (i % 3)));
      else { mk(actors[i], 'arrive', p.x + pitch, p.z, p.x, p.z, p.yaw, 0, 0); actors[i].group.rotation.set(0, p.yaw, 0); this.root.add(actors[i].group); }
    });
    for (const [id, was] of this.placed) if (!next.some((b) => b.id === id)) mk(was.actor, 'stay', was.x, was.z, was.x, was.z, was.yaw, 0, 0);
    this.movers = movers;
    await new Promise<void>((resolve) => { this.move = { seconds, pitch, t: 0, resolve }; });
    // settle: the new line-up in its spots, the old faces gone
    for (const m of movers) if (m.mode === 'stay') this.root.remove(m.actor.group);
    this.place(next, actors, spots);
    this.placeAuctioneer();
    this.movers = []; this.move = null;
  }

  /** Walking: slide to the new spot with a bounce, facing the way you go, then turn back to the door. */
  private stepMovers(dt: number, shift: number): void {
    const mv = this.move!;
    mv.t += dt;
    let settled = mv.t >= mv.seconds;
    for (const m of this.movers) {
      m.t += dt;
      const g = m.actor.group;
      if (m.mode === 'stay') { g.position.x = m.fromX - shift; continue; }
      if (m.mode === 'arrive') { g.position.x = m.fromX - shift; continue; }
      if (m.t < m.start) { g.position.x = m.fromX - shift; settled = false; continue; }
      const k = THREE.MathUtils.clamp((m.t - m.start) / m.dur, 0, 1);
      if (m.t < m.start + m.dur + 0.3) settled = false;
      const e = easeInOut(k);
      // from the old spot (sliding away with the row) to the new spot at the origin
      g.position.x = THREE.MathUtils.lerp(m.fromX - shift, m.toX, e);
      // walk along the doors rather than through the camera: the path bows in toward the row
      const zLine = THREE.MathUtils.lerp(m.fromZ, m.toZ, e);
      g.position.z = zLine - Math.max(0, zLine - 1.5) * 0.85 * Math.sin(Math.PI * k);
      const walking = k > 0 && k < 1;
      const phase = (m.t - m.start) * 9 + m.wobble;
      g.position.y = walking ? Math.abs(Math.sin(phase)) * 0.035 * Math.sqrt(Math.sin(Math.PI * k)) : 0;
      // face the way you are going (+x), then turn back to the door
      const dirYaw = Math.PI / 2;
      const yaw = k < 0.12 ? THREE.MathUtils.lerp(m.yawTo, dirYaw, k / 0.12) : k > 0.82 ? THREE.MathUtils.lerp(dirYaw, m.yawTo, (k - 0.82) / 0.18) : dirYaw;
      g.rotation.set(walking ? 0.06 : 0, yaw, walking ? Math.sin(phase) * 0.03 : 0, 'YXZ');
    }
    if (settled) { const r = mv.resolve; this.move = null; r(); }
  }

  /** `shift` is how far the row has slid (metres); only read while the crowd is walking over. */
  update(dt: number, shift = 0): void {
    if (this.move) this.stepMovers(dt, shift);
    const seen = new Set<Actor>();
    for (const f of this.rivals.values()) { seen.add(f); f.update(dt); }
    for (const m of this.movers) if (!seen.has(m.actor) && m.actor !== this.auctioneer) { seen.add(m.actor); m.actor.update(dt); }
    this.auctioneer.update(dt);
  }
}
