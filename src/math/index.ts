/**
 * Which math backend the game talks to.
 *
 * Platform (Rollerz) when a game id and client code are configured, either at build time
 *   VITE_ROLLERZ_GAME_ID, VITE_ROLLERZ_CLIENT_CODE, VITE_ROLLERZ_SERVER_URL (optional if the host
 *   passes ?server=), VITE_ROLLERZ_PATH (optional), VITE_ROLLERZ_STAGES (default 6)
 * or in the page URL: ?game=…&client=…&server=… (the SDK reads ?server= and ?session= itself).
 *
 * Practice (play credits, settled in this browser) only when nothing platform-related is
 * configured, or when forced with ?math=practice. A half-configured platform is an error,
 * never a silent fallback: real-money play must not end up rolling in the browser.
 */
import { PracticeClient } from './practice';
import { RollerzClient, type RollerzConfig } from './rollerz';
import type { MathClient } from './types';

export * from './types';
export { PracticeClient } from './practice';
export { MathResponseError } from './parse';

export class MathConfigError extends Error { constructor(m: string) { super(m); this.name = 'MathConfigError'; } }

export interface MathEnv {
  VITE_ROLLERZ_GAME_ID?: string;
  VITE_ROLLERZ_CLIENT_CODE?: string;
  VITE_ROLLERZ_SERVER_URL?: string;
  VITE_ROLLERZ_PATH?: string;
  VITE_ROLLERZ_STAGES?: string;
  VITE_ROLLERZ_LOGGING?: string;
}

/** Decide the backend from build env + page URL. Pure, so it can be tested. */
export function resolveMathConfig(env: MathEnv, search: string): { mode: 'practice' } | { mode: 'platform'; cfg: RollerzConfig } {
  const q = new URLSearchParams(search);
  const gameId = q.get('game') || env.VITE_ROLLERZ_GAME_ID || '';
  const clientCode = q.get('client') || env.VITE_ROLLERZ_CLIENT_CODE || '';
  const serverParam = q.get('server') || '';
  const serverUrl = env.VITE_ROLLERZ_SERVER_URL || '';
  const anyPlatform = !!(gameId || clientCode || serverParam || serverUrl || q.get('session'));
  if (q.get('math') === 'practice') {
    if (env.VITE_ROLLERZ_GAME_ID) throw new MathConfigError('Practice mode is disabled in a platform build.');
    return { mode: 'practice' };
  }
  if (!anyPlatform) return { mode: 'practice' };
  const missing = [!gameId && 'game id', !clientCode && 'internal client code', !(serverParam || serverUrl) && 'math server URL'].filter(Boolean);
  if (missing.length) throw new MathConfigError(`Platform session is missing: ${missing.join(', ')}.`);
  const stages = Number(env.VITE_ROLLERZ_STAGES || 6);
  return { mode: 'platform', cfg: { gameId, internalClientCode: clientCode, serverUrl: serverUrl || undefined, path: env.VITE_ROLLERZ_PATH || undefined, stages: Number.isInteger(stages) && stages > 0 ? stages : 6, logging: env.VITE_ROLLERZ_LOGGING === '1' } };
}

export function createMathClient(env: MathEnv = import.meta.env as MathEnv, search = typeof location !== 'undefined' ? location.search : '', opts: { practiceStart?: number } = {}): MathClient {
  const r = resolveMathConfig(env, search);
  return r.mode === 'platform' ? new RollerzClient(r.cfg) : new PracticeClient(undefined, undefined, undefined, opts.practiceStart);
}
