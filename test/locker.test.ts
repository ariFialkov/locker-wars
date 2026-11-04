import { describe, it, expect } from 'vitest';
import { makeRNG } from '../src/core/rng';
import { generateLocker, resolveLocker, settleExact } from '../src/game/lockerGen';

describe('locker resolution', () => {
  it('appraises every placed item and lands on the server contents to the cent', () => {
    const rng = makeRNG('resolve-test');
    for (let n = 1; n <= 300; n++) {
      const locker = generateLocker('seedA', n);
      // contents as the math server pays them: whole cents, including empty lockers
      const target = n % 17 === 0 ? 0 : Math.round(rng.range(0, 900) * 100) / 100;
      const res = settleExact(resolveLocker(locker, target, rng.fork('r' + n)), target);
      expect(res.appraisals.length).toBe(locker.items.length);
      for (const a of res.appraisals) {
        expect(a.value).toBeGreaterThanOrEqual(0);
        expect(Math.abs(a.value * 100 - Math.round(a.value * 100))).toBeLessThan(1e-6); // whole cents
      }
      const sumCents = res.appraisals.reduce((s, a) => s + Math.round(a.value * 100), 0);
      expect(sumCents).toBe(Math.round(target * 100));
      expect(res.error).toBeCloseTo(0, 9);
    }
  });

  it('an empty locker appraises at exactly $0, every item junk', () => {
    const locker = generateLocker('seedE', 4);
    const res = settleExact(resolveLocker(locker, 0, makeRNG('empty')), 0);
    expect(res.total).toBe(0);
    for (const a of res.appraisals) { expect(a.value).toBe(0); expect(a.condition.label).toBe('Junk'); }
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
