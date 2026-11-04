import { describe, it, expect } from 'vitest';
import { PracticeClient, STORAGE_PRESET, lockerTable, lockerMultiplier, reachable } from '../src/math/practice';
import { makeRNG } from '../src/core/rng';

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const seeded = (seed: string) => { const r = makeRNG(seed); return () => r.next(); };

describe('practice locker table (documented storage preset)', () => {
  const t = lockerTable(STORAGE_PRESET.payouts, STORAGE_PRESET.weights, STORAGE_PRESET.rtp);
  it('has mean exactly R = 0.95 and an empty-locker chance of about 18%', () => {
    expect(t.mean).toBeCloseTo(0.95, 12);
    expect(t.bands[0].payout).toBe(0);
    expect(t.bands[0].p).toBeGreaterThan(0.17);
    expect(t.bands[0].p).toBeLessThan(0.19);
    expect(t.bands.reduce((s, b) => s + b.p, 0)).toBeCloseTo(1, 12);
  });
  it('slopes ±r inside each band with r = 0.1 × the smallest paying gap, so each band keeps its mean', () => {
    expect(t.r).toBeCloseTo(0.03, 12);
    for (const b of t.bands.slice(1)) {
      const lo = lockerMultiplier(t, b.from + 1e-9).multiplier, hi = lockerMultiplier(t, b.to - 1e-9).multiplier, mid = lockerMultiplier(t, (b.from + b.to) / 2).multiplier;
      expect(lo).toBeCloseTo(b.payout - t.r, 6);
      expect(hi).toBeCloseTo(b.payout + t.r, 6);
      expect(mid).toBeCloseTo(b.payout, 6);
    }
    // the curve is monotone: bands never overlap
    let prev = -1;
    for (let v = 0; v < 1; v += 0.0005) { const m = lockerMultiplier(t, v).multiplier; expect(m).toBeGreaterThanOrEqual(prev - 1e-12); prev = m; }
  });
  it('reaches 8 to 13 × the opener by the last raise', () => {
    const reach = reachable(STORAGE_PRESET.steps, 6);
    expect(Math.min(...reach[5])).toBe(8);
    expect(Math.max(...reach[5])).toBe(13);
  });
});

describe('practice client: wire format and balance semantics', () => {
  it('debits on bet, credits on collect, once', async () => {
    const c = new PracticeClient(STORAGE_PRESET, seeded('a'), memStore(), 50000);
    const s = await c.open();
    expect(s.mode).toBe('practice');
    expect(s.balance).toBe(50000);
    const r = await c.bet(500, 'BID_1');
    expect(r.balance).toBe(49500);
    const after = await c.collect(r.roundId);
    expect(after).toBe(49500 + r.win);
    expect(await c.collect(r.roundId)).toBe(after); // collecting twice pays once
  });

  it('rejects amounts that are not valid levels, and bets above the balance', async () => {
    const c = new PracticeClient(STORAGE_PRESET, seeded('b'), memStore(), 1000);
    await expect(c.bet(700, 'BID_1')).rejects.toThrow(/Invalid bet amount/);
    await expect(c.bet(2500, 'BID_1')).rejects.toThrow(/insufficient/);
    await expect(c.bet(500, 'BID_9')).rejects.toThrow();
  });

  it('an outbid refunds the bid in full and names the next raise on the ladder', async () => {
    const c = new PracticeClient(STORAGE_PRESET, () => 0.1, memStore(), 1e9); // u = 0.1 < H_1 = 0.6
    const r = await c.bet(500, 'BID_1');
    expect(r.outcome).toBe('OUTBID');
    expect(r.win).toBe(500);
    expect(r.locker).toBeNull();
    expect(r.next).toEqual({ betType: 'BID_2', bid: 1000, increment: 500, multiple: 2 });
    expect(c.validBets('BID_2')).toContain(r.next!.bid);
  });

  it('walks the whole ladder with every raise a valid level, and the last raise always wins', async () => {
    for (let trial = 0; trial < 200; trial++) {
      const rng = makeRNG('ladder' + trial);
      let k = 0;
      // force outbids for the first stages to reach the top
      const c = new PracticeClient(STORAGE_PRESET, () => (k < 5 ? 0 : rng.next()), memStore(), 1e9);
      let bet = { amount: STORAGE_PRESET.chips[trial % 7], betType: 'BID_1' };
      let r = await c.bet(bet.amount, bet.betType);
      while (r.outcome === 'OUTBID') {
        await c.collect(r.roundId);
        expect(r.next).not.toBeNull();
        expect(c.validBets(r.next!.betType)).toContain(r.next!.bid);
        k++;
        bet = { amount: r.next!.bid, betType: r.next!.betType };
        r = await c.bet(bet.amount, bet.betType);
      }
      expect(r.outcome).toBe('WON');
      expect(r.next).toBeNull();
      expect(bet.betType).toBe('BID_6');
    }
  });

  it('outbid rates per stage and the won-locker return match the design (Monte Carlo)', async () => {
    const c = new PracticeClient(STORAGE_PRESET, seeded('mc'), memStore(), 1e12);
    const N = 40000;
    for (let k = 1; k <= 6; k++) {
      let out = 0, staked = 0, returned = 0;
      const amount = Math.round(1000 * reachable(STORAGE_PRESET.steps, 6)[k - 1][0]);
      for (let i = 0; i < N; i++) {
        const r = await c.bet(amount, `BID_${k}`);
        if (r.outcome === 'OUTBID') out++; else { staked += r.bet; returned += r.win; }
        await c.collect(r.roundId);
      }
      const H = STORAGE_PRESET.outbid[k - 1];
      expect(Math.abs(out / N - H)).toBeLessThan(4 * Math.sqrt(H * (1 - H) / N) + 1e-9);
      if (staked > 0) expect(Math.abs(returned / staked - 0.95)).toBeLessThan(0.05);
    }
  });

  it('buy now costs 10 × the opener and opens the locker straight away', async () => {
    const c = new PracticeClient(STORAGE_PRESET, seeded('buy'), memStore(), 1e9);
    expect(c.validBets('BUY_NOW')).toEqual(STORAGE_PRESET.chips.map((x) => x * 10));
    const r = await c.bet(5000, 'BUY_NOW');
    expect(r.outcome).toBe('BOUGHT');
    expect(r.locker!.contents).toBe(r.win);
    expect(r.win).toBe(Math.round(5000 * r.locker!.multiplier));
  });

  it('keeps play credits across reloads', async () => {
    const store = memStore();
    const a = new PracticeClient(STORAGE_PRESET, () => 0.1, store, 50000);
    const r = await a.bet(200, 'BID_1');
    await a.collect(r.roundId);
    const b = new PracticeClient(STORAGE_PRESET, () => 0.1, store, 50000);
    expect((await b.open()).balance).toBe(50000);
    b.topUp(10000);
    expect((await new PracticeClient(STORAGE_PRESET, () => 0.1, store, 50000).open()).balance).toBe(60000);
  });
});
