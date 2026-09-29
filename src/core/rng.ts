/** Deterministic PRNG utilities (sfc32 + string hashing). */

export type RNG = {
  next(): number; // [0,1)
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  weighted<T>(arr: readonly T[], weight: (t: T) => number): T;
  chance(p: number): boolean;
  shuffle<T>(arr: T[]): T[];
  gauss(mean?: number, sd?: number): number;
  lognormal(median: number, sigma: number): number;
  fork(label: string): RNG;
};

export function hashString(str: string): number {
  // cyrb53-ish 32-bit fold
  let h1 = 0xdeadbeef ^ 0x9e3779b9, h2 = 0x41c6ce57 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ ((h1 >>> 0) << 0);
}

export function makeRNG(seed: number | string): RNG {
  const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  let a = s ^ 0x9e3779b9, b = s ^ 0x243f6a88, c = s ^ 0xb7e15162, d = (s + 0x1f83d9ab) | 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng: RNG = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (arr, weight) => {
      let total = 0;
      for (const t of arr) total += weight(t);
      let r = next() * total;
      for (const t of arr) {
        r -= weight(t);
        if (r <= 0) return t;
      }
      return arr[arr.length - 1];
    },
    chance: (p) => next() < p,
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    gauss: (mean = 0, sd = 1) => {
      const u = 1 - next(), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    lognormal: (median, sigma) => median * Math.exp(rng.gauss(0, sigma)),
    fork: (label) => makeRNG(hashString(label + ':' + Math.floor(next() * 4294967296))),
  };
  return rng;
}
