import { describe, it, expect } from 'vitest';
import { makeRNG } from '../src/core/rng';
import { drawOutcome, TARGET_RTP, theoreticalMean, payoutTarget } from '../src/core/economy';
import { generateLocker, resolveLocker } from '../src/game/lockerGen';
import { snap } from '../src/core/money';

describe('outcome distribution', () => {
  it('has an analytic mean equal to the target RTP', () => {
    expect(theoreticalMean()).toBeCloseTo(TARGET_RTP, 10);
  });
  it('samples to the target RTP', () => {
    const rng = makeRNG('rtp-test');
    let sum = 0;
    const n = 400_000;
    for (let i = 0; i < n; i++) sum += drawOutcome(rng).multiplier;
    expect(sum / n).toBeCloseTo(TARGET_RTP, 2);
  });
});

describe('locker resolution', () => {
  it('appraises every placed item and hits the dollar target closely', () => {
    const rng = makeRNG('resolve-test');
    let worst = 0;
    for (let n = 1; n <= 300; n++) {
      const locker = generateLocker('seedA', n);
      const target = Math.max(50, rng.range(50, 40_000));
      const res = resolveLocker(locker, target, rng.fork('r' + n));
      expect(res.appraisals.length).toBe(locker.items.length);
      for (const a of res.appraisals) expect(a.value).toBeGreaterThanOrEqual(0);
      worst = Math.max(worst, Math.abs(res.error) / target);
    }
    // small rounding noise only; floors on extreme busts are carried as debt by the round loop
    expect(worst).toBeLessThan(0.6);
  });

  it('keeps every item inside the unit', () => {
    for (let n = 1; n <= 200; n++) {
      const locker = generateLocker('seedB', n);
      for (const it of locker.items) {
        expect(Math.abs(it.x) + it.fp[0] / 2).toBeLessThan(1.7);
        expect(it.z).toBeLessThan(0);
        expect(it.z).toBeGreaterThan(-3.0);
        expect(it.y + it.fp[1]).toBeLessThan(2.7);
      }
      expect(locker.items.some((i) => i.hidden && i.cover!.size === 'S')).toBe(true);
    }
  });
});

describe('full round loop realises the target RTP', () => {
  it('converges to ~96% over many won lockers regardless of stake behaviour', () => {
    const rng = makeRNG('loop-test');
    let spent = 0, earned = 0, debt = 0;
    const rounds = 6000;
    for (let n = 1; n <= rounds; n++) {
      const locker = generateLocker('seedC', n);
      // wildly varying stake policy: sometimes cheap, sometimes silly
      const stake = snap(Math.max(50, locker.apparentValue * rng.lognormal(0.7, 0.6)));
      const { multiplier } = drawOutcome(rng);
      const { target, debtUsed } = payoutTarget(multiplier, stake, debt);
      debt -= debtUsed;
      const res = resolveLocker(locker, target, rng.fork('x' + n));
      debt += res.error; // overshoot is owed back, undershoot is owed to the player
      spent += stake;
      earned += res.total;
    }
    const rtp = earned / spent;
    expect(rtp).toBeGreaterThan(TARGET_RTP - 0.02);
    expect(rtp).toBeLessThan(TARGET_RTP + 0.02);
    expect(Math.abs(debt)).toBeLessThan(spent * 0.01);
  });
});
