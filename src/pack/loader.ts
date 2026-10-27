/**
 * Pack model loader. Models are {"b64": GLB} JSON files; GLBs use meshopt,
 * quantized meshes and WebP textures.
 *
 * Frame-rate rules:
 *  - one parse at a time, and the next waits for a fresh animation frame;
 *  - meshopt decoding runs in Web Workers;
 *  - every texture is uploaded to the GPU right after parsing (initTexture), so a
 *    model's first appearance on screen never stalls a frame;
 *  - item and cover models live in an LRU capped by count; pinned models (in the
 *    current locker or prefetched for the next) are never evicted.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { packUrl } from './manifest';

let workersReady = false;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let renderer: THREE.WebGLRenderer | null = null;

/** Called once with the game renderer so textures can be uploaded ahead of use. */
export function initPackLoader(r: THREE.WebGLRenderer): void {
  renderer = r;
  if (!workersReady) {
    try { (MeshoptDecoder as unknown as { useWorkers?: (n: number) => void }).useWorkers?.(Math.min(2, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))); } catch { /* single-thread fallback */ }
    workersReady = true;
  }
}

interface Entry { path: string; promise: Promise<GLTF>; gltf: GLTF | null; pins: number; lastUsed: number; kind: 'char' | 'asset' }
const cache = new Map<string, Entry>();
const MAX_ASSETS = 40;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
let chain: Promise<unknown> = Promise.resolve();

async function fetchAndParse(path: string): Promise<GLTF> {
  const res = await fetch(packUrl(path));
  if (!res.ok) throw new Error(`pack ${path}: HTTP ${res.status}`);
  const { b64 } = (await res.json()) as { b64: string };
  // native base64 decode (fast, off the JS heap)
  const buf = await (await fetch('data:application/octet-stream;base64,' + b64)).arrayBuffer();
  // serialise parsing so only one model's work lands in any frame
  const run = chain.then(async () => {
    await nextFrame();
    const gltf = await loader.parseAsync(buf, '');
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.map) { std.map.anisotropy = 4; renderer?.initTexture(std.map); }
      }
    });
    gltf.scene.userData.packOwned = true;
    return gltf;
  });
  chain = run.catch(() => undefined);
  return run;
}

function get(path: string, kind: Entry['kind']): Entry {
  let e = cache.get(path);
  if (!e) {
    const entry: Entry = { path, promise: null as unknown as Promise<GLTF>, gltf: null, pins: 0, lastUsed: performance.now(), kind };
    entry.promise = fetchAndParse(path).then((g) => { entry.gltf = g; evict(); return g; });
    entry.promise.catch(() => cache.delete(path));
    cache.set(path, entry);
    e = entry;
  }
  e.lastUsed = performance.now();
  return e;
}

function disposeGltf(g: GLTF): void {
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of ([] as THREE.Material[]).concat(m.material)) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }
  });
}

function evict(): void {
  const assets = [...cache.values()].filter((e) => e.kind === 'asset' && e.gltf);
  if (assets.length <= MAX_ASSETS) return;
  const victims = assets.filter((e) => e.pins === 0).sort((a, b) => a.lastUsed - b.lastUsed).slice(0, assets.length - MAX_ASSETS);
  for (const v of victims) { cache.delete(v.path); disposeGltf(v.gltf!); }
}

/** Start loading without using the result (prefetch). */
export function preload(path: string, kind: Entry['kind'] = 'asset'): Promise<unknown> { return get(path, kind).promise; }

/** Pin while a locker uses a model so the LRU never drops it mid-round. */
export function pin(path: string): void { const e = cache.get(path); if (e) e.pins++; }
export function unpin(path: string): void { const e = cache.get(path); if (e) { e.pins = Math.max(0, e.pins - 1); e.lastUsed = performance.now(); } evict(); }

/** A static instance sharing geometry, material and texture with the cached original. */
export async function instance(path: string): Promise<THREE.Object3D> {
  const g = await get(path, 'asset').promise;
  const o = g.scene.clone(true);
  o.userData.packOwned = true;
  return o;
}

/** A skinned instance with its own skeleton plus the model's animation clips. */
export async function character(path: string): Promise<{ object: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  const g = await get(path, 'char').promise;
  const object = cloneSkinned(g.scene);
  object.userData.packOwned = true;
  return { object, clips: g.animations };
}

export function isReady(path: string): boolean { return !!cache.get(path)?.gltf; }
export function cacheStats(): { models: number; pinned: number } {
  const all = [...cache.values()].filter((e) => e.gltf);
  return { models: all.length, pinned: all.filter((e) => e.pins > 0).length };
}
