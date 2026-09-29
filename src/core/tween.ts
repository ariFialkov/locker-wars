/** Minimal promise-based tween/timer system ticked from the render loop. */
export type Ease = (t: number) => number;
export const easeOut: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn: Ease = (t) => t * t * t;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const linear: Ease = (t) => t;
export const bounceOut: Ease = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const backOut: Ease = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

interface Active { dur: number; t: number; fn: (k: number) => void; ease: Ease; resolve: () => void; cancelled: boolean }
const active: Active[] = [];

export interface TweenHandle extends Promise<void> { cancel(): void }

export function tween(dur: number, fn: (k: number) => void, ease: Ease = easeOut): TweenHandle {
  let ref!: Active;
  const p = new Promise<void>((resolve) => {
    ref = { dur: Math.max(0.0001, dur), t: 0, fn, ease, resolve, cancelled: false };
    active.push(ref);
  }) as TweenHandle;
  p.cancel = () => { ref.cancelled = true; };
  return p;
}

export function wait(sec: number): TweenHandle { return tween(sec, () => {}, linear); }

/** Global time scale (used to fast-forward the count-up). */
export const clock = { scale: 1 };

export function tickTweens(dt: number): void {
  const d = dt * clock.scale;
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i];
    if (a.cancelled) { active.splice(i, 1); a.resolve(); continue; }
    a.t += d;
    const k = Math.min(1, a.t / a.dur);
    a.fn(a.ease(k));
    if (k >= 1) { active.splice(i, 1); a.resolve(); }
  }
}

export function cancelAllTweens(): void {
  for (const a of active) a.cancelled = true;
}
