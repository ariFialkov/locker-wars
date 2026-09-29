/**
 * Voices: the auctioneer's chant and rival yells. Uses SpeechSynthesis where
 * available (nearly everywhere), with a synthesised "babble" fallback so the
 * auction never goes silent.
 *
 * Voice selection matters a lot: macOS ships novelty voices (Cellos, Bells,
 * Good News...) that sing or warble, so we score voices and only use natural
 * ones.
 */
import { sfx } from './sfx';

interface VoiceOpts { pitch?: number; rate?: number; volume?: number; interrupt?: boolean; channel?: 'auctioneer' | 'crowd' }

const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|fred|grandma|grandpa|rocko|shelley|sandy|eddy|flo|reed|princess|agnes|bruce|vicki|victoria|eloquence/i;
const PREFERRED_MALE = /^(daniel|alex|aaron|tom|nathan|arthur|oliver|rishi|google uk english male|microsoft (david|mark|guy|ryan|christopher|eric|brian|andrew)|en-us-.*-(neural|natural).*male)/i;
const PREFERRED_FEMALE = /^(samantha|karen|moira|tessa|ava|allison|susan|zoe|google us english|google uk english female|microsoft (zira|jenny|aria|michelle|sonia|libby|emma))/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.toLowerCase().startsWith('en')) return -1;
  if (NOVELTY.test(v.name)) return -1;
  let s = 1;
  if (v.localService) s += 2;
  if (/en[-_]us/i.test(v.lang)) s += 1;
  if (PREFERRED_MALE.test(v.name) || PREFERRED_FEMALE.test(v.name)) s += 4;
  if (/natural|neural|premium|enhanced/i.test(v.name)) s += 2;
  if (/compact/i.test(v.name)) s -= 1;
  return s;
}

/** Numbers the way an auctioneer says them: "$1,250" -> "twelve fifty", "$45" -> "forty five". */
export function spokenAmount(n: number): string {
  const v = Math.round(n);
  if (v >= 1100 && v < 10000 && v % 100 !== 0 && v % 50 === 0) {
    const hundreds = Math.floor(v / 100), rest = v % 100;
    return `${hundreds} ${rest}`; // "twelve fifty"
  }
  return String(v);
}

/** Replace $amounts in a chant with spoken forms so the synth doesn't say "dollars" every beat. */
export function chantify(text: string, sayDollars = false): string {
  return text.replace(/\$([\d,]+)/g, (_, num: string) => spokenAmount(Number(num.replace(/,/g, ''))) + (sayDollars ? ' dollars' : ''));
}

class Voice {
  enabled = true;
  private synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private auctioneerVoice: SpeechSynthesisVoice | null = null;
  private lastAuctioneer: SpeechSynthesisUtterance | null = null;
  private crowdQueue = 0;

  constructor() {
    if (this.synth) {
      const load = () => {
        const all = this.synth!.getVoices().map((v) => ({ v, s: scoreVoice(v) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        this.voices = all.map((x) => x.v);
        // Auctioneer: the best male-sounding voice we can find, else the best overall.
        this.auctioneerVoice = this.voices.find((v) => PREFERRED_MALE.test(v.name)) ?? this.voices[0] ?? null;
      };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  setEnabled(on: boolean): void { this.enabled = on; if (!on) this.synth?.cancel(); }

  private pickVoice(seed: number): SpeechSynthesisVoice | null {
    const pool = this.voices.filter((v) => v !== this.auctioneerVoice);
    if (pool.length === 0) return this.voices[0] ?? null;
    return pool[Math.abs(seed) % pool.length];
  }

  speak(text: string, opts: VoiceOpts = {}, voiceSeed = 0): void {
    if (!this.enabled) return;
    if (!this.synth) { this.babble(text, opts); return; }
    const channel = opts.channel ?? 'crowd';
    if (channel === 'auctioneer') {
      // A new bid cuts the auctioneer off mid-chant, like real life.
      if (opts.interrupt !== false && this.lastAuctioneer) this.synth.cancel();
      else if (opts.interrupt === false && this.synth.speaking) return; // don't stack filler patter
    } else if (channel === 'crowd' && this.crowdQueue > 2) {
      return; // don't pile up yells
    }
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = opts.pitch ?? 1; u.rate = opts.rate ?? 1; u.volume = opts.volume ?? 1;
    const v = channel === 'auctioneer' ? this.auctioneerVoice : this.pickVoice(voiceSeed);
    if (v) { u.voice = v; u.lang = v.lang; }
    if (channel === 'auctioneer') { this.lastAuctioneer = u; u.onend = u.onerror = () => { if (this.lastAuctioneer === u) this.lastAuctioneer = null; }; }
    else { this.crowdQueue++; u.onend = u.onerror = () => { this.crowdQueue = Math.max(0, this.crowdQueue - 1); }; }
    try { this.synth.speak(u); } catch { this.babble(text, opts); }
  }

  stopAuctioneer(): void { if (this.lastAuctioneer && this.synth) { this.synth.cancel(); this.lastAuctioneer = null; } }
  stopAll(): void { this.synth?.cancel(); this.crowdQueue = 0; this.lastAuctioneer = null; }

  /** Fallback: rhythmic syllables so the auction still has a "voice". */
  private babble(text: string, opts: VoiceOpts): void {
    const syll = Math.min(14, Math.max(2, Math.round(text.length / 4)));
    const pitch = 140 * (opts.pitch ?? 1);
    for (let i = 0; i < syll; i++) sfxBabble(pitch * (1 + (Math.sin(i * 1.7) * 0.15)), 0.07 / (opts.rate ?? 1), i * 0.085 / (opts.rate ?? 1));
  }
}

function sfxBabble(freq: number, dur: number, delay: number): void {
  (sfx as unknown as { tone: (f: number, d: number, o: object) => void }).tone(freq, dur, { type: 'sawtooth', gain: 0.05, delay, freqEnd: freq * 0.8 });
}

export const voice = new Voice();
