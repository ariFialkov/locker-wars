/** Tiny primitive-composition toolkit used by all procedural item recipes. */
import * as THREE from 'three';
import type { RNG } from '../../core/rng';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export interface MatOpts { rough?: number; metal?: number; emissive?: number; flat?: boolean; transparent?: number }

export function mat(color: number | string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? 0}|${o.flat ? 1 : 0}|${o.transparent ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: o.rough ?? 0.7,
      metalness: o.metal ?? 0,
      flatShading: !!o.flat,
    });
    if (o.emissive) m.emissive = new THREE.Color(color).multiplyScalar(o.emissive);
    if (o.transparent !== undefined && o.transparent < 1) {
      m.transparent = true;
      m.opacity = o.transparent;
    }
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Box with its base at y=0 (so stacking is trivial). */
export function box(w: number, h: number, d: number, color: number | string, o: MatOpts = {}): THREE.Mesh {
  const m = mesh(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), mat(color, o));
  m.scale.set(w, h, d);
  m.position.y = h / 2;
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, color: number | string, o: MatOpts & { seg?: number } = {}): THREE.Mesh {
  const seg = o.seg ?? 20;
  const m = mesh(geo(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg)), mat(color, o));
  // Non-uniform top/bottom radius approximated by cone geometry when they differ.
  if (Math.abs(rTop - rBot) > 1e-4) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    const mm = mesh(g, mat(color, o));
    mm.position.y = h / 2;
    return mm;
  }
  m.scale.set(rTop, h, rTop);
  m.position.y = h / 2;
  return m;
}

export function sphere(r: number, color: number | string, o: MatOpts = {}): THREE.Mesh {
  const m = mesh(geo('sph', () => new THREE.SphereGeometry(1, 20, 14)), mat(color, o));
  m.scale.setScalar(r);
  m.position.y = r;
  return m;
}

export function torus(r: number, tube: number, color: number | string, o: MatOpts = {}): THREE.Mesh {
  const m = mesh(new THREE.TorusGeometry(r, tube, 10, 28), mat(color, o));
  return m;
}

export function cone(r: number, h: number, color: number | string, o: MatOpts & { seg?: number } = {}): THREE.Mesh {
  const m = mesh(new THREE.ConeGeometry(r, h, o.seg ?? 16), mat(color, o));
  m.position.y = h / 2;
  return m;
}

export function plane(w: number, h: number, color: number | string, o: MatOpts = {}): THREE.Mesh {
  const m = mesh(geo('plane', () => new THREE.PlaneGeometry(1, 1)), mat(color, o));
  m.scale.set(w, h, 1);
  (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, ry = 0): T {
  obj.position.set(x, obj.position.y + y, z);
  obj.rotation.y = ry;
  return obj;
}

export function rot<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.rotation.set(x, y, z);
  return obj;
}

/** Colour helpers — small curated palettes so items look designed, not random. */
export const WOODS = [0x8b5a2b, 0x6b4423, 0xa9764a, 0x5c3a21, 0xc49a6c, 0x3e2a1a];
export const METALS = [0x9a9da3, 0x6c7079, 0xb8bcc4, 0x55585f];
export const PLASTICS = [0xd94f3d, 0x2f6fd6, 0x3aa655, 0xf2c14e, 0xeeeeee, 0x222222, 0xff7b39, 0x8e44ad];
export const FABRICS = [0x7a3b3b, 0x3b4f7a, 0x4f7a3b, 0x7a6a3b, 0x8c8c8c, 0x2b2b2b, 0xb0907a, 0x5d3f6a];
export const PASTELS = [0xf7c9d4, 0xc9e2f7, 0xd4f7c9, 0xf7ecc9, 0xe6d3f7];

export function vary(rng: RNG, color: number, amount = 0.08): number {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + rng.range(-amount * 0.3, amount * 0.3) + 1) % 1, Math.min(1, Math.max(0, hsl.s + rng.range(-amount, amount))), Math.min(1, Math.max(0, hsl.l + rng.range(-amount, amount))));
  return c.getHex();
}

/** Simple canvas-generated label/texture for boxes, posters etc. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
