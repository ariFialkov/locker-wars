/** Stylised rival buyers and the auctioneer, with tiny gesture animations. */
import * as THREE from 'three';
import type { Bot } from '../game/bots';
import { box, cyl, sphere, cone, mat, mesh, group } from '../game/items/shapes';
import { tween, easeOut, easeInOut } from '../core/tween';

export class Figure {
  readonly group = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly rightArm: THREE.Group;
  readonly leftArm: THREE.Group;
  private phase = Math.random() * 10;
  private baseY = 0;
  private excite = 0;

  constructor(color: number, skin: number, hat: Bot['hat'] | 'auctioneer', scale = 1) {
    const g = this.group;
    const pants = box(0.34, 0.75, 0.24, 0x2b2f3a, { rough: 0.9 }); g.add(pants);
    for (const s of [-1, 1]) { const shoe = box(0.12, 0.06, 0.26, 0x1a1a1a, { rough: 0.8 }); shoe.position.set(s * 0.1, 0.03, 0.03); g.add(shoe); }
    const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), mat(color, { rough: 0.85 })); torso.position.y = 1.08; g.add(torso);
    this.head = sphere(0.14, skin, { rough: 0.7 }); this.head.position.y = 1.52; g.add(this.head);
    const neck = cyl(0.06, 0.06, 0.08, skin, { rough: 0.7 }); neck.position.y = 1.36; g.add(neck);
    // hats
    if (hat === 'cap' || hat === 'visor') { const brim = box(0.22, 0.03, 0.18, color, { rough: 0.8 }); brim.position.set(0, 1.62, 0.13); g.add(brim); if (hat === 'cap') { const top = sphere(0.145, color, { rough: 0.8 }); top.scale.y = 0.6; top.position.y = 1.62; g.add(top); } }
    if (hat === 'fedora') { const brim = cyl(0.22, 0.22, 0.02, 0x4a3a2a); brim.position.y = 1.6; g.add(brim); const crown = cyl(0.13, 0.15, 0.14, 0x4a3a2a); crown.position.y = 1.61; g.add(crown); }
    if (hat === 'beanie') { const b = sphere(0.15, color, { rough: 1 }); b.scale.y = 0.75; b.position.y = 1.6; g.add(b); const pom = sphere(0.04, 0xeeeeee, { rough: 1 }); pom.position.y = 1.73; g.add(pom); }
    if (hat === 'cowboy') { const brim = cyl(0.28, 0.28, 0.02, 0x8a6a3a); brim.position.y = 1.6; g.add(brim); const crown = cyl(0.12, 0.14, 0.16, 0x8a6a3a); crown.position.y = 1.61; g.add(crown); }
    if (hat === 'auctioneer') { const brim = cyl(0.2, 0.2, 0.02, 0x2b2b2b); brim.position.y = 1.6; g.add(brim); const crown = cyl(0.12, 0.13, 0.12, 0x2b2b2b); crown.position.y = 1.61; g.add(crown); }
    // eyes + sunglasses for some
    for (const s of [-1, 1]) { const eye = sphere(0.018, 0x111111); eye.position.set(s * 0.05, 1.55, 0.125); g.add(eye); }
    // arms
    const mkArm = (side: number) => {
      const a = new THREE.Group();
      const upper = mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), mat(color, { rough: 0.85 })); upper.position.y = -0.16; a.add(upper);
      const hand = sphere(0.055, skin, { rough: 0.7 }); hand.position.y = -0.36; a.add(hand);
      a.position.set(side * 0.26, 1.28, 0);
      a.rotation.z = side * 0.15;
      return a;
    };
    this.rightArm = mkArm(1); this.leftArm = mkArm(-1);
    g.add(this.rightArm, this.leftArm);
    g.scale.setScalar(scale);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /** Quick hand-up gesture used when bidding. */
  raise(): void {
    const a = this.rightArm;
    this.excite = 1;
    tween(0.18, (k) => { a.rotation.x = -2.6 * k; a.rotation.z = 0.15 + 0.5 * k; }, easeOut).then(() => tween(0.9, (k) => { a.rotation.x = -2.6 + 2.6 * k * k; a.rotation.z = 0.65 - 0.5 * k; }, easeInOut));
  }
  /** Shrug / arms-out gesture when dropping out. */
  shrug(): void {
    for (const a of [this.leftArm, this.rightArm]) {
      const s = a === this.rightArm ? 1 : -1;
      tween(0.25, (k) => { a.rotation.z = s * (0.15 + 1.1 * k); a.rotation.x = -0.6 * k; }, easeOut).then(() => tween(0.8, (k) => { a.rotation.z = s * (1.25 - 1.1 * k); a.rotation.x = -0.6 + 0.6 * k; }, easeInOut));
    }
  }
  cheer(): void {
    for (const a of [this.leftArm, this.rightArm]) tween(0.2, (k) => { a.rotation.x = -2.9 * k; }, easeOut).then(() => tween(1.2, (k) => { a.rotation.x = -2.9 + 2.9 * k; }, easeInOut));
    this.excite = 2;
  }
  gavelSwing(): void {
    const a = this.rightArm;
    tween(0.12, (k) => { a.rotation.x = -1.6 * k; }, easeOut).then(() => tween(0.1, (k) => { a.rotation.x = -1.6 + 1.9 * k; }, easeOut)).then(() => tween(0.4, (k) => { a.rotation.x = 0.3 - 0.3 * k; }, easeInOut));
  }

  update(t: number, lookAt: THREE.Vector3 | null): void {
    // idle sway + bob; more when excited
    this.excite = Math.max(0, this.excite - 0.016);
    const b = Math.sin(t * 1.7 + this.phase) * 0.01 + this.excite * Math.abs(Math.sin(t * 12)) * 0.03;
    this.group.position.y = this.baseY + b;
    this.group.rotation.z = Math.sin(t * 0.9 + this.phase) * 0.015;
    if (lookAt) {
      const dx = lookAt.x - this.group.position.x, dz = lookAt.z - this.group.position.z;
      const yaw = Math.atan2(dx, dz);
      this.head.rotation.y = THREE.MathUtils.clamp(yaw - this.group.rotation.y, -0.9, 0.9);
    }
  }

  /** World position of the head top (for labels/speech bubbles). */
  labelAnchor(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1.95, 0).applyMatrix4(this.group.matrixWorld);
  }
}

export class Crowd {
  readonly rivals = new Map<string, Figure>();
  readonly auctioneer: Figure;
  private readonly root = new THREE.Group();
  private podium: THREE.Group;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.auctioneer = new Figure(0xf0e6d2, 0xe8beac, 'auctioneer', 1.02);
    // clipboard in left hand, gavel in right
    const clip = box(0.16, 0.22, 0.015, 0x8a6a3a); clip.position.set(0, -0.3, 0.1); clip.rotation.x = -0.4; this.auctioneer.leftArm.add(clip);
    const gavel = group(cyl(0.012, 0.012, 0.22, 0x6b4423), box(0.09, 0.05, 0.05, 0x6b4423)); gavel.children[1].position.y = 0.22; gavel.position.set(0, -0.36, 0); gavel.rotation.x = 1.2; this.auctioneer.rightArm.add(gavel);
    const tie = cone(0.03, 0.2, 0xb02020); tie.rotation.x = Math.PI; tie.position.set(0, 1.2, 0.2); this.auctioneer.group.add(tie);
    this.auctioneer.group.position.set(-2.6, 0, 0.5);
    this.auctioneer.group.rotation.y = 0.75;
    this.root.add(this.auctioneer.group);
    this.podium = group(box(0.5, 0.05, 0.4, 0x5c3a21)); this.podium.position.set(-2.85, 0, 0.85); this.root.add(this.podium);
  }

  setRivals(bots: Bot[]): void {
    for (const f of this.rivals.values()) this.root.remove(f.group);
    this.rivals.clear();
    // Fan them out along the driveway on both sides of the camera line.
    const slots = [
      { x: -2.55, z: 1.25, ry: 0.6 }, { x: 2.6, z: 1.35, ry: -0.6 }, { x: -1.7, z: 2.35, ry: 0.45 }, { x: 1.95, z: 2.45, ry: -0.45 },
      { x: -3.1, z: 2.5, ry: 0.5 }, { x: 3.1, z: 2.6, ry: -0.5 },
    ];
    bots.forEach((b, i) => {
      const f = new Figure(b.color, b.skin, b.hat, 0.97 + (i % 3) * 0.03);
      const s = slots[i % slots.length];
      f.group.position.set(s.x, 0, s.z);
      f.group.rotation.y = Math.PI + s.ry; // face the door
      this.rivals.set(b.id, f);
      this.root.add(f.group);
    });
  }

  update(t: number, focus: THREE.Vector3): void {
    for (const f of this.rivals.values()) f.update(t, focus);
    this.auctioneer.update(t, null);
  }
}
