/** Currency formatting and the auction bid lattice. */

export function fmt(n: number): string {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-$' : '$') + s;
}

export function fmtSigned(n: number): string {
  const v = Math.round(n);
  return (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString('en-US');
}

/** Bid increment as a function of the current price (like a real auction house). */
export function increment(price: number): number {
  if (price < 100) return 10;
  if (price < 300) return 25;
  if (price < 1000) return 50;
  if (price < 2500) return 100;
  if (price < 5000) return 250;
  if (price < 10000) return 500;
  if (price < 25000) return 1000;
  return 2500;
}

/** Snap a price to the nearest value on the increment lattice. */
export function snap(price: number): number {
  const inc = increment(price);
  return Math.max(inc, Math.round(price / inc) * inc);
}

export function snapDown(price: number): number {
  const inc = increment(price);
  return Math.max(inc, Math.floor(price / inc) * inc);
}

/** Rounds a value to a "nice looking" dollar amount for item appraisals. */
export function niceValue(v: number): number {
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  if (v < 10000) return Math.round(v / 50) * 50;
  return Math.round(v / 100) * 100;
}
