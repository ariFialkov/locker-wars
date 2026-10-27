/**
 * The auction crowd: the auctioneer and the rival buyers.
 *
 * Characters are the asset pack's rigged models, each driven by an AnimationMixer:
 * an idle loop with one-shot clips (bid, cheer, sulk, flair; the auctioneer has talk,
 * gesture, point, wave and bow) crossfaded on top. A rival can be played by more than
 * one model (Rosa & Ray bid as one team). If a model fails to load, a simple block
 * figure stands in so the game always runs.
 */
import * as THREE from 'three';
import type { Bot } from '../game/bots';
import { box, cyl, sphere, cone, mat, mesh, group } from '../game/items/shapes';
import { tween, easeOut, easeInOut } from '../core/tween';
import { PACK_CHARACTERS } from '../pack/manifest';
import { character, preload } from '../pack/loader';

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
}

class PackActor implements Actor {
  readonly group = new THREE.Group();
  private members: Member[] = [];
  private height = 1.8;
  private talking = false;
  private timers: { at: number; fn: () => void }[] = [];
  private t = 0;

  addMember(object: THREE.Object3D, clips: THREE.AnimationClip[], height: number, x: number): void {
    object.position.x = x;
    object.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    this.group.add(object);
    const mixer = new THREE.AnimationMixer(object);
    const actions = new Map(clips.map((c) => [c.name, mixer.clipAction(c)]));
    const idle = actions.get('idle') ?? null;
    if (idle) { idle.play(); idle.time = Math.random() * idle.getClip().duration; }
    const m: Member = { object, mixer, actions, idle, oneShot: null, talk: null };
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
    for (const m of this.members) m.mixer.update(dt);
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
    this.group.children[0].position.y = 0;
    this.head.position.y = 1.52 + Math.sin(this.t * 1.7 + this.phase) * 0.008 + this.excite * Math.abs(Math.sin(this.t * 12)) * 0.02;
  }
  labelAnchor(out: THREE.Vector3): THREE.Vector3 { return out.set(0, 1.95, 0).applyMatrix4(this.group.matrixWorld); }
}

/* ------------------------------------------------------------------ */
/*                                 crowd                               */
/* ------------------------------------------------------------------ */

const AUCTIONEER = 'auctioneer';
const SLOTS = [
  { x: -2.55, z: 1.25, ry: 0.6 }, { x: 2.6, z: 1.35, ry: -0.6 }, { x: -1.7, z: 2.35, ry: 0.45 }, { x: 1.95, z: 2.45, ry: -0.45 },
  { x: -3.15, z: 2.55, ry: 0.5 }, { x: 3.15, z: 2.65, ry: -0.5 },
];

async function buildActor(packIds: string[], fallback: () => Actor): Promise<Actor> {
  try {
    const a = new PackActor();
    const spread = packIds.length > 1 ? 0.36 : 0;
    for (let i = 0; i < packIds.length; i++) {
      const c = PACK_CHARACTERS[packIds[i]];
      const { object, clips } = await character(c.model);
      a.addMember(object, clips, c.height_m, (i - (packIds.length - 1) / 2) * spread * 2);
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

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.auctioneer = new BlockActor(0xf0e6d2, 0xe8beac, 'auctioneer');
    this.auctioneer.group.visible = false; // only shown if the real model fails to load
    this.placeAuctioneer();
    const podium = group(box(0.5, 0.05, 0.4, 0x5c3a21)); podium.position.set(-2.85, 0, 0.85); this.root.add(podium);
  }

  private placeAuctioneer(): void {
    this.auctioneer.group.position.set(-2.6, 0, 0.5);
    this.auctioneer.group.rotation.y = 0.75;
    this.root.add(this.auctioneer.group);
  }

  /** Load every character model once (they are needed all session). Reports 0..1 progress. */
  async loadCharacters(onProgress?: (p: number) => void): Promise<void> {
    const ids = Object.keys(PACK_CHARACTERS);
    let done = 0;
    await Promise.all(ids.map((id) => preload(PACK_CHARACTERS[id].model, 'char').catch(() => undefined).then(() => onProgress?.(++done / ids.length))));
    const auct = await buildActor([AUCTIONEER], () => new BlockActor(0xf0e6d2, 0xe8beac, 'auctioneer'));
    this.root.remove(this.auctioneer.group);
    this.auctioneer = auct;
    this.auctioneer.group.visible = true;
    this.placeAuctioneer();
  }

  async setRivals(bots: Bot[]): Promise<void> {
    const built = await Promise.all(bots.map((b) => buildActor(b.pack, () => new BlockActor(b.color, b.skin, b.hat))));
    for (const f of this.rivals.values()) this.root.remove(f.group);
    this.rivals.clear();
    bots.forEach((b, i) => {
      const f = built[i];
      const s = SLOTS[i % SLOTS.length];
      f.group.position.set(s.x, 0, s.z);
      f.group.rotation.y = Math.PI + s.ry; // face the door
      this.rivals.set(b.id, f);
      this.root.add(f.group);
    });
  }

  update(dt: number): void {
    for (const f of this.rivals.values()) f.update(dt);
    this.auctioneer.update(dt);
  }
}
