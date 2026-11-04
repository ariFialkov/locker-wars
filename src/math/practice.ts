/**
 * Practice mode: play credits, settled in this browser.
 *
 * This is NOT the platform. It exists so the game is playable (and testable) where no
 * Rollerz session is configured, e.g. the GitHub Pages build. It speaks exactly the same
 * wire format and balance semantics as the platform, so the game code path is identical:
 * `bet` debits the stake and returns the result, `collect` credits the win.
 *
 * The numbers are the auction engine's documented "storage" preset (written independently
 * from its published description, not copied from its code):
 *  - raise k is OUTBID with probability H_k = 0.6, 0.5, 0.4, 0.3, 0.2, 0, refunding the bid in full;
 *  - otherwise the locker opens: a one-shot draw with mean R = 0.95 × the bid, over listed
 *    multiples 0, 0.5, 0.8, 1.2, 1.5, 2, 3, 5, 7 with fixed relative weights for the paying
 *    multiples and the empty-locker probability solved for the mean (about 18%);
 *    inside a band the multiplier slopes linearly ±r around the listed multiple,
 *    r = 0.1 × the smallest gap between paying multiples, so each band's mean is exact;
 *  - one uniform decides both: u < H → outbid, else v = (u − H)/(1 − H) picks the locker;
 *  - after an outbid the auctioneer's increment (in opening-bid units) is drawn uniformly from
 *    1 · 1,2 · 1,2 · 2,3 · 2,4, so the next raise is opener × (multiple + step);
 *  - BUY_NOW costs 10 × the opener and opens the same locker shape with mean 0.95 × the price.
 */
import { BUY_NOW, DEFAULT_CURRENCY, bidType, stageOf, type MathClient, type MathSession, type RaiseResult, type LockerDraw } from './types';

export interface PracticeParams {
  rtp: number;
  outbid: number[];
  steps: number[][];
  payouts: number[];
  weights: number[];
  buyNow: number;
  chips: number[];
}

export const STORAGE_PRESET: PracticeParams = {
  rtp: 0.95,
  outbid: [0.6, 0.5, 0.4, 0.3, 0.2, 0],
  steps: [[1], [1, 2], [1, 2], [2, 3], [2, 4]],
  payouts: [0, 0.5, 0.8, 1.2, 1.5, 2, 3, 5, 7],
  weights: [0, 30, 24, 16, 11, 8, 4, 1.5, 0.6],
  buyNow: 10,
  chips: [100, 200, 500, 1000, 2500, 5000, 10000],
};

interface Band { payout: number; p: number; from: number; to: number }

/** The locker table: band probabilities with the empty band solved so the mean is exactly `rtp`. */
export function lockerTable(payouts: number[], weights: number[], rtp: number): { bands: Band[]; r: number; mean: number } {
  const paying = payouts.map((a, i) => ({ a, w: weights[i] })).filter((x) => x.a > 0);
  const wSum = paying.reduce((s, x) => s + x.w, 0);
  const payingMean = paying.reduce((s, x) => s + x.w * x.a, 0) / wSum;
  if (!(payingMean > rtp)) throw new Error('lockerTable: paying multiples cannot reach the target mean');
  const pEmpty = 1 - rtp / payingMean;
  const raw = payouts.map((a, i) => ({ payout: a, p: a > 0 ? (1 - pEmpty) * weights[i] / wSum : pEmpty }));
  let acc = 0;
  const bands = raw.map((b) => { const band = { ...b, from: acc, to: acc + b.p }; acc += b.p; return band; });
  bands[bands.length - 1].to = 1;
  const pos = payouts.filter((a) => a > 0).sort((x, y) => x - y);
  let gap = Infinity;
  for (let i = 1; i < pos.length; i++) gap = Math.min(gap, pos[i] - pos[i - 1]);
  const r = 0.1 * (Number.isFinite(gap) ? gap : 0);
  const mean = bands.reduce((s, b) => s + b.p * b.payout, 0);
  return { bands, r, mean };
}

/** Multiplier for a uniform v on [0,1): the band v lands in, sloped ±r across the band. */
export function lockerMultiplier(table: { bands: Band[]; r: number }, v: number): { multiplier: number; band: number } {
  const { bands, r } = table;
  let j = bands.findIndex((b) => v < b.to);
  if (j < 0) j = bands.length - 1;
  const b = bands[j];
  if (b.payout === 0) return { multiplier: 0, band: j };
  const t = b.p > 0 ? Math.min(1, Math.max(0, (v - b.from) / b.p)) : 0.5;
  return { multiplier: b.payout + r * (2 * t - 1), band: j };
}

/** Multiples (of the opener) each raise can reach: stage 1 is 1; stage k+1 adds any step of stage k. */
export function reachable(steps: number[][], stages: number): number[][] {
  const reach: number[][] = [[1]];
  for (let k = 1; k < stages; k++) reach.push([...new Set(reach[k - 1].flatMap((m) => steps[k - 1].map((d) => m + d)))].sort((a, b) => a - b));
  return reach;
}

const BALANCE_KEY = 'locker-wars:practice-balance';
export const PRACTICE_START = 50000; // $500 of play credits

function cryptoUniform(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

export class PracticeClient implements MathClient {
  readonly mode = 'practice' as const;
  private readonly table: ReturnType<typeof lockerTable>;
  private readonly reach: number[][];
  private balance: number;
  private rounds = new Map<string, { win: number; collected: boolean }>();
  private nextId = 1;

  constructor(
    private readonly params: PracticeParams = STORAGE_PRESET,
    private readonly uniform: () => number = cryptoUniform,
    private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
    startBalance = PRACTICE_START,
  ) {
    this.table = lockerTable(params.payouts, params.weights, params.rtp);
    this.reach = reachable(params.steps, params.outbid.length);
    const saved = Number(this.read());
    this.balance = Number.isInteger(saved) && saved >= 0 && this.read() !== null ? saved : startBalance;
  }

  private read(): string | null { try { return this.store?.getItem(BALANCE_KEY) ?? null; } catch { return null; } }
  private persist(): void { try { this.store?.setItem(BALANCE_KEY, String(this.balance)); } catch { /* storage blocked: keep playing */ } }

  get stages(): number { return this.params.outbid.length; }

  async open(): Promise<MathSession> {
    const chips = this.params.chips;
    return { mode: 'practice', balance: this.balance, currency: DEFAULT_CURRENCY, chipLevels: [...chips], defaultBet: chips[Math.min(2, chips.length - 1)], buyNowMultiple: this.params.buyNow, stages: this.stages, rtp: this.params.rtp };
  }

  validBets(betType: string): number[] {
    if (betType === BUY_NOW) return this.params.chips.map((c) => c * this.params.buyNow);
    const k = stageOf(betType);
    if (!k || k > this.stages) return [];
    return [...new Set(this.reach[k - 1].flatMap((m) => this.params.chips.map((c) => Math.round(c * m))))].sort((a, b) => a - b);
  }

  /** The opening chip behind a raise amount (each amount factors into one chip × reachable multiple). */
  private openerOf(amount: number, k: number): { chip: number; multiple: number } {
    for (const chip of this.params.chips) {
      const m = amount / chip;
      if (this.reach[k - 1].some((x) => Math.abs(x - m) < 1e-9)) return { chip, multiple: m };
    }
    throw new Error(`Invalid bet amount ${amount} for BID_${k}`);
  }

  async bet(amount: number, betType: string): Promise<RaiseResult> {
    if (!this.validBets(betType).includes(amount)) throw new Error(`Invalid bet amount ${amount} for betType ${betType}`);
    if (amount > this.balance) throw new Error('insufficient balance');
    const u = Math.min(this.uniform(), 1 - 1e-12);
    let outcome: RaiseResult['outcome'];
    let win = 0;
    let locker: LockerDraw | null = null;
    let next: RaiseResult['next'] = null;
    if (betType === BUY_NOW) {
      const d = lockerMultiplier(this.table, u);
      outcome = 'BOUGHT';
      win = Math.round(amount * d.multiplier);
      locker = { multiplier: d.multiplier, contents: win, band: d.band, multiple: this.table.bands[d.band].payout };
    } else {
      const k = stageOf(betType)!;
      const H = this.params.outbid[k - 1];
      if (u < H) {
        outcome = 'OUTBID';
        win = amount; // the bid comes back in full
        if (k < this.stages) {
          const { chip, multiple } = this.openerOf(amount, k);
          const inc = this.params.steps[k - 1];
          const step = inc[Math.min(inc.length - 1, Math.floor(this.uniform() * inc.length))];
          const m = multiple + step;
          next = { betType: bidType(k + 1), bid: Math.round(chip * m), increment: Math.round(chip * step), multiple: m };
        }
      } else {
        const d = lockerMultiplier(this.table, H < 1 ? (u - H) / (1 - H) : u);
        outcome = 'WON';
        win = Math.round(amount * d.multiplier);
        locker = { multiplier: d.multiplier, contents: win, band: d.band, multiple: this.table.bands[d.band].payout };
      }
    }
    this.balance -= amount;
    this.persist();
    const roundId = `practice-${Date.now().toString(36)}-${this.nextId++}`;
    this.rounds.set(roundId, { win, collected: false });
    return { roundId, outcome, bet: amount, win, balance: this.balance, next, locker };
  }

  async collect(roundId: string): Promise<number> {
    const r = this.rounds.get(roundId);
    if (!r) throw new Error(`unknown roundId "${roundId}"`);
    if (!r.collected) { r.collected = true; this.balance += r.win; this.persist(); }
    return this.balance;
  }

  /** Practice only: top up play credits when broke. */
  topUp(amount: number): number { this.balance += amount; this.persist(); return this.balance; }
}
