/**
 * Procedural sound effects. Everything is synthesised with the Web Audio API so
 * the PWA ships zero audio assets and works offline.
 */
class SFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private murmur: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  enabled = true;

  /** Must be called from a user gesture on iOS. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.now, 0.05);
  }

  private get now(): number { return this.ctx?.currentTime ?? 0; }
  private ok(): { ctx: AudioContext; master: GainNode; noiseBuf: AudioBuffer } | null {
    return this.ctx && this.master && this.noiseBuf && this.enabled ? { ctx: this.ctx, master: this.master, noiseBuf: this.noiseBuf } : null;
  }

  private noise(dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; attack?: number; decay?: number; freqEnd?: number } = {}): void {
    const a0 = this.ok(); if (!a0) return;
    const { ctx, master, noiseBuf } = a0;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass'; f.frequency.value = opts.freq ?? 1000; f.Q.value = opts.q ?? 1;
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, this.now + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0, this.now);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.5, this.now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, this.now + Math.max(a + 0.01, dur));
    src.connect(f).connect(g).connect(master);
    src.start(); src.stop(this.now + dur + 0.05);
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; freqEnd?: number; attack?: number; detune?: number; delay?: number } = {}): void {
    const a0 = this.ok(); if (!a0) return;
    const { ctx, master } = a0;
    const t0 = this.now + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.3, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /* ---- named effects ---- */
  boltCutterSnap(): void {
    this.noise(0.08, { type: 'highpass', freq: 3000, gain: 0.6 });
    this.tone(1800, 0.25, { type: 'square', gain: 0.08, freqEnd: 900 });
    this.tone(3200, 0.5, { gain: 0.15, freqEnd: 2900 });
    this.noise(0.6, { type: 'highpass', freq: 6000, gain: 0.25, attack: 0.02 }); // sizzle
  }
  lockDrop(): void {
    this.tone(2400, 0.18, { type: 'triangle', gain: 0.25, freqEnd: 1500 });
    this.noise(0.12, { type: 'bandpass', freq: 2500, q: 3, gain: 0.35 });
    this.tone(1900, 0.12, { type: 'triangle', gain: 0.12, delay: 0.16, freqEnd: 1400 });
  }
  doorRoll(dur: number): void {
    const a0 = this.ok(); if (!a0) return;
    const { ctx, master, noiseBuf } = a0;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, this.now); g.gain.linearRampToValueAtTime(0.5, this.now + 0.15);
    g.gain.setValueAtTime(0.5, this.now + dur - 0.2); g.gain.linearRampToValueAtTime(0, this.now + dur);
    // rattle: tremolo via LFO
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(f).connect(g).connect(master);
    src.start(); lfo.start(); src.stop(this.now + dur + 0.05); lfo.stop(this.now + dur + 0.05);
    this.tone(70, dur, { type: 'sawtooth', gain: 0.06, attack: 0.1 });
  }
  doorSlam(): void {
    this.tone(60, 0.5, { type: 'sine', gain: 0.9, freqEnd: 35 });
    this.noise(0.35, { type: 'lowpass', freq: 900, gain: 0.8 });
    this.noise(0.9, { type: 'bandpass', freq: 300, q: 2, gain: 0.3, attack: 0.03 }); // metal ring
  }
  gavel(): void {
    for (const d of [0, 0.13, 0.26]) {
      this.tone(220, 0.12, { type: 'triangle', gain: 0.5, freqEnd: 120, delay: d });
      this.noise(0.06, { type: 'lowpass', freq: 1500, gain: 0.5 });
    }
  }
  bidBlip(player = false): void {
    this.tone(player ? 880 : 620, 0.09, { type: 'square', gain: 0.07 });
    this.tone(player ? 1320 : 930, 0.12, { type: 'square', gain: 0.05, delay: 0.06 });
  }
  crowdReact(intensity = 0.5): void {
    // short swell of murmur
    this.noise(0.6, { type: 'bandpass', freq: 500, q: 0.6, gain: 0.12 * intensity + 0.05, attack: 0.08 });
    this.noise(0.4, { type: 'bandpass', freq: 1200, q: 0.8, gain: 0.08 * intensity, attack: 0.05 });
  }
  cashTick(i: number): void {
    this.tone(700 + (i % 12) * 60, 0.05, { type: 'square', gain: 0.04 });
  }
  kaching(big = false): void {
    this.tone(2637, 0.9, { gain: 0.25 });
    this.tone(3520, 0.7, { gain: 0.15, delay: 0.02 });
    this.tone(120, 0.15, { type: 'triangle', gain: 0.5, freqEnd: 60, delay: 0.05 });
    if (big) { this.tone(2093, 0.8, { gain: 0.2, delay: 0.15 }); this.tone(3136, 1.2, { gain: 0.2, delay: 0.3 }); }
  }
  whoosh(): void { this.noise(0.45, { type: 'bandpass', freq: 400, freqEnd: 2400, q: 1.2, gain: 0.4, attack: 0.05 }); }
  thud(): void { this.tone(90, 0.25, { type: 'sine', gain: 0.6, freqEnd: 45 }); this.noise(0.12, { type: 'lowpass', freq: 500, gain: 0.5 }); }
  boxOpen(): void { this.noise(0.25, { type: 'bandpass', freq: 1500, q: 0.7, gain: 0.3, attack: 0.02 }); this.noise(0.15, { type: 'highpass', freq: 2500, gain: 0.15, attack: 0.1 }); }
  safeClick(): void { this.tone(1500, 0.05, { type: 'square', gain: 0.1 }); this.tone(900, 0.2, { type: 'triangle', gain: 0.3, freqEnd: 500, delay: 0.12 }); this.noise(0.3, { type: 'lowpass', freq: 800, gain: 0.4, attack: 0.02 }); }
  sad(): void { this.tone(300, 0.5, { type: 'sawtooth', gain: 0.12, freqEnd: 150 }); this.tone(220, 0.8, { type: 'sawtooth', gain: 0.1, freqEnd: 100, delay: 0.35 }); }
  fanfare(big = false): void {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((n, i) => { this.tone(n, 0.5, { type: 'triangle', gain: 0.22, delay: i * 0.11 }); this.tone(n * 2, 0.35, { gain: 0.08, delay: i * 0.11 }); });
  }
  tick(): void { this.tone(1200, 0.04, { type: 'square', gain: 0.05 }); }
  click(): void { this.tone(500, 0.03, { type: 'square', gain: 0.05 }); }
  stamp(bad: boolean): void { bad ? this.tone(180, 0.25, { type: 'square', gain: 0.15, freqEnd: 90 }) : this.tone(900, 0.15, { type: 'triangle', gain: 0.2, freqEnd: 1400 }); this.noise(0.08, { type: 'lowpass', freq: 1200, gain: 0.4 }); }
  coinShower(n: number): void { for (let i = 0; i < n; i++) this.tone(2000 + Math.random() * 2500, 0.25, { gain: 0.06, delay: i * 0.07 + Math.random() * 0.03 }); }

  /** Continuous low crowd murmur during the auction. */
  murmurOn(): void {
    const a0 = this.ok(); if (!a0 || this.murmur) return;
    const { ctx, master, noiseBuf } = a0;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 350; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, this.now); g.gain.linearRampToValueAtTime(0.06, this.now + 1.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37; const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(master); src.start(); lfo.start();
    this.murmur = { src, gain: g };
  }
  murmurOff(): void {
    if (!this.murmur || !this.ctx) return;
    const m = this.murmur; this.murmur = null;
    m.gain.gain.linearRampToValueAtTime(0, this.now + 1.2);
    m.src.stop(this.now + 1.3);
  }
}

export const sfx = new SFX();
