/**
 * All sound is synthesised with Web Audio, so there are no audio files to inline.
 *
 * Android Chrome won't start audio without a tap, so unlock() must be called from
 * a tap handler ("Start break"). It creates the AudioContext and plays a silent
 * buffer to warm it up. After that the alarm can fire with no further taps.
 *
 * The alarm is a two-tone square-wave siren (960/770 Hz) through a compressor at
 * full gain. Nothing else in the game uses square waves or that band. It bypasses
 * the in-game volume, so it can't be muted from inside the game.
 */
import { ENGINE } from '../config';

type Ctx = AudioContext;

class AudioEngine {
  ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private alarmBus: GainNode | null = null;
  private ambience: { nodes: AudioNode[]; gain: GainNode } | null = null;
  private scheduledAlarm: { stop: () => void; at: number } | null = null;
  /** The last time the alarm actually started (performance clock ms), for tests/telemetry. */
  lastAlarmStarted = 0;
  sfxVolume = 0.7;

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get available(): boolean {
    return typeof window !== 'undefined' && !!((window as any).AudioContext || (window as any).webkitAudioContext);
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.available) return;
    try {
      if (!this.ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' }) as Ctx;
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = 1;
        this.master.connect(c.destination);
        this.sfx = c.createGain();
        this.sfx.gain.value = this.sfxVolume;
        this.sfx.connect(this.master);
        // Alarm bus: its own compressor straight to the speakers, ignoring game volume.
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 6;
        comp.ratio.value = 8;
        comp.attack.value = 0.002;
        comp.release.value = 0.1;
        this.alarmBus = c.createGain();
        this.alarmBus.gain.value = 1;
        this.alarmBus.connect(comp);
        comp.connect(c.destination);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      // Warm-up: a silent buffer started inside the gesture.
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* audio unavailable: the visual alarm still works */
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.sfx) this.sfx.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, at = 0, glideTo?: number): void {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ----- game sounds (sine/triangle only, so they never resemble the alarm) ----- */
  tap(): void { this.tone(660, 0.05, 'sine', 0.06); }
  run(): void { this.tone(220, 0.25, 'triangle', 0.12, 0, 440); }
  win(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.14, i * 0.09)); }
  fail(): void { this.tone(300, 0.3, 'triangle', 0.12, 0, 150); }
  chime(): void { this.tone(880, 0.6, 'sine', 0.12); this.tone(1320, 0.6, 'sine', 0.06, 0.12); }
  unlockSfx(): void { [392, 523, 659].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.1, i * 0.12)); }
  /** Gentle two-note "warning" (not the alarm). */
  warning(): void { this.tone(740, 0.35, 'sine', 0.16); this.tone(554, 0.5, 'sine', 0.16, 0.3); }

  /* ----------------------------------------------------------- ambience */
  /**
   * A quiet lab hum: low drones plus filtered noise (air handling). It's
   * deliberately audible. Chrome doesn't freeze tabs that are playing sound, so it
   * helps the break timer and alarm keep running with the screen off.
   */
  startAmbience(): void {
    const c = this.ctx;
    if (!c || !this.master || this.ambience) return;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.05, c.currentTime, 1.5);
    gain.connect(this.master);
    const nodes: AudioNode[] = [];
    for (const [f, a] of [[55, 0.5], [110, 0.25], [165.5, 0.08]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = a;
      o.connect(g);
      g.connect(gain);
      o.start();
      nodes.push(o, g);
    }
    // Noise
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); d[i] = last * 3; }
    const n = c.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 600;
    const ng = c.createGain();
    ng.gain.value = 0.6;
    n.connect(bp); bp.connect(ng); ng.connect(gain);
    n.start();
    nodes.push(n, bp, ng);
    this.ambience = { nodes, gain };
  }

  stopAmbience(): void {
    const a = this.ambience;
    if (!a || !this.ctx) return;
    this.ambience = null;
    a.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => {
      for (const n of a.nodes) { try { (n as any).stop?.(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } }
      try { a.gain.disconnect(); } catch { /* */ }
    }, 1500);
  }

  /* -------------------------------------------------------------- alarm */

  /** Build one siren burst starting at audio time `t`. Returns a stopper. */
  private siren(t: number): () => void {
    const c = this.ctx!;
    const dur = ENGINE.alarmDurationS;
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.type = 'square';
    o2.type = 'square';
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    // Two-tone: alternate every 0.25 s.
    for (let k = 0; k < dur * 4; k++) {
      const f = k % 2 === 0 ? 960 : 770;
      o1.frequency.setValueAtTime(f, t + k * 0.25);
      o2.frequency.setValueAtTime(f * 1.005, t + k * 0.25);
    }
    // Pulse the amplitude for urgency.
    for (let k = 0; k < dur * 2; k++) {
      g.gain.setValueAtTime(0.9, t + k * 0.5);
      g.gain.setValueAtTime(0.55, t + k * 0.5 + 0.4);
    }
    g.gain.setValueAtTime(0.9, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g);
    g.connect(this.alarmBus!);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    return () => {
      try { o1.stop(); o2.stop(); } catch { /* already stopped */ }
      try { g.disconnect(); } catch { /* */ }
    };
  }

  /** Sound the alarm now. Returns false if audio is still locked (needs a tap). */
  alarmNow(): boolean {
    if (!this.ctx || !this.alarmBus) return false;
    if (this.ctx.state !== 'running') { void this.ctx.resume(); if ((this.ctx.state as string) !== 'running') return false; }
    this.siren(this.ctx.currentTime + 0.01);
    this.lastAlarmStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return true;
  }

  /**
   * Pre-schedule the alarm on the audio clock for the break's end (epoch ms). The
   * audio clock keeps running even if JS timers are throttled in the background.
   */
  scheduleAlarmAt(epochMs: number): void {
    this.cancelScheduledAlarm();
    const c = this.ctx;
    if (!c || !this.alarmBus) return;
    const delay = (epochMs - Date.now()) / 1000;
    if (delay <= 0.05) return;
    const stop = this.siren(c.currentTime + delay);
    this.scheduledAlarm = { stop, at: epochMs };
  }

  /** True if a pre-scheduled alarm is due within ~2 s of now (so the app shouldn't double it). */
  scheduledAlarmCovers(now: number): boolean {
    return !!this.scheduledAlarm && Math.abs(this.scheduledAlarm.at - now) < 2000 && this.unlocked;
  }

  cancelScheduledAlarm(): void {
    if (this.scheduledAlarm) {
      this.scheduledAlarm.stop();
      this.scheduledAlarm = null;
    }
  }
}

export const audio = new AudioEngine();
