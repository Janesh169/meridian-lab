/**
 * Oscillation sync:
 *  - pendulum: choose a length so the pendulum beats in time with a door mechanism
 *  - spring:   choose a mass so a spring–mass oscillator matches a reference beat
 *  - resonance: choose a driving frequency that shakes a jammed latch loose
 * The pendulum is the full nonlinear equation (RK4), not the small-angle formula.
 */
import { DEG } from '../../physics/integrators';
import { Oscillator, Pendulum } from '../../physics/oscillations';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec } from '../framework';

/* ======================================================== beat sync base */

interface BeatParams {
  view: View;
  /** Reference beat period (s). */
  period: number;
  beats: number;
  /** Allowed timing error per beat (s). */
  tol: number;
}

abstract class BeatSync<P extends BeatParams> extends Puzzle<P> {
  protected ticks: number[] = [];
  protected lastV = 0;

  /** Current "velocity" of the oscillator: a tick is when it crosses from + to − (right/top extreme). */
  protected abstract velocity(): number;
  protected abstract stepSim(dt: number): void;
  protected abstract reset(): void;

  protected start(): void {
    this.ticks = [];
    this.reset();
    this.lastV = this.velocity();
  }

  protected advance(dt: number): void {
    const P = this.params;
    const sub = 16, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const t0 = this.simT;
      this.stepSim(h);
      this.simT = t0 + h;
      const v = this.velocity();
      // Velocity crosses zero going from + to − at the positive extreme.
      if (this.lastV > 0 && v <= 0) {
        const tc = t0 + h * (this.lastV / (this.lastV - v));
        this.ticks.push(tc);
        const k = this.ticks.length;
        const err = tc - k * P.period;
        if (Math.abs(err) > P.tol) {
          return this.finish(false, `Beat ${k}: the oscillator was ${Math.abs(err).toFixed(2)} s ${err > 0 ? 'late' : 'early'}. Its period is about ${(tc / k).toFixed(2)} s.`);
        }
        if (k >= P.beats) return this.finish(true, `In sync for ${P.beats} beats. The lock disengages.`);
      }
      this.lastV = v;
      // Overdue: the next beat should already have happened.
      const k = this.ticks.length + 1;
      if (this.simT > k * P.period + P.tol) {
        return this.finish(false, `Beat ${k}: the oscillator was late. It's swinging too slowly.`);
      }
    }
  }

  protected drawTimeline(d: Draw, y: number): void {
    const P = this.params;
    const v = P.view;
    const x0 = v.x + v.w * 0.08, x1 = v.x + v.w * 0.92;
    const T = P.period * (P.beats + 0.5);
    const X = (t: number) => x0 + ((x1 - x0) * t) / T;
    d.line(x0, y, x1, y, C.steelEdge, 2);
    for (let k = 1; k <= P.beats; k++) {
      const t = k * P.period;
      d.rect(X(t - P.tol), y - 0.02 * v.h, X(t + P.tol) - X(t - P.tol), 0.04 * v.h, 'rgba(255,182,72,0.18)');
      const lit = this.status !== 'edit' && this.simT >= t;
      d.dot(X(t), y, lit ? 6 : 4, lit ? C.amber : 'rgba(255,182,72,0.5)', lit);
    }
    for (const t of this.ticks) d.line(X(t), y - 0.04 * v.h, X(t), y + 0.04 * v.h, C.cyan, 3);
    if (this.status === 'running') d.line(X(this.simT), y - 0.05 * v.h, X(this.simT), y + 0.05 * v.h, C.white, 1);
    d.text(x0, y - 0.07 * v.h, 'door beats ◆   your oscillator |', 12, C.dim, 'left');
  }

  /** Door/lock mechanism drawn at (x, y) pulsing with the reference beat. */
  protected drawDoor(d: Draw, x: number, y: number, size: number): void {
    const P = this.params;
    const t = this.status === 'edit' ? performanceNow() / 1000 : this.simT;
    const phase = (t % P.period) / P.period;
    const pulse = Math.max(0, 1 - phase * 5);
    d.rect(x - size / 2, y - size, size, size * 2, C.steel, C.steelEdge, 2);
    const bolts = P.beats;
    for (let i = 0; i < bolts; i++) {
      const by = y - size * 0.8 + (i * size * 1.6) / Math.max(1, bolts - 1);
      const open = this.ticks.length > i && this.status !== 'edit';
      d.rect(x - size / 2 - (open ? 0 : size * 0.25), by - size * 0.05, size * 0.3, size * 0.1, open ? C.green : '#5d7186');
    }
    d.ctx.globalAlpha = 0.3 + 0.7 * pulse;
    d.dot(x, y + size * 1.15, 7, C.amber, true);
    d.ctx.globalAlpha = 1;
    d.text(x, y + size * 1.4, `beat every ${P.period.toFixed(2)} s`, 12, C.amber);
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/* ============================================================== pendulum */

export interface PendulumParams extends BeatParams {
  amplitudeDeg: number;
  L: { min: number; max: number; step: number };
  g?: number;
}

class PendulumSync extends BeatSync<PendulumParams> {
  private pend = new Pendulum(1, 0);
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const L = this.params.L;
    return [{ kind: 'slider', id: 'L', label: 'Pendulum length', min: L.min, max: L.max, step: L.step, fmt: (v) => `${v.toFixed(3)} m` }];
  }
  protected reset(): void {
    // Released from rest at +A; first tick is one full period later.
    this.pend = new Pendulum(this.values.L, this.params.amplitudeDeg * DEG, 0, this.params.g);
  }
  protected velocity(): number { return this.pend.omega; }
  protected stepSim(dt: number): void { this.pend.step(dt); }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.25, 'm', 4);
    const pivot = { x: P.view.x + P.view.w * 0.35, y: P.view.y + P.view.h - 0.15 };
    const L = this.values.L;
    const th = this.status === 'edit' ? P.amplitudeDeg * DEG : this.pend.theta;
    const bob = { x: pivot.x + L * Math.sin(th), y: pivot.y - L * Math.cos(th) };
    d.rect(pivot.x - 0.3, pivot.y, 0.6, 0.06, C.steel, C.steelEdge, 2);
    // amplitude arc
    const ctx = d.ctx;
    ctx.strokeStyle = 'rgba(127,149,171,0.3)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(d.cam.X(pivot.x), d.cam.Y(pivot.y), L * d.cam.scale, Math.PI / 2 - P.amplitudeDeg * DEG, Math.PI / 2 + P.amplitudeDeg * DEG);
    ctx.stroke();
    ctx.setLineDash([]);
    d.line(pivot.x, pivot.y, bob.x, bob.y, '#c9d6e3', 2);
    d.circleW(bob.x, bob.y, 0.06, C.cyan, 'rgba(62,230,255,0.25)', 2.5);
    d.dimension(pivot.x - 0.25, pivot.y, pivot.x - 0.25, pivot.y - L, `L = ${L.toFixed(3)} m`, 0);
    this.drawDoor(d, P.view.x + P.view.w * 0.8, pivot.y - 0.55, 0.32);
    this.drawTimeline(d, P.view.y + 0.12);
    d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.05, `released from ${P.amplitudeDeg}°`, 12, C.dim, 'left', 'top');
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.2, `Calibration log: L ≈ ${this.def.solution.L.toFixed(2)} m`, 13, C.amber, 'left', 'top');
  }
}

/* ============================================================== spring */

export interface SpringParams extends BeatParams {
  k: number;
  amplitude: number;
  mass: { min: number; max: number; step: number };
}

class SpringSync extends BeatSync<SpringParams> {
  private osc = new Oscillator(1, 1);
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const m = this.params.mass;
    return [{ kind: 'slider', id: 'm', label: 'Mass on the spring', min: m.min, max: m.max, step: m.step, fmt: (v) => `${v.toFixed(2)} kg` }];
  }
  protected reset(): void {
    this.osc = new Oscillator(this.values.m, this.params.k, 0, 0, 0, this.params.amplitude, 0);
  }
  protected velocity(): number { return this.osc.v; }
  protected stepSim(dt: number): void { this.osc.step(dt); }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.1, 'm', 5);
    const top = P.view.y + P.view.h - 0.05;
    const cx = P.view.x + P.view.w * 0.35;
    const rest = top - 0.45;
    const x = this.status === 'edit' ? P.amplitude : this.osc.x;
    const by = rest + x; // + is up
    d.rect(cx - 0.15, top, 0.3, 0.03, C.steel, C.steelEdge, 2);
    // coil
    const n = 14;
    const pts = [{ x: cx, y: top }];
    for (let i = 1; i < n; i++) pts.push({ x: cx + (i % 2 ? 0.05 : -0.05), y: top + ((by + 0.05 - top) * i) / n });
    pts.push({ x: cx, y: by + 0.05 });
    d.path(pts, '#c9d6e3', 2);
    const sz = 0.06 + Math.cbrt(this.values.m) * 0.04;
    d.rect(cx - sz / 2, by + 0.05 - sz, sz, sz, '#2a2f3a', C.cyan, 2);
    d.text(cx + sz, by + 0.05 - sz / 2, `${this.values.m.toFixed(2)} kg`, 13, C.cyan, 'left');
    d.text(cx, top + 0.06, `k = ${P.k} N/m`, 12, C.dim);
    this.drawDoor(d, P.view.x + P.view.w * 0.8, rest - 0.05, 0.18);
    this.drawTimeline(d, P.view.y + 0.08);
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.02, P.view.y + P.view.h - 0.02, `Calibration log: m ≈ ${this.def.solution.m.toFixed(1)} kg`, 13, C.amber, 'left', 'top');
  }
}

/* ============================================================== resonance */

export interface ResonanceParams {
  view: View;
  m: number;
  k: number;
  c: number;
  F0: number;
  threshold: number;
  maxTime: number;
  f: { min: number; max: number; step: number };
}

class ResonancePuzzle extends Puzzle<ResonanceParams> {
  private osc = new Oscillator(1, 1);
  private hist: number[] = [];
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const f = this.params.f;
    return [{ kind: 'slider', id: 'f', label: 'Driving frequency', min: f.min, max: f.max, step: f.step, fmt: (v) => `${v.toFixed(2)} Hz` }];
  }
  protected start(): void {
    const P = this.params;
    this.osc = new Oscillator(P.m, P.k, P.c, P.F0, 2 * Math.PI * this.values.f);
    this.hist = [];
  }
  protected advance(dt: number): void {
    const P = this.params;
    const sub = 20;
    for (let i = 0; i < sub; i++) {
      this.osc.step(dt / sub);
      if (Math.abs(this.osc.x) >= P.threshold) {
        this.simT = this.osc.t;
        return this.finish(true, `The latch rattled free after ${this.osc.t.toFixed(1)} s.`);
      }
    }
    this.simT = this.osc.t;
    this.hist.push(this.osc.x);
    if (this.hist.length > 900) this.hist.shift();
    if (this.osc.t > P.maxTime) {
      const amp = Math.max(...this.hist.slice(-120).map(Math.abs));
      this.finish(false, `After ${P.maxTime} s it only shakes ±${(amp * 100).toFixed(1)} cm (needs ${(P.threshold * 100).toFixed(0)} cm).`);
    }
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.1, 'm', 5);
    const v = P.view;
    const x = this.status === 'edit' ? 0 : this.osc.x;
    const cy = v.y + v.h * 0.62;
    const cx = v.x + v.w * 0.5;
    // Hatch on springs
    d.line(v.x + 0.1, cy, cx - 0.25 + x, cy, '#c9d6e3', 2, [6, 4]);
    d.rect(cx - 0.25 + x, cy - 0.2, 0.5, 0.4, '#2a2f3a', C.cyan, 2.5);
    d.text(cx + x, cy, 'HATCH', 12, C.cyan);
    d.rect(cx - P.threshold - 0.25, cy + 0.28, 0.5 + 2 * P.threshold, 0.02, 'rgba(255,182,72,0.4)');
    d.text(cx, cy + 0.36, `latch frees at ±${(P.threshold * 100).toFixed(0)} cm`, 12, C.amber);
    // Shaker
    const phase = this.status === 'edit' ? 0 : Math.cos(2 * Math.PI * this.values.f * this.osc.t);
    d.rect(v.x + v.w - 0.45, cy - 0.15 + phase * 0.03, 0.3, 0.3, C.steel, C.magenta, 2);
    d.text(v.x + v.w - 0.3, cy - 0.3, `${this.values.f.toFixed(2)} Hz`, 13, C.magenta);
    d.text(v.x + 0.05, v.y + v.h - 0.05, `m = ${P.m} kg · k = ${P.k} N/m · damping c = ${P.c} kg/s · F₀ = ${P.F0} N`, 12, C.dim, 'left', 'top');
    // Trace
    if (this.hist.length > 1) {
      const n = this.hist.length;
      const x0 = v.x + 0.1, w = v.w - 0.2, y0 = v.y + v.h * 0.2;
      const scale = (v.h * 0.15) / P.threshold;
      const xs = new Float64Array(n), ys = new Float64Array(n);
      for (let i = 0; i < n; i++) { xs[i] = x0 + (w * i) / 900; ys[i] = y0 + this.hist[i] * scale; }
      d.line(x0, y0 + P.threshold * scale, x0 + w, y0 + P.threshold * scale, 'rgba(255,182,72,0.4)', 1, [4, 4]);
      d.line(x0, y0 - P.threshold * scale, x0 + w, y0 - P.threshold * scale, 'rgba(255,182,72,0.4)', 1, [4, 4]);
      d.glowXY(xs, ys, n, C.cyan, 1.5);
    }
    if (this.status !== 'edit') d.text(v.x + v.w - 0.05, v.y + v.h - 0.05, `t = ${this.osc.t.toFixed(1)} s`, 15, C.cyan, 'right', 'top');
    if (this.showGuide && this.status !== 'running') d.text(v.x + 0.05, v.y + v.h - 0.2, `Calibration log: ≈ ${this.def.solution.f.toFixed(1)} Hz`, 13, C.amber, 'left', 'top');
  }
}

registerPuzzleType('pendulum', PendulumSync as any);
registerPuzzleType('spring', SpringSync as any);
registerPuzzleType('resonance', ResonancePuzzle as any);
export { PendulumSync, SpringSync, ResonancePuzzle };
