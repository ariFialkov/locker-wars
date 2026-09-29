/** Builds and animates a locker's contents (visible items + covers + reveals). */
import * as THREE from 'three';
import type { Locker, PlacedItem, Appraisal } from '../game/lockerGen';
import { makeRNG } from '../core/rng';
import { buildCover } from '../game/items/covers';
import { tween, wait, easeOut, easeIn, backOut } from '../core/tween';
import { sfx } from '../audio/sfx';

interface Entry { placed: PlacedItem; root: THREE.Group; cover: THREE.Group | null; item: THREE.Group | null }

const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 });

export class LockerContents {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private halo: THREE.Group | null = null;

  constructor(scene: THREE.Scene, locker: Locker) {
    scene.add(this.group);
    for (const p of locker.items) {
      const root = new THREE.Group();
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = p.rotY;
      let cover: THREE.Group | null = null, item: THREE.Group | null = null;
      const rng = makeRNG(p.seed);
      if (p.hidden) { cover = buildCover(rng, p.cover!.kind, p.cover!.dims); root.add(cover); }
      else { item = p.def!.build(rng); root.add(item); }
      this.group.add(root);
      this.entries.set(p.uid, { placed: p, root, cover, item });
    }
  }

  worldPos(uid: string, out = new THREE.Vector3()): THREE.Vector3 {
    const e = this.entries.get(uid)!;
    return out.set(e.placed.x, e.placed.y + e.placed.fp[1] * 0.5, e.placed.z);
  }
  footprint(uid: string): [number, number, number] { return this.entries.get(uid)!.placed.fp; }

  /** Draw attention to one item during the count-up. */
  highlight(uid: string | null): void {
    if (this.halo) { this.halo.parent?.remove(this.halo); this.halo = null; }
    if (!uid) return;
    const e = this.entries.get(uid)!;
    const [w, h, d] = e.placed.fp;
    // a floor ring + a thin bounding outline: reads as "targeted" without hiding the item
    const r = Math.max(w, d) * 0.62 + 0.08;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 40), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, h + 0.08, d + 0.08)), edgeMat);
    edges.position.y = h / 2;
    this.halo = new THREE.Group(); this.halo.add(ring, edges);
    e.root.add(this.halo);
    tween(0.6, (k) => { ring.scale.setScalar(1 + 0.15 * Math.sin(k * Math.PI)); }, easeOut);
  }

  /** Reveal a concealed slot: cover animates away, the real item pops in. */
  async reveal(a: Appraisal): Promise<void> {
    const e = this.entries.get(a.item.uid)!;
    if (!e.cover) { await this.bump(e); return; }
    const kind = a.item.cover!.kind;
    const cover = e.cover;
    const item = a.def.build(makeRNG(a.item.seed ^ 0x5bd1e995));
    // scale the revealed thing to sit inside the cover's footprint if it's bigger
    const [cw, ch, cd] = a.item.cover!.dims;
    const [iw, ih, id] = a.def.footprint;
    const s = Math.min(1, (cw + 0.15) / iw, (ch + 0.35) / ih, (cd + 0.15) / id);
    item.scale.setScalar(0.001);
    e.root.add(item);
    e.item = item;
    if (kind === 'tarp' || kind === 'blanket') {
      sfx.whoosh();
      const dir = Math.random() < 0.5 ? -1 : 1;
      await tween(0.7, (k) => { cover.position.set(dir * 1.2 * k, 1.3 * Math.sin(k * Math.PI) + 0.9 * k, 0.4 * k); cover.rotation.set(-0.8 * k, 0.2 * k, dir * 1.4 * k); cover.scale.setScalar(1 - 0.5 * k); }, easeOut);
    } else if (kind === 'box' || kind === 'crate') {
      sfx.boxOpen();
      await tween(0.35, (k) => { cover.position.y = 0.08 * Math.sin(k * Math.PI); cover.rotation.z = 0.08 * Math.sin(k * Math.PI * 2); }, easeOut);
      await tween(0.4, (k) => { cover.scale.set(1 + 0.2 * k, 1 - k, 1 + 0.2 * k); }, easeIn);
    } else if (kind === 'safe') {
      sfx.safeClick();
      await tween(0.9, (k) => { cover.rotation.y = Math.sin(k * Math.PI * 6) * 0.05 * (1 - k); }, easeOut);
      await tween(0.5, (k) => { cover.position.z = -0.35 * k; cover.scale.y = 1 - 0.6 * k; cover.rotation.x = -0.9 * k; }, easeIn);
    } else if (kind === 'suitcase') {
      sfx.boxOpen();
      await tween(0.5, (k) => { cover.rotation.x = -1.1 * k; cover.position.z = -0.15 * k; }, easeOut);
      await tween(0.3, (k) => { cover.scale.setScalar(1 - k); }, easeIn);
    } else {
      sfx.whoosh();
      await tween(0.45, (k) => { cover.scale.set(1 + 0.3 * k, 1 - k, 1 + 0.3 * k); }, easeIn);
    }
    cover.visible = false;
    await tween(0.55, (k) => { item.scale.setScalar(Math.max(0.001, s * k)); item.position.y = 0.25 * Math.sin(k * Math.PI); }, backOut);
    e.cover = null;
  }

  /** Little hop for a visible item as it is appraised. */
  async bump(e: Entry): Promise<void> {
    const it = e.item; if (!it) return;
    await tween(0.45, (k) => { it.position.y = 0.12 * Math.sin(k * Math.PI); it.rotation.y = 0.15 * Math.sin(k * Math.PI * 2); }, easeOut);
  }
  bumpUid(uid: string): Promise<void> { return this.bump(this.entries.get(uid)!); }

  async fadeOut(): Promise<void> {
    await tween(0.4, (k) => { this.group.scale.setScalar(1 - 0.001 * k); }, easeIn);
    await wait(0);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); }
    });
  }
}
