/**
 * Which math backend the game talks to.
 *
 * Platform (Rollerz) when a client code and math server URL are configured, either at build time
 *   VITE_ROLLERZ_CLIENT_CODE, VITE_ROLLERZ_SERVER_URL (optional if the host passes ?server=),
 *   VITE_ROLLERZ_GAME_ID (defaults to ROLLERZ_GAME_ID), VITE_ROLLERZ_PATH, VITE_ROLLERZ_STAGES (default 6)
 * or in the page URL: ?client=…&server=… (the SDK reads ?server= and ?session= itself).
 *
 * Otherwise, for testing: the math engine's published module, run in this browser
 * (engine, the default), or offline play credits with ?math=practice.
 * A half-configured platform is an error, never a silent fallback: real-money play must not
 * end up rolling in the browser.
 */
import { PracticeClient } from './practice';
import { EngineClient, ENGINE_URL } from './engine';
import { RollerzClient, type RollerzConfig } from './rollerz';
import type { MathClient } from './types';

/** Locker Wars' game id on Rollerz. */
export const ROLLERZ_GAME_ID = 'b6f0701f-fdb7-4139-8e50-c7a962e67a65';

export * from './types';
export { PracticeClient } from './practice';
export { EngineClient, ENGINE_URL } from './engine';
export { MathResponseError } from './parse';

export class MathConfigError extends Error { constructor(m: string) { super(m); this.name = 'MathConfigError'; } }

export interface MathEnv {
  VITE_ROLLERZ_GAME_ID?: string;
  VITE_ROLLERZ_CLIENT_CODE?: string;
  VITE_ROLLERZ_SERVER_URL?: string;
  VITE_ROLLERZ_PATH?: string;
  VITE_ROLLERZ_STAGES?: string;
  VITE_ROLLERZ_LOGGING?: string;
  /** Test builds only: load the engine module from elsewhere (e.g. a local copy). */
  VITE_ENGINE_URL?: string;
}

/** Decide the backend from build env + page URL. Pure, so it can be tested. */
export function resolveMathConfig(env: MathEnv, search: string): { mode: 'practice' } | { mode: 'engine'; url: string } | { mode: 'platform'; cfg: RollerzConfig } {
  const q = new URLSearchParams(search);
  const gameId = q.get('game') || env.VITE_ROLLERZ_GAME_ID || ROLLERZ_GAME_ID;
  const clientCode = q.get('client') || env.VITE_ROLLERZ_CLIENT_CODE || '';
  const serverParam = q.get('server') || '';
  const serverUrl = env.VITE_ROLLERZ_SERVER_URL || '';
  const platformBuild = !!(env.VITE_ROLLERZ_CLIENT_CODE || env.VITE_ROLLERZ_SERVER_URL);
  const anyPlatform = !!(clientCode || serverParam || serverUrl || q.get('session'));
  const want = q.get('math');
  if (want === 'practice' || want === 'engine') {
    if (platformBuild) throw new MathConfigError('Test modes are disabled in a platform build.');
    return want === 'practice' ? { mode: 'practice' } : { mode: 'engine', url: env.VITE_ENGINE_URL || ENGINE_URL };
  }
  if (!anyPlatform) return { mode: 'engine', url: env.VITE_ENGINE_URL || ENGINE_URL };
  const missing = [!gameId && 'game id', !clientCode && 'internal client code', !(serverParam || serverUrl) && 'math server URL'].filter(Boolean);
  if (missing.length) throw new MathConfigError(`Platform session is missing: ${missing.join(', ')}.`);
  const stages = Number(env.VITE_ROLLERZ_STAGES || 6);
  return { mode: 'platform', cfg: { gameId, internalClientCode: clientCode, serverUrl: serverUrl || undefined, path: env.VITE_ROLLERZ_PATH || undefined, stages: Number.isInteger(stages) && stages > 0 ? stages : 6, logging: env.VITE_ROLLERZ_LOGGING === '1' } };
}

export function createMathClient(env: MathEnv = import.meta.env as MathEnv, search = typeof location !== 'undefined' ? location.search : '', opts: { practiceStart?: number } = {}): MathClient {
  const r = resolveMathConfig(env, search);
  if (r.mode === 'platform') return new RollerzClient(r.cfg);
  if (r.mode === 'engine') return new EngineClient(r.url, 'storage', opts.practiceStart ?? 50000);
  return new PracticeClient(undefined, undefined, undefined, opts.practiceStart);
}
