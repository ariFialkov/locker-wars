/** Player progress, analytics and persistence (localStorage). */
import type { Category } from '../game/items/types';
import type { OutcomeTier } from './economy';

import { START_BALANCE, BAILOUT_AMOUNT } from './config';
export { START_BALANCE, BAILOUT_AMOUNT };
const KEY = 'locker-wars:v1';

export interface RoundRecord {
  n: number;
  theme: string;
  result: 'won' | 'lost' | 'passed';
  winner: string; // 'player' or bot id
  paid: number;
  value: number;
  profit: number;
  multiplier: number;
  tier: OutcomeTier | null;
  topItem: { name: string; value: number } | null;
  items: number;
  couldHaveHadFor: number;
  at: number;
}

export interface CategoryStat { items: number; value: number; lockers: number; replicas: number }
export interface ItemStat { count: number; value: number; best: number; name: string; category: Category }
export interface RivalStat { beatYou: number; youBeat: number; lockers: number; spent: number }

export interface Stats {
  version: number;
  sessionSeed: string;
  round: number;
  balance: number;
  debt: number;
  rounds: number;
  won: number;
  lost: number;
  passed: number;
  totalSpent: number;
  totalEarned: number;
  bestProfit: number;
  worstLoss: number;
  bestLockerValue: number;
  bestMultiplier: number;
  streak: number;
  bestStreak: number;
  bailouts: number;
  jackpots: number;
  hiddenValue: number;
  visibleValue: number;
  itemsAppraised: number;
  replicas: number;
  byCategory: Partial<Record<Category, CategoryStat>>;
  items: Record<string, ItemStat>;
  rivals: Record<string, RivalStat>;
  history: RoundRecord[];
  balanceHistory: number[];
  settings: { sound: boolean; voice: boolean; quality: 'auto' | 'low' | 'high' };
}

export function freshStats(seed?: string): Stats {
  return {
    version: 1,
    sessionSeed: seed ?? Math.random().toString(36).slice(2, 10),
    round: 0,
    balance: START_BALANCE,
    debt: 0,
    rounds: 0, won: 0, lost: 0, passed: 0,
    totalSpent: 0, totalEarned: 0,
    bestProfit: 0, worstLoss: 0, bestLockerValue: 0, bestMultiplier: 0,
    streak: 0, bestStreak: 0, bailouts: 0, jackpots: 0,
    hiddenValue: 0, visibleValue: 0, itemsAppraised: 0, replicas: 0,
    byCategory: {}, items: {}, rivals: {}, history: [], balanceHistory: [START_BALANCE],
    settings: { sound: true, voice: true, quality: 'auto' },
  };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshStats();
    const s = JSON.parse(raw) as Stats;
    if (s.version !== 1) return freshStats();
    return { ...freshStats(s.sessionSeed), ...s, settings: { ...freshStats().settings, ...(s.settings ?? {}) } };
  } catch {
    return freshStats();
  }
}

let saveTimer: number | null = null;
export function saveStats(s: Stats): void {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: play on */ }
  }, 150);
}

export function resetStats(): Stats {
  const s = freshStats();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

export function realizedRTP(s: Stats): number | null {
  return s.totalSpent > 0 ? s.totalEarned / s.totalSpent : null;
}

export function pushRound(s: Stats, r: RoundRecord): void {
  s.history.unshift(r);
  if (s.history.length > 60) s.history.length = 60;
  s.balanceHistory.push(Math.round(s.balance));
  if (s.balanceHistory.length > 120) s.balanceHistory.shift();
}
