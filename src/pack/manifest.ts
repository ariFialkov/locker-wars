/**
 * Typed access to the Locker Wars asset pack manifest (assets/pack/manifest.json).
 * The manifest is bundled; the files it points to are served at ./pack/.
 */
import raw from '../../assets/pack/manifest.json';
import type { CoverKind } from '../game/items/types';

export interface PackLine { id: string; category: string; text: string; file: string; seconds: number }
export interface PackCharacter { id: string; name: string; role: string; description: string; model: string; height_m: number; animations: string[]; lines: PackLine[] }
export interface PackItem { id: string; name: string; category: string; rarity: string; size: string; dims_m: { w: number; h: number; d: number }; card: string; value: { min: number; max: number }; flags: string; can_be_replica: boolean; covers: string[]; model: string }
export interface PackCover { id: string; name: string; dims_m: { w: number; h: number; d: number }; card: string | null; model: string }
export interface CoverFit { scale: [number, number, number]; item_yaw: number; item_offset_y: number; size_m: [number, number, number] }

interface Manifest { characters: PackCharacter[]; items: PackItem[]; covers: PackCover[]; cover_fits: Record<string, Record<string, CoverFit> | string> }
const M = raw as unknown as Manifest;

export const PACK_BASE = './pack/';
export const packUrl = (path: string): string => PACK_BASE + path;

export const PACK_ITEMS: Record<string, PackItem> = Object.fromEntries(M.items.map((i) => [i.id, i]));
export const PACK_CHARACTERS: Record<string, PackCharacter> = Object.fromEntries(M.characters.map((c) => [c.id, c]));

/** Game cover kind <-> pack container id. */
export const COVER_PACK_ID: Record<CoverKind, string> = {
  box: 'cover_box', crate: 'cover_crate', safe: 'cover_safe', suitcase: 'cover_suitcase', bag: 'cover_trashbag', tarp: 'cover_tarp', blanket: 'cover_blanket', trunk: 'cover_trunk',
};
const KIND_BY_PACK_ID = Object.fromEntries(Object.entries(COVER_PACK_ID).map(([k, v]) => [v, k])) as Record<string, CoverKind>;
export const PACK_COVERS: Record<CoverKind, PackCover> = Object.fromEntries(M.covers.map((c) => [KIND_BY_PACK_ID[c.id], c])) as Record<CoverKind, PackCover>;

/** The pack ships no trunk card; ours is rendered in the same style (see tools/cards). */
export function coverCard(kind: CoverKind): string { return packUrl(PACK_COVERS[kind].card ?? `cards/${COVER_PACK_ID[kind]}.webp`); }
export function itemCard(id: string): string { return packUrl(PACK_ITEMS[id]?.card ?? `cards/${id}.webp`); }

/** Containers that can hide this item, as ray-tested by the pack. */
export function packCoversFor(itemId: string): CoverKind[] {
  return (PACK_ITEMS[itemId]?.covers ?? []).map((c) => KIND_BY_PACK_ID[c]).filter(Boolean);
}
export function coverFit(itemId: string, kind: CoverKind): CoverFit | null {
  const f = M.cover_fits[itemId];
  return typeof f === 'object' ? f[COVER_PACK_ID[kind]] ?? null : null;
}
