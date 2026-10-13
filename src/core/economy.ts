/**
 * RTP engine.
 *
 * Every locker the player WINS is an independent bet: the stake is the hammer
 * price P, and the payout is the locker's appraised contents V. Before the
 * auction even starts, a payout multiplier M is drawn from a fixed
 * distribution whose mean is exactly TARGET_RTP. The final contents are then
 * "retargeted" so that V = M * P (see lockerGen.resolveLocker). Because M is
 * drawn independently of everything the player can observe (visible items,
 * rival behaviour, price), nothing the player does — spotting valuables,
 * folding on pricey lockers, jump-bidding — can move the expected return away
 * from TARGET_RTP. Selection bias is impossible by construction.
 *
 * Any dollars we could not hit exactly (e.g. visible items already exceed a
 * tiny bust target even at scrap value) are carried forward as `debt` and
 * smoothly absorbed by the next won lockers, so the long-run RTP converges.
 */

import type { RNG } from './rng';

export const TARGET_RTP = 0.96;

export type OutcomeTier = 'bust' | 'loss' | 'win' | 'big' | 'huge' | 'jackpot';

export const TIER_LABEL: Record<OutcomeTier, string> = { bust: 'Bust', loss: 'Loss', win: 'Win', big: 'Big win', huge: 'Huge win', jackpot: 'Jackpot' };

interface Tier { tier: OutcomeTier; p: number; lo: number; hi: number }

/**
 * Raw tiers (uniform inside each band). Shaped so wins are worth the effort:
 * about half of won lockers pay more than the hammer price, and most of those
 * pay x1.1 or better, with a fat big-win band (x1.5-x2.2) and rarer huge and
 * jackpot bands. The price of that at a fixed 96% mean is the losing side:
 * most losses are busts (near-worthless lockers), with a slim "loss" band in
 * between. The mean is analytically rescaled to TARGET_RTP, which only nudges
 * the bands by a few percent.
 */
const RAW_TIERS: Tier[] = [
  { tier: 'bust', p: 0.41, lo: 0.02, hi: 0.30 },
  { tier: 'loss', p: 0.10, lo: 0.30, hi: 0.80 },
  { tier: 'win', p: 0.27, lo: 1.10, hi: 1.40 },
  { tier: 'big', p: 0.17, lo: 1.50, hi: 2.20 },
  { tier: 'huge', p: 0.04, lo: 2.20, hi: 4.50 },
  { tier: 'jackpot', p: 0.01, lo: 4.50, hi: 12.0 },
];

const RAW_MEAN = RAW_TIERS.reduce((s, t) => s + t.p * (t.lo + t.hi) / 2, 0);
/** Multiplicative calibration so E[M] === TARGET_RTP exactly. */
export const CALIBRATION = TARGET_RTP / RAW_MEAN;

export const TIERS: Tier[] = RAW_TIERS.map((t) => ({ ...t, lo: t.lo * CALIBRATION, hi: t.hi * CALIBRATION }));

export interface Outcome { multiplier: number; tier: OutcomeTier }

/** Draw the pre-determined payout multiplier for a round. */
export function drawOutcome(rng: RNG): Outcome {
  let r = rng.next();
  for (const t of TIERS) {
    if (r < t.p) return { multiplier: rng.range(t.lo, t.hi), tier: t.tier };
    r -= t.p;
  }
  const last = TIERS[TIERS.length - 1];
  return { multiplier: rng.range(last.lo, last.hi), tier: last.tier };
}

export function tierOf(multiplier: number): OutcomeTier {
  for (const t of TIERS) if (multiplier < t.hi) return t.tier;
  return 'jackpot';
}

/** Probability that a won locker returns more than its price (used by tests and the stats panel). */
export function hitRate(): number {
  return TIERS.reduce((s, t) => s + t.p * (t.hi <= 1 ? 0 : t.lo >= 1 ? 1 : (t.hi - 1) / (t.hi - t.lo)), 0);
}

/** Exact analytic mean of the calibrated distribution (used by tests). */
export function theoreticalMean(): number {
  return TIERS.reduce((s, t) => s + t.p * (t.lo + t.hi) / 2, 0);
}

/**
 * Compute the dollar target for a won locker, applying a smooth correction for
 * any error carried over from previous rounds. The correction is capped so a
 * single round never feels rigged (at most 25% of this round's stake).
 */
export function payoutTarget(multiplier: number, stake: number, debt: number): { target: number; debtUsed: number } {
  const ideal = multiplier * stake;
  const cap = 0.25 * stake;
  const debtUsed = Math.max(-cap, Math.min(cap, debt));
  const target = Math.max(0.01 * stake, ideal - debtUsed);
  return { target, debtUsed: ideal - target };
}
