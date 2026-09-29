/** Roll-up door, hasp + padlock, bolt cutters and their animations. */
import * as THREE from 'three';
import { LOCKER } from '../game/lockerGen';
import { box, cyl, torus, mat, mesh, rot } from '../game/items/shapes';
import { tween, wait, easeInOut, easeIn, easeOut, bounceOut } from '../core/tween';
import { sfx } from '../audio/sfx';

const SLATS = 16;

export class RollupDoor {
  readonly group = new THREE.Group();
  private slats: THREE.Mesh[] = [];
  private drum: THREE.Mesh;
  private lockGroup = new THREE.Group();
  private padlock = new THREE.Group();
  private cutters = new THREE.Group();
  private cutterArms: [THREE.Group, THREE.Group];
  private openAmount = 0;
  private slatH: number;
  readonly lockPos = new THREE.Vector3(0, 0.42, 0.14);

  constructor(scene: THREE.Scene) {
    const W = LOCKER.width, H = LOCKER.height;
    this.slatH = H / SLATS;
    const slatMat = new THREE.MeshStandardMaterial({ color: 0xd0782f, roughness: 0.55, metalness: 0.35 });
    const slatMatDark = new THREE.MeshStandardMaterial({ color: 0xa85d22, roughness: 0.6, metalness: 0.35 });
    for (let i = 0; i < SLATS; i++) {
      const s = mesh(new THREE.BoxGeometry(W + 0.1, this.slatH * 0.985, 0.05), i % 2 ? slatMat : slatMatDark);
      s.position.set(0, this.slatH * (i + 0.5), 0.05);
      this.group.add(s);
      this.slats.push(s);
    }
    // dark backing so nothing peeks through the slat grooves while closed
    const backing = mesh(new THREE.PlaneGeometry(W + 0.1, H + 0.2), mat(0x2a1a0c, { rough: 1 })); backing.position.set(0, H / 2, 0.02); backing.castShadow = false; this.slats[0].add(backing); backing.position.set(0, H / 2 - this.slatH * 0.5, -0.03);
    // bottom rail with handle
    const rail = box(W + 0.1, 0.06, 0.08, 0x333333, { rough: 0.5, metal: 0.6 }); rail.position.set(0, 0.03, 0.06); this.slats[0].add(rail); rail.position.set(0, -this.slatH * 0.45, 0.02);
    this.drum = mesh(new THREE.CylinderGeometry(0.16, 0.16, W + 0.2, 20), mat(0x444444, { rough: 0.5, metal: 0.6 }));
    this.drum.rotation.z = Math.PI / 2; this.drum.position.set(0, H + 0.12, 0.12);
    this.group.add(this.drum);
    const hood = box(W + 0.3, 0.42, 0.42, 0x3a3530, { rough: 0.6, metal: 0.4 }); hood.position.set(0, H - 0.03, 0.12); this.group.add(hood);

    // hasp + padlock at bottom centre
    const hasp = box(0.2, 0.06, 0.03, 0x777777, { rough: 0.4, metal: 0.8 }); hasp.position.set(0, 0.36, 0.09); this.lockGroup.add(hasp);
    const staple = torus(0.035, 0.008, 0x888888, { rough: 0.3, metal: 0.9 }); staple.position.set(0, 0.42, 0.11); this.lockGroup.add(staple);
    const body = box(0.11, 0.1, 0.045, 0xc9a227, { rough: 0.3, metal: 0.9 }); body.position.set(0, 0.28, 0.13); this.padlock.add(body);
    const shackle = torus(0.04, 0.009, 0xaaaaaa, { rough: 0.25, metal: 1 }); shackle.position.set(0, 0.38, 0.13); this.padlock.add(shackle);
    const keyhole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8), mat(0x111111)); keyhole.rotation.x = Math.PI / 2; keyhole.position.set(0, 0.31, 0.155); this.padlock.add(keyhole);
    this.padlock.scale.setScalar(1.6); this.padlock.position.set(0, -0.14, 0.02);
    this.lockGroup.add(this.padlock);
    this.group.add(this.lockGroup);

    // bolt cutters: two long handles meeting at jaws
    const mkArm = (side: number) => {
      const arm = new THREE.Group();
      const handle = rot(cyl(0.018, 0.018, 0.8, 0xd12e2e, { rough: 0.5 }), 0, 0, 0); handle.position.y = -0.4; arm.add(handle);
      const grip = rot(cyl(0.024, 0.024, 0.25, 0x222222, { rough: 0.8 }), 0, 0, 0); grip.position.y = -0.7; arm.add(grip);
      const jaw = box(0.05, 0.14, 0.03, 0x666666, { rough: 0.3, metal: 0.9 }); jaw.position.set(side * 0.02, 0, 0); arm.add(jaw);
      return arm;
    };
    this.cutterArms = [mkArm(-1), mkArm(1)];
    this.cutterArms[0].rotation.z = -0.35; this.cutterArms[1].rotation.z = 0.35;
    this.cutters.add(...this.cutterArms);
    this.cutters.visible = false;
    this.group.add(this.cutters);

    scene.add(this.group);
    this.setOpen(0);
  }

  get isOpen(): boolean { return this.openAmount > 0.95; }

  setOpen(t: number): void {
    this.openAmount = t;
    const H = LOCKER.height;
    const lift = t * (H + this.slatH);
    for (let i = 0; i < SLATS; i++) {
      const s = this.slats[i];
      const y = this.slatH * (i + 0.5) + lift;
      const over = y - (H - 0.05);
      if (over > 0) {
        // slat curls into the drum: shrink and tuck it in
        const k = Math.min(1, over / (this.slatH * 1.5));
        s.position.set(0, H - 0.05 + Math.sin(k * 1.2) * 0.12, 0.05 + k * 0.2);
        s.scale.y = Math.max(0.001, 1 - k);
        s.visible = k < 0.999;
      } else {
        s.position.set(0, y, 0.05);
        s.scale.y = 1; s.visible = true;
      }
    }
    this.drum.rotation.x = t * 12;
    this.lockGroup.position.y = lift;
    this.lockGroup.visible = t < 0.05 || this.padlock.visible;
  }

  resetLock(): void {
    this.padlock.visible = true;
    this.padlock.position.set(0, -0.14, 0.02); this.padlock.rotation.set(0, 0, 0);
    this.lockGroup.visible = true;
  }

  /** Cut the lock: cutters swing in, bite, spark, lock drops. Resolves when done. */
  async cutLock(onSnap: () => void): Promise<void> {
    const c = this.cutters;
    c.visible = true;
    c.position.set(-1.5, 0.5, 0.9);
    c.rotation.set(0.2, -0.9, -1.4);
    this.cutterArms[0].rotation.z = -0.35; this.cutterArms[1].rotation.z = 0.35;
    const target = new THREE.Vector3(0.02, 0.4, 0.2);
    const from = c.position.clone();
    await tween(0.7, (k) => { c.position.lerpVectors(from, target, k); c.rotation.set(0.2 - 0.2 * k, -0.9 + 0.6 * k, -1.4 - 0.15 * k); }, easeInOut);
    await wait(0.25);
    // squeeze (twice, second one snaps)
    await tween(0.35, (k) => { this.cutterArms[0].rotation.z = -0.35 + 0.2 * k; this.cutterArms[1].rotation.z = 0.35 - 0.2 * k; }, easeIn);
    await tween(0.2, (k) => { this.cutterArms[0].rotation.z = -0.15 - 0.15 * k; this.cutterArms[1].rotation.z = 0.15 + 0.15 * k; }, easeOut);
    await tween(0.3, (k) => { this.cutterArms[0].rotation.z = -0.3 + 0.3 * k; this.cutterArms[1].rotation.z = 0.3 - 0.3 * k; }, easeIn);
    sfx.boltCutterSnap();
    onSnap();
    // lock falls
    const p = this.padlock;
    const fall = tween(0.55, (k) => { p.position.y = -0.14 - 0.3 * k; p.position.z = 0.02 + 0.12 * k; p.rotation.x = -1.2 * k; p.rotation.z = 0.6 * k; }, bounceOut);
    const out = tween(0.6, (k) => { c.position.lerpVectors(target, from, k); c.rotation.y = -0.3 - 0.6 * k; }, easeInOut);
    await Promise.all([fall, out]);
    sfx.lockDrop();
    c.visible = false;
    await wait(0.2);
    this.padlock.visible = false;
  }

  async open(): Promise<void> {
    this.padlock.visible = false;
    sfx.doorRoll(2.4);
    await tween(2.4, (k) => this.setOpen(k), easeInOut);
  }

  async close(): Promise<void> {
    sfx.doorRoll(1.1);
    await tween(1.1, (k) => this.setOpen(1 - k), easeIn);
    sfx.doorSlam();
    // little rattle
    await tween(0.35, (k) => { this.group.position.y = Math.sin(k * Math.PI * 4) * 0.02 * (1 - k); }, easeOut);
    this.group.position.y = 0;
  }
}
