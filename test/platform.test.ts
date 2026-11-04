import { describe, it, expect } from 'vitest';
import { parseRaise, MathResponseError } from '../src/math/parse';
import { resolveMathConfig, MathConfigError, ROLLERZ_GAME_ID, ENGINE_URL } from '../src/math/index';
import { RollerzClient, type RollerzSDKLike } from '../src/math/rollerz';

const envelope = { roundId: 'r1', balance: 99000, totalBetAmount: 1000, nextAction: ['COLLECT'] };

describe('reading bet responses', () => {
  it('reads auction fields at the top level (the engine contract)', () => {
    const r = parseRaise({ ...envelope, totalWinAmount: 1000, outcome: 'OUTBID', next: { betType: 'BID_2', bid: 2000, increment: 1000, multiple: 2 }, locker: null, seedHash: 'abc' });
    expect(r).toMatchObject({ roundId: 'r1', outcome: 'OUTBID', bet: 1000, win: 1000, balance: 99000, next: { betType: 'BID_2', bid: 2000 }, locker: null, seedHash: 'abc' });
  });
  it('reads auction fields nested under `math` (the Rollerz generic provider)', () => {
    const r = parseRaise({ ...envelope, totalWinAmount: 1530, math: { outcome: 'WON', next: null, locker: { multiplier: 1.53, band: 4, multiple: 1.5, contents: 1530 } } });
    expect(r.outcome).toBe('WON');
    expect(r.locker).toEqual({ multiplier: 1.53, contents: 1530, band: 4, multiple: 1.5 });
  });
  it('refuses anything malformed rather than inventing a result', () => {
    expect(() => parseRaise({ ...envelope, totalWinAmount: 0, outcome: 'MAYBE' })).toThrow(MathResponseError);
    expect(() => parseRaise({ ...envelope, totalWinAmount: 0, outcome: 'WON', locker: null })).toThrow(/without a locker/);
    expect(() => parseRaise({ ...envelope, totalWinAmount: 12.5, outcome: 'OUTBID' })).toThrow(/integer/);
    expect(() => parseRaise({ ...envelope, totalWinAmount: 900, outcome: 'WON', locker: { multiplier: 1, contents: 1000 } })).toThrow(/do not match/);
    expect(() => parseRaise({ balance: 1, totalBetAmount: 1, totalWinAmount: 0, outcome: 'OUTBID' })).toThrow(/roundId/);
  });
});

describe('choosing the math backend', () => {
  it('the published math engine (test mode) when nothing platform-related is configured', () => {
    expect(resolveMathConfig({}, '')).toEqual({ mode: 'engine', url: ENGINE_URL });
    expect(resolveMathConfig({ VITE_ENGINE_URL: 'http://127.0.0.1:8799/rgs.js' }, '')).toEqual({ mode: 'engine', url: 'http://127.0.0.1:8799/rgs.js' });
  });
  it('offline practice credits with ?math=practice', () => {
    expect(resolveMathConfig({}, '?math=practice').mode).toBe('practice');
  });
  it('platform when the client code and server are present, with Locker Wars\' game id by default', () => {
    const a = resolveMathConfig({ VITE_ROLLERZ_CLIENT_CODE: 'abc', VITE_ROLLERZ_SERVER_URL: 'https://math.example/auction' }, '');
    expect(a).toMatchObject({ mode: 'platform', cfg: { gameId: ROLLERZ_GAME_ID, internalClientCode: 'abc', serverUrl: 'https://math.example/auction', stages: 6 } });
    expect(ROLLERZ_GAME_ID).toBe('b6f0701f-fdb7-4139-8e50-c7a962e67a65');
    expect(resolveMathConfig({}, '?client=c&server=https%3A%2F%2Fm.example').mode).toBe('platform');
  });
  it('a half-configured platform is an error, never a silent fallback', () => {
    expect(() => resolveMathConfig({}, '?server=https://m.example')).toThrow(/client code/);
    expect(() => resolveMathConfig({ VITE_ROLLERZ_CLIENT_CODE: 'c' }, '')).toThrow(/math server URL/);
  });
  it('a test math server with ?rgs= (or VITE_RGS_URL)', () => {
    expect(resolveMathConfig({}, '?rgs=http%3A%2F%2F127.0.0.1%3A8790')).toEqual({ mode: 'server', url: 'http://127.0.0.1:8790' });
    expect(resolveMathConfig({ VITE_RGS_URL: 'https://math.example' }, '')).toEqual({ mode: 'server', url: 'https://math.example' });
    expect(() => resolveMathConfig({}, '?rgs=javascript:alert(1)')).toThrow(MathConfigError);
    expect(() => resolveMathConfig({ VITE_ROLLERZ_CLIENT_CODE: 'c', VITE_ROLLERZ_SERVER_URL: 's' }, '?rgs=http://x')).toThrow(MathConfigError);
  });
  it('a platform build cannot be switched to a test mode from the URL', () => {
    const env = { VITE_ROLLERZ_CLIENT_CODE: 'c', VITE_ROLLERZ_SERVER_URL: 's' };
    expect(() => resolveMathConfig(env, '?math=practice')).toThrow(MathConfigError);
    expect(() => resolveMathConfig(env, '?math=engine')).toThrow(MathConfigError);
  });
});

describe('Rollerz client', () => {
  function fakeSdk() {
    const calls: unknown[][] = [];
    const sdk: RollerzSDKLike = {
      init: async (...a) => { calls.push(['init', ...a]); },
      gp: {
        configureBetTypes: async (...a) => { calls.push(['configureBetTypes', ...a]); },
        openGame: async (o) => { calls.push(['openGame', o]); return { sessionId: 's', balance: 100000, chipLevels: [100, 200, 500, 1000, 2500, 5000, 10000], defaultBet: 200, buyNow: { multiple: 10 }, stages: [1, 2, 3, 4, 5, 6], rtp: 0.95 }; },
        getValidBets: () => [1000, 2000],
        placeBet: async (amount, o) => { calls.push(['placeBet', amount, o]); return { roundId: 'x', balance: 100000 - amount, totalBetAmount: amount, totalWinAmount: amount, nextAction: ['COLLECT'], math: { outcome: 'OUTBID', next: { betType: 'BID_2', bid: amount * 2, increment: amount, multiple: 2 }, locker: null } }; },
        collect: async (id) => { calls.push(['collect', id]); return { balance: 100000 }; },
      },
    };
    return { sdk, calls };
  }

  it('opens a GP session with the configured server and client code, and places raises through it', async () => {
    const { sdk, calls } = fakeSdk();
    const c = new RollerzClient({ gameId: 'locker-wars', internalClientCode: 'abc', serverUrl: 'https://math.example', stages: 6 }, async () => sdk);
    const s = await c.open();
    expect(s).toMatchObject({ mode: 'platform', balance: 100000, buyNowMultiple: 10, stages: 6, rtp: 0.95 });
    expect(calls[0]).toEqual(['init', 'locker-wars', { enableLogging: false }]);
    expect(calls[1]).toEqual(['configureBetTypes', ['BID_1', 'BID_2', 'BID_3', 'BID_4', 'BID_5', 'BID_6', 'BUY_NOW'], { defaultBetType: 'BID_1' }]);
    expect(calls[2]).toEqual(['openGame', { internalClientCode: 'abc', serverUrl: 'https://math.example' }]);
    const r = await c.bet(500, 'BID_1');
    expect(calls[3]).toEqual(['placeBet', 500, { betType: 'BID_1' }]);
    expect(r).toMatchObject({ outcome: 'OUTBID', win: 500, next: { betType: 'BID_2', bid: 1000 } });
    expect(await c.collect('x')).toBe(100000);
  });
});
