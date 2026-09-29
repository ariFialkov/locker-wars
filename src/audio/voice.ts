/**
 * Voices: the auctioneer's chant and rival yells. Uses SpeechSynthesis where
 * available (nearly everywhere), with a synthesised "babble" fallback so the
 * auction never goes silent.
 */
import { sfx } from './sfx';

interface VoiceOpts { pitch?: number; rate?: number; volume?: number; interrupt?: boolean; channel?: 'auctioneer' | 'crowd' }

class Voice {
  enabled = true;
  private synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private lastAuctioneer: SpeechSynthesisUtterance | null = null;
  private crowdQueue = 0;

  constructor() {
    if (this.synth) {
      const load = () => { this.voices = this.synth!.getVoices().filter((v) => v.lang.startsWith('en')); };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  setEnabled(on: boolean): void { this.enabled = on; if (!on) this.synth?.cancel(); }

  private pickVoice(seed: number): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;
    return this.voices[Math.abs(seed) % this.voices.length];
  }

  speak(text: string, opts: VoiceOpts = {}, voiceSeed = 0): void {
    if (!this.enabled) return;
    if (!this.synth) { this.babble(text, opts); return; }
    const channel = opts.channel ?? 'crowd';
    if (channel === 'auctioneer' && opts.interrupt !== false) {
      // A new bid cuts the auctioneer off mid-chant, like real life.
      if (this.lastAuctioneer) this.synth.cancel();
    } else if (channel === 'crowd' && this.crowdQueue > 2) {
      return; // don't pile up yells
    }
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = opts.pitch ?? 1; u.rate = opts.rate ?? 1; u.volume = opts.volume ?? 1;
    const v = this.pickVoice(voiceSeed);
    if (v) u.voice = v;
    if (channel === 'auctioneer') this.lastAuctioneer = u;
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
  // reach into the sfx tone helper via a tiny public shim
  (sfx as unknown as { tone: (f: number, d: number, o: object) => void }).tone(freq, dur, { type: 'sawtooth', gain: 0.05, delay, freqEnd: freq * 0.8 });
}

export const voice = new Voice();
