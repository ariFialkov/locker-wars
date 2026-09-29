/**
 * Locker generation (what you see) and resolution (what it was really worth).
 *
 * generateLocker: picks a theme, rolls items, packs them into the unit, and
 * conceals a share of them under covers. Visible items get a rolled base value.
 * Hidden slots are just covers with a size class — their identity is decided
 * later by resolveLocker so the appraised total lands on the RTP target.
 */
import { makeRNG, type RNG } from '../core/rng';
import { niceValue } from '../core/money';
import { ITEM_BANK, ITEM_BY_ID, FLEX_ITEM_IDS } from './items/bank';
import { coversFor, type Category, type CoverKind, type ItemDef, type SizeClass } from './items/types';
import { coverDims, coverGuess } from './items/covers';

export const LOCKER = { width: 3.4, depth: 3.2, height: 2.6 };

export interface Theme { id: string; name: string; blurb: string; bias: Partial<Record<Category, number>>; count: [number, number]; hiddenShare: [number, number] }

export const THEMES: Theme[] = [
  { id: 'household', name: 'Household clean-out', blurb: 'Someone stopped paying rent on a whole apartment.', bias: { furniture: 2.2, appliances: 1.8, junk: 1.6, toys: 1.2, electronics: 1.1 }, count: [10, 17], hiddenShare: [0.3, 0.45] },
  { id: 'contractor', name: "Contractor's unit", blurb: 'Dusty, heavy, and probably full of tools.', bias: { tools: 3.0, junk: 1.3, vehicles: 0.8, appliances: 0.9, furniture: 0.4 }, count: [8, 14], hiddenShare: [0.3, 0.5] },
  { id: 'collector', name: "Collector's stash", blurb: 'Neatly packed. Too neatly.', bias: { collectibles: 3.0, art: 1.8, valuables: 1.4, electronics: 1.0, junk: 0.5, furniture: 0.5 }, count: [9, 16], hiddenShare: [0.4, 0.6] },
  { id: 'garage', name: 'Garage overflow', blurb: 'Weekend-warrior gear and things with wheels.', bias: { vehicles: 2.4, sports: 2.0, tools: 1.4, junk: 1.2, furniture: 0.5 }, count: [7, 13], hiddenShare: [0.3, 0.45] },
  { id: 'musician', name: "Musician's storage", blurb: 'Cases. Lots of cases.', bias: { instruments: 3.2, electronics: 1.4, furniture: 0.8, junk: 0.8 }, count: [7, 13], hiddenShare: [0.35, 0.55] },
  { id: 'boutique', name: 'Boutique closing', blurb: 'Racks, boxes, and the smell of retail.', bias: { clothing: 3.0, furniture: 1.2, art: 1.0, junk: 0.8 }, count: [9, 15], hiddenShare: [0.35, 0.5] },
  { id: 'estate', name: 'Retiree estate', blurb: 'Decades of a life, boxed up in a hurry.', bias: { art: 1.8, furniture: 1.6, valuables: 1.3, collectibles: 1.2, junk: 1.4, appliances: 0.8 }, count: [10, 18], hiddenShare: [0.35, 0.55] },
  { id: 'gamer', name: "Gamer's den", blurb: 'RGB lighting optional.', bias: { electronics: 3.0, toys: 1.6, collectibles: 1.4, furniture: 0.8, junk: 0.9 }, count: [8, 14], hiddenShare: [0.3, 0.45] },
  { id: 'mystery', name: 'Mystery unit', blurb: 'Nobody remembers who rented this one.', bias: {}, count: [8, 16], hiddenShare: [0.45, 0.65] },
];

export interface Cover { kind: CoverKind; size: SizeClass; dims: [number, number, number] }

export interface PlacedItem {
  uid: string;
  hidden: boolean;
  /** Visible items know what they are. */
  def?: ItemDef;
  baseValue?: number;
  cover?: Cover;
  x: number; y: number; z: number; rotY: number;
  /** Bounding footprint after rotation: w, h, d */
  fp: [number, number, number];
  row: 0 | 1 | 2;
  /** Instance seed so the same mesh is rebuilt identically. */
  seed: number;
}

export interface Locker {
  seed: string;
  number: number;
  theme: Theme;
  items: PlacedItem[];
  /** What a savvy buyer would guess it's worth from outside: drives rival bidding. */
  apparentValue: number;
  visibleBaseValue: number;
}

interface Surface { x: number; z: number; y: number; w: number; d: number; used: boolean }

export function generateLocker(sessionSeed: string, number: number): Locker {
  if (number <= 3) {
    // Ease players in: among a few candidates, take the most modest-looking unit.
    let best: Locker | null = null;
    for (let k = 0; k < 6; k++) {
      const cand = generateLockerRaw(sessionSeed, number, k);
      if (!best || Math.abs(cand.apparentValue - 1800) < Math.abs(best.apparentValue - 1800)) best = cand;
    }
    return best!;
  }
  return generateLockerRaw(sessionSeed, number, 0);
}

function generateLockerRaw(sessionSeed: string, number: number, variant: number): Locker {
  const seed = `${sessionSeed}#${number}${variant ? '~' + variant : ''}`;
  const rng = makeRNG(seed);
  const theme = number <= 1 ? THEMES[0] : rng.pick(THEMES);
  const count = rng.int(theme.count[0], theme.count[1]);
  const hiddenShare = rng.range(theme.hiddenShare[0], theme.hiddenShare[1]);

  // Roll item definitions with theme bias; avoid too many duplicates.
  const defs: ItemDef[] = [];
  const used = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const def = rng.weighted(ITEM_BANK, (d) => d.weight * (theme.bias[d.category] ?? (theme.id === 'mystery' ? 1 : 0.6)) / (1 + 3 * (used.get(d.id) ?? 0)));
    used.set(def.id, (used.get(def.id) ?? 0) + 1);
    defs.push(def);
  }
  // Big things first so the back row gets the bulk.
  const sizeRank: Record<SizeClass, number> = { XL: 0, L: 1, M: 2, S: 3 };
  defs.sort((a, b) => sizeRank[a.size] - sizeRank[b.size] + (rng.next() - 0.5) * 0.4);

  // Decide which are hidden. Always at least two hidden slots and at least one small (box/safe/suitcase).
  const nHidden = Math.max(2, Math.round(count * hiddenShare));
  const hiddenIdx = new Set<number>();
  // Small valuables (cash, jewellery, bullion...) are never left in plain sight.
  defs.forEach((d, i) => { if (d.valuable) hiddenIdx.add(i); });
  const order = rng.shuffle(defs.map((_, i) => i));
  for (const i of order) { if (hiddenIdx.size >= nHidden) break; hiddenIdx.add(i); }

  const items: PlacedItem[] = [];
  let smallHidden = 0;
  defs.forEach((def, i) => {
    const instSeed = Math.floor(rng.next() * 1e9);
    if (hiddenIdx.has(i)) {
      const covers = coversFor(def);
      let kind = rng.pick(covers);
      // A concealed thing's cover size is what the buyer sees; keep it honest to the size class.
      let size: SizeClass = def.size;
      if (kind === 'box' || kind === 'safe' || kind === 'suitcase' || kind === 'bag') { size = 'S'; smallHidden++; }
      const dims = coverDims(rng, kind, size);
      items.push({ uid: `h${i}`, hidden: true, cover: { kind, size, dims }, x: 0, y: 0, z: 0, rotY: 0, fp: dims, row: 1, seed: instSeed });
    } else {
      const baseValue = niceValue(rollValue(rng, def));
      items.push({ uid: `v${i}`, hidden: false, def, baseValue, x: 0, y: 0, z: 0, rotY: 0, fp: def.footprint, row: 1, seed: instSeed });
    }
  });
  if (smallHidden === 0) {
    // guarantee a small container (it is the residual absorber for extreme outcomes)
    const kind: CoverKind = rng.pick(['box', 'safe', 'suitcase']);
    const dims = coverDims(rng, kind, 'S');
    items.push({ uid: 'hx', hidden: true, cover: { kind, size: 'S', dims }, x: 0, y: 0, z: 0, rotY: 0, fp: dims, row: 0, seed: Math.floor(rng.next() * 1e9) });
  }

  const placed = pack(rng, items);
  const visibleBaseValue = placed.filter((p) => !p.hidden).reduce((s, p) => s + (p.baseValue ?? 0), 0);
  const apparentValue = visibleBaseValue + placed.filter((p) => p.hidden).reduce((s, p) => s + coverGuess(p.cover!.kind, p.cover!.size), 0);
  return { seed, number, theme, items: placed, apparentValue, visibleBaseValue };
}

function rollValue(rng: RNG, def: ItemDef): number {
  // Log-uniform inside the range so cheap versions are common and the top end is rare.
  // What you can see from the door is appraised conservatively; the big swings live under the covers.
  const [lo, hiRaw] = def.value;
  const hi = Math.min(hiRaw, Math.max(lo * 8, def.category === 'vehicles' ? 12000 : 3500));
  const l = Math.max(lo, 1);
  const v = Math.exp(rng.range(Math.log(l), Math.log(Math.max(hi, l + 1))));
  return lo === 0 && rng.chance(0.3) ? 0 : v;
}

/** Shelf-pack items into three depth rows with light stacking. Drops what cannot fit. */
function pack(rng: RNG, items: PlacedItem[]): PlacedItem[] {
  const halfW = LOCKER.width / 2 - 0.12;
  const rows: { z: number; maxD: number; cursor: number; row: 0 | 1 | 2 }[] = [
    { z: -2.6, maxD: 1.1, cursor: -halfW, row: 2 },
    { z: -1.55, maxD: 0.8, cursor: -halfW, row: 1 },
    { z: -0.62, maxD: 0.7, cursor: -halfW + 0.1, row: 0 },
  ];
  const surfaces: Surface[] = [];
  const out: PlacedItem[] = [];

  for (const it of items) {
    let [w, h, d] = it.fp;
    // draped covers spread at the floor: reserve room for the skirt
    if (it.hidden && (it.cover!.kind === 'tarp' || it.cover!.kind === 'blanket')) { w *= 1.12; d *= 1.12; }
    let rotY = 0;
    if (d > w * 1.4 && d > 1.0) { [w, d] = [d, w]; rotY = Math.PI / 2; }
    rotY += rng.range(-0.12, 0.12);
    const wRot = w + Math.abs(Math.sin(rotY)) * d * 0.5;

    // Try stacking small light items on an available surface first (40% of the time).
    if (!it.hidden || it.cover!.kind === 'box' || it.cover!.kind === 'suitcase') {
      if (w < 0.8 && h < 0.8 && rng.chance(0.7)) {
        const s = surfaces.find((sf) => !sf.used && sf.w >= w * 0.9 && sf.d >= d * 0.8 && sf.y + h < LOCKER.height - 0.4);
        if (s) {
          s.used = true;
          out.push({ ...it, x: s.x + rng.range(-0.05, 0.05), y: s.y, z: s.z, rotY, fp: [w, h, d], row: s.z > -1.0 ? 0 : s.z > -1.9 ? 1 : 2 });
          const stackable = it.hidden ? it.cover!.kind === 'box' : !!it.def?.stackable;
          if (stackable && s.y + h < 1.5) surfaces.push({ x: s.x, z: s.z, y: s.y + h, w: w * 0.9, d: d * 0.9, used: false });
          continue;
        }
      }
    }

    // Prefer rows by size: big → back, medium → middle, small → front, with fallbacks.
    const pref = h > 1.2 || w > 1.2 ? [0, 1, 2] : h > 0.6 ? [1, 0, 2] : [2, 1, 0];
    let done = false;
    for (const ri of pref) {
      const row = rows[ri];
      if (d > row.maxD + 0.12) continue;
      const gap = rng.range(0.04, 0.16);
      if (row.cursor + gap + wRot <= halfW) {
        const x = row.cursor + gap + wRot / 2;
        const z = row.z + rng.range(-0.05, 0.05) + (row.row === 0 ? 0 : Math.max(0, row.maxD - d) * 0.3);
        row.cursor = x + wRot / 2;
        out.push({ ...it, x, y: 0, z, rotY, fp: [w, h, d], row: row.row });
        const stackable = it.hidden ? it.cover!.kind === 'crate' || it.cover!.kind === 'box' || it.cover!.kind === 'safe' : !!it.def?.stackable;
        if (stackable && h < 1.4) surfaces.push({ x, z, y: h, w: w * 0.9, d: d * 0.9, used: false });
        if (stackable && h < 0.7 && w > 1.2) surfaces.push({ x: x + w * 0.3, z, y: h, w: w * 0.4, d: d * 0.9, used: false }, { x: x - w * 0.3, z, y: h, w: w * 0.4, d: d * 0.9, used: false });
        done = true;
        break;
      }
    }
    if (!done && !it.hidden) {
      // Last resort for small visible items: squeeze somewhere on any surface.
      const s = surfaces.find((sf) => !sf.used && sf.w >= w * 0.8 && sf.d >= d * 0.7 && sf.y + h < LOCKER.height - 0.35);
      if (s) { s.used = true; out.push({ ...it, x: s.x, y: s.y, z: s.z, rotY, fp: [w, h, d], row: s.z > -1.0 ? 0 : s.z > -1.9 ? 1 : 2 }); }
    } else if (!done && it.hidden && it.cover!.size === 'S') {
      const s = surfaces.find((sf) => !sf.used && sf.w >= w * 0.8 && sf.y + h < LOCKER.height - 0.35);
      if (s) { s.used = true; out.push({ ...it, x: s.x, y: s.y, z: s.z, rotY, fp: [w, h, d], row: s.z > -1.0 ? 0 : s.z > -1.9 ? 1 : 2 }); }
    }
  }
  // Ensure at least one hidden small slot survived packing (residual absorber).
  if (!out.some((p) => p.hidden && p.cover!.size === 'S')) {
    const kind: CoverKind = 'box';
    const dims = coverDims(rng, kind, 'S');
    out.push({ uid: 'hz', hidden: true, cover: { kind, size: 'S', dims }, x: 1.05, y: 0, z: -0.5, rotY: 0.2, fp: dims, row: 0, seed: Math.floor(rng.next() * 1e9) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*                        Resolution / appraisal                        */
/* ------------------------------------------------------------------ */

export interface Condition { label: string; mult: number; tone: 'good' | 'neutral' | 'bad' }

const CONDITIONS: (Condition & { p: number })[] = [
  { label: 'Mint', mult: 1.5, tone: 'good', p: 0.08 },
  { label: 'Excellent', mult: 1.2, tone: 'good', p: 0.17 },
  { label: 'Good', mult: 1.0, tone: 'neutral', p: 0.35 },
  { label: 'Worn', mult: 0.7, tone: 'neutral', p: 0.2 },
  { label: 'Damaged', mult: 0.4, tone: 'bad', p: 0.12 },
  { label: 'Broken', mult: 0.15, tone: 'bad', p: 0.08 },
];
const REPLICA: Condition = { label: 'Replica', mult: 0.05, tone: 'bad' };
const SCRAP: Condition = { label: 'Scrap', mult: 0.05, tone: 'bad' };

export interface Appraisal {
  item: PlacedItem;
  def: ItemDef;
  /** Appraised value that gets added to the total. */
  value: number;
  baseValue: number;
  condition: Condition;
  /** True when this item was concealed and is being revealed. */
  revealed: boolean;
}

export interface Resolution { appraisals: Appraisal[]; total: number; error: number }

/**
 * Decide the final contents so that Σ value ≈ target. Visible items keep their
 * identity (only condition varies); hidden slots pick an identity whose value
 * range fits the share of the target they must carry.
 */
export function resolveLocker(locker: Locker, target: number, rng: RNG): Resolution {
  const visible = locker.items.filter((p) => !p.hidden);
  const hidden = locker.items.filter((p) => p.hidden);

  // 1. Visible items: draw conditions, then nudge downward if they alone bust the target.
  const condIdx = new Map<string, number>();
  const luxuryReplica = new Set<string>();
  for (const v of visible) {
    let i = 0, r = rng.next();
    for (; i < CONDITIONS.length - 1; i++) { r -= CONDITIONS[i].p; if (r <= 0) break; }
    condIdx.set(v.uid, i);
    if (v.def!.luxury && rng.chance(0.06)) luxuryReplica.add(v.uid);
  }
  const condOf = (v: PlacedItem): Condition => (luxuryReplica.has(v.uid) ? REPLICA : condIdx.get(v.uid)! >= CONDITIONS.length ? (v.def!.luxury ? REPLICA : SCRAP) : CONDITIONS[condIdx.get(v.uid)!]);
  const visibleSum = () => visible.reduce((s, v) => s + niceValue(v.baseValue! * condOf(v).mult), 0);

  const minHidden = hidden.length * 5;
  let guard = 0;
  while (visibleSum() + minHidden > target && guard++ < 200) {
    // downgrade the currently most valuable visible item one notch
    let best: PlacedItem | null = null, bestVal = -1;
    for (const v of visible) {
      const val = v.baseValue! * condOf(v).mult;
      if (val > bestVal && condIdx.get(v.uid)! < CONDITIONS.length && !luxuryReplica.has(v.uid)) { best = v; bestVal = val; }
    }
    if (!best) break;
    condIdx.set(best.uid, condIdx.get(best.uid)! + 1);
  }
  // In generous rounds, let a couple of visible items shine (purely cosmetic: hidden slots absorb the difference).
  if (target > 2.5 * (visibleSum() + minHidden)) {
    for (const v of visible) if (rng.chance(0.3) && condIdx.get(v.uid)! > 0) condIdx.set(v.uid, Math.max(0, condIdx.get(v.uid)! - 1));
  }

  const appraisals: Appraisal[] = visible.map((v) => {
    const c = condOf(v);
    return { item: v, def: v.def!, baseValue: v.baseValue!, value: niceValue(v.baseValue! * c.mult), condition: c, revealed: false };
  });

  // 2. Hidden slots share the remainder.
  let remaining = target - appraisals.reduce((s, a) => s + a.value, 0);
  const shares = hidden.map((h) => {
    const sizeW: Record<SizeClass, number> = { S: 1, M: 1.6, L: 2.4, XL: 3.5 };
    const kindW = h.cover!.kind === 'safe' ? 3 : h.cover!.kind === 'bag' ? 0.5 : 1;
    return rng.lognormal(1, 0.8) * sizeW[h.cover!.size] * kindW;
  });
  const shareSum = shares.reduce((a, b) => a + b, 0) || 1;
  const usedIds = new Set(visible.map((v) => v.def!.id));
  // Process the small container last so it can absorb whatever the others could not.
  const orderIdx = hidden.map((_, i) => i).sort((a, b) => (hidden[a].cover!.size === 'S' ? 1 : 0) - (hidden[b].cover!.size === 'S' ? 1 : 0));
  let carry = 0;
  const hiddenAppraisals = new Map<number, Appraisal>();
  orderIdx.forEach((i, k) => {
    const h = hidden[i];
    const isLast = k === orderIdx.length - 1;
    let amount = isLast ? remaining : Math.max(0, remaining * (shares[i] / shareSum) + carry);
    amount = Math.max(0, amount);
    const def = chooseHiddenDef(rng, h, amount, usedIds, isLast);
    usedIds.add(def.id);
    const [lo, hi] = def.value;
    let value = Math.min(Math.max(amount, lo), Math.max(hi, lo));
    if (isLast && FLEX_ITEM_IDS.includes(def.id)) value = Math.max(0, amount); // flex items can hold anything
    value = niceValue(value);
    carry = amount - value;
    remaining -= value;
    remaining += 0; // keep explicit
    // A cosmetic condition consistent with the value.
    const cond = pickHiddenCondition(rng, def, value);
    hiddenAppraisals.set(i, { item: h, def, baseValue: niceValue(value / cond.mult), value, condition: cond, revealed: true });
  });
  hidden.forEach((_, i) => appraisals.push(hiddenAppraisals.get(i)!));

  // Order for the count-up walk: front row → back, left → right, stacked items follow their base.
  appraisals.sort((a, b) => a.item.row - b.item.row || a.item.x - b.item.x || a.item.y - b.item.y);
  const total = appraisals.reduce((s, a) => s + a.value, 0);
  return { appraisals, total, error: total - target };
}

function chooseHiddenDef(rng: RNG, slot: PlacedItem, amount: number, usedIds: Set<string>, isLast: boolean): ItemDef {
  const { kind, size } = slot.cover!;
  const fits = (d: ItemDef) => d.size === size && coversFor(d).includes(kind);
  let pool = ITEM_BANK.filter(fits);
  if (kind === 'safe') pool = pool.filter((d) => d.valuable);
  if (pool.length === 0) pool = ITEM_BANK.filter((d) => d.size === size);
  if (pool.length === 0) pool = ITEM_BANK.filter((d) => d.size === 'S');
  const containing = pool.filter((d) => amount >= d.value[0] * 0.9 && amount <= d.value[1] * 1.1);
  if (isLast && size === 'S' && (containing.length === 0 || amount > 3000)) {
    // Flexible-value items (cash, coins, jewelry...) can plausibly sit in any small container.
    const flex = FLEX_ITEM_IDS.map((id) => ITEM_BY_ID[id]).filter((d) => kind !== 'safe' || d.valuable);
    return rng.weighted(flex, (d) => (usedIds.has(d.id) ? 0.2 : 1) * (amount >= d.value[0] && amount <= d.value[1] ? 3 : 1));
  }
  if (containing.length > 0) return rng.weighted(containing, (d) => d.weight * (usedIds.has(d.id) ? 0.15 : 1));
  // nearest range
  let best = pool[0], bestDist = Infinity;
  for (const d of pool) {
    const dist = amount < d.value[0] ? Math.log(d.value[0] + 1) - Math.log(amount + 1) : Math.log(amount + 1) - Math.log(d.value[1] + 1);
    const w = dist / (usedIds.has(d.id) ? 0.5 : 1) + (rng.next() * 0.2);
    if (w < bestDist) { bestDist = w; best = d; }
  }
  return best;
}

function pickHiddenCondition(rng: RNG, def: ItemDef, value: number): Condition {
  const [lo, hi] = def.value;
  const ok = CONDITIONS.filter((c) => value / c.mult >= lo * 0.5 && value / c.mult <= hi * 1.5);
  if (ok.length === 0) return CONDITIONS[2];
  return rng.weighted(ok, (c) => c.p);
}
