#!/usr/bin/env node
// A test math server: the auction engine behind HTTP, so results are drawn on a server and
// not in the player's browser. It speaks the RGS provider routes the Rollerz SDK uses:
//
//   POST /api/auction/open        {sessionId?, balance?}   -> session (chip levels, buy-now, stages, rtp)
//   POST /api/auction/valid-bets  {betType}                -> {levels}
//   POST /api/auction/bet         {betAmount, betType}     -> round (outcome, locker, next, seedHash…)
//   POST /api/auction/collect     {roundId}                -> {balance}
//   GET  /                                                 -> health and engine info
//
// The session id travels as X-Session-Id (or sessionId in the body). Sessions, balances and
// seeds live only here; any seed a client sends is ignored.
//
// Usage: node scripts/math-server.mjs <path-to-gnarone-game-math clone> [port] [preset]
//   git clone https://github.com/Danvid1009/gnarone-game-math.git ../gnarone-game-math
//   node scripts/math-server.mjs ../gnarone-game-math 8790
// then open the game with ?rgs=http://localhost:8790
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, portArg, presetArg] = process.argv.slice(2);
if (!repo) { console.error('usage: node scripts/math-server.mjs <path-to-gnarone-game-math> [port] [preset]'); process.exit(2); }
const port = Number(portArg ?? process.env.PORT ?? 8790);
const preset = presetArg ?? 'storage';
const { createGame } = await import(pathToFileURL(resolve(repo, 'auction-engine/src/rgs.js')).href);
const game = createGame({ preset });
const START_BALANCE = Number(process.env.START_BALANCE ?? 50000);

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
};
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(body)); };
const readJson = (req) => new Promise((ok, fail) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e5) { fail(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { try { ok(data ? JSON.parse(data) : {}); } catch (e) { fail(e); } });
  req.on('error', fail);
});

/** Rounds belong to the session that placed them. */
const owner = new Map();
let bets = 0;

const routes = {
  open: (b, sid) => game.open({ sessionId: sid || undefined, balance: START_BALANCE }),
  'valid-bets': (b) => game.validBets({ betType: String(b.betType) }),
  bet: (b, sid) => {
    if (!sid) throw new Error('missing session');
    // only these three fields reach the engine: the seed is always drawn here
    const r = game.bet({ sessionId: sid, betAmount: Number(b.betAmount), betType: String(b.betType) });
    owner.set(r.roundId, sid); bets++;
    return r;
  },
  collect: (b, sid) => {
    const roundId = String(b.roundId);
    if (owner.get(roundId) !== sid) throw new Error('unknown round for this session');
    return game.collect({ roundId });
  },
};

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, { ok: true, engine: 'auction', preset, bets, routes: Object.keys(routes).map((r) => `/api/auction/${r}`) });
  const m = url.pathname.match(/^\/api\/auction\/([a-z-]+)$/);
  if (!m || req.method !== 'POST' || !routes[m[1]]) return send(res, 404, { message: 'not found' });
  try {
    const body = await readJson(req);
    const sid = String(req.headers['x-session-id'] ?? body.sessionId ?? '');
    send(res, 200, routes[m[1]](body, sid));
  } catch (e) {
    send(res, 400, { message: e instanceof Error ? e.message : String(e) });
  }
}).listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`auction math server (${preset}) on http://${process.env.HOST ?? '127.0.0.1'}:${port}`));
