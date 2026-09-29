import { describe, it, expect } from 'vitest';
import { makeRNG } from '../src/core/rng';
import { Auction } from '../src/game/auction';
import { BOTS } from '../src/game/bots';
import { increment } from '../src/core/money';

function run(seed: string, policy: 'incremental' | 'silent' | 'fold', balance = 1e9) {
  const rng = makeRNG(seed);
  const a = new Auction({ apparentValue: rng.range(200, 8000), bots: rng.shuffle([...BOTS]).slice(0, 4), rng, playerBalance: () => balance });
  a.start();
  let t = 0, bids = 0, sold: { who: string | null; amount: number } | null = null;
  let folded = false;
  while (!sold && t < 600) {
    a.update(1 / 30); t += 1 / 30;
    for (const e of a.drain()) if (e.type === 'sold') sold = { who: e.who, amount: e.amount };
    if (policy === 'incremental' && a.playerCanBid) { a.playerBid(a.ask); bids++; }
    if (policy === 'fold' && !folded && a.price > 0) { a.playerFold(); folded = true; }
  }
  return { a, sold: sold!, bids, t };
}

describe('auction', () => {
  it('an incremental bidder always wins one increment above the top rival limit', () => {
    for (let i = 0; i < 200; i++) {
      const { a, sold } = run('inc' + i, 'incremental');
      expect(sold).toBeTruthy();
      expect(sold.who).toBe('player');
      expect(sold.amount + increment(sold.amount)).toBeGreaterThan(a.topRivalLimit);
      expect(sold.amount).toBeLessThanOrEqual(a.topRivalLimit + increment(a.topRivalLimit) * 2);
    }
  });
  it('a silent player never buys anything; a rival does', () => {
    for (let i = 0; i < 100; i++) {
      const { sold, a } = run('sil' + i, 'silent');
      expect(sold.who).not.toBe('player');
      expect(sold.who).not.toBeNull();
      expect(sold.amount).toBeLessThanOrEqual(a.topRivalLimit);
    }
  });
  it('folding wraps the auction up quickly', () => {
    for (let i = 0; i < 50; i++) {
      const { sold, t } = run('fold' + i, 'fold');
      expect(sold.who).not.toBe('player');
      expect(t).toBeLessThan(90);
    }
  });
  it('respects the player balance', () => {
    const { sold } = run('poor', 'incremental', 40);
    expect(sold.who).not.toBe('player');
  });
});

describe('auction pacing', () => {
  it('an incremental bidder needs a reasonable number of bids and the auction stays under ~90s', () => {
    let maxBids = 0, maxT = 0, sumBids = 0;
    for (let i = 0; i < 200; i++) {
      const { bids, t } = run('pace' + i, 'incremental');
      maxBids = Math.max(maxBids, bids); maxT = Math.max(maxT, t); sumBids += bids;
    }
    expect(sumBids / 200).toBeLessThan(12);
    expect(maxT).toBeLessThan(95);
  });
});
