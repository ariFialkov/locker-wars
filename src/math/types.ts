/**
 * The game's view of the auction math server.
 *
 * The auction is a chain of single-call bets ("raises"). Each raise either gets OUTBID
 * (the stake comes back in full) or WINS the locker, whose contents are a one-shot draw
 * worth `multiplier × bid`. BUY_NOW takes the locker outright at a fixed price.
 * Every amount here is an integer in minor units (cents), as on the platform.
 */

export type RaiseOutcome = 'OUTBID' | 'WON' | 'BOUGHT';

/** The raise the player is offered next, after being outbid. */
export interface NextRaise {
  betType: string;
  /** Amount of the next raise, minor units. */
  bid: number;
  /** The auctioneer's increment over the previous raise, minor units. */
  increment: number;
  /** The next raise as a multiple of the opening bid. */
  multiple: number;
}

/** A won (or bought) locker. `contents` = round(multiplier × bid), minor units. */
export interface LockerDraw {
  multiplier: number;
  contents: number;
  band: number | null;
  /** The listed multiple of the band the draw landed in (0 = empty locker). */
  multiple: number | null;
}

/** One settled raise. `balance` is after the stake, before the win is collected. */
export interface RaiseResult {
  roundId: string;
  outcome: RaiseOutcome;
  bet: number;
  /** Refund (OUTBID) or locker contents (WON / BOUGHT), minor units. */
  win: number;
  balance: number;
  next: NextRaise | null;
  locker: LockerDraw | null;
  /** Commitment to the round's seed, and the seed once the round has ended (when the server provides them). */
  seedHash?: string;
  seed?: string;
}

export interface Currency { code: string; prefix: string; suffix: string; grouping: string; decimal: string; precision: number; denomination: number }

/**
 * platform: Rollerz; server: a test math server over HTTP (results drawn on the server);
 * engine: the math engine's published module, in the browser (testing); practice: offline play credits.
 */
export type MathMode = 'platform' | 'server' | 'engine' | 'practice';

export interface MathSession {
  mode: MathMode;
  balance: number;
  currency: Currency;
  /** Opening-bid chips, minor units. */
  chipLevels: number[];
  defaultBet: number;
  /** Buy-now price as a multiple of the opening chip, or null if the server does not offer it. */
  buyNowMultiple: number | null;
  /** Number of raise stages (BID_1 … BID_n). */
  stages: number;
  /** Return to player on a won locker, when the server publishes it. */
  rtp: number | null;
}

export interface MathClient {
  readonly mode: MathMode;
  open(): Promise<MathSession>;
  /** Valid amounts for a bet type, minor units. */
  validBets(betType: string): number[];
  bet(amount: number, betType: string): Promise<RaiseResult>;
  /** Credit a settled round; returns the new balance. */
  collect(roundId: string): Promise<number>;
}

export const DEFAULT_CURRENCY: Currency = { code: 'USD', prefix: '$', suffix: '', grouping: ',', decimal: '.', precision: 2, denomination: 1 };

/** Bet type names: raise k is BID_k, the outright purchase is BUY_NOW. */
export const bidType = (stage: number): string => `BID_${stage}`;
export const BUY_NOW = 'BUY_NOW';
export const stageOf = (betType: string): number | null => { const m = /^BID_(\d+)$/.exec(betType); return m ? Number(m[1]) : null; };
