/**
 * Reading bet responses from the platform.
 *
 * The auction engine's game fields (outcome, locker, next) arrive either at the top level
 * of the bet response, or, through the Rollerz generic provider, under `math` (the GP
 * provider's home for game-specific data). Both are accepted; anything malformed throws,
 * so a bad response can never be turned into a made-up result.
 */
import type { LockerDraw, NextRaise, RaiseOutcome, RaiseResult } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export class MathResponseError extends Error {
  constructor(message: string, readonly raw: unknown) { super(message); this.name = 'MathResponseError'; }
}

function int(o: Obj, key: string, raw: unknown): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new MathResponseError(`bet response: "${key}" must be a non-negative integer (minor units), got ${JSON.stringify(v)}`, raw);
  return v;
}

function parseNext(v: unknown, raw: unknown): NextRaise | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) throw new MathResponseError('bet response: "next" must be an object or null', raw);
  const betType = v.betType;
  if (typeof betType !== 'string') throw new MathResponseError('bet response: "next.betType" missing', raw);
  return { betType, bid: int(v, 'bid', raw), increment: typeof v.increment === 'number' ? v.increment : 0, multiple: typeof v.multiple === 'number' ? v.multiple : 0 };
}

function parseLocker(v: unknown, win: number, raw: unknown): LockerDraw | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) throw new MathResponseError('bet response: "locker" must be an object or null', raw);
  const multiplier = v.multiplier;
  if (typeof multiplier !== 'number' || !(multiplier >= 0)) throw new MathResponseError('bet response: "locker.multiplier" missing', raw);
  const contents = typeof v.contents === 'number' ? v.contents : win;
  if (contents !== win) throw new MathResponseError(`bet response: locker contents ${contents} do not match totalWinAmount ${win}`, raw);
  return { multiplier, contents, band: typeof v.band === 'number' ? v.band : null, multiple: typeof v.multiple === 'number' ? v.multiple : null };
}

/** Turn a raw bet response into a RaiseResult, or throw MathResponseError. */
export function parseRaise(raw: unknown): RaiseResult {
  if (!isObj(raw)) throw new MathResponseError('bet response is not an object', raw);
  // game fields may be nested under `math`; the envelope fields are always top-level
  const game: Obj = isObj(raw.math) && typeof (raw.math as Obj).outcome === 'string' ? (raw.math as Obj) : raw;
  const roundId = raw.roundId;
  if (typeof roundId !== 'string' || !roundId) throw new MathResponseError('bet response: "roundId" missing', raw);
  const outcome = game.outcome;
  if (outcome !== 'OUTBID' && outcome !== 'WON' && outcome !== 'BOUGHT') throw new MathResponseError(`bet response: unknown outcome ${JSON.stringify(outcome)}`, raw);
  const win = int(raw, 'totalWinAmount', raw);
  const bet = int(raw, 'totalBetAmount', raw);
  const balance = int(raw, 'balance', raw);
  const locker = parseLocker(game.locker, win, raw);
  const next = parseNext(game.next, raw);
  if ((outcome === 'WON' || outcome === 'BOUGHT') && !locker) throw new MathResponseError(`bet response: ${outcome} without a locker`, raw);
  if (outcome === 'OUTBID' && locker) throw new MathResponseError('bet response: OUTBID with a locker', raw);
  const out: RaiseResult = { roundId, outcome: outcome as RaiseOutcome, bet, win, balance, next, locker };
  if (typeof raw.seedHash === 'string') out.seedHash = raw.seedHash;
  if (typeof raw.seed === 'string') out.seed = raw.seed;
  return out;
}
