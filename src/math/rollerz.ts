/**
 * The platform: bets placed through the Rollerz SDK's generic provider (`gp`).
 *
 *   game ──RollerzSDK.gp──▶ Rollerz bridge iframe ──▶ Rollerz RGS backend ──▶ the auction math server
 *
 * The SDK (MIT, @rollerz/sdk 0.1.4, pinned) owns the session, the balance and every random
 * draw; this module only forwards bets and reads results. Nothing here can change an outcome.
 * The SDK runtime is loaded lazily, so practice mode never downloads it.
 *
 * Calls used (from the SDK's published type definitions):
 *   RollerzSDK.init(gameId)
 *   RollerzSDK.gp.configureBetTypes([...], { defaultBetType })
 *   RollerzSDK.gp.openGame({ serverUrl, internalClientCode, path? })   → GPSession
 *   RollerzSDK.gp.getValidBets({ betType })                            → number[]
 *   RollerzSDK.gp.placeBet(amount, { betType })                        → GPBetResult
 *   RollerzSDK.gp.collect(roundId)                                     → { balance }
 */
import { parseRaise } from './parse';
import { BUY_NOW, DEFAULT_CURRENCY, bidType, type Currency, type MathClient, type MathSession, type RaiseResult } from './types';

interface GPSessionLike {
  sessionId: string;
  balance: number;
  currency?: Currency;
  chipLevels?: number[];
  minBet?: number;
  maxBet?: number;
  defaultBet?: number;
  [extra: string]: unknown;
}
interface GPProviderLike {
  configureBetTypes(types: readonly string[], options?: { defaultBetType?: string; boostedBetType?: string | null }): Promise<void>;
  openGame(options?: Record<string, unknown>): Promise<GPSessionLike>;
  getValidBets(opts?: { betType?: string }): number[];
  placeBet(betAmount: number, opts?: { betType?: string }): Promise<unknown>;
  collect(roundId: string): Promise<{ balance: number }>;
}
export interface RollerzSDKLike {
  init(gameId: string, options?: { enableLogging?: boolean }): Promise<void>;
  gp: GPProviderLike;
}

export interface RollerzConfig {
  gameId: string;
  /** Math server the Rollerz backend calls. Omit when the host passes `?server=` (the SDK reads it itself). */
  serverUrl?: string;
  internalClientCode: string;
  path?: string;
  /** Number of raise stages the math server offers (BID_1 … BID_n). */
  stages: number;
  logging?: boolean;
}

async function loadSdk(): Promise<RollerzSDKLike> {
  const w = window as unknown as { RollerzSDK?: RollerzSDKLike };
  if (!w.RollerzSDK) await import('@rollerz/sdk'); // the bundle installs window.RollerzSDK
  if (!w.RollerzSDK) throw new Error('Rollerz SDK failed to load');
  return w.RollerzSDK;
}

export class RollerzClient implements MathClient {
  readonly mode = 'platform' as const;
  private sdk: RollerzSDKLike | null = null;
  private stages: number;

  constructor(private readonly cfg: RollerzConfig, private readonly sdkLoader: () => Promise<RollerzSDKLike> = loadSdk) {
    this.stages = cfg.stages;
  }

  private get gp(): GPProviderLike {
    if (!this.sdk) throw new Error('Rollerz session not open');
    return this.sdk.gp;
  }

  private betTypes(): string[] { return [...Array.from({ length: this.stages }, (_, i) => bidType(i + 1)), BUY_NOW]; }

  async open(): Promise<MathSession> {
    this.sdk = await this.sdkLoader();
    await this.sdk.init(this.cfg.gameId, { enableLogging: !!this.cfg.logging });
    await this.gp.configureBetTypes(this.betTypes(), { defaultBetType: bidType(1) });
    const s = await this.gp.openGame({
      internalClientCode: this.cfg.internalClientCode,
      ...(this.cfg.serverUrl ? { serverUrl: this.cfg.serverUrl } : {}),
      ...(this.cfg.path ? { path: this.cfg.path } : {}),
    });
    // The math server may publish its stage list and buy-now multiple in the session (as the auction engine does).
    const published = Array.isArray(s.stages) ? s.stages.length : null;
    if (published && published !== this.stages) { this.stages = published; await this.gp.configureBetTypes(this.betTypes(), { defaultBetType: bidType(1) }); }
    const chips = s.chipLevels?.length ? s.chipLevels : this.gp.getValidBets({ betType: bidType(1) });
    if (!chips.length) throw new Error('Rollerz session has no chip levels');
    const buyNow = (s.buyNow as { multiple?: number } | null | undefined)?.multiple;
    const buyLevels = this.safeValidBets(BUY_NOW);
    const buyNowMultiple = typeof buyNow === 'number' ? buyNow : buyLevels.length ? buyLevels[0] / chips[0] : null;
    return {
      mode: 'platform',
      balance: s.balance,
      currency: s.currency ?? DEFAULT_CURRENCY,
      chipLevels: [...chips].sort((a, b) => a - b),
      defaultBet: s.defaultBet ?? chips[Math.min(1, chips.length - 1)],
      buyNowMultiple,
      stages: this.stages,
      rtp: typeof s.rtp === 'number' ? s.rtp : null,
    };
  }

  private safeValidBets(betType: string): number[] { try { return this.gp.getValidBets({ betType }); } catch { return []; } }

  validBets(betType: string): number[] { return this.safeValidBets(betType); }

  async bet(amount: number, betType: string): Promise<RaiseResult> {
    return parseRaise(await this.gp.placeBet(amount, { betType }));
  }

  async collect(roundId: string): Promise<number> {
    return (await this.gp.collect(roundId)).balance;
  }
}
