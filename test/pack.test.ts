import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ITEM_BANK } from '../src/game/items/bank';
import { BOTS } from '../src/game/bots';
import { generateLocker, resolveLocker } from '../src/game/lockerGen';
import { makeRNG } from '../src/core/rng';
import { PACK_ITEMS, PACK_COVERS, PACK_CHARACTERS, COVER_PACK_ID, coverFit, packCoversFor } from '../src/pack/manifest';
import type { CoverKind } from '../src/game/items/types';

const PACK = join(__dirname, '..', 'assets', 'pack');
const has = (rel: string) => existsSync(join(PACK, rel)) && statSync(join(PACK, rel)).size > 0;

describe('asset pack coverage', () => {
  it('has a model and a card for every item in the bank, at the size the packer uses', () => {
    for (const d of ITEM_BANK) {
      const p = PACK_ITEMS[d.id];
      expect(p, d.id).toBeTruthy();
      expect(has(p.model), p.model).toBe(true);
      expect(has(p.card), p.card).toBe(true);
      expect(d.footprint).toEqual([p.dims_m.w, p.dims_m.h, p.dims_m.d]);
      expect(packCoversFor(d.id).length, d.id).toBeGreaterThan(0);
    }
  });
  it('has a model and a card for every container, including the steamer trunk', () => {
    for (const kind of Object.keys(COVER_PACK_ID) as CoverKind[]) {
      const c = PACK_COVERS[kind];
      expect(c, kind).toBeTruthy();
      expect(has(c.model), c.model).toBe(true);
      expect(has(c.card ?? `cards/${COVER_PACK_ID[kind]}.webp`), kind + ' card').toBe(true);
    }
  });
  it('has every character and voice line the rivals and auctioneer use', () => {
    const ids = new Set(['auctioneer', ...BOTS.flatMap((b) => b.pack)]);
    for (const id of ids) {
      const c = PACK_CHARACTERS[id];
      expect(c, id).toBeTruthy();
      expect(has(c.model), c.model).toBe(true);
      for (const l of c.lines) expect(has(l.file), l.file).toBe(true);
    }
    for (const b of BOTS) for (const id of b.pack) {
      const kinds = new Set(PACK_CHARACTERS[id].lines.map((l) => l.id.replace(/_\d+$/, '')));
      for (const k of ['bid', 'out', 'win', 'react', 'flair']) expect(kinds.has(k), `${id} ${k}`).toBe(true);
    }
    const auct = new Set(PACK_CHARACTERS.auctioneer.lines.map((l) => l.id.replace(/_\d+$/, '')));
    for (const k of ['intro', 'look', 'open', 'ack', 'player', 'once', 'twice', 'sold', 'drop', 'reveal', 'jackpot', 'bust', 'outro']) expect(auct.has(k), k).toBe(true);
  });
});

describe('lockers only use tested container fits', () => {
  it('hides every concealed item in a container the pack fit-tested for it', () => {
    const kinds = new Set<string>();
    for (let n = 1; n <= 600; n++) {
      const l = generateLocker('fits', n);
      for (const it of l.items.filter((i) => i.hidden)) {
        const c = it.cover!;
        kinds.add(c.kind);
        expect(coverFit(c.fitItem, c.kind), `${c.fitItem} in ${c.kind}`).not.toBeNull();
        // the packer may turn a deep container sideways, swapping width and depth
        expect(it.fp[1]).toBe(c.dims[1]);
        expect([it.fp[0], it.fp[2]].sort()).toEqual([c.dims[0], c.dims[2]].sort());
      }
      // the revealed identity of every hidden slot can also sit in that container
      const res = resolveLocker(l, 40, makeRNG('r' + n));
      for (const a of res.appraisals.filter((x) => x.revealed)) {
        const fits = packCoversFor(a.def.id);
        const flex = ['cash_can', 'coins', 'jewelry_box', 'bonds', 'watch'].includes(a.def.id);
        expect(fits.includes(a.item.cover!.kind) || flex, `${a.def.id} revealed from ${a.item.cover!.kind}`).toBe(true);
      }
    }
    expect(kinds.has('trunk')).toBe(true);
  });
});
