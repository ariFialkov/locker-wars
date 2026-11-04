/**
 * Test mode: the auction math engine itself, loaded from its published URL.
 *
 *   import { createGame } from 'https://danvid1009.github.io/gnarone-game-math/auction/api/rgs.js'
 *
 * This is the engine's documented browser module. It implements the RGS provider contract
 * (open / valid-bets / bet / collect, minor units, "bet debits, collect credits") and rolls
 * every result with crypto.getRandomValues, in the player's browser. So it is the real math,
 * but NOT platform controlled: use it to test the math and the wire format until the Rollerz
 * server URL and client code exist, then switch to the platform.
 *
 * Nothing is copied from the engine: it is fetched and run as published, so whatever its
 * author ships at that URL is what runs here.
 */
import { parseRaise } from './parse';
import { DEFAULT_CURRENCY, type Currency, type MathClient, type MathSession, type RaiseResult } from './types';

export const ENGINE_URL = 'https://danvid1009.github.io/gnarone-game-math/auction/api/rgs.js';

/** The slice of the engine's `createGame()` object this client uses. */
interface EngineGame {
  open(opts?: { sessionId?: string; balance?: number }): Record<string, unknown> & { sessionId: string; balance: number };
  validBets(opts: { betType: string }): { levels: number[] };
  bet(opts: { sessionId: string; betAmount: number; betType: string }): unknown;
  collect(opts: { roundId: string }): { balance: number };
}
interface EngineModule { createGame(opts?: { preset?: string }): EngineGame }

export class EngineClient implements MathClient {
  readonly mode = 'engine' as const;
  private game: EngineGame | null = null;
  private sessionId = '';
  /** The last bet or collect response, as the engine sent it (for inspection). */
  lastRaw: unknown = null;

  constructor(
    private readonly url: string = ENGINE_URL,
    private readonly preset = 'storage',
    private readonly startBalance = 50000,
    private readonly loader: (url: string) => Promise<EngineModule> = (u) => import(/* @vite-ignore */ u) as Promise<EngineModule>,
  ) {}

  private get g(): EngineGame { if (!this.game) throw new Error('engine session not open'); return this.game; }

  async open(): Promise<MathSession> {
    let mod: EngineModule;
    try { mod = await this.loader(this.url); }
    catch (e) { throw new Error(`couldn't load the math engine from ${this.url} (${e instanceof Error ? e.message : String(e)}). Add ?math=practice to play offline.`); }
    if (typeof mod.createGame !== 'function') throw new Error(`${this.url} is not the auction engine module`);
    this.game = mod.createGame({ preset: this.preset });
    const s = this.g.open({ balance: this.startBalance });
    this.sessionId = s.sessionId;
    const chips = Array.isArray(s.chipLevels) ? (s.chipLevels as number[]) : this.g.validBets({ betType: 'BID_1' }).levels;
    const buyNow = (s.buyNow as { multiple?: number } | null | undefined)?.multiple;
    return {
      mode: 'engine',
      balance: s.balance,
      currency: (s.currency as Currency | undefined) ?? DEFAULT_CURRENCY,
      chipLevels: [...chips].sort((a, b) => a - b),
      defaultBet: typeof s.defaultBet === 'number' ? s.defaultBet : chips[0],
      buyNowMultiple: typeof buyNow === 'number' ? buyNow : null,
      stages: Array.isArray(s.stages) ? s.stages.length : 6,
      rtp: typeof s.rtp === 'number' ? s.rtp : null,
    };
  }

  validBets(betType: string): number[] { try { return this.g.validBets({ betType }).levels; } catch { return []; } }

  async bet(amount: number, betType: string): Promise<RaiseResult> {
    const raw = this.g.bet({ sessionId: this.sessionId, betAmount: amount, betType });
    this.lastRaw = raw;
    return parseRaise(raw);
  }

  async collect(roundId: string): Promise<number> {
    const r = this.g.collect({ roundId });
    return r.balance;
  }

  /** Test credits only: carry the balance into a fresh engine session with more on top. */
  async topUp(amount: number, current: number): Promise<number> {
    const s = this.g.open({ balance: current + amount });
    this.sessionId = s.sessionId;
    return s.balance;
  }
}
