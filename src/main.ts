import './styles.css';
import { Game } from './game/round';
import type { Quality } from './render/scene';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

function pickQuality(): Quality {
  const q = new URL(location.href).searchParams.get('q');
  if (q === 'low' || q === 'high') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (!coarse) return 'high';
  return cores >= 6 && mem >= 4 ? 'high' : 'low';
}

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const game = new Game(canvas, pickQuality());
(window as unknown as { game: Game }).game = game;
