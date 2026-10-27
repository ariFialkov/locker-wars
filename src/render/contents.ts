/**
 * A locker's contents in 3D: visible items, the containers that hide the rest,
 * and the reveal animations of the count-up.
 *
 * Models come from the asset pack. Everything a locker shows is loaded, uploaded to
 * the GPU and pinned before the door opens; hidden items are prefetched once the
 * auction is settled. Any model that fails to load falls back to the procedural one.
 */
import * as THREE from 'three';
import type { Locker, PlacedItem, Appraisal } from '../game/lockerGen';
import { makeRNG } from '../core/rng';
import { buildCover } from '../game/items/covers';
import type { CoverKind } from '../game/items/types';
import { tween, wait, easeOut, easeIn, backOut } from '../core/tween';
import { sfx } from '../audio/sfx';
import { PACK_ITEMS, PACK_COVERS, coverFit } from '../pack/manifest';
import { instance, preload, pin, unpin } from '../pack/loader';

interface Entry { placed: PlacedItem; root: THREE.Group; cover: THREE.Object3D | null; item: THREE.Object3D | null }

const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 });

const itemPath = (id: string): string | null => PACK_ITEMS[id]?.model ?? null;
const coverPath = (kind: CoverKind): string | null => PACK_COVERS[kind]?.model ?? null;

/** Model paths a locker shows before the auction (visible items and containers). */
export function lockerPaths(locker: Locker): string[] {
  const out = new Set<string>();
  for (const p of locker.items) {
    const path = p.hidden ? coverPath(p.cover!.kind) : itemPath(p.def!.id);
    if (path) out.add(path);
  }
  return [...out];
}

/** Start loading a future locker's models and keep them cached until released. */
export function prefetchLocker(locker: Locker): string[] {
  const paths = lockerPaths(locker);
  for (const p of paths) void preload(p).then(() => pin(p), () => undefined);
  return paths;
}
export function releasePaths(paths: string[]): void { for (const p of paths) unpin(p); }

async function itemObject(p: PlacedItem, defId: string, build: () => THREE.Object3D): Promise<THREE.Object3D> {
  const path = itemPath(defId);
  if (path) { try { return await instance(path); } catch (e) { console.warn('item model failed', defId, e); } }
  return build();
}

async function coverObject(p: PlacedItem): Promise<THREE.Object3D> {
  const c = p.cover!;
  const fit = coverFit(c.fitItem, c.kind);
  const path = coverPath(c.kind);
  if (path && fit) {
    try {
      const o = await instance(path);
      o.scale.set(fit.scale[0], fit.scale[1], fit.scale[2]);
      const g = new THREE.Group(); g.add(o);
      return g;
    } catch (e) { console.warn('cover model failed', c.kind, e); }
  }
  return buildCover(makeRNG(p.seed), c.kind, c.dims);
}

/** Objects using every material the count-up introduces, so their shaders can be compiled ahead of time. */
export function warmupObjects(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 8), ringMat), new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.1, 0.1, 0.1)), edgeMat));
  return g;
}

export class LockerContents {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private halo: THREE.Group | null = null;
  private pinned: string[] = [];
  private revealObjects = new Map<string, Promise<THREE.Object3D>>();

  private constructor(private scene: THREE.Scene) {}

  /** Load, upload and place everything visible in the locker. */
  static async create(scene: THREE.Scene, locker: Locker): Promise<LockerContents> {
    const lc = new LockerContents(scene);
    lc.pinned = lockerPaths(locker);
    await Promise.all(lc.pinned.map((p) => preload(p).then(() => pin(p), () => undefined)));
    const built = await Promise.all(locker.items.map(async (p) => {
      if (p.hidden) return { p, cover: await coverObject(p), item: null };
      return { p, cover: null, item: await itemObject(p, p.def!.id, () => p.def!.build(makeRNG(p.seed))) };
    }));
    for (const { p, cover, item } of built) {
      const root = new THREE.Group();
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = p.rotY;
      if (cover) root.add(cover);
      if (item) root.add(item);
      lc.group.add(root);
      lc.entries.set(p.uid, { placed: p, root, cover, item });
    }
    scene.add(lc.group);
    return lc;
  }

  /** Once the contents are settled, fetch every hidden item's model so reveals never wait. */
  prefetchReveals(appraisals: Appraisal[]): void {
    for (const a of appraisals) {
      if (!a.revealed || this.revealObjects.has(a.item.uid)) continue;
      const path = itemPath(a.def.id);
      if (path) { this.pinned.push(path); void preload(path).then(() => pin(path), () => undefined); }
      this.revealObjects.set(a.item.uid, itemObject(a.item, a.def.id, () => a.def.build(makeRNG(a.item.seed ^ 0x5bd1e995))));
    }
  }

  worldPos(uid: string, out = new THREE.Vector3()): THREE.Vector3 {
    const e = this.entries.get(uid)!;
    return out.set(e.placed.x, e.placed.y + e.placed.fp[1] * 0.5, e.placed.z);
  }
  footprint(uid: string): [number, number, number] { return this.entries.get(uid)!.placed.fp; }

  /** Draw attention to one item during the count-up. */
  highlight(uid: string | null): void {
    if (this.halo) { this.halo.parent?.remove(this.halo); this.halo.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.halo = null; }
    if (!uid) return;
    const e = this.entries.get(uid)!;
    const [w, h, d] = e.placed.fp;
    const r = Math.max(w, d) * 0.62 + 0.08;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 40), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, h + 0.08, d + 0.08)), edgeMat);
    edges.position.y = h / 2;
    this.halo = new THREE.Group(); this.halo.add(ring, edges);
    e.root.add(this.halo);
    tween(0.6, (k) => { ring.scale.setScalar(1 + 0.15 * Math.sin(k * Math.PI)); }, easeOut);
  }

  /** Reveal a concealed slot: the container animates away and the real item pops in. */
  async reveal(a: Appraisal): Promise<void> {
    const e = this.entries.get(a.item.uid)!;
    if (!e.cover) { await this.bump(e); return; }
    const kind = a.item.cover!.kind;
    const cover = e.cover;
    if (!this.revealObjects.has(a.item.uid)) this.prefetchReveals([a]);
    const item = await this.revealObjects.get(a.item.uid)!;
    // seat the item the way the pack fits it in this container; shrink it if it is bigger than the container
    const fit = coverFit(a.def.id, kind);
    const [cw, ch, cd] = a.item.cover!.dims;
    const [iw, ih, id] = a.def.footprint;
    const s = fit && a.def.id === a.item.cover!.fitItem ? 1 : Math.min(1, (cw + 0.12) / iw, (ch + 0.3) / ih, (cd + 0.12) / id);
    const yaw = THREE.MathUtils.degToRad(fit?.item_yaw ?? 0);
    const lift = fit?.item_offset_y ?? 0;
    item.rotation.y = yaw;
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
    } else if (kind === 'suitcase' || kind === 'trunk') {
      sfx.boxOpen();
      await tween(0.5, (k) => { cover.rotation.x = -1.1 * k; cover.position.z = -0.15 * k; }, easeOut);
      await tween(0.3, (k) => { cover.scale.setScalar(1 - k); }, easeIn);
    } else {
      sfx.whoosh();
      await tween(0.45, (k) => { cover.scale.set(1 + 0.3 * k, 1 - k, 1 + 0.3 * k); }, easeIn);
    }
    cover.visible = false;
    await tween(0.55, (k) => { item.scale.setScalar(Math.max(0.001, s * k)); item.position.y = lift + 0.25 * Math.sin(k * Math.PI); }, backOut);
    item.position.y = lift;
    e.cover = null;
  }

  /** Little hop for a visible item as it is appraised. */
  async bump(e: Entry): Promise<void> {
    const it = e.item; if (!it) return;
    const y0 = it.position.y, r0 = it.rotation.y;
    await tween(0.45, (k) => { it.position.y = y0 + 0.12 * Math.sin(k * Math.PI); it.rotation.y = r0 + 0.15 * Math.sin(k * Math.PI * 2); }, easeOut);
  }
  bumpUid(uid: string): Promise<void> { return this.bump(this.entries.get(uid)!); }

  async fadeOut(): Promise<void> { await wait(0); }

  dispose(): void {
    this.scene.remove(this.group);
    this.highlight(null);
    // pack geometry/materials are shared with the cache: only free procedural fallbacks
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let p: THREE.Object3D | null = m, owned = false;
      while (p) { if (p.userData.packOwned) { owned = true; break; } p = p.parent; }
      if (!owned) m.geometry.dispose();
    });
    releasePaths(this.pinned);
    this.pinned = [];
  }
}
