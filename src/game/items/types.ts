import type * as THREE from 'three';
import type { RNG } from '../../core/rng';
import { packCoversFor } from '../../pack/manifest';

export type Category =
  | 'furniture' | 'appliances' | 'electronics' | 'tools' | 'vehicles' | 'instruments'
  | 'collectibles' | 'valuables' | 'art' | 'sports' | 'toys' | 'clothing' | 'junk';

export type SizeClass = 'S' | 'M' | 'L' | 'XL';

export type CoverKind = 'box' | 'crate' | 'safe' | 'suitcase' | 'bag' | 'tarp' | 'blanket' | 'trunk';

export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  size: SizeClass;
  /** Base appraisal range in dollars. */
  value: [number, number];
  /** Rarity weight: higher = more common when filling lockers. */
  weight: number;
  /** Approximate bounding footprint (w, h, d) in metres, base at y=0. */
  footprint: [number, number, number];
  /** Can be revealed as a fake/replica during appraisal. */
  luxury?: boolean;
  /** Soft goods can be stuffed in bags. */
  soft?: boolean;
  /** Small valuables that belong in a safe. */
  valuable?: boolean;
  /** Can other things be stacked on it? */
  stackable?: boolean;
  build: (rng: RNG) => THREE.Group;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  furniture: 'Furniture', appliances: 'Appliances', electronics: 'Electronics', tools: 'Tools',
  vehicles: 'Vehicles', instruments: 'Instruments', collectibles: 'Collectibles', valuables: 'Valuables',
  art: 'Art & Antiques', sports: 'Sports', toys: 'Toys', clothing: 'Clothing', junk: 'Junk',
};

/** Icon name (see ui/icons.ts) for each category — the names match 1:1. */
export const CATEGORY_ICON: Record<Category, Category> = {
  furniture: 'furniture', appliances: 'appliances', electronics: 'electronics', tools: 'tools', vehicles: 'vehicles', instruments: 'instruments',
  collectibles: 'collectibles', valuables: 'valuables', art: 'art', sports: 'sports', toys: 'toys', clothing: 'clothing', junk: 'junk',
};

/** Containers that can hide an item: the pack's ray-tested fits, else the old size heuristic. */
export function coversFor(def: ItemDef): CoverKind[] {
  const fromPack = packCoversFor(def.id);
  if (fromPack.length) return fromPack;
  return heuristicCovers(def);
}

function heuristicCovers(def: ItemDef): CoverKind[] {
  const out: CoverKind[] = [];
  if (def.size === 'S') {
    out.push('box', 'suitcase');
    if (def.valuable) out.push('safe');
    if (def.soft) out.push('bag');
  } else if (def.size === 'M') {
    out.push('crate', 'tarp', 'blanket');
    if (def.soft) out.push('bag');
    if (def.footprint[1] < 0.6 && def.footprint[0] < 0.7) out.push('box');
  } else if (def.size === 'L') {
    out.push('tarp', 'blanket');
  } else {
    out.push('tarp');
  }
  return out;
}
