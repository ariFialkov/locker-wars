/** Currency formatting and the auction bid lattice. */

/** "$1,250" or, for small fractional appraisals, "$3.50". */
export function fmt(n: number): string {
  const v = Math.round(n * 100) / 100;
  const whole = Number.isInteger(v);
  const s = Math.abs(v).toLocaleString('en-US', whole ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-$' : '$') + s;
}

export function fmtSigned(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (v >= 0 ? '+' : '-') + fmt(Math.abs(v)).slice(0);
}

/** Bid increment as a function of the current price (like a real auction house). */
export function increment(price: number): number {
  if (price < 15) return 1;
  if (price < 40) return 2;
  if (price < 100) return 5;
  if (price < 250) return 10;
  if (price < 500) return 25;
  if (price < 1000) return 50;
  if (price < 2500) return 100;
  return 250;
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
  if (v <= 0) return 0;
  if (v < 5) return Math.max(0.25, Math.round(v * 4) / 4);
  if (v < 20) return Math.round(v * 2) / 2;
  if (v < 100) return Math.round(v);
  if (v < 1000) return Math.round(v / 5) * 5;
  if (v < 10000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}
