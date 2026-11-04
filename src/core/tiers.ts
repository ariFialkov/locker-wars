/**
 * Labels for how a won locker turned out, from its multiplier (contents ÷ hammer price).
 * Purely descriptive: the multiplier itself comes from the math server.
 */
export type OutcomeTier = 'bust' | 'loss' | 'win' | 'big' | 'huge' | 'jackpot';

export const TIER_LABEL: Record<OutcomeTier, string> = {
  bust: 'Bust', loss: 'Loss', win: 'Win', big: 'Big win', huge: 'Huge', jackpot: 'Jackpot',
};

export function tierOf(multiplier: number): OutcomeTier {
  if (multiplier < 0.3) return 'bust';
  if (multiplier < 1) return 'loss';
  if (multiplier < 1.5) return 'win';
  if (multiplier < 2.2) return 'big';
  if (multiplier < 4.5) return 'huge';
  return 'jackpot';
}
