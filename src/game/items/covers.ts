/** Concealments: tarps, boxes, crates, safes, suitcases, bags, blankets. */
import * as THREE from 'three';
import type { RNG } from '../../core/rng';
import type { CoverKind, SizeClass } from './types';
import { box, cyl, sphere, torus, group, at, rot, mat, mesh, WOODS, vary } from './shapes';

export const COVER_LABEL: Record<CoverKind, string> = {
  box: 'Cardboard box', crate: 'Wooden crate', safe: 'Locked safe', suitcase: 'Suitcase', bag: 'Trash bag', tarp: 'Tarp-covered lump', blanket: 'Blanket-covered shape',
};

export const COVER_ICON: Record<CoverKind, string> = { box: '📦', crate: '🪵', safe: '🔐', suitcase: '🧳', bag: '🛍️', tarp: '🟦', blanket: '🧶' };

/** Rough guess a buyer would assign to a concealed shape of this kind/size. Drives rival valuations only. */
export function coverGuess(kind: CoverKind, size: SizeClass): number {
  const base: Record<CoverKind, number> = { box: 60, crate: 200, safe: 1200, suitcase: 110, bag: 30, tarp: 240, blanket: 140 };
  const sizeMul: Record<SizeClass, number> = { S: 1, M: 1.8, L: 3, XL: 5 };
  return base[kind] * (kind === 'tarp' || kind === 'blanket' ? sizeMul[size] : 1);
}

export function coverDims(rng: RNG, kind: CoverKind, size: SizeClass): [number, number, number] {
  switch (kind) {
    case 'box': return [rng.range(0.4, 0.6), rng.range(0.35, 0.55), rng.range(0.35, 0.5)];
    case 'crate': return [rng.range(0.6, 0.9), rng.range(0.5, 0.8), rng.range(0.5, 0.7)];
    case 'safe': return [rng.range(0.4, 0.55), rng.range(0.45, 0.7), rng.range(0.4, 0.5)];
    case 'suitcase': return [rng.range(0.5, 0.7), rng.range(0.4, 0.6), rng.range(0.22, 0.3)];
    case 'bag': return [rng.range(0.5, 0.7), rng.range(0.4, 0.55), rng.range(0.45, 0.6)];
    case 'tarp':
    case 'blanket': {
      const s: Record<SizeClass, [number, number, number]> = { S: [0.5, 0.45, 0.45], M: [0.9, 0.8, 0.7], L: [1.3, 1.1, 0.9], XL: [1.9, 1.15, 1.1] };
      const [w, h, d] = s[size];
      return [w * rng.range(0.9, 1.15), h * rng.range(0.85, 1.15), d * rng.range(0.9, 1.15)];
    }
  }
}

/** Draped-cloth hull: a segmented box whose vertices are flared at the base and jittered. */
function drape(rng: RNG, w: number, h: number, d: number, color: number, rough = 0.85): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d, 6, 5, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const seedNoise = rng.next() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + h / 2) / h; // 0 bottom .. 1 top
    const flare = 1 + (1 - t) * 0.12; // skirt spreads at the floor
    const bulge = 1 + Math.sin(t * Math.PI) * 0.06;
    const n = Math.sin(x * 9.1 + seedNoise) * Math.cos(z * 7.3 + seedNoise * 0.5) * 0.03 + Math.sin(y * 11 + x * 5) * 0.015;
    const roundTop = t > 0.85 ? 1 - (t - 0.85) * 0.6 : 1;
    pos.setXYZ(i, x * flare * bulge * roundTop + n, y, z * flare * bulge * roundTop + n);
  }
  g.computeVertexNormals();
  const m = mesh(g, mat(color, { rough }));
  m.position.y = h / 2;
  return m;
}

export function buildCover(rng: RNG, kind: CoverKind, dims: [number, number, number]): THREE.Group {
  const [w, h, d] = dims;
  switch (kind) {
    case 'tarp': {
      const c = vary(rng, rng.pick([0x2a5fb0, 0x2a5fb0, 0x3b7a3b, 0x8a8a8a, 0x8b6b3a]), 0.06);
      const g = group(drape(rng, w, h, d, c, 0.6));
      // a few weights / rope details
      for (let i = 0; i < 3; i++) g.add(at(box(0.06, 0.05, 0.06, 0x333333), rng.range(-w / 2, w / 2) * 1.1, 0, (i % 2 ? 1 : -1) * d * 0.6));
      return g;
    }
    case 'blanket': {
      const c = vary(rng, rng.pick([0x7a3b3b, 0x3b4f7a, 0x6a5a4a, 0xa89f91, 0x4f7a3b]), 0.08);
      return group(drape(rng, w, h, d, c, 1));
    }
    case 'box': {
      const c = vary(rng, 0xb98b5a, 0.07);
      const b = box(w, h, d, c, { rough: 0.95 });
      const g = group(b);
      // flaps + tape + marker scribble
      g.add(at(box(w * 0.2, 0.004, d + 0.004, 0xc9b28a, { rough: 0.5 }), 0, h, 0));
      g.add(at(box(w * 0.5, 0.004, 0.02, 0xc9b28a, { rough: 0.5 }), 0, h, 0));
      g.add(at(box(w * 0.4, 0.06, 0.004, 0x333333, { rough: 0.9 }), rng.range(-0.05, 0.05), h * 0.6, d / 2 + 0.001));
      if (rng.chance(0.4)) g.add(at(box(w * 0.3, 0.12, 0.004, 0xffffff, { rough: 0.9 }), rng.range(-0.05, 0.05), h * 0.25, d / 2 + 0.001));
      return g;
    }
    case 'crate': {
      const c = vary(rng, rng.pick(WOODS), 0.08);
      const g = group();
      const t = 0.03;
      // slats on 4 sides + solid top/bottom
      g.add(box(w, t, d, c), at(box(w, t, d, c), 0, h - t, 0));
      for (let i = 0; i < 4; i++) {
        const y = t + i * ((h - 2 * t) / 4);
        const sh = (h - 2 * t) / 4 * 0.75;
        g.add(at(box(w, sh, t, c), 0, y, d / 2 - t / 2), at(box(w, sh, t, c), 0, y, -d / 2 + t / 2), at(box(t, sh, d, c), w / 2 - t / 2, y, 0), at(box(t, sh, d, c), -w / 2 + t / 2, y, 0));
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.05, h, 0.05, vary(rng, c, 0.05)), sx * (w / 2 - 0.025), 0, sz * (d / 2 - 0.025)));
      // stencil
      g.add(at(box(w * 0.5, h * 0.2, 0.003, 0x222222, { rough: 0.9 }), 0, h * 0.4, d / 2 + 0.001));
      return g;
    }
    case 'safe': {
      const c = rng.pick([0x2a2f36, 0x1d3a2a, 0x3b2a1a, 0x444444]);
      const g = group(box(w, h, d, c, { rough: 0.35, metal: 0.7 }));
      g.add(at(box(w * 0.86, h * 0.86, 0.02, vary(rng, c, 0.05), { rough: 0.3, metal: 0.7 }), 0, h * 0.07, d / 2));
      const dial = rot(cyl(0.06, 0.06, 0.03, 0xc0c0c0, { rough: 0.2, metal: 1 }), Math.PI / 2, 0, 0);
      dial.position.set(-w * 0.15, h * 0.55, d / 2 + 0.02);
      g.add(dial);
      const handle = rot(box(0.03, 0.15, 0.03, 0xc0c0c0, { rough: 0.2, metal: 1 }), 0, 0, 0.5);
      handle.position.set(w * 0.2, h * 0.45, d / 2 + 0.03);
      g.add(handle);
      return g;
    }
    case 'suitcase': {
      const c = vary(rng, rng.pick([0x3e2a1a, 0x1a1a1a, 0x7a1f1f, 0x2b4a7a, 0xb0a080]), 0.06);
      const g = group(box(w, h, d, c, { rough: 0.55 }));
      g.add(at(box(w * 0.3, 0.03, 0.03, 0x1a1a1a, { rough: 0.5 }), 0, h + 0.03, 0));
      g.add(at(box(0.02, 0.06, 0.03, 0x1a1a1a), -w * 0.15, h, 0), at(box(0.02, 0.06, 0.03, 0x1a1a1a), w * 0.15, h, 0));
      for (const s of [-1, 1]) g.add(at(box(0.05, 0.04, 0.01, 0xc9a54a, { rough: 0.3, metal: 0.8 }), s * w * 0.3, h * 0.65, d / 2));
      g.add(at(box(w + 0.01, 0.015, d + 0.01, vary(rng, c, 0.1)), 0, h * 0.6, 0));
      return g;
    }
    case 'bag': {
      const c = rng.pick([0x151515, 0x151515, 0xe8e8e8, 0x2b2b4a]);
      const s = sphere(0.5, c, { rough: 0.45, metal: 0.05 });
      s.scale.set(w / 2 * 1.9, h / 2 * 1.9 * 0.85, d / 2 * 1.9);
      s.position.y = h / 2 * 0.85;
      const knot = torus(0.05, 0.02, c, { rough: 0.45 });
      knot.position.y = h * 0.9;
      knot.rotation.x = Math.PI / 2;
      // a few lumps
      const g = group(s, knot);
      for (let i = 0; i < 4; i++) {
        const l = sphere(rng.range(0.07, 0.12), c, { rough: 0.45 });
        l.position.set(rng.range(-w / 3, w / 3), rng.range(h * 0.2, h * 0.7), rng.range(-d / 3, d / 3));
        g.add(l);
      }
      return g;
    }
  }
}
