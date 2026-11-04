import { describe, it, expect } from 'vitest';
import { makeRNG } from '../src/core/rng';
import { RaiseAuction, type RaiseEvent } from '../src/game/raise';
import { BOTS } from '../src/game/bots';
import type { RaiseResult } from '../src/math/types';

const money = (m: number) => `$${(m / 100).toFixed(2)}`;
function make(seed = 'r') {
  const rng = makeRNG(seed);
  const a = new RaiseAuction({ bots: rng.shuffle([...BOTS]).slice(0, 4), rng, money });
  return a;
}
function run(a: RaiseAuction, seconds: number, onEvent?: (e: RaiseEvent) => void): RaiseEvent[] {
  const all: RaiseEvent[] = [];
  for (let t = 0; t < seconds && a.phase !== 'sold'; t += 1 / 30) { a.update(1 / 30); for (const e of a.drain()) { all.push(e); onEvent?.(e); } }
  for (const e of a.drain()) all.push(e);
  return all;
}
const outbid = (bet: number, next: number, bt = 'BID_2'): RaiseResult => ({ roundId: 'x', outcome: 'OUTBID', bet, win: bet, balance: 0, next: { betType: bt, bid: next, increment: next - bet, multiple: next / 500 }, locker: null });
const won = (bet: number, m: number): RaiseResult => ({ roundId: 'y', outcome: 'WON', bet, win: Math.round(bet * m), balance: 0, next: null, locker: { multiplier: m, contents: Math.round(bet * m), band: 3, multiple: 1.2 } });

describe('raise auction (presentation around server results)', () => {
  it('the player opens at the chosen chip with BID_1', () => {
    const a = make(); a.start(500);
    a.setOpeningChip(1000);
    expect(a.playerRaise()).toEqual({ amount: 1000, betType: 'BID_1' });
    expect(a.phase).toBe('pending');
    expect(a.playerRaise()).toBeNull(); // no double bets while one is out
  });

  it('OUTBID: a rival counters strictly between the bid and the next raise, then the player is offered the next raise', () => {
    for (const [bet, next] of [[500, 1000], [100, 200], [10000, 50000], [2500, 7500]]) {
      const a = make('o' + bet); a.start(bet);
      a.playerRaise();
      a.settle(outbid(bet, next));
      const ev = run(a, 2);
      const counter = ev.find((e) => e.type === 'bid' && e.who !== 'player') as Extract<RaiseEvent, { type: 'bid' }>;
      expect(counter.amount).toBeGreaterThan(bet);
      expect(counter.amount).toBeLessThan(next);
      expect(a.phase).toBe('outbid');
      expect(a.ask).toBe(next);
      expect(a.playerRaise()).toEqual({ amount: next, betType: 'BID_2' });
    }
  });

  it('after an outbid, letting the clock run out sells to the rival at the counter', () => {
    const a = make('timeout'); a.start(500);
    a.playerRaise(); a.settle(outbid(500, 1000));
    const ev = run(a, 20);
    const sold = ev.find((e) => e.type === 'sold') as Extract<RaiseEvent, { type: 'sold' }>;
    expect(sold.who).not.toBe('player');
    expect(sold.amount).toBe(a.price);
    expect(ev.filter((e) => e.type === 'going').length).toBe(2);
  });

  it('WON: the rivals fold and it is sold to the player at the bid', () => {
    const a = make('won'); a.start(500);
    a.playerRaise(); a.settle(won(500, 1.2));
    const ev = run(a, 10);
    const sold = ev.find((e) => e.type === 'sold') as Extract<RaiseEvent, { type: 'sold' }>;
    expect(sold.who).toBe('player');
    expect(sold.amount).toBe(500);
    expect(ev.some((e) => e.type === 'drop')).toBe(true);
  });

  it('a silent player never buys anything: a rival takes it at the opener', () => {
    const a = make('silent'); a.start(500);
    const ev = run(a, 30);
    const sold = ev.find((e) => e.type === 'sold') as Extract<RaiseEvent, { type: 'sold' }>;
    expect(sold.who).not.toBe('player');
    expect(a.playerBids).toBe(0);
  });

  it('walking away wraps it up quickly, and a failed bet changes nothing', () => {
    const a = make('walk'); a.start(500);
    a.playerRaise(); a.failed();
    expect(a.phase).toBe('opening');
    expect(a.playerBids).toBe(0);
    a.playerWalk();
    let soldAt = -1, t = 0;
    for (; t < 30 && soldAt < 0; t += 1 / 30) { a.update(1 / 30); if (a.drain().some((e) => e.type === 'sold')) soldAt = t; }
    expect(a.phase).toBe('sold');
    expect(soldAt).toBeLessThan(8); // well under the 12 s an undecided opener would take
  });

  it('buy now goes straight to the player', () => {
    const a = make('buy'); a.start(500);
    expect(a.playerBuyNow(5000)).toEqual({ amount: 5000, betType: 'BUY_NOW' });
    a.settle({ ...won(5000, 0.8), outcome: 'BOUGHT' });
    const ev = run(a, 5);
    expect((ev.find((e) => e.type === 'sold') as Extract<RaiseEvent, { type: 'sold' }>).who).toBe('player');
  });
});
