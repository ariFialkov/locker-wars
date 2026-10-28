/**
 * Recorded voice lines from the asset pack, played through the game's audio bus.
 *
 * Rules that keep the crowd readable:
 *  - the auctioneer says one line at a time; a new important line cuts the old one off;
 *  - at most two crowd lines overlap, and extras are dropped;
 *  - the auctioneer dips while a rival shouts over him;
 *  - a line that is not decoded within a short grace period is skipped, never played late.
 */
import { sfx } from '../audio/sfx';
import { voice as tts } from '../audio/voice';
import { PACK_CHARACTERS, packUrl, type PackLine } from './manifest';
import type { RNG } from '../core/rng';

export type Channel = 'auctioneer' | 'crowd';

interface Playing { src: AudioBufferSourceNode; gain: GainNode; channel: Channel; done: Promise<void> }

/** Per-channel loudness tap, so a character's mouth can follow what it is saying. */
class LevelTap {
  readonly node: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  constructor(ctx: AudioContext) {
    this.node = ctx.createAnalyser();
    this.node.fftSize = 256;
    this.buf = new Float32Array(this.node.fftSize);
  }
  /** RMS of the last few milliseconds, 0..~1. */
  level(): number {
    this.node.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  }
}

class VoiceLines {
  enabled = true;
  private raw = new Map<string, Promise<ArrayBuffer>>();
  private decoded = new Map<string, Promise<AudioBuffer>>();
  private playing: Playing[] = [];
  private taps = new Map<Channel, LevelTap>();

  /** Fetch line files ahead of time (decoding waits for the audio context). */
  preload(charId: string): void {
    for (const l of PACK_CHARACTERS[charId]?.lines ?? []) this.fetchRaw(l.file);
  }

  private fetchRaw(file: string): Promise<ArrayBuffer> {
    let p = this.raw.get(file);
    if (!p) {
      p = fetch(packUrl(file)).then((r) => { if (!r.ok) throw new Error(`voice ${file}: HTTP ${r.status}`); return r.arrayBuffer(); });
      p.catch(() => this.raw.delete(file));
      this.raw.set(file, p);
    }
    return p;
  }

  private buffer(file: string): Promise<AudioBuffer> | null {
    const a = sfx.audio(); if (!a) return null;
    let p = this.decoded.get(file);
    if (!p) {
      // decodeAudioData detaches its input, so decode a copy and keep the fetched bytes reusable
      p = this.fetchRaw(file).then((ab) => a.ctx.decodeAudioData(ab.slice(0)));
      p.catch(() => this.decoded.delete(file));
      this.decoded.set(file, p);
    }
    return p;
  }

  /** Decode everything already fetched; call after the first user gesture. */
  warm(): void { for (const f of this.raw.keys()) void this.buffer(f); }

  lines(charId: string, kind: string): PackLine[] {
    return (PACK_CHARACTERS[charId]?.lines ?? []).filter((l) => l.id === kind || l.id.startsWith(kind + '_'));
  }

  pick(rng: RNG, charId: string, kind: string): PackLine | null {
    const ls = this.lines(charId, kind);
    return ls.length ? rng.pick(ls) : null;
  }

  isBusy(channel: Channel): boolean { return this.playing.some((p) => p.channel === channel); }

  /** How loud a channel is right now (0 when nothing plays), for lip-sync. */
  level(channel: Channel): number {
    if (!this.isBusy(channel)) return 0;
    return this.taps.get(channel)?.level() ?? 0;
  }

  private tap(channel: Channel, ctx: AudioContext, out: AudioNode): AudioNode {
    let t = this.taps.get(channel);
    if (!t) { t = new LevelTap(ctx); t.node.connect(out); this.taps.set(channel, t); }
    return t.node;
  }

  /**
   * Play a line. Resolves when it finishes (or immediately if it was skipped).
   * `interrupt` cuts off whatever the auctioneer is currently saying.
   */
  async play(line: PackLine, channel: Channel, opts: { interrupt?: boolean; volume?: number; graceMs?: number } = {}): Promise<boolean> {
    if (!this.enabled) return false;
    const a = sfx.audio();
    if (!a || !sfx.enabled) return false;
    if (channel === 'auctioneer') {
      if (this.isBusy('auctioneer')) { if (opts.interrupt === false) return false; this.stop('auctioneer'); }
    } else if (this.playing.filter((p) => p.channel === 'crowd').length >= 2) return false;
    const pending = this.buffer(line.file);
    if (!pending) return false;
    let buf: AudioBuffer | null = null;
    try {
      buf = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), opts.graceMs ?? 700))]);
    } catch {
      // file missing or undecodable: fall back to the speech synthesiser so the moment still has a voice
      tts.speak(line.text, { channel, rate: 1.15 });
      return false;
    }
    if (!buf) return false;
    const src = a.ctx.createBufferSource(); src.buffer = buf;
    const gain = a.ctx.createGain(); gain.gain.value = (opts.volume ?? 1) * (channel === 'crowd' ? 0.95 : 1);
    src.connect(gain).connect(this.tap(channel, a.ctx, a.out));
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });
    const entry: Playing = { src, gain, channel, done };
    src.onended = () => { this.playing = this.playing.filter((p) => p !== entry); this.unduck(); resolveDone(); };
    this.playing.push(entry);
    if (channel === 'crowd') this.duck();
    src.start();
    await done;
    return true;
  }

  stop(channel?: Channel): void {
    for (const p of [...this.playing]) if (!channel || p.channel === channel) { try { p.src.stop(); } catch { /* already stopped */ } }
  }

  private duck(): void {
    const a = sfx.audio(); if (!a) return;
    for (const p of this.playing) if (p.channel === 'auctioneer') p.gain.gain.setTargetAtTime(0.55, a.ctx.currentTime, 0.05);
  }
  private unduck(): void {
    const a = sfx.audio(); if (!a || this.isBusy('crowd')) return;
    for (const p of this.playing) if (p.channel === 'auctioneer') p.gain.gain.setTargetAtTime(1, a.ctx.currentTime, 0.15);
  }
}

export const voiceLines = new VoiceLines();
