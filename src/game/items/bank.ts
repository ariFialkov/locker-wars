/**
 * The item bank: every object that can show up in a locker, each built from
 * simple primitives with per-instance colour variation so no two lockers look
 * alike. Value ranges are in USD. Keep footprints honest — the packer relies on them.
 */
import * as THREE from 'three';
import type { RNG } from '../../core/rng';
import { g } from '../../core/config';
import type { ItemDef } from './types';
import { box, cyl, sphere, torus, cone, group, at, rot, mat, mesh, WOODS, METALS, PLASTICS, FABRICS, PASTELS, vary } from './shapes';

const pickWood = (r: RNG) => vary(r, r.pick(WOODS));
const pickMetal = (r: RNG) => vary(r, r.pick(METALS), 0.04);
const pickPlastic = (r: RNG) => vary(r, r.pick(PLASTICS));
const pickFabric = (r: RNG) => vary(r, r.pick(FABRICS));
const GOLD = 0xd4af37, SILVER = 0xc0c0c0, BLACK = 0x1a1a1a, WHITE = 0xf0f0f0, CHROME = 0xdadfe6;
const metalOpts = { rough: 0.35, metal: 0.8 };
const chromeOpts = { rough: 0.2, metal: 1 };
const glassOpts = { rough: 0.05, metal: 0.1, transparent: 0.45 };

/* ---------- reusable sub-assemblies ---------- */
function legs(r: RNG, w: number, d: number, h: number, color: number, t = 0.05): THREE.Group {
  const g = group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(t, h, t, color), sx * (w / 2 - t), 0, sz * (d / 2 - t)));
  void r;
  return g;
}
function wheel(rad: number, width: number, hub = 0x999999): THREE.Group {
  const tire = rot(cyl(rad, rad, width, 0x151515, { rough: 0.9 }), 0, 0, Math.PI / 2);
  tire.position.y = 0;
  const h = rot(cyl(rad * 0.55, rad * 0.55, width + 0.01, hub, metalOpts), 0, 0, Math.PI / 2);
  h.position.y = 0;
  const g = group(tire, h);
  g.position.y = rad;
  return g;
}
function screen(w: number, h: number, frame = BLACK): THREE.Group {
  const f = box(w, h, 0.04, frame, { rough: 0.4 });
  const s = box(w * 0.94, h * 0.9, 0.01, 0x0c1a2a, { rough: 0.1, metal: 0.3 });
  s.position.z = 0.025; s.position.y = h / 2;
  return group(f, s);
}
function frameArt(r: RNG, w: number, h: number): THREE.Group {
  const frameColor = r.pick([GOLD, 0x3b2a1a, BLACK, 0xe8e4d8]);
  const f = box(w, h, 0.05, frameColor, frameColor === GOLD ? metalOpts : {});
  // "painting": a few coloured stripes/blocks on a canvas
  const canvas = box(w * 0.85, h * 0.85, 0.01, r.pick(PASTELS));
  canvas.position.z = 0.03; canvas.position.y = h * 0.5;
  const g = group(f, canvas);
  for (let i = 0; i < 4; i++) {
    const b = box(r.range(0.05, w * 0.4), r.range(0.05, h * 0.4), 0.005, pickPlastic(r));
    b.position.set(r.range(-w * 0.3, w * 0.3), h * 0.5 + r.range(-h * 0.3, h * 0.3), 0.04);
    g.add(b);
  }
  return g;
}
function cardboard(r: RNG, w: number, h: number, d: number): THREE.Group {
  const c = vary(r, 0xb98b5a, 0.06);
  const b = box(w, h, d, c, { rough: 0.95 });
  const tape = box(w * 0.18, 0.002, d + 0.002, 0xc9b28a, { rough: 0.6 });
  tape.position.y = h + 0.001;
  return group(b, tape);
}

/* ---------- the bank ---------- */
export const ITEM_BANK: ItemDef[] = [
  /* ===== FURNITURE ===== */
  {
    id: 'sofa', name: 'Three-seat sofa', category: 'furniture', size: 'XL', value: [80, 600], weight: 6, footprint: [2.0, 0.85, 0.9], soft: true, stackable: true,
    build: (r) => {
      const c = pickFabric(r);
      const base = box(2.0, 0.42, 0.9, c, { rough: 0.95 });
      const back = at(box(2.0, 0.5, 0.25, c, { rough: 0.95 }), 0, 0.4, -0.32);
      const g = group(base, back);
      for (const s of [-1, 1]) g.add(at(box(0.2, 0.28, 0.9, c, { rough: 0.95 }), s * 0.9, 0.42, 0));
      for (let i = 0; i < 3; i++) g.add(at(box(0.55, 0.12, 0.6, vary(r, c, 0.05), { rough: 0.95 }), -0.6 + i * 0.6, 0.42, 0.1));
      return g;
    },
  },
  {
    id: 'armchair', name: 'Armchair', category: 'furniture', size: 'L', value: [40, 350], weight: 7, footprint: [0.9, 0.9, 0.9], soft: true,
    build: (r) => {
      const c = pickFabric(r);
      const g = group(box(0.9, 0.42, 0.9, c, { rough: 0.95 }), at(box(0.9, 0.5, 0.22, c, { rough: 0.95 }), 0, 0.42, -0.34));
      for (const s of [-1, 1]) g.add(at(box(0.18, 0.25, 0.9, c, { rough: 0.95 }), s * 0.36, 0.42, 0));
      return g;
    },
  },
  {
    id: 'dining_table', name: 'Dining table', category: 'furniture', size: 'XL', value: [100, 800], weight: 4, footprint: [1.6, 0.76, 0.9], stackable: true,
    build: (r) => { const w = pickWood(r); return group(at(box(1.6, 0.05, 0.9, w), 0, 0.71, 0), legs(r, 1.5, 0.8, 0.71, w, 0.07)); },
  },
  {
    id: 'chairs', name: 'Set of dining chairs', category: 'furniture', size: 'L', value: [40, 250], weight: 6, footprint: [0.95, 0.95, 0.5],
    build: (r) => {
      const w = pickWood(r);
      const g = group();
      for (let i = 0; i < 2; i++) {
        const ch = group(at(box(0.42, 0.04, 0.42, w), 0, 0.43, 0), legs(r, 0.4, 0.4, 0.43, w, 0.04), at(box(0.42, 0.45, 0.04, w), 0, 0.47, -0.19));
        ch.position.x = -0.24 + i * 0.48;
        g.add(ch);
      }
      return g;
    },
  },
  {
    id: 'bookshelf', name: 'Bookshelf', category: 'furniture', size: 'L', value: [30, 200], weight: 6, footprint: [0.9, 1.8, 0.32],
    build: (r) => {
      const w = pickWood(r);
      const g = group(box(0.9, 1.8, 0.03, w), at(box(0.03, 1.8, 0.32, w), -0.435, 0, 0), at(box(0.03, 1.8, 0.32, w), 0.435, 0, 0));
      g.children[0].position.z = -0.145;
      for (let i = 0; i < 5; i++) {
        g.add(at(box(0.9, 0.03, 0.32, w), 0, i * 0.44, 0));
        if (i < 4) for (let b = 0; b < r.int(3, 8); b++) g.add(at(box(0.05, r.range(0.18, 0.3), 0.22, pickPlastic(r), { rough: 0.9 }), -0.38 + b * 0.09, i * 0.44 + 0.03, 0));
      }
      return g;
    },
  },
  {
    id: 'dresser', name: 'Chest of drawers', category: 'furniture', size: 'L', value: [60, 500], weight: 6, footprint: [1.0, 1.0, 0.5], stackable: true,
    build: (r) => {
      const w = pickWood(r);
      const g = group(box(1.0, 1.0, 0.5, w));
      for (let i = 0; i < 4; i++) {
        g.add(at(box(0.9, 0.2, 0.02, vary(r, w, 0.06)), 0, 0.05 + i * 0.235, 0.255));
        g.add(at(cyl(0.02, 0.02, 0.02, GOLD, metalOpts), 0, 0.15 + i * 0.235, 0.27, 0)).children.slice(-1)[0].rotation.x = Math.PI / 2;
      }
      return g;
    },
  },
  {
    id: 'bed', name: 'Bed frame & mattress', category: 'furniture', size: 'XL', value: [80, 600], weight: 4, footprint: [1.5, 1.0, 2.0], soft: true, stackable: true,
    build: (r) => {
      const w = pickWood(r);
      const g = group(at(box(1.5, 0.3, 2.0, w), 0, 0.1, 0), at(box(1.4, 0.22, 1.9, WHITE, { rough: 0.95 }), 0, 0.4, 0), at(box(1.5, 0.6, 0.06, w), 0, 0.4, -0.97));
      g.add(at(box(0.5, 0.12, 0.35, vary(r, 0xeeeeee), { rough: 0.95 }), 0, 0.62, -0.7));
      return g;
    },
  },
  {
    id: 'coffee_table', name: 'Coffee table', category: 'furniture', size: 'M', value: [30, 300], weight: 6, footprint: [1.0, 0.45, 0.55], stackable: true,
    build: (r) => { const w = pickWood(r); return group(at(box(1.0, 0.04, 0.55, w), 0, 0.41, 0), legs(r, 0.95, 0.5, 0.41, w)); },
  },
  {
    id: 'wardrobe', name: 'Wardrobe', category: 'furniture', size: 'XL', value: [100, 900], weight: 4, footprint: [1.2, 2.0, 0.6],
    build: (r) => {
      const w = pickWood(r);
      const g = group(box(1.2, 2.0, 0.6, w));
      for (const s of [-1, 1]) g.add(at(box(0.56, 1.9, 0.02, vary(r, w, 0.05)), s * 0.29, 0.05, 0.305), at(sphere(0.02, GOLD, metalOpts), s * 0.06, 1.0, 0.33));
      return g;
    },
  },
  {
    id: 'rocking_chair', name: 'Rocking chair', category: 'furniture', size: 'L', value: [60, 400], weight: 4, footprint: [0.6, 1.0, 0.9],
    build: (r) => {
      const w = pickWood(r);
      const g = group(at(box(0.5, 0.04, 0.5, w), 0, 0.45, 0), at(box(0.5, 0.55, 0.04, w), 0, 0.47, -0.23), legs(r, 0.48, 0.48, 0.45, w, 0.04));
      for (const s of [-1, 1]) { const rk = rot(torus(0.45, 0.02, w), Math.PI / 2, 0, 0); rk.position.set(s * 0.24, 0.45, 0); rk.scale.z = 0.4; g.add(rk); }
      return g;
    },
  },
  {
    id: 'office_chair', name: 'Office chair', category: 'furniture', size: 'M', value: [30, 400], weight: 6, footprint: [0.65, 1.1, 0.65],
    build: (r) => {
      const c = r.pick([BLACK, 0x2c2c2c, 0x3b4f7a]);
      const g = group(cyl(0.03, 0.03, 0.45, CHROME, chromeOpts), at(box(0.5, 0.08, 0.5, c, { rough: 0.9 }), 0, 0.45, 0), at(box(0.48, 0.55, 0.08, c, { rough: 0.9 }), 0, 0.53, -0.22));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(at(rot(box(0.3, 0.03, 0.04, 0x222222), 0, a, 0), Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15)); }
      return g;
    },
  },
  {
    id: 'desk', name: 'Writing desk', category: 'furniture', size: 'L', value: [50, 500], weight: 5, footprint: [1.3, 0.75, 0.6], stackable: true,
    build: (r) => { const w = pickWood(r); return group(at(box(1.3, 0.04, 0.6, w), 0, 0.71, 0), at(box(0.4, 0.68, 0.55, w), 0.42, 0, 0), legs(r, 1.25, 0.55, 0.71, w)); },
  },
  {
    id: 'nightstand', name: 'Nightstand', category: 'furniture', size: 'M', value: [20, 150], weight: 6, footprint: [0.5, 0.6, 0.45], stackable: true,
    build: (r) => { const w = pickWood(r); return group(box(0.5, 0.6, 0.45, w), at(box(0.42, 0.18, 0.02, vary(r, w, 0.06)), 0, 0.3, 0.23)); },
  },
  {
    id: 'lamp', name: 'Floor lamp', category: 'furniture', size: 'M', value: [15, 200], weight: 6, footprint: [0.4, 1.6, 0.4],
    build: (r) => group(cyl(0.15, 0.15, 0.02, pickMetal(r), metalOpts), cyl(0.015, 0.015, 1.35, pickMetal(r), metalOpts), at(cone(0.22, 0.3, pickFabric(r), { rough: 0.9 }), 0, 1.3, 0)),
  },

  /* ===== APPLIANCES ===== */
  {
    id: 'fridge', name: 'Refrigerator', category: 'appliances', size: 'XL', value: [150, 900], weight: 4, footprint: [0.8, 1.8, 0.75],
    build: (r) => { const c = r.pick([WHITE, CHROME, 0x2a2a2a]); const g = group(box(0.8, 1.8, 0.75, c, c === CHROME ? chromeOpts : { rough: 0.4 })); g.add(at(box(0.03, 0.5, 0.03, 0xbbbbbb, metalOpts), 0.3, 0.9, 0.38), at(box(0.03, 0.4, 0.03, 0xbbbbbb, metalOpts), 0.3, 0.3, 0.38)); return g; },
  },
  {
    id: 'washer', name: 'Washing machine', category: 'appliances', size: 'L', value: [120, 700], weight: 4, footprint: [0.6, 0.85, 0.6], stackable: true,
    build: () => { const g = group(box(0.6, 0.85, 0.6, WHITE, { rough: 0.4 })); const door = rot(torus(0.2, 0.03, 0xaaaaaa, metalOpts), 0, 0, 0); door.position.set(0, 0.4, 0.31); g.add(door); const gl = rot(cyl(0.18, 0.18, 0.01, 0x224466, glassOpts), Math.PI / 2, 0, 0); gl.position.set(0, 0.4, 0.31); g.add(gl); return g; },
  },
  {
    id: 'microwave', name: 'Microwave', category: 'appliances', size: 'S', value: [20, 120], weight: 7, footprint: [0.5, 0.3, 0.38], stackable: true,
    build: (r) => group(box(0.5, 0.3, 0.38, r.pick([BLACK, WHITE, CHROME]), { rough: 0.4, metal: 0.3 }), at(box(0.32, 0.22, 0.01, 0x111111, { rough: 0.2 }), -0.06, 0.04, 0.19)),
  },
  {
    id: 'mini_fridge', name: 'Mini fridge', category: 'appliances', size: 'M', value: [30, 150], weight: 6, footprint: [0.5, 0.85, 0.5], stackable: true,
    build: (r) => group(box(0.5, 0.85, 0.5, r.pick([BLACK, WHITE, 0xd94f3d]), { rough: 0.4 }), at(box(0.02, 0.35, 0.02, 0xcccccc, metalOpts), 0.2, 0.3, 0.26)),
  },
  {
    id: 'mixer', name: 'Stand mixer', category: 'appliances', size: 'S', value: [80, 400], weight: 4, footprint: [0.35, 0.4, 0.25],
    build: (r) => { const c = pickPlastic(r); return group(box(0.2, 0.08, 0.25, c, { rough: 0.3, metal: 0.3 }), at(box(0.12, 0.3, 0.12, c, { rough: 0.3, metal: 0.3 }), -0.04, 0.08, -0.05), at(box(0.3, 0.1, 0.12, c, { rough: 0.3, metal: 0.3 }), 0.05, 0.3, -0.05), at(cyl(0.11, 0.09, 0.15, CHROME, chromeOpts), 0.08, 0.08, 0.02)); },
  },
  {
    id: 'vacuum', name: 'Vacuum cleaner', category: 'appliances', size: 'M', value: [30, 300], weight: 6, footprint: [0.35, 1.1, 0.4],
    build: (r) => { const c = pickPlastic(r); return group(box(0.3, 0.12, 0.4, c, { rough: 0.5 }), at(box(0.18, 0.7, 0.16, c, { rough: 0.5 }), 0, 0.12, -0.1), at(cyl(0.02, 0.02, 0.3, 0x333333), 0, 0.8, -0.1)); },
  },
  {
    id: 'ac_unit', name: 'Window AC unit', category: 'appliances', size: 'M', value: [80, 400], weight: 4, footprint: [0.6, 0.4, 0.55], stackable: true,
    build: () => { const g = group(box(0.6, 0.4, 0.55, 0xe6e6e6, { rough: 0.5 })); for (let i = 0; i < 8; i++) g.add(at(box(0.5, 0.01, 0.01, 0x888888), 0, 0.06 + i * 0.04, 0.28)); return g; },
  },
  {
    id: 'espresso', name: 'Espresso machine', category: 'appliances', size: 'S', value: [100, 1500], weight: 3, footprint: [0.4, 0.4, 0.4],
    build: () => group(box(0.4, 0.4, 0.4, CHROME, chromeOpts), at(box(0.42, 0.04, 0.42, BLACK, { rough: 0.4 }), 0, 0.4, 0), at(cyl(0.02, 0.02, 0.15, BLACK), 0.1, 0.1, 0.22), at(cyl(0.03, 0.03, 0.05, CHROME, chromeOpts), -0.05, 0.14, 0.2)),
  },
  {
    id: 'sewing_machine', name: 'Sewing machine', category: 'appliances', size: 'S', value: [40, 800], weight: 3, footprint: [0.45, 0.32, 0.22], luxury: true,
    build: (r) => { const c = r.pick([BLACK, 0xf0e6d2, 0x3b6ea5]); return group(box(0.45, 0.06, 0.22, c, { rough: 0.3 }), at(box(0.1, 0.26, 0.14, c, { rough: 0.3 }), 0.15, 0.06, 0), at(box(0.4, 0.08, 0.12, c, { rough: 0.3 }), 0, 0.26, 0), at(cyl(0.005, 0.005, 0.1, CHROME, chromeOpts), -0.14, 0.16, 0)); },
  },

  /* ===== ELECTRONICS ===== */
  {
    id: 'flat_tv', name: 'Flat-screen TV', category: 'electronics', size: 'L', value: [100, 1200], weight: 6, footprint: [1.2, 0.75, 0.25],
    build: () => { const g = group(at(screen(1.2, 0.68), 0, 0.07, 0)); g.add(box(0.5, 0.07, 0.25, BLACK, { rough: 0.4 })); return g; },
  },
  {
    id: 'crt_tv', name: 'Old tube TV', category: 'electronics', size: 'M', value: [5, 60], weight: 7, footprint: [0.6, 0.5, 0.5], stackable: true,
    build: (r) => group(box(0.6, 0.5, 0.5, r.pick([0x3a3a3a, 0x6b4423, 0x888888]), { rough: 0.6 }), at(box(0.46, 0.36, 0.02, 0x0e1a20, { rough: 0.1 }), -0.04, 0.07, 0.25)),
  },
  {
    id: 'laptop', name: 'Laptop', category: 'electronics', size: 'S', value: [100, 1500], weight: 6, footprint: [0.35, 0.25, 0.25],
    build: (r) => { const c = r.pick([CHROME, BLACK, 0x9aa0a6]); return group(box(0.35, 0.02, 0.24, c, chromeOpts), at(rot(box(0.35, 0.02, 0.24, c, chromeOpts), -1.2, 0, 0), 0, 0.02, -0.14)); },
  },
  {
    id: 'console', name: 'Game console & controllers', category: 'electronics', size: 'S', value: [80, 450], weight: 6, footprint: [0.35, 0.1, 0.3],
    build: (r) => { const c = r.pick([BLACK, WHITE]); return group(box(0.3, 0.06, 0.28, c, { rough: 0.4 }), at(box(0.12, 0.04, 0.09, c, { rough: 0.5 }), 0.1, 0.06, 0.06), at(box(0.12, 0.04, 0.09, c, { rough: 0.5 }), -0.1, 0.06, 0.06)); },
  },
  {
    id: 'speakers', name: 'Hi-fi speaker pair', category: 'electronics', size: 'M', value: [100, 1200], weight: 5, footprint: [0.9, 0.95, 0.35],
    build: (r) => { const w = pickWood(r); const g = group(); for (const s of [-1, 1]) { g.add(at(box(0.32, 0.95, 0.35, w), s * 0.28, 0, 0)); const wf = rot(cyl(0.11, 0.11, 0.02, BLACK), Math.PI / 2, 0, 0); wf.position.set(s * 0.28, 0.3, 0.18); g.add(wf); const tw = rot(cyl(0.05, 0.05, 0.02, 0x333333), Math.PI / 2, 0, 0); tw.position.set(s * 0.28, 0.7, 0.18); g.add(tw); } return g; },
  },
  {
    id: 'turntable', name: 'Turntable', category: 'electronics', size: 'S', value: [60, 800], weight: 4, footprint: [0.45, 0.14, 0.38],
    build: (r) => { const g = group(box(0.45, 0.08, 0.38, pickWood(r))); g.add(at(cyl(0.15, 0.15, 0.01, 0x111111), -0.03, 0.08, 0), at(box(0.02, 0.01, 0.2, CHROME, chromeOpts), 0.16, 0.1, -0.05)); return g; },
  },
  {
    id: 'pc_tower', name: 'Gaming PC', category: 'electronics', size: 'S', value: [150, 2500], weight: 4, footprint: [0.24, 0.5, 0.5],
    build: () => { const g = group(box(0.24, 0.5, 0.5, BLACK, { rough: 0.3, metal: 0.3 })); g.add(at(box(0.01, 0.42, 0.42, 0x3355aa, { ...glassOpts, emissive: 0.6 }), 0.12, 0.04, 0)); return g; },
  },
  {
    id: 'camera', name: 'Camera bag & lenses', category: 'electronics', size: 'S', value: [100, 3000], weight: 3, footprint: [0.4, 0.25, 0.25], luxury: true,
    build: () => { const g = group(box(0.4, 0.25, 0.25, 0x1e1e1e, { rough: 0.9 })); g.add(at(box(0.12, 0.08, 0.06, BLACK, { rough: 0.4 }), -0.1, 0.25, 0.0)); const lens = rot(cyl(0.035, 0.035, 0.07, 0x222222, { rough: 0.4 }), Math.PI / 2, 0, 0); lens.position.set(-0.1, 0.29, 0.06); g.add(lens); return g; },
  },
  {
    id: 'drone', name: 'Camera drone', category: 'electronics', size: 'S', value: [150, 1800], weight: 3, footprint: [0.45, 0.12, 0.45],
    build: (r) => { const c = r.pick([WHITE, 0x555555]); const g = group(at(box(0.18, 0.08, 0.22, c, { rough: 0.4 }), 0, 0.04, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.add(at(rot(box(0.22, 0.02, 0.03, c, { rough: 0.4 }), 0, sx * sz * 0.8, 0), sx * 0.12, 0.08, sz * 0.12)); g.add(at(cyl(0.1, 0.1, 0.004, 0x333333, { transparent: 0.7 }), sx * 0.19, 0.11, sz * 0.19)); } return g; },
  },
  {
    id: 'arcade', name: 'Arcade cabinet', category: 'electronics', size: 'L', value: [800, 5000], weight: 2, footprint: [0.7, 1.8, 0.8],
    build: (r) => { const c = pickPlastic(r); const g = group(box(0.7, 1.8, 0.8, c, { rough: 0.5 })); g.add(at(rot(box(0.55, 0.45, 0.02, 0x0a1620, { rough: 0.1, emissive: 0.4 }), -0.35, 0, 0), 0, 1.1, 0.35)); g.add(at(box(0.6, 0.05, 0.25, BLACK), 0, 0.95, 0.42)); for (let i = 0; i < 4; i++) g.add(at(cyl(0.02, 0.02, 0.01, pickPlastic(r), { rough: 0.3 }), -0.15 + i * 0.1, 1.0, 0.47)); g.add(at(cyl(0.015, 0.015, 0.1, 0x222222), -0.2, 1.0, 0.4), at(sphere(0.03, 0xd94f3d, { rough: 0.3 }), -0.2, 1.09, 0.4)); return g; },
  },
  {
    id: 'vr_kit', name: 'VR headset kit', category: 'electronics', size: 'S', value: [80, 700], weight: 3, footprint: [0.3, 0.2, 0.25],
    build: () => group(box(0.3, 0.2, 0.25, 0xf4f4f4, { rough: 0.6 }), at(box(0.18, 0.09, 0.1, WHITE, { rough: 0.3 }), 0, 0.2, 0)),
  },

  /* ===== TOOLS ===== */
  {
    id: 'toolbox', name: 'Steel toolbox', category: 'tools', size: 'S', value: [40, 400], weight: 7, footprint: [0.55, 0.3, 0.3], stackable: true,
    build: (r) => { const c = r.pick([0xd94f3d, 0x2f6fd6, 0x222222]); return group(box(0.55, 0.3, 0.3, c, { rough: 0.4, metal: 0.4 }), at(box(0.15, 0.03, 0.03, 0x111111), 0, 0.3, 0)); },
  },
  {
    id: 'drill_set', name: 'Cordless power-tool set', category: 'tools', size: 'S', value: [50, 300], weight: 6, footprint: [0.45, 0.3, 0.3], stackable: true,
    build: (r) => group(box(0.45, 0.3, 0.3, r.pick([0xf2c14e, 0xd94f3d, 0x3aa655, 0x222222]), { rough: 0.5 })),
  },
  {
    id: 'table_saw', name: 'Table saw', category: 'tools', size: 'L', value: [150, 900], weight: 3, footprint: [0.8, 0.9, 0.7], stackable: true,
    build: (r) => { const c = r.pick([0x6c7079, 0x3aa655, 0xf2c14e]); return group(legs(r, 0.7, 0.6, 0.85, 0x444444, 0.04), at(box(0.8, 0.05, 0.7, c, metalOpts), 0, 0.85, 0), at(rot(cyl(0.12, 0.12, 0.004, SILVER, chromeOpts), 0, 0, Math.PI / 2), 0, 0.9, 0)); },
  },
  {
    id: 'generator', name: 'Portable generator', category: 'tools', size: 'M', value: [200, 1500], weight: 3, footprint: [0.7, 0.55, 0.5], stackable: true,
    build: (r) => { const c = r.pick([0xd94f3d, 0xf2c14e, 0x2f6fd6]); const g = group(box(0.6, 0.45, 0.45, c, { rough: 0.5, metal: 0.2 })); g.add(at(box(0.7, 0.03, 0.03, 0x333333, metalOpts), 0, 0.5, 0.2), at(box(0.7, 0.03, 0.03, 0x333333, metalOpts), 0, 0.5, -0.2)); for (const s of [-1, 1]) g.add(at(wheel(0.08, 0.05), s * 0.32, 0, 0.15)); return g; },
  },
  {
    id: 'ladder', name: 'Aluminium ladder', category: 'tools', size: 'L', value: [40, 250], weight: 5, footprint: [0.5, 1.9, 0.35],
    build: () => { const g = group(); for (const s of [-1, 1]) g.add(at(rot(box(0.04, 1.9, 0.04, CHROME, chromeOpts), 0.1, 0, 0), s * 0.22, 0, 0.1)); for (let i = 0; i < 6; i++) g.add(at(box(0.44, 0.03, 0.06, CHROME, chromeOpts), 0, 0.2 + i * 0.3, 0.1 - (0.2 + i * 0.3) * 0.1)); return g; },
  },
  {
    id: 'compressor', name: 'Air compressor', category: 'tools', size: 'M', value: [80, 500], weight: 4, footprint: [0.6, 0.6, 0.35],
    build: (r) => { const c = r.pick([0xd94f3d, 0x2f6fd6, 0x222222]); const tank = rot(cyl(0.16, 0.16, 0.55, c, { rough: 0.4, metal: 0.3 }), 0, 0, Math.PI / 2); tank.position.y = 0.2; return group(tank, at(box(0.2, 0.15, 0.2, 0x222222, metalOpts), 0, 0.36, 0), at(wheel(0.07, 0.04), 0.2, 0, 0), at(wheel(0.07, 0.04), -0.2, 0, 0)); },
  },
  {
    id: 'welder', name: 'Welding kit', category: 'tools', size: 'M', value: [200, 1200], weight: 3, footprint: [0.5, 0.5, 0.4], stackable: true,
    build: (r) => group(box(0.5, 0.45, 0.4, r.pick([0x2f6fd6, 0xd94f3d, 0x2a2a2a]), { rough: 0.4, metal: 0.3 }), at(box(0.3, 0.05, 0.05, BLACK), 0, 0.45, 0), at(box(0.2, 0.1, 0.15, 0x333333), 0.1, 0.5, 0)),
  },
  {
    id: 'mower', name: 'Lawn mower', category: 'tools', size: 'L', value: [80, 600], weight: 4, footprint: [0.55, 1.0, 1.3],
    build: (r) => { const c = r.pick([0xd94f3d, 0x3aa655, 0xf2c14e]); const g = group(at(box(0.5, 0.2, 0.6, c, { rough: 0.5 }), 0, 0.12, 0.2), at(box(0.25, 0.18, 0.25, 0x333333, metalOpts), 0, 0.32, 0.2)); for (const sx of [-1, 1]) for (const sz of [0, 1]) g.add(at(wheel(sz ? 0.12 : 0.08, 0.05), sx * 0.27, 0, sz ? -0.05 : 0.45)); g.add(at(rot(box(0.03, 0.95, 0.03, 0x444444, metalOpts), 0.6, 0, 0), -0.22, 0.2, -0.3), at(rot(box(0.03, 0.95, 0.03, 0x444444, metalOpts), 0.6, 0, 0), 0.22, 0.2, -0.3), at(box(0.47, 0.03, 0.03, 0x444444, metalOpts), 0, 1.0, -0.62)); return g; },
  },
  {
    id: 'pressure_washer', name: 'Pressure washer', category: 'tools', size: 'M', value: [60, 400], weight: 4, footprint: [0.4, 0.8, 0.45],
    build: (r) => { const c = r.pick([0xf2c14e, 0x3aa655, 0x222222]); return group(at(box(0.35, 0.45, 0.4, c, { rough: 0.5 }), 0, 0.1, 0), at(wheel(0.1, 0.05), 0.2, 0, -0.1), at(wheel(0.1, 0.05), -0.2, 0, -0.1), at(rot(box(0.03, 0.35, 0.03, 0x444444, metalOpts), 0, 0, 0), -0.14, 0.55, -0.15), at(rot(box(0.03, 0.35, 0.03, 0x444444, metalOpts), 0, 0, 0), 0.14, 0.55, -0.15), at(box(0.3, 0.03, 0.03, 0x444444, metalOpts), 0, 0.88, -0.15)); },
  },

  /* ===== VEHICLES ===== */
  {
    id: 'motorcycle', name: 'Motorcycle', category: 'vehicles', size: 'XL', value: [1500, 12000], weight: 1.5, footprint: [0.7, 1.1, 2.1],
    build: (r) => { const c = pickPlastic(r); const g = group(at(wheel(0.32, 0.12), 0, 0, 0.72), at(wheel(0.32, 0.14), 0, 0, -0.65), at(box(0.3, 0.3, 0.9, 0x333333, metalOpts), 0, 0.3, 0), at(box(0.28, 0.25, 0.6, c, { rough: 0.3, metal: 0.4 }), 0, 0.6, -0.05), at(box(0.3, 0.08, 0.5, BLACK, { rough: 0.9 }), 0, 0.72, -0.5), at(rot(cyl(0.03, 0.03, 0.55, CHROME, chromeOpts), 0.5, 0, 0), 0, 0.35, 0.55), at(rot(box(0.7, 0.03, 0.03, CHROME, chromeOpts), 0, 0, 0), 0, 0.85, 0.5), at(rot(cyl(0.02, 0.02, 1.0, CHROME, chromeOpts), Math.PI / 2 + 0.1, 0, 0), 0.2, 0.25, -0.2)); return g; },
  },
  {
    id: 'bicycle', name: 'Bicycle', category: 'vehicles', size: 'L', value: [60, 1500], weight: 5, footprint: [0.55, 1.05, 1.75],
    build: (r) => { const c = pickPlastic(r); const g = group(at(wheel(0.33, 0.03, 0x777777), 0, 0, 0.55), at(wheel(0.33, 0.03, 0x777777), 0, 0, -0.55)); g.add(at(rot(box(0.03, 0.03, 0.75, c, { rough: 0.3, metal: 0.4 }), 0, 0, 0), 0, 0.72, 0), at(rot(box(0.03, 0.55, 0.03, c, { rough: 0.3, metal: 0.4 }), 0.3, 0, 0), 0, 0.3, -0.3), at(rot(box(0.03, 0.6, 0.03, c, { rough: 0.3, metal: 0.4 }), -0.3, 0, 0), 0, 0.3, 0.35), at(box(0.45, 0.03, 0.03, 0x333333), 0, 0.98, 0.45), at(box(0.12, 0.05, 0.25, 0x222222, { rough: 0.9 }), 0, 0.85, -0.35)); return g; },
  },
  {
    id: 'jetski', name: 'Jet ski on trailer', category: 'vehicles', size: 'XL', value: [2000, 9000], weight: 0.8, footprint: [1.1, 1.1, 2.6],
    build: (r) => { const c = pickPlastic(r); const g = group(at(box(1.0, 0.1, 2.3, 0x333333, metalOpts), 0, 0.15, 0), at(wheel(0.2, 0.1), 0.55, 0, 0), at(wheel(0.2, 0.1), -0.55, 0, 0)); const hull = box(0.85, 0.45, 2.3, c, { rough: 0.25, metal: 0.2 }); hull.position.y = 0.25 + 0.225; g.add(hull); g.add(at(box(0.5, 0.35, 0.9, vary(r, c, 0.15), { rough: 0.3 }), 0, 0.7, -0.2), at(box(0.55, 0.05, 0.4, BLACK, { rough: 0.9 }), 0, 1.05, 0.1)); return g; },
  },
  {
    id: 'atv', name: 'Quad bike', category: 'vehicles', size: 'XL', value: [1500, 8000], weight: 1, footprint: [1.1, 1.1, 1.9],
    build: (r) => { const c = pickPlastic(r); const g = group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(wheel(0.27, 0.2), sx * 0.45, 0, sz * 0.6)); g.add(at(box(0.7, 0.4, 1.4, c, { rough: 0.5 }), 0, 0.3, 0), at(box(0.4, 0.12, 0.6, BLACK, { rough: 0.9 }), 0, 0.7, -0.2), at(box(0.7, 0.03, 0.03, 0x333333, metalOpts), 0, 0.95, 0.4), at(box(0.03, 0.3, 0.03, 0x333333, metalOpts), 0, 0.68, 0.4)); return g; },
  },
  {
    id: 'kayak', name: 'Kayak & paddle', category: 'vehicles', size: 'XL', value: [150, 1200], weight: 2, footprint: [0.7, 0.45, 2.9],
    build: (r) => { const c = pickPlastic(r); const k = rot(cyl(0.32, 0.32, 2.9, c, { rough: 0.5 }), Math.PI / 2, 0, 0); k.position.y = 0.2; k.scale.x = 1; k.scale.z = 0.6; const g = group(k); g.add(at(rot(cyl(0.015, 0.015, 2.0, 0x222222), Math.PI / 2, 0, 0), 0.3, 0.42, 0)); return g; },
  },
  {
    id: 'scooter', name: 'Electric scooter', category: 'vehicles', size: 'M', value: [200, 1500], weight: 4, footprint: [0.4, 1.15, 1.15],
    build: () => group(at(wheel(0.12, 0.05), 0, 0, 0.5), at(wheel(0.12, 0.05), 0, 0, -0.5), at(box(0.15, 0.04, 0.9, BLACK, { rough: 0.7 }), 0, 0.1, 0), at(rot(box(0.03, 1.0, 0.03, 0x333333, metalOpts), 0.15, 0, 0), 0, 0.12, 0.42), at(box(0.4, 0.03, 0.03, 0x333333, metalOpts), 0, 1.1, 0.27)),
  },
  {
    id: 'gokart', name: 'Go-kart', category: 'vehicles', size: 'XL', value: [400, 3000], weight: 1.5, footprint: [1.2, 0.7, 1.8],
    build: (r) => { const c = pickPlastic(r); const g = group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(wheel(0.15, 0.12), sx * 0.5, 0, sz * 0.65)); g.add(at(box(0.6, 0.08, 1.5, c, { rough: 0.4 }), 0, 0.12, 0), at(box(0.45, 0.4, 0.4, BLACK, { rough: 0.9 }), 0, 0.2, -0.25), at(rot(torus(0.14, 0.02, 0x222222), Math.PI / 4, 0, 0), 0, 0.5, 0.35), at(box(0.3, 0.25, 0.3, 0x444444, metalOpts), 0, 0.2, -0.65)); return g; },
  },

  /* ===== INSTRUMENTS ===== */
  {
    id: 'acoustic', name: 'Acoustic guitar', category: 'instruments', size: 'M', value: [60, 2000], weight: 5, footprint: [0.4, 1.0, 0.15], luxury: true,
    build: (r) => { const w = pickWood(r); const body = rot(cyl(0.2, 0.2, 0.1, w), Math.PI / 2, 0, 0); body.position.y = 0.2; body.scale.set(1, 1, 1.25); const g = group(body); g.add(at(rot(cyl(0.02, 0.02, 0.01, 0x111111), Math.PI / 2, 0, 0), 0, 0.22, 0.06), at(box(0.06, 0.6, 0.03, 0x3e2a1a), 0, 0.42, 0)); return g; },
  },
  {
    id: 'electric_guitar', name: 'Electric guitar & amp', category: 'instruments', size: 'M', value: [150, 3500], weight: 4, footprint: [0.6, 1.0, 0.45], luxury: true,
    build: (r) => { const c = pickPlastic(r); const g = group(box(0.55, 0.45, 0.4, 0x222222, { rough: 0.9 }), at(box(0.45, 0.35, 0.01, 0x555555, { rough: 0.95 }), 0, 0.05, 0.2)); g.add(at(rot(box(0.3, 0.42, 0.05, c, { rough: 0.2, metal: 0.3 }), 0, 0, 0.1), 0.15, 0.45, 0.1), at(rot(box(0.05, 0.6, 0.03, 0x3e2a1a), 0, 0, 0.1), 0.1, 0.8, 0.1)); return g; },
  },
  {
    id: 'drums', name: 'Drum kit', category: 'instruments', size: 'XL', value: [250, 2500], weight: 2, footprint: [1.5, 1.1, 1.3],
    build: (r) => { const c = pickPlastic(r); const g = group(); const kick = rot(cyl(0.3, 0.3, 0.4, c, { rough: 0.3, metal: 0.2 }), Math.PI / 2, 0, 0); kick.position.set(0, 0.3, 0.2); g.add(kick); for (const [x, z, h, rr] of [[-0.45, -0.1, 0.5, 0.18], [0.45, -0.1, 0.5, 0.2], [-0.2, -0.4, 0.75, 0.14], [0.2, -0.4, 0.75, 0.15]]) { g.add(at(cyl(rr, rr, 0.25, c, { rough: 0.3, metal: 0.2 }), x, h, z), at(cyl(0.01, 0.01, h, CHROME, chromeOpts), x, 0, z)); } for (const [x, z] of [[-0.65, -0.5], [0.65, -0.5]]) g.add(at(cyl(0.01, 0.01, 1.05, CHROME, chromeOpts), x, 0, z), at(cyl(0.2, 0.2, 0.01, GOLD, metalOpts), x, 1.05, z)); return g; },
  },
  {
    id: 'keyboard', name: 'Digital piano', category: 'instruments', size: 'L', value: [100, 1500], weight: 4, footprint: [1.3, 0.85, 0.4],
    build: () => group(legs(null as unknown as RNG, 1.2, 0.35, 0.7, 0x222222, 0.04), at(box(1.3, 0.1, 0.4, BLACK, { rough: 0.4 }), 0, 0.7, 0), at(box(1.2, 0.02, 0.15, WHITE, { rough: 0.3 }), 0, 0.8, 0.1)),
  },
  {
    id: 'upright_piano', name: 'Upright piano', category: 'instruments', size: 'XL', value: [200, 4000], weight: 1.2, footprint: [1.5, 1.25, 0.65],
    build: (r) => { const w = r.pick([BLACK, 0x3e2a1a, 0x5c3a21]); return group(box(1.5, 1.25, 0.6, w, { rough: 0.25 }), at(box(1.5, 0.1, 0.3, w, { rough: 0.25 }), 0, 0.68, 0.3), at(box(1.3, 0.02, 0.14, WHITE, { rough: 0.3 }), 0, 0.78, 0.36)); },
  },
  {
    id: 'trumpet', name: 'Trumpet in case', category: 'instruments', size: 'S', value: [100, 1500], weight: 3, footprint: [0.55, 0.2, 0.25],
    build: () => group(box(0.55, 0.2, 0.25, 0x1e1e1e, { rough: 0.8 }), at(box(0.35, 0.03, 0.03, GOLD, metalOpts), 0, 0.2, 0), at(rot(cone(0.06, 0.1, GOLD, metalOpts), 0, 0, -Math.PI / 2), 0.23, 0.18, 0)),
  },
  {
    id: 'violin', name: 'Violin in case', category: 'instruments', size: 'S', value: [80, 8000], weight: 2, footprint: [0.6, 0.15, 0.25], luxury: true, valuable: true,
    build: () => group(box(0.6, 0.15, 0.25, 0x2b1a1a, { rough: 0.8 }), at(box(0.2, 0.03, 0.12, 0xa9764a, { rough: 0.3 }), 0.1, 0.15, 0), at(box(0.3, 0.02, 0.03, 0x3e2a1a), -0.15, 0.15, 0)),
  },
  {
    id: 'saxophone', name: 'Saxophone', category: 'instruments', size: 'S', value: [150, 4000], weight: 2, footprint: [0.3, 0.7, 0.25], luxury: true,
    build: () => group(at(rot(cyl(0.04, 0.03, 0.6, GOLD, metalOpts), 0.15, 0, 0), 0, 0.06, 0), at(rot(cone(0.09, 0.14, GOLD, metalOpts), Math.PI + 0.3, 0, 0), 0, 0.02, 0.14), at(box(0.28, 0.06, 0.24, 0x1e1e1e, { rough: 0.8 }), 0, 0, 0)),
  },

  /* ===== COLLECTIBLES ===== */
  {
    id: 'comics', name: 'Long box of comics', category: 'collectibles', size: 'S', value: [10, 8000], weight: 4, footprint: [0.7, 0.3, 0.3], luxury: true, stackable: true,
    build: (r) => { const g = cardboard(r, 0.7, 0.28, 0.3); for (let i = 0; i < 12; i++) g.add(at(box(0.01, 0.26, 0.24, pickPlastic(r), { rough: 0.6 }), -0.3 + i * 0.05, 0.03, 0)); return g; },
  },
  {
    id: 'coins', name: 'Coin collection', category: 'collectibles', size: 'S', value: [50, 20000], weight: 2.5, footprint: [0.35, 0.12, 0.3], luxury: true, valuable: true,
    build: () => { const g = group(box(0.35, 0.1, 0.3, 0x3e2a1a, { rough: 0.5 })); for (let i = 0; i < 12; i++) g.add(at(cyl(0.02, 0.02, 0.005, i % 3 ? SILVER : GOLD, metalOpts), -0.13 + (i % 4) * 0.08, 0.1, -0.09 + Math.floor(i / 4) * 0.08)); return g; },
  },
  {
    id: 'cards', name: 'Sports card box', category: 'collectibles', size: 'S', value: [20, 15000], weight: 3, footprint: [0.4, 0.12, 0.25], luxury: true, valuable: true, stackable: true,
    build: (r) => { const g = cardboard(r, 0.4, 0.1, 0.25); for (let i = 0; i < 6; i++) g.add(at(box(0.06, 0.09, 0.005, pickPlastic(r), { rough: 0.4 }), -0.15 + i * 0.06, 0.1, 0)); return g; },
  },
  {
    id: 'action_figures', name: 'Boxed action figures', category: 'collectibles', size: 'S', value: [30, 3000], weight: 4, footprint: [0.45, 0.35, 0.2], luxury: true, stackable: true,
    build: (r) => { const g = group(); for (let i = 0; i < 3; i++) { const c = pickPlastic(r); g.add(at(box(0.13, 0.33, 0.06, c, { rough: 0.4 }), -0.15 + i * 0.15, 0, 0)); g.add(at(box(0.09, 0.22, 0.01, 0x88bbdd, glassOpts), -0.15 + i * 0.15, 0.06, 0.03)); } return g; },
  },
  {
    id: 'toy_robot', name: 'Vintage tin robot', category: 'collectibles', size: 'S', value: [40, 2500], weight: 2.5, footprint: [0.2, 0.35, 0.15], luxury: true,
    build: (r) => { const c = r.pick([0xd94f3d, 0x2f6fd6, 0x9a9da3]); return group(box(0.16, 0.2, 0.12, c, metalOpts), at(box(0.12, 0.1, 0.1, c, metalOpts), 0, 0.2, 0), at(box(0.04, 0.16, 0.05, 0x9a9da3, metalOpts), 0.1, 0.06, 0), at(box(0.04, 0.16, 0.05, 0x9a9da3, metalOpts), -0.1, 0.06, 0), at(sphere(0.015, 0xffee88, { emissive: 1 }), 0.03, 0.245, 0.05), at(sphere(0.015, 0xffee88, { emissive: 1 }), -0.03, 0.245, 0.05)); },
  },
  {
    id: 'stamps', name: 'Stamp albums', category: 'collectibles', size: 'S', value: [20, 5000], weight: 2.5, footprint: [0.35, 0.15, 0.3], luxury: true, stackable: true,
    build: (r) => { const g = group(); for (let i = 0; i < 3; i++) g.add(at(box(0.33, 0.045, 0.28, r.pick([0x7a3b3b, 0x3b4f7a, 0x2b2b2b]), { rough: 0.7 }), 0, i * 0.05, 0)); return g; },
  },
  {
    id: 'signed_ball', name: 'Signed ball in case', category: 'collectibles', size: 'S', value: [50, 6000], weight: 2.5, footprint: [0.2, 0.2, 0.2], luxury: true, valuable: true,
    build: (r) => group(box(0.2, 0.2, 0.2, 0xcfe6f5, glassOpts), at(box(0.2, 0.02, 0.2, BLACK), 0, 0, 0), at(sphere(0.07, r.pick([WHITE, 0xb8651a, 0xff7b39]), { rough: 0.6 }), 0, 0.02, 0)),
  },
  {
    id: 'vinyl', name: 'Crate of vinyl records', category: 'collectibles', size: 'S', value: [40, 1500], weight: 4, footprint: [0.4, 0.4, 0.4], stackable: true,
    build: (r) => { const g = group(box(0.4, 0.35, 0.4, pickWood(r))); for (let i = 0; i < 10; i++) g.add(at(box(0.01, 0.32, 0.32, i % 2 ? pickPlastic(r) : 0x222222, { rough: 0.6 }), -0.17 + i * 0.035, 0.08, 0)); return g; },
  },
  {
    id: 'model_train', name: 'Model train set', category: 'collectibles', size: 'S', value: [50, 3500], weight: 2, footprint: [0.5, 0.2, 0.35], luxury: true, stackable: true,
    build: (r) => { const g = cardboard(r, 0.5, 0.15, 0.35); g.add(at(box(0.12, 0.05, 0.05, 0x8b1a1a, { rough: 0.4 }), -0.1, 0.15, 0), at(box(0.1, 0.045, 0.05, 0x1a3b6b, { rough: 0.4 }), 0.05, 0.15, 0), at(box(0.1, 0.045, 0.05, 0x1a6b2b, { rough: 0.4 }), 0.18, 0.15, 0)); return g; },
  },
  {
    id: 'lego_bin', name: 'Bin of building bricks', category: 'toys', size: 'S', value: [30, 1500], weight: 4, footprint: [0.5, 0.35, 0.4], stackable: true,
    build: (r) => { const g = group(box(0.5, 0.33, 0.4, 0xd9e2ec, { rough: 0.5, transparent: 0.7 })); for (let i = 0; i < 14; i++) g.add(at(box(0.05, 0.03, 0.03, pickPlastic(r), { rough: 0.3 }), r.range(-0.2, 0.2), r.range(0.02, 0.25), r.range(-0.15, 0.15))); return g; },
  },

  /* ===== VALUABLES ===== */
  {
    id: 'jewelry_box', name: 'Jewelry box', category: 'valuables', size: 'S', value: [50, 15000], weight: 2.5, footprint: [0.3, 0.2, 0.2], luxury: true, valuable: true,
    build: (r) => { const g = group(box(0.3, 0.16, 0.2, r.pick([0x7a3b3b, 0x3e2a1a, 0x2b2b2b]), { rough: 0.4 })); g.add(at(rot(box(0.3, 0.02, 0.2, 0x7a3b3b, { rough: 0.4 }), -1.0, 0, 0), 0, 0.16, -0.09)); for (let i = 0; i < 5; i++) g.add(at(sphere(0.012, i % 2 ? GOLD : SILVER, chromeOpts), -0.1 + i * 0.05, 0.16, 0.02)); return g; },
  },
  {
    id: 'watch', name: 'Luxury wristwatch', category: 'valuables', size: 'S', value: [100, 30000], weight: 2, footprint: [0.15, 0.1, 0.15], luxury: true, valuable: true,
    build: (r) => { const c = r.pick([GOLD, SILVER, 0x333333]); const g = group(box(0.15, 0.08, 0.15, 0x1a3b2a, { rough: 0.5 })); const face = rot(cyl(0.03, 0.03, 0.01, c, chromeOpts), 0, 0, 0); face.position.y = 0.085; g.add(face); const band = torus(0.035, 0.008, c, chromeOpts); band.rotation.x = Math.PI / 2; band.position.y = 0.085; g.add(band); return g; },
  },
  {
    id: 'gold_bars', name: 'Gold bullion', category: 'valuables', size: 'S', value: [2000, 60000], weight: 0.5, footprint: [0.25, 0.12, 0.15], valuable: true,
    build: () => { const g = group(); for (let i = 0; i < 3; i++) g.add(at(box(0.09, 0.04, 0.14, GOLD, { rough: 0.25, metal: 1 }), -0.08 + i * 0.08, 0, 0)); g.add(at(box(0.09, 0.04, 0.14, GOLD, { rough: 0.25, metal: 1 }), -0.04, 0.04, 0), at(box(0.09, 0.04, 0.14, GOLD, { rough: 0.25, metal: 1 }), 0.04, 0.04, 0)); return g; },
  },
  {
    id: 'cash_can', name: 'Coffee can of cash', category: 'valuables', size: 'S', value: [20, 8000], weight: 3, footprint: [0.16, 0.2, 0.16], valuable: true,
    build: (r) => { const g = group(cyl(0.08, 0.08, 0.18, r.pick([0xd94f3d, 0x2f6fd6, 0x3aa655]), { rough: 0.5, metal: 0.3 })); for (let i = 0; i < 5; i++) g.add(at(rot(box(0.07, 0.03, 0.005, 0x85bb65, { rough: 0.8 }), 0, i * 0.6, 0), 0, 0.18, 0)); return g; },
  },
  {
    id: 'ring_box', name: 'Diamond ring', category: 'valuables', size: 'S', value: [50, 12000], weight: 2, footprint: [0.08, 0.08, 0.08], luxury: true, valuable: true,
    build: () => group(box(0.08, 0.06, 0.08, 0x2b1a3b, { rough: 0.6 }), at(rot(torus(0.015, 0.004, GOLD, chromeOpts), 0, 0, 0), 0, 0.075, 0), at(sphere(0.008, 0xe8f6ff, { rough: 0, metal: 0.5, emissive: 0.4 }), 0, 0.083, 0)),
  },
  {
    id: 'silverware', name: 'Silverware chest', category: 'valuables', size: 'S', value: [60, 3000], weight: 3, footprint: [0.45, 0.15, 0.3], luxury: true, valuable: true, stackable: true,
    build: (r) => { const g = group(box(0.45, 0.12, 0.3, pickWood(r))); for (let i = 0; i < 8; i++) g.add(at(box(0.015, 0.005, 0.18, SILVER, chromeOpts), -0.14 + i * 0.04, 0.12, 0)); return g; },
  },
  {
    id: 'pearls', name: 'Pearl necklace', category: 'valuables', size: 'S', value: [50, 6000], weight: 2, footprint: [0.15, 0.06, 0.15], luxury: true, valuable: true,
    build: () => { const g = group(box(0.15, 0.03, 0.15, 0x3b2a4a, { rough: 0.6 })); const t = torus(0.045, 0.008, 0xf6f0e6, { rough: 0.2, metal: 0.1 }); t.rotation.x = Math.PI / 2; t.position.y = 0.04; g.add(t); return g; },
  },
  {
    id: 'bonds', name: 'Envelope of savings bonds', category: 'valuables', size: 'S', value: [50, 10000], weight: 1.5, footprint: [0.3, 0.03, 0.22], valuable: true,
    build: () => group(box(0.3, 0.02, 0.22, 0xe8dcc0, { rough: 0.9 }), at(box(0.2, 0.005, 0.12, 0xa9c9a0, { rough: 0.9 }), 0.02, 0.02, 0.01)),
  },

  /* ===== ART & ANTIQUES ===== */
  {
    id: 'painting', name: 'Framed painting', category: 'art', size: 'M', value: [30, 25000], weight: 4, footprint: [1.0, 0.8, 0.08], luxury: true,
    build: (r) => { const w = r.range(0.7, 1.1), h = r.range(0.5, 0.9); const g = frameArt(r, w, h); g.rotation.x = -0.12; return g; },
  },
  {
    id: 'bust', name: 'Marble bust', category: 'art', size: 'S', value: [50, 4000], weight: 2.5, footprint: [0.3, 0.55, 0.3], luxury: true,
    build: (r) => { const c = r.pick([0xf2efe6, 0x7a7a7a, 0x3e2a1a]); return group(box(0.3, 0.12, 0.3, 0x2b2b2b, { rough: 0.3 }), at(box(0.28, 0.14, 0.14, c, { rough: 0.5 }), 0, 0.12, 0), at(cyl(0.05, 0.06, 0.08, c, { rough: 0.5 }), 0, 0.26, 0), at(sphere(0.1, c, { rough: 0.5 }), 0, 0.33, 0)); },
  },
  {
    id: 'vase', name: 'Porcelain vase', category: 'art', size: 'S', value: [20, 9000], weight: 3, footprint: [0.25, 0.45, 0.25], luxury: true, valuable: true,
    build: (r) => { const c = r.pick([0xe8f0f6, 0xf4e9d0, 0x2f6fd6, 0xd94f3d]); return group(cyl(0.1, 0.07, 0.3, c, { rough: 0.2 }), at(cyl(0.06, 0.1, 0.1, c, { rough: 0.2 }), 0, 0.3, 0), at(torus(0.05, 0.01, 0x2f6fd6, { rough: 0.3 }), 0, 0.2, 0).rotateX(Math.PI / 2)); },
  },
  {
    id: 'grandfather_clock', name: 'Grandfather clock', category: 'art', size: 'L', value: [200, 5000], weight: 2, footprint: [0.55, 2.0, 0.35], luxury: true,
    build: (r) => { const w = pickWood(r); const g = group(box(0.5, 2.0, 0.32, w), at(box(0.55, 0.12, 0.36, w), 0, 1.88, 0), at(box(0.55, 0.06, 0.36, w), 0, 0, 0)); const face = rot(cyl(0.16, 0.16, 0.01, 0xf2efe6, { rough: 0.5 }), Math.PI / 2, 0, 0); face.position.set(0, 1.6, 0.165); g.add(face); g.add(at(box(0.25, 1.1, 0.01, 0xc9d6dc, glassOpts), 0, 0.2, 0.165), at(cyl(0.06, 0.06, 0.01, GOLD, metalOpts), 0, 0.3, 0.12).rotateX(Math.PI / 2)); return g; },
  },
  {
    id: 'globe', name: 'Antique globe', category: 'art', size: 'S', value: [40, 1500], weight: 3, footprint: [0.4, 0.55, 0.4], luxury: true,
    build: (r) => { const g = group(cyl(0.15, 0.15, 0.02, pickWood(r)), cyl(0.02, 0.02, 0.15, GOLD, metalOpts), at(sphere(0.18, 0xd9c9a3, { rough: 0.6 }), 0, 0.15, 0)); const ring = torus(0.2, 0.008, GOLD, metalOpts); ring.rotation.z = 0.4; ring.position.y = 0.33; g.add(ring); return g; },
  },
  {
    id: 'chandelier', name: 'Crystal chandelier', category: 'art', size: 'M', value: [100, 6000], weight: 2, footprint: [0.7, 0.6, 0.7], luxury: true,
    build: () => { const g = group(cyl(0.35, 0.35, 0.02, 0x2b2b2b), at(cyl(0.05, 0.05, 0.15, GOLD, metalOpts), 0, 0.02, 0)); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(at(rot(box(0.3, 0.02, 0.02, GOLD, metalOpts), 0, -a, 0), Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17)); g.add(at(sphere(0.03, 0xffffff, { rough: 0, metal: 0.2, transparent: 0.8, emissive: 0.15 }), Math.cos(a) * 0.32, 0.22, Math.sin(a) * 0.32)); } return g; },
  },
  {
    id: 'mirror', name: 'Ornate mirror', category: 'art', size: 'M', value: [30, 800], weight: 4, footprint: [0.8, 1.2, 0.08],
    build: (r) => { const g = group(box(0.8, 1.2, 0.05, r.pick([GOLD, 0x3b2a1a, WHITE]), metalOpts), at(box(0.68, 1.06, 0.005, 0xdfe8ee, { rough: 0.02, metal: 1 }), 0, 0.07, 0.028)); g.rotation.x = -0.1; return g; },
  },
  {
    id: 'tiffany_lamp', name: 'Stained-glass lamp', category: 'art', size: 'S', value: [80, 7000], weight: 2, footprint: [0.4, 0.55, 0.4], luxury: true, valuable: true,
    build: () => { const g = group(cyl(0.12, 0.12, 0.02, 0x4a3a2a, metalOpts), cyl(0.02, 0.02, 0.35, 0x4a3a2a, metalOpts), at(cone(0.22, 0.2, 0x3aa655, { rough: 0.3, transparent: 0.85, emissive: 0.3 }), 0, 0.35, 0)); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(at(box(0.05, 0.05, 0.005, [0xd94f3d, 0xf2c14e, 0x2f6fd6][i % 3], { emissive: 0.5 }), Math.cos(a) * 0.15, 0.4, Math.sin(a) * 0.15, -a)); } return g; },
  },
  {
    id: 'sword', name: 'Antique sword', category: 'art', size: 'S', value: [100, 9000], weight: 1.5, footprint: [1.0, 0.1, 0.15], luxury: true, valuable: true,
    build: () => group(box(1.0, 0.08, 0.14, 0x1e1e1e, { rough: 0.8 }), at(box(0.65, 0.01, 0.03, SILVER, chromeOpts), 0.1, 0.08, 0), at(box(0.2, 0.02, 0.025, 0x3e2a1a), -0.35, 0.08, 0), at(box(0.03, 0.03, 0.08, GOLD, metalOpts), -0.24, 0.075, 0)),
  },
  {
    id: 'rug', name: 'Rolled Persian rug', category: 'art', size: 'L', value: [50, 6000], weight: 3, footprint: [0.35, 0.35, 2.0], luxury: true, soft: true, stackable: true,
    build: (r) => { const c = r.pick([0x7a1f1f, 0x1f3a7a, 0x8a5a1f]); const roll = rot(cyl(0.17, 0.17, 2.0, c, { rough: 0.95 }), Math.PI / 2, 0, 0); roll.position.y = 0.17; const g = group(roll); const inner = rot(cyl(0.12, 0.12, 2.02, vary(r, c, 0.2), { rough: 0.95 }), Math.PI / 2, 0, 0); inner.position.y = 0.17; g.add(inner); return g; },
  },
  {
    id: 'typewriter', name: 'Vintage typewriter', category: 'art', size: 'S', value: [30, 1200], weight: 3, footprint: [0.4, 0.25, 0.35], luxury: true,
    build: (r) => { const c = r.pick([BLACK, 0x3aa655, 0x9a9da3]); const g = group(box(0.4, 0.14, 0.3, c, { rough: 0.3, metal: 0.4 }), at(box(0.42, 0.06, 0.1, c, { rough: 0.3, metal: 0.4 }), 0, 0.18, -0.1)); for (let i = 0; i < 12; i++) g.add(at(cyl(0.012, 0.012, 0.01, 0xeeeeee), -0.15 + (i % 6) * 0.06, 0.14, 0.02 + Math.floor(i / 6) * 0.06)); return g; },
  },

  /* ===== SPORTS ===== */
  {
    id: 'treadmill', name: 'Treadmill', category: 'sports', size: 'XL', value: [100, 1200], weight: 3, footprint: [0.8, 1.3, 1.8],
    build: () => group(at(box(0.7, 0.15, 1.6, 0x2a2a2a, { rough: 0.5 }), 0, 0, 0.1), at(box(0.55, 0.02, 1.3, 0x111111, { rough: 0.9 }), 0, 0.15, 0.15), at(rot(box(0.05, 1.1, 0.05, 0x666666, metalOpts), 0.2, 0, 0), -0.3, 0.15, -0.6), at(rot(box(0.05, 1.1, 0.05, 0x666666, metalOpts), 0.2, 0, 0), 0.3, 0.15, -0.6), at(box(0.7, 0.25, 0.1, 0x222222, { rough: 0.4 }), 0, 1.2, -0.8)),
  },
  {
    id: 'dumbbells', name: 'Dumbbell set & rack', category: 'sports', size: 'M', value: [40, 400], weight: 5, footprint: [0.9, 0.5, 0.4],
    build: () => { const g = group(box(0.9, 0.05, 0.4, 0x222222, metalOpts), at(box(0.9, 0.05, 0.4, 0x222222, metalOpts), 0, 0.4, 0), at(box(0.05, 0.4, 0.05, 0x222222, metalOpts), -0.42, 0.05, 0), at(box(0.05, 0.4, 0.05, 0x222222, metalOpts), 0.42, 0.05, 0)); for (let i = 0; i < 4; i++) for (const y of [0.05, 0.45]) { const w = 0.03 + i * 0.012; g.add(at(rot(cyl(w, w, 0.06, 0x444444, metalOpts), 0, 0, Math.PI / 2), -0.28 + i * 0.19 - 0.1, y + w - 0.03, 0), at(rot(cyl(w, w, 0.06, 0x444444, metalOpts), 0, 0, Math.PI / 2), -0.28 + i * 0.19 + 0.1, y + w - 0.03, 0), at(rot(cyl(0.012, 0.012, 0.2, CHROME, chromeOpts), 0, 0, Math.PI / 2), -0.28 + i * 0.19, y + w - 0.03, 0)); } return g; },
  },
  {
    id: 'golf', name: 'Golf clubs & bag', category: 'sports', size: 'M', value: [80, 2500], weight: 4, footprint: [0.35, 1.2, 0.35], luxury: true,
    build: (r) => { const c = pickPlastic(r); const g = group(at(rot(cyl(0.16, 0.14, 0.9, c, { rough: 0.7 }), 0.15, 0, 0), 0, 0, 0)); for (let i = 0; i < 6; i++) g.add(at(rot(cyl(0.006, 0.006, 0.5, CHROME, chromeOpts), 0.15, 0, 0), -0.08 + (i % 3) * 0.08, 0.8, -0.05 + Math.floor(i / 3) * 0.1)); return g; },
  },
  {
    id: 'punching_bag', name: 'Heavy bag', category: 'sports', size: 'M', value: [30, 200], weight: 4, footprint: [0.4, 1.2, 0.4], soft: true,
    build: (r) => group(cyl(0.18, 0.18, 1.1, r.pick([0xd94f3d, BLACK, 0x2f6fd6]), { rough: 0.6 }), at(cyl(0.02, 0.02, 0.15, CHROME, chromeOpts), 0, 1.1, 0)),
  },
  {
    id: 'surfboard', name: 'Surfboard', category: 'sports', size: 'L', value: [100, 1200], weight: 3, footprint: [0.5, 2.1, 0.15],
    build: (r) => { const b = box(0.5, 2.1, 0.06, pickPlastic(r), { rough: 0.3 }); b.scale.set(0.5, 2.1, 0.06); const g = group(b); g.add(at(box(0.15, 0.6, 0.02, WHITE, { rough: 0.3 }), 0, 0.8, 0.03)); g.rotation.x = -0.15; return g; },
  },
  {
    id: 'skis', name: 'Skis & poles', category: 'sports', size: 'M', value: [50, 600], weight: 3, footprint: [0.3, 1.8, 0.15],
    build: (r) => { const c = pickPlastic(r); const g = group(); for (const s of [-1, 1]) g.add(at(rot(box(0.09, 1.75, 0.02, c, { rough: 0.3 }), -0.1, 0, 0), s * 0.06, 0, 0)); for (const s of [-1, 1]) g.add(at(rot(cyl(0.008, 0.008, 1.3, 0x333333), -0.1, 0, 0), s * 0.14, 0, 0.05)); return g; },
  },
  {
    id: 'hoop', name: 'Basketball hoop', category: 'sports', size: 'L', value: [60, 400], weight: 2.5, footprint: [1.0, 1.5, 0.6],
    build: () => { const g = group(box(1.0, 0.35, 0.6, 0x222222, { rough: 0.6 }), at(box(0.08, 1.2, 0.08, 0x444444, metalOpts), 0, 0.35, -0.2), at(box(1.0, 0.7, 0.03, 0xe6e6e6, { rough: 0.4 }), 0, 1.4, -0.15).translateY(-0.5)); const rim = torus(0.22, 0.015, 0xff7b39, metalOpts); rim.rotation.x = Math.PI / 2; rim.position.set(0, 1.2, 0.1); g.add(rim); return g; },
  },
  {
    id: 'bowling', name: 'Bowling balls & bag', category: 'sports', size: 'S', value: [20, 150], weight: 4, footprint: [0.45, 0.3, 0.3],
    build: (r) => group(box(0.45, 0.28, 0.3, 0x222222, { rough: 0.8 }), at(sphere(0.11, pickPlastic(r), { rough: 0.15 }), 0.1, 0.28, 0)),
  },
  {
    id: 'fishing', name: 'Fishing rods & tackle', category: 'sports', size: 'M', value: [40, 700], weight: 4, footprint: [0.4, 1.7, 0.3],
    build: (r) => { const g = group(box(0.4, 0.25, 0.3, r.pick([0x3aa655, 0x6b4423]), { rough: 0.6 })); for (let i = 0; i < 3; i++) g.add(at(rot(cyl(0.006, 0.004, 1.6, 0x222222), 0, 0, 0.05 * (i - 1)), -0.1 + i * 0.1, 0.1, -0.05)); return g; },
  },

  /* ===== TOYS ===== */
  {
    id: 'rocking_horse', name: 'Rocking horse', category: 'toys', size: 'M', value: [30, 400], weight: 3, footprint: [0.4, 0.75, 0.95],
    build: (r) => { const w = pickWood(r); const g = group(); for (const s of [-1, 1]) { const rk = rot(torus(0.45, 0.02, w), Math.PI / 2, 0, 0); rk.position.set(s * 0.15, 0.45, 0); rk.scale.z = 0.4; g.add(rk); } g.add(at(box(0.25, 0.25, 0.6, w), 0, 0.35, 0), at(box(0.15, 0.25, 0.15, w), 0, 0.55, 0.25), at(box(0.12, 0.12, 0.25, w), 0, 0.72, 0.3)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.05, 0.3, 0.05, w), sx * 0.09, 0.06, sz * 0.22)); return g; },
  },
  {
    id: 'dollhouse', name: 'Dollhouse', category: 'toys', size: 'M', value: [30, 600], weight: 3, footprint: [0.7, 0.8, 0.45], luxury: true,
    build: (r) => { const c = r.pick(PASTELS); const g = group(box(0.7, 0.55, 0.45, c, { rough: 0.7 })); const roof = rot(cone(0.5, 0.3, 0x7a3b3b, { rough: 0.7, seg: 4 }), 0, Math.PI / 4, 0); roof.position.y = 0.7; roof.scale.z = 0.65; g.add(roof); for (let i = 0; i < 4; i++) g.add(at(box(0.1, 0.12, 0.01, 0x88bbdd, { rough: 0.2 }), -0.22 + (i % 2) * 0.44, 0.1 + Math.floor(i / 2) * 0.28, 0.23)); return g; },
  },
  {
    id: 'kid_bike', name: "Child's bicycle", category: 'toys', size: 'M', value: [20, 150], weight: 4, footprint: [0.45, 0.7, 1.1],
    build: (r) => { const c = r.pick(PASTELS.concat([0xd94f3d, 0x2f6fd6])); return group(at(wheel(0.2, 0.03, 0x999999), 0, 0, 0.35), at(wheel(0.2, 0.03, 0x999999), 0, 0, -0.35), at(box(0.03, 0.03, 0.5, c, { rough: 0.3, metal: 0.3 }), 0, 0.45, 0), at(rot(box(0.03, 0.35, 0.03, c, { rough: 0.3, metal: 0.3 }), 0.4, 0, 0), 0, 0.2, -0.2), at(box(0.35, 0.03, 0.03, 0x333333), 0, 0.65, 0.28), at(box(0.12, 0.05, 0.2, 0x222222), 0, 0.55, -0.25)); },
  },
  {
    id: 'plush_pile', name: 'Pile of plush toys', category: 'toys', size: 'M', value: [10, 200], weight: 4, footprint: [0.7, 0.5, 0.6], soft: true,
    build: (r) => { const g = group(); for (let i = 0; i < 6; i++) g.add(at(sphere(r.range(0.1, 0.17), r.pick(PASTELS.concat([0xb8651a, 0xeeeeee])), { rough: 1 }), r.range(-0.25, 0.25), r.range(0, 0.25), r.range(-0.2, 0.2))); return g; },
  },
  {
    id: 'pinball', name: 'Pinball machine', category: 'toys', size: 'L', value: [500, 6000], weight: 1.5, footprint: [0.75, 1.9, 1.4], luxury: true,
    build: (r) => { const c = pickPlastic(r); const g = group(at(box(0.75, 0.3, 1.3, c, { rough: 0.5 }), 0, 0.75, 0), at(box(0.75, 0.9, 0.25, c, { rough: 0.5 }), 0, 1.0, -0.55), at(rot(box(0.65, 0.02, 1.2, 0x2a2a4a, { rough: 0.2, emissive: 0.3 }), 0.1, 0, 0), 0, 1.02, 0.02), at(box(0.65, 0.6, 0.02, 0x4a1a6a, { rough: 0.2, emissive: 0.4 }), 0, 1.2, -0.42)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(0.06, 0.75, 0.06, 0x222222, metalOpts), sx * 0.32, 0, sz * 0.55)); return g; },
  },

  /* ===== CLOTHING ===== */
  {
    id: 'clothes_rack', name: 'Rack of clothes', category: 'clothing', size: 'L', value: [40, 2000], weight: 5, footprint: [1.2, 1.6, 0.5], soft: true, luxury: true,
    build: (r) => { const g = group(at(box(1.2, 0.03, 0.03, CHROME, chromeOpts), 0, 1.55, 0), at(cyl(0.015, 0.015, 1.55, CHROME, chromeOpts), -0.55, 0, 0), at(cyl(0.015, 0.015, 1.55, CHROME, chromeOpts), 0.55, 0, 0), at(box(1.2, 0.03, 0.4, CHROME, chromeOpts), 0, 0.05, 0)); for (let i = 0; i < 9; i++) g.add(at(box(0.09, r.range(0.6, 1.0), 0.35, pickFabric(r), { rough: 0.95 }), -0.48 + i * 0.12, 0.6, 0)); return g; },
  },
  {
    id: 'sneakers', name: 'Stack of sneaker boxes', category: 'clothing', size: 'S', value: [30, 3000], weight: 4, footprint: [0.4, 0.5, 0.3], luxury: true, stackable: true,
    build: (r) => { const g = group(); for (let i = 0; i < 4; i++) g.add(at(box(0.36, 0.12, 0.26, r.pick([0xff7b39, 0x222222, 0xeeeeee, 0xd94f3d]), { rough: 0.6 }), r.range(-0.02, 0.02), i * 0.125, r.range(-0.02, 0.02), r.range(-0.1, 0.1))); return g; },
  },
  {
    id: 'handbag', name: 'Designer handbag', category: 'clothing', size: 'S', value: [100, 12000], weight: 2, footprint: [0.4, 0.35, 0.2], luxury: true, valuable: true,
    build: (r) => { const c = r.pick([0x3e2a1a, 0xd94f3d, BLACK, 0xf7c9d4]); const g = group(box(0.4, 0.28, 0.18, c, { rough: 0.35 })); const handle = torus(0.1, 0.012, c, { rough: 0.35 }); handle.position.y = 0.28; g.add(handle); g.add(at(box(0.04, 0.03, 0.01, GOLD, chromeOpts), 0, 0.15, 0.09)); return g; },
  },
  {
    id: 'fur_coat', name: 'Fur coat on mannequin', category: 'clothing', size: 'M', value: [100, 4000], weight: 2, footprint: [0.6, 1.7, 0.4], luxury: true, soft: true,
    build: (r) => { const c = r.pick([0x5c3a21, 0x2b2b2b, 0xd9d0c0]); return group(cyl(0.2, 0.2, 0.02, 0x222222), cyl(0.02, 0.02, 0.6, 0x222222), at(box(0.55, 1.0, 0.35, c, { rough: 1 }), 0, 0.6, 0), at(sphere(0.11, 0xd9d0c0, { rough: 0.8 }), 0, 1.6, 0)); },
  },
  {
    id: 'wedding_dress', name: 'Boxed wedding dress', category: 'clothing', size: 'M', value: [50, 2000], weight: 2, footprint: [0.7, 0.2, 0.5], soft: true, stackable: true,
    build: () => group(box(0.7, 0.2, 0.5, 0xf4f0ea, { rough: 0.8 }), at(box(0.3, 0.02, 0.2, 0xe8f6ff, glassOpts), 0, 0.2, 0)),
  },
  {
    id: 'leather_jackets', name: 'Leather jackets', category: 'clothing', size: 'S', value: [30, 900], weight: 3, footprint: [0.5, 0.25, 0.4], soft: true, stackable: true,
    build: (r) => { const g = group(); for (let i = 0; i < 3; i++) g.add(at(box(0.48, 0.07, 0.38, r.pick([BLACK, 0x3e2a1a, 0x7a1f1f]), { rough: 0.4 }), r.range(-0.02, 0.02), i * 0.075, 0)); return g; },
  },

  /* ===== JUNK ===== */
  {
    id: 'tires', name: 'Stack of old tires', category: 'junk', size: 'M', value: [10, 200], weight: 5, footprint: [0.65, 0.7, 0.65], stackable: true,
    build: () => { const g = group(); for (let i = 0; i < 3; i++) { const t = torus(0.24, 0.1, 0x151515, { rough: 0.95 }); t.rotation.x = Math.PI / 2; t.position.y = 0.1 + i * 0.2; g.add(t); } return g; },
  },
  {
    id: 'paint_cans', name: 'Old paint cans', category: 'junk', size: 'S', value: [0, 30], weight: 6, footprint: [0.4, 0.2, 0.4],
    build: (r) => { const g = group(); for (let i = 0; i < 4; i++) g.add(at(cyl(0.08, 0.08, 0.18, 0x9a9da3, metalOpts), -0.1 + (i % 2) * 0.2, 0, -0.1 + Math.floor(i / 2) * 0.2), at(cyl(0.07, 0.07, 0.005, pickPlastic(r), { rough: 0.3 }), -0.1 + (i % 2) * 0.2, 0.18, -0.1 + Math.floor(i / 2) * 0.2)); return g; },
  },
  {
    id: 'magazines', name: 'Bundle of old magazines', category: 'junk', size: 'S', value: [5, 80], weight: 6, footprint: [0.35, 0.3, 0.3], stackable: true,
    build: (r) => { const g = group(); for (let i = 0; i < 10; i++) g.add(at(box(0.3, 0.025, 0.24, i % 3 ? 0xe8e4d8 : pickPlastic(r), { rough: 0.9 }), r.range(-0.01, 0.01), i * 0.028, 0, r.range(-0.08, 0.08))); return g; },
  },
  {
    id: 'broken_fan', name: 'Broken box fan', category: 'junk', size: 'S', value: [0, 15], weight: 5, footprint: [0.5, 0.5, 0.12],
    build: () => { const g = group(box(0.5, 0.5, 0.1, 0xd9d9d9, { rough: 0.7 })); const b = rot(cyl(0.2, 0.2, 0.02, 0x555555), Math.PI / 2, 0, 0); b.position.set(0, 0.25, 0.05); g.add(b); return g; },
  },
  {
    id: 'clothes_bags', name: 'Bags of old clothes', category: 'junk', size: 'M', value: [5, 60], weight: 6, footprint: [0.7, 0.55, 0.6], soft: true,
    build: (r) => { const g = group(); for (let i = 0; i < 3; i++) { const s = sphere(0.28, r.pick([0x1a1a1a, 0xeeeeee]), { rough: 0.85 }); s.scale.y = 0.8; s.position.set(r.range(-0.2, 0.2), 0.22, r.range(-0.15, 0.15)); g.add(s); } return g; },
  },
  {
    id: 'old_mattress', name: 'Stained mattress', category: 'junk', size: 'L', value: [0, 40], weight: 4, footprint: [0.25, 1.9, 1.0], soft: true,
    build: () => { const g = group(box(0.22, 1.9, 1.0, 0xdcd3c0, { rough: 1 })); g.add(at(box(0.01, 0.4, 0.3, 0xb7a58a, { rough: 1 }), 0.11, 0.8, 0.1)); g.rotation.x = 0; return g; },
  },
  {
    id: 'misc_tub', name: 'Tub of odds and ends', category: 'junk', size: 'S', value: [5, 120], weight: 7, footprint: [0.55, 0.4, 0.4], stackable: true,
    build: (r) => { const g = group(box(0.55, 0.38, 0.4, r.pick([0x2f6fd6, 0x888888, 0x3aa655]), { rough: 0.5 })); g.add(at(box(0.57, 0.03, 0.42, 0xeeeeee, { rough: 0.5 }), 0, 0.38, 0)); return g; },
  },
  {
    id: 'hose', name: 'Garden hose & tools', category: 'junk', size: 'S', value: [5, 30], weight: 5, footprint: [0.4, 0.15, 0.4],
    build: () => { const t = torus(0.15, 0.05, 0x3aa655, { rough: 0.7 }); t.rotation.x = Math.PI / 2; t.position.y = 0.05; return group(t); },
  },
  {
    id: 'xmas', name: 'Box of holiday decorations', category: 'junk', size: 'S', value: [10, 120], weight: 5, footprint: [0.5, 0.4, 0.4], stackable: true,
    build: (r) => { const g = cardboard(r, 0.5, 0.35, 0.4); for (let i = 0; i < 5; i++) g.add(at(sphere(0.04, r.pick([0xd94f3d, 0xf2c14e, 0x3aa655]), { rough: 0.2, metal: 0.4 }), r.range(-0.18, 0.18), 0.35, r.range(-0.12, 0.12))); return g; },
  },
  {
    id: 'dvds', name: 'Box of DVDs', category: 'junk', size: 'S', value: [5, 80], weight: 6, footprint: [0.45, 0.3, 0.35], stackable: true,
    build: (r) => { const g = cardboard(r, 0.45, 0.28, 0.35); for (let i = 0; i < 10; i++) g.add(at(box(0.015, 0.19, 0.14, pickPlastic(r), { rough: 0.5 }), -0.18 + i * 0.04, 0.1, 0)); return g; },
  },
  {
    id: 'books', name: 'Boxes of books', category: 'junk', size: 'S', value: [5, 150], weight: 6, footprint: [0.5, 0.45, 0.4], stackable: true,
    build: (r) => group(cardboard(r, 0.5, 0.25, 0.4), at(cardboard(r, 0.45, 0.2, 0.35), 0, 0.25, 0, 0.1)),
  },
  {
    id: 'office_boxes', name: 'File boxes of paperwork', category: 'junk', size: 'S', value: [0, 20], weight: 6, footprint: [0.4, 0.55, 0.35], stackable: true,
    build: () => group(box(0.4, 0.27, 0.33, 0xf0eadc, { rough: 0.9 }), at(box(0.4, 0.27, 0.33, 0xf0eadc, { rough: 0.9 }), 0, 0.27, 0)),
  },
  {
    id: 'exercise_bike', name: 'Old exercise bike', category: 'junk', size: 'L', value: [10, 120], weight: 3, footprint: [0.5, 1.2, 1.1],
    build: () => group(at(box(0.5, 0.05, 0.9, 0x333333, metalOpts), 0, 0, 0), at(rot(box(0.05, 1.0, 0.05, 0x666666, metalOpts), 0.25, 0, 0), 0, 0.05, 0.3), at(box(0.3, 0.06, 0.25, 0x222222, { rough: 0.9 }), 0, 1.0, -0.2), at(box(0.45, 0.03, 0.03, 0x222222), 0, 1.1, 0.45), at(rot(cyl(0.25, 0.25, 0.05, 0x444444, metalOpts), 0, 0, Math.PI / 2), 0, 0.1, 0.1)),
  },
  {
    id: 'cooler', name: 'Camping gear & cooler', category: 'junk', size: 'M', value: [20, 250], weight: 5, footprint: [0.7, 0.5, 0.5], stackable: true,
    build: (r) => group(box(0.6, 0.4, 0.4, r.pick([0xd94f3d, 0x2f6fd6, 0xeeeeee]), { rough: 0.5 }), at(box(0.6, 0.08, 0.4, 0xeeeeee, { rough: 0.5 }), 0, 0.4, 0), at(cyl(0.12, 0.12, 0.5, 0x3aa655, { rough: 0.8 }), 0.28, 0, 0.1).rotateZ(Math.PI / 2).translateX(-0.2)),
  },
];

// Values above are authored in street dollars; convert once to game dollars.
for (const d of ITEM_BANK) d.value = [g(d.value[0]), g(d.value[1])];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEM_BANK.map((d) => [d.id, d]));

/** Special open-ended items used when a hidden slot must absorb any residual value. */
export const FLEX_ITEM_IDS = ['cash_can', 'coins', 'jewelry_box', 'bonds', 'watch'];

void mesh; void mat;
