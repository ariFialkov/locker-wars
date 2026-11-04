/**
 * Test server mode: bets go over HTTP to a math server (see scripts/math-server.mjs), which
 * holds the session, the balance and every random draw. The browser only sends bets and
 * shows answers, as it will on the platform; nothing about the result is decided here.
 *
 * Routes are the RGS provider routes the Rollerz SDK's bridge calls:
 *   POST {base}/api/auction/open | valid-bets | bet | collect, session id in X-Session-Id.
 */
import { parseRaise } from './parse';
import { BUY_NOW, DEFAULT_CURRENCY, bidType, type Currency, type MathClient, type MathSession, type RaiseResult } from './types';

const SESSION_KEY = 'locker-wars:rgs-session';

export class HttpRgsClient implements MathClient {
  readonly mode = 'server' as const;
  private sessionId = '';
  private levels = new Map<string, number[]>();
  private readonly base: string;

  constructor(base: string, private readonly fetcher: typeof fetch = (...a) => fetch(...a), private readonly provider = 'auction') {
    this.base = base.replace(/\/+$/, '');
  }

  private async call<T>(route: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(`${this.base}/api/${this.provider}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.sessionId ? { 'X-Session-Id': this.sessionId } : {}) },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`math server unreachable at ${this.base} (${e instanceof Error ? e.message : String(e)})`);
    }
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : `math server error ${res.status}`);
    return data as T;
  }

  async open(): Promise<MathSession> {
    let saved = '';
    try { saved = sessionStorage.getItem(SESSION_KEY) ?? ''; } catch { /* storage blocked */ }
    const s = await this.call<Record<string, unknown> & { sessionId: string; balance: number }>('open', saved ? { sessionId: saved } : {});
    this.sessionId = s.sessionId;
    try { sessionStorage.setItem(SESSION_KEY, s.sessionId); } catch { /* storage blocked */ }
    const stages = Array.isArray(s.stages) ? s.stages.length : 6;
    // valid amounts per bet type, fetched once (validBets() must answer synchronously)
    const types = [...Array.from({ length: stages }, (_, i) => bidType(i + 1)), BUY_NOW];
    await Promise.all(types.map(async (t) => { try { this.levels.set(t, (await this.call<{ levels: number[] }>('valid-bets', { betType: t })).levels); } catch { /* not offered */ } }));
    const chips = Array.isArray(s.chipLevels) ? (s.chipLevels as number[]) : this.levels.get(bidType(1)) ?? [];
    if (!chips.length) throw new Error('math server returned no chip levels');
    const buyNow = (s.buyNow as { multiple?: number } | null | undefined)?.multiple;
    return {
      mode: 'server',
      balance: s.balance,
      currency: (s.currency as Currency | undefined) ?? DEFAULT_CURRENCY,
      chipLevels: [...chips].sort((a, b) => a - b),
      defaultBet: typeof s.defaultBet === 'number' ? s.defaultBet : chips[0],
      buyNowMultiple: typeof buyNow === 'number' ? buyNow : null,
      stages,
      rtp: typeof s.rtp === 'number' ? s.rtp : null,
    };
  }

  validBets(betType: string): number[] { return this.levels.get(betType) ?? []; }

  async bet(amount: number, betType: string): Promise<RaiseResult> {
    return parseRaise(await this.call('bet', { betAmount: amount, betType }));
  }

  async collect(roundId: string): Promise<number> {
    return (await this.call<{ balance: number }>('collect', { roundId })).balance;
  }
}
