/**
 * Wave puzzles:
 *  - string:   a sonometer wire driven at one end. Tune tension, length, wire or frequency
 *              to get a standing wave with the right number of loops (real wave equation).
 *  - coupled:  two pendulums joined by a spring. Choose the spring so all the energy
 *              arrives at the second pendulum exactly when the latch window opens.
 *  - doppler:  zero-beat a reference tone against a moving source (you can hear it).
 *  - ydse:     Young's double slit, with fringe width, a thin sheet and white light.
 */
import { audio } from '../../audio/engine';
import { DEG, G_EARTH } from '../../physics/integrators';
import { CoupledPendulums, doppler, transferTime, StringSim, ydseIntensity } from '../../physics/waves';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec } from '../framework';

type Knob = { fixed: number } | { min: number; max: number; step: number };
const isFixed = (k: Knob): k is { fixed: number } => 'fixed' in k;

/* ================================================================ string */

export interface StringParams {
  view: View;
  /** Vibrating length (m): fixed, or a movable bridge (control `L`). */
  L: Knob;
  /** Hanging mass that sets the tension T = Mg (kg): fixed, or control `M`. */
  mass: Knob;
  /** Wires to choose from (control `wire`), mass per length μ in kg/m. */
  wires: { label: string; mu: number }[];
  /** Drive frequency (Hz): fixed, or control `f`. */
  f: Knob;
  driveA: number;
  gamma: number;
  /** Felt pads touching the wire, as a fraction of the length. */
  dampers?: number[];
  goalN: number;
  /** Simulated seconds before judging. */
  settle: number;
}

class StringPuzzle extends Puzzle<StringParams> {
  private sim: StringSim | null = null;
  private disp = new Float64Array(61);
  private judgedReset = false;
  private seenN = 0;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!isFixed(P.mass)) out.push({ kind: 'slider', id: 'M', label: 'Hanging mass (sets tension)', min: P.mass.min, max: P.mass.max, step: P.mass.step, fmt: (v) => `${v.toFixed(2)} kg → T = ${(v * G_EARTH).toFixed(1)} N` });
    if (!isFixed(P.L)) out.push({ kind: 'slider', id: 'L', label: 'Bridge position (vibrating length)', min: P.L.min, max: P.L.max, step: P.L.step, fmt: (v) => `${v.toFixed(3)} m` });
    if (!isFixed(P.f)) out.push({ kind: 'slider', id: 'f', label: 'Driver frequency', min: P.f.min, max: P.f.max, step: P.f.step, fmt: (v) => `${v.toFixed(1)} Hz` });
    if (P.wires.length > 1) out.push({ kind: 'choice', id: 'wire', label: 'Wire', options: P.wires.map((w, i) => ({ value: i, label: `${w.label} (${(w.mu * 1000).toFixed(1)} g/m)` })) });
    return out;
  }
  L(): number { return isFixed(this.params.L) ? this.params.L.fixed : this.values.L; }
  M(): number { return isFixed(this.params.mass) ? this.params.mass.fixed : this.values.M; }
  f(): number { return isFixed(this.params.f) ? this.params.f.fixed : this.values.f; }
  mu(): number { return this.params.wires[this.params.wires.length > 1 ? this.values.wire ?? 0 : 0].mu; }

  protected start(): void {
    const P = this.params;
    const L = this.L();
    this.sim = new StringSim({ L, tension: this.M() * G_EARTH, mu: this.mu(), driveA: P.driveA, driveF: this.f(), gamma: P.gamma, dampers: (P.dampers ?? []).map((fr) => ({ x: fr * L, rate: 400 })), points: 60 });
    this.disp.fill(0);
    this.judgedReset = false;
    this.seenN = 0;
  }

  protected advance(dt: number): void {
    const P = this.params;
    const s = this.sim!;
    // Twice real time, so a run takes a few seconds.
    s.advance(dt * 2);
    this.simT = s.t;
    for (let i = 0; i <= s.n; i++) this.disp[i] = Math.max(Math.abs(s.y[i]), this.disp[i] * 0.985);
    if (!this.judgedReset && s.t >= P.settle - 1) { s.resetEnvelope(); this.judgedReset = true; }
    if (s.t >= P.settle) {
      const amp = s.maxEnvelope();
      const best = s.bestHarmonic();
      this.seenN = best.n;
      if (amp < 5 * P.driveA) {
        if (amp >= 2.8 * P.driveA && best.corr >= 0.95) return this.finish(false, `Close: a ${best.n}-loop wave is starting to form (±${(amp * 1000).toFixed(1)} mm), but the wire isn’t quite at resonance. Fine-tune.`);
        return this.finish(false, `It barely moves (±${(amp * 1000).toFixed(1)} mm). ${this.f().toFixed(1)} Hz isn’t a natural frequency of this wire.`);
      }
      if (best.n !== P.goalN || best.corr < 0.9) return this.finish(false, `It rings, but with ${best.n} loop${best.n === 1 ? '' : 's'}, not ${P.goalN}.`);
      this.finish(true, `Resonating with ${P.goalN} loops (±${(amp * 1000).toFixed(0)} mm).`);
    }
  }

  draw(d: Draw, t: number): void {
    const P = this.params;
    d.clear();
    d.grid(0.1, 'm', 5);
    const L = this.L();
    const Lmax = isFixed(P.L) ? P.L.fixed : P.L.max;
    const y0 = P.view.y + P.view.h * 0.55;
    // Scale so a typical resonance fills the view; grow the scale down if it would clip.
    let peak = 0;
    for (let i = 0; i < this.disp.length; i++) peak = Math.max(peak, this.disp[i]);
    const scale = (P.view.h * 0.3) / Math.max(12 * P.driveA, peak * 1.05);
    // Bench
    d.slab(-0.15, y0 - P.view.h * 0.42, Lmax + 0.5, 0.06);
    // Driver
    d.rect(-0.14, y0 - 0.08, 0.12, 0.16, C.steel, C.magenta, 2);
    d.text(-0.08, y0 + 0.14, `${this.f().toFixed(1)} Hz`, 12, C.magenta);
    // Far bridge and pulley with hanging mass
    d.path([{ x: L, y: y0 }, { x: L - 0.03, y: y0 - 0.12 }, { x: L + 0.03, y: y0 - 0.12 }], C.steelEdge, 2, true, C.steel);
    const px = Lmax + 0.25;
    d.line(L, y0, px, y0, 'rgba(201,214,227,0.5)', 1.5);
    d.circleW(px, y0 - 0.04, 0.04, C.steelEdge, C.steel, 2);
    d.line(px + 0.04, y0 - 0.04, px + 0.04, y0 - 0.25, '#c9d6e3', 1.5);
    const mh = 0.05 + Math.sqrt(this.M()) * 0.03;
    d.rect(px + 0.04 - mh / 2, y0 - 0.25 - mh, mh, mh, '#2a2f3a', C.amber, 2);
    d.text(px + 0.1, y0 - 0.27 - mh / 2, `${this.M().toFixed(2)} kg`, 12, C.amber, 'left');
    // Dampers
    for (const fr of P.dampers ?? []) {
      d.rect(fr * L - 0.015, y0 + 0.01, 0.03, 0.05, '#5a3a3a', C.red, 1.5);
      d.text(fr * L, y0 + 0.09, 'felt', 11, C.red);
    }
    d.dimension(0, y0 - P.view.h * 0.3, L, y0 - P.view.h * 0.3, `L = ${L.toFixed(3)} m`, 0);
    // String
    const s = this.sim;
    if (s && this.status !== 'edit') {
      const n = s.n;
      const up: { x: number; y: number }[] = [], dn: { x: number; y: number }[] = [];
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * L;
        const a = Math.min(P.view.h * 0.35, this.disp[i] * scale);
        up.push({ x, y: y0 + a });
        dn.unshift({ x, y: y0 - a });
      }
      d.path([...up, ...dn], 'rgba(62,230,255,0)', 0, true, 'rgba(62,230,255,0.12)');
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push({ x: (i / n) * L, y: y0 + Math.max(-P.view.h * 0.35, Math.min(P.view.h * 0.35, s.y[i] * scale)) });
      d.glowPath(pts, C.cyan, 2);
    } else {
      d.line(0, y0, L, y0, '#c9d6e3', 2);
    }
    const w = P.wires[P.wires.length > 1 ? this.values.wire ?? 0 : 0];
    d.text(P.view.x + 0.02, P.view.y + P.view.h - 0.02, `Goal: a standing wave with ${P.goalN} loop${P.goalN === 1 ? '' : 's'} · ${w.label} wire μ = ${(w.mu * 1000).toFixed(1)} g/m · T = ${(this.M() * G_EARTH).toFixed(1)} N`, 13, C.dim, 'left', 'top');
    if (this.status !== 'edit' && this.seenN) d.text(P.view.x + P.view.w - 0.02, P.view.y + P.view.h - 0.02, `${this.seenN} loop${this.seenN === 1 ? '' : 's'}`, 15, C.cyan, 'right', 'top');
    if (this.showGuide && this.status !== 'running') {
      const sol = this.def.solution;
      const key = Object.keys(sol)[0];
      d.text(P.view.x + 0.02, P.view.y + P.view.h - 0.1, `Calibration log: ${key} ≈ ${sol[key]}`, 13, C.amber, 'left', 'top');
    }
    void t;
  }
}

/* ================================================================ coupled */

export interface CoupledParams {
  view: View;
  L: number;
  m: number;
  k: Knob;
  theta0: number;
  window: { min: number; max: number };
  maxT: number;
}

class CoupledPuzzle extends Puzzle<CoupledParams> {
  private sim = new CoupledPendulums(1, 1, 1, 0);
  private hit: number | null = null;
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const k = this.params.k;
    return isFixed(k) ? [] : [{ kind: 'slider', id: 'k', label: 'Coupling spring', min: k.min, max: k.max, step: k.step, fmt: (v) => `${v.toFixed(2)} N/m` }];
  }
  k(): number { return isFixed(this.params.k) ? this.params.k.fixed : this.values.k; }
  protected start(): void {
    const P = this.params;
    this.sim = new CoupledPendulums(P.L, P.m, this.k(), P.theta0 * DEG);
    this.hit = null;
  }
  protected advance(dt: number): void {
    const P = this.params;
    const sub = 30, h = (dt * 2) / sub; // twice real time
    for (let i = 0; i < sub; i++) {
      this.sim.step(h);
      const [e1, e2] = this.sim.energies();
      if (e2 / (e1 + e2) >= 0.97) {
        this.hit = this.sim.t;
        break;
      }
    }
    this.simT = this.sim.t;
    if (this.hit !== null) {
      if (this.hit < P.window.min) return this.finish(false, `The energy arrived at ${this.hit.toFixed(1)} s, before the latch window opened (${P.window.min}–${P.window.max} s). The coupling is too strong.`);
      if (this.hit <= P.window.max) return this.finish(true, `All the energy reached the bolt pendulum at ${this.hit.toFixed(1)} s. Latch released.`);
      return this.finish(false, `The energy arrived at ${this.hit.toFixed(1)} s, after the window closed.`);
    }
    if (this.simT > Math.max(P.window.max + 0.5, P.maxT)) this.finish(false, `At ${P.window.max} s the bolt pendulum still had only part of the energy. The coupling is too weak (or too lopsided).`);
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.25, 'm', 4);
    const top = P.view.y + P.view.h - 0.3;
    const gap = 0.6;
    const th = this.status === 'edit' ? [P.theta0 * DEG, 0] : [this.sim.y[0], this.sim.y[2]];
    const bobs = [-gap / 2, gap / 2].map((x, i) => ({ px: x, bx: x + P.L * Math.sin(th[i]), by: top - P.L * Math.cos(th[i]) }));
    d.rect(-gap / 2 - 0.2, top, gap + 0.4, 0.05, C.steel, C.steelEdge, 2);
    // spring between bobs
    const a = bobs[0], b = bobs[1];
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      const off = i === 0 || i === 12 ? 0 : (i % 2 ? 0.03 : -0.03);
      pts.push({ x: a.bx + (b.bx - a.bx) * f, y: a.by + (b.by - a.by) * f + off });
    }
    d.path(pts, C.amber, 1.5);
    bobs.forEach((bb, i) => {
      d.line(bb.px, top, bb.bx, bb.by, '#c9d6e3', 2);
      d.circleW(bb.bx, bb.by, 0.06, i ? C.green : C.cyan, i ? 'rgba(77,255,154,0.25)' : 'rgba(62,230,255,0.25)', 2.5);
      d.text(bb.bx, bb.by - 0.12, i ? 'bolt' : 'driver', 12, i ? C.green : C.cyan);
    });
    // energy bars
    const [e1, e2] = this.status === 'edit' ? [1, 0] : this.sim.energies();
    const tot = e1 + e2 || 1;
    const bx = P.view.x + P.view.w - 0.5, by = P.view.y + 0.25;
    d.rect(bx, by, 0.12, (e1 / tot) * 0.8, C.cyan);
    d.rect(bx + 0.2, by, 0.12, (e2 / tot) * 0.8, C.green);
    d.text(bx + 0.06, by - 0.08, 'E₁', 12, C.cyan);
    d.text(bx + 0.26, by - 0.08, 'E₂', 12, C.green);
    // timeline
    const x0 = P.view.x + 0.15, x1 = P.view.x + P.view.w - 0.8, ty = P.view.y + 0.12;
    const T = Math.max(P.window.max + 1, P.maxT);
    const X = (t: number) => x0 + ((x1 - x0) * t) / T;
    d.line(x0, ty, x1, ty, C.steelEdge, 2);
    d.rect(X(P.window.min), ty - 0.04, X(P.window.max) - X(P.window.min), 0.08, 'rgba(77,255,154,0.25)');
    d.text(X((P.window.min + P.window.max) / 2), ty + 0.1, 'latch window', 11, C.green);
    if (this.status !== 'edit') d.line(X(Math.min(T, this.simT)), ty - 0.06, X(Math.min(T, this.simT)), ty + 0.06, C.white, 2);
    d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.05, `L = ${P.L} m · m = ${P.m} kg · k = ${this.k().toFixed(2)} N/m`, 13, C.dim, 'left', 'top');
    if (this.status !== 'edit') d.text(P.view.x + P.view.w - 0.05, P.view.y + P.view.h - 0.05, `t = ${this.simT.toFixed(1)} s`, 15, C.cyan, 'right', 'top');
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.15, `Calibration log: k ≈ ${this.def.solution.k.toFixed(2)} N/m (transfer ${transferTime(P.L, P.m, this.def.solution.k).toFixed(1)} s)`, 13, C.amber, 'left', 'top');
  }
}

/* ================================================================ doppler */

export interface DopplerParams {
  view: View;
  /** Source frequency (Hz) and speed of sound (m/s). */
  f0: number;
  v: number;
  /** Source speed toward the listener (m/s): control `vs` or fixed. */
  vs: Knob;
  /** Listener speed toward the source (m/s): control `vo` or fixed. */
  vo: Knob;
  /** Reference tone (Hz): control `fr` or fixed. */
  ref: Knob;
  tol: number;
  sourceLabel: string;
}

class DopplerPuzzle extends Puzzle<DopplerParams> {
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!isFixed(P.ref)) out.push({ kind: 'slider', id: 'fr', label: 'Reference tone', min: P.ref.min, max: P.ref.max, step: P.ref.step, fmt: (v) => `${v.toFixed(1)} Hz` });
    if (!isFixed(P.vo)) out.push({ kind: 'slider', id: 'vo', label: 'Your cart speed (+ toward the source)', min: P.vo.min, max: P.vo.max, step: P.vo.step, fmt: (v) => `${v.toFixed(1)} m/s` });
    if (!isFixed(P.vs)) out.push({ kind: 'slider', id: 'vs', label: 'Source speed (+ toward you)', min: P.vs.min, max: P.vs.max, step: P.vs.step, fmt: (v) => `${v.toFixed(1)} m/s` });
    return out;
  }
  val(k: Knob, id: string): number { return isFixed(k) ? k.fixed : this.values[id]; }
  heard(): number { const P = this.params; return doppler(P.f0, P.v, this.val(P.vs, 'vs'), this.val(P.vo, 'vo')); }
  ref(): number { return this.val(this.params.ref, 'fr'); }
  protected start(): void {
    audio.beats(this.heard(), this.ref(), 2.6);
  }
  protected advance(dt: number): void {
    this.simT += dt;
    if (this.simT < 2.8) return;
    const beat = Math.abs(this.heard() - this.ref());
    if (beat <= this.params.tol) return this.finish(true, `Zero beat. You hear the ${this.params.sourceLabel} at ${this.heard().toFixed(1)} Hz, matching ${this.ref().toFixed(1)} Hz.`);
    this.finish(false, `Beats at ${beat.toFixed(1)} per second: the tones don’t match yet.`);
  }
  draw(d: Draw, time: number): void {
    const P = this.params;
    d.clear();
    const v = P.view;
    const tau = this.status === 'edit' ? time % 4 : this.simT;
    // Scene: source on the left moving right (toward the listener on the right).
    const vs = this.val(P.vs, 'vs'), vo = this.val(P.vo, 'vo');
    const cDisp = 1.6; // display units per second for sound
    const ex = 5; // speeds exaggerated ×5 for visibility
    const sx0 = v.x + 0.8, ly = v.y + v.h * 0.62;
    const srcX = sx0 + cDisp * ((vs * ex) / P.v) * tau;
    const lisX = v.x + v.w - 0.9 - cDisp * ((vo * ex) / P.v) * tau;
    d.line(v.x, ly - 0.3, v.x + v.w, ly - 0.3, C.steelEdge, 2);
    for (let k = 0; k < 14; k++) {
      const te = k * 0.3;
      if (te > tau) break;
      const ex0 = sx0 + cDisp * ((vs * ex) / P.v) * te;
      const r = cDisp * (tau - te);
      d.ctx.globalAlpha = Math.max(0, 0.5 - r / 12);
      d.circleW(ex0, ly, r, C.violet, undefined, 1.5);
      d.ctx.globalAlpha = 1;
    }
    d.rect(srcX - 0.3, ly - 0.25, 0.6, 0.4, '#2a2f3a', C.amber, 2);
    d.text(srcX, ly + 0.28, P.sourceLabel, 12, C.amber);
    if (vs) d.arrow(srcX, ly + 0.5, srcX + Math.sign(vs) * 0.5, ly + 0.5, C.amber);
    d.circleW(lisX, ly, 0.18, C.cyan, 'rgba(62,230,255,0.2)', 2);
    d.text(lisX, ly + 0.28, 'you', 12, C.cyan);
    if (vo) d.arrow(lisX, ly + 0.5, lisX - Math.sign(vo) * 0.5, ly + 0.5, C.cyan);
    d.text(v.x + 0.1, v.y + v.h - 0.08, `${P.sourceLabel}: ${P.f0} Hz · sound ${P.v} m/s · source ${vs.toFixed(1)} m/s · you ${vo.toFixed(1)} m/s (motion drawn ×5)`, 13, C.dim, 'left', 'top');
    // Beat strip: what you hear, heard tone + reference.
    const by = v.y + v.h * 0.22, bh = v.h * 0.13;
    const df = Math.abs(this.heard() - this.ref());
    const x0 = v.x + 0.2, x1 = v.x + v.w - 0.2;
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const tt = (i / 300) * 2; // 2 seconds
      const env = Math.abs(Math.cos(Math.PI * df * tt));
      pts.push({ x: x0 + (x1 - x0) * (i / 300), y: by + bh * env * Math.cos(2 * Math.PI * 12 * tt) });
    }
    d.path(pts, this.status === 'win' ? C.green : C.cyan, 1.2);
    d.text(x0, by + bh + 0.15, this.status === 'edit' ? 'Sound check: press Run to listen' : `What you hear over 2 s (heard tone + reference)`, 12, C.dim, 'left');
    if (this.showGuide && this.status !== 'running') {
      const key = Object.keys(this.def.solution)[0];
      d.text(v.x + 0.1, v.y + v.h - 0.35, `Calibration log: ${key} ≈ ${this.def.solution[key]}`, 13, C.amber, 'left', 'top');
    }
  }
}

/* ================================================================ YDSE */

export interface YdseParams {
  view: View;
  /** Wavelengths: choose one (control `lam`), or use all at once (white light). */
  lambdas: { label: string; nm: number; color: string }[];
  white?: boolean;
  /** Slit separation (mm): fixed, or control `d`. */
  d: Knob;
  /** Screen distance (m): fixed, or control `D`. */
  D: Knob;
  /** Thin sheet over the upper slit: index n, thickness control `th` (µm). */
  sheet?: { n: number; t: { min: number; max: number; step: number } };
  bright: number[];
  dark?: number[];
  /** Screen half-height shown (mm). */
  half: number;
}

class YdsePuzzle extends Puzzle<YdseParams> {
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!P.white && P.lambdas.length > 1) out.push({ kind: 'choice', id: 'lam', label: 'Laser', options: P.lambdas.map((l, i) => ({ value: i, label: `${l.label} ${l.nm} nm` })) });
    if (!isFixed(P.d)) out.push({ kind: 'slider', id: 'd', label: 'Slit separation', min: P.d.min, max: P.d.max, step: P.d.step, fmt: (v) => `${v.toFixed(3)} mm` });
    if (!isFixed(P.D)) out.push({ kind: 'slider', id: 'D', label: 'Screen distance', min: P.D.min, max: P.D.max, step: P.D.step, fmt: (v) => `${v.toFixed(2)} m` });
    if (P.sheet) out.push({ kind: 'slider', id: 'th', label: `Glass sheet over the upper slit (n = ${P.sheet.n})`, min: P.sheet.t.min, max: P.sheet.t.max, step: P.sheet.t.step, fmt: (v) => `${v.toFixed(2)} µm` });
    return out;
  }
  dm(): number { return (isFixed(this.params.d) ? this.params.d.fixed : this.values.d) / 1000; }
  Dm(): number { return isFixed(this.params.D) ? this.params.D.fixed : this.values.D; }
  sheetPath(): number { const s = this.params.sheet; return s ? (s.n - 1) * (this.values.th ?? 0) * 1e-6 : 0; }
  active() { const P = this.params; return P.white ? P.lambdas : [P.lambdas[P.lambdas.length > 1 ? this.values.lam ?? 0 : 0]]; }
  I(ymm: number, nm: number): number { return ydseIntensity(ymm / 1000, this.dm(), this.Dm(), nm * 1e-9, this.sheetPath()); }

  protected start(): void {}
  protected advance(dt: number): void {
    this.simT += dt;
    if (this.simT < 1.6) return;
    const P = this.params;
    for (const y of P.bright) for (const l of this.active()) {
      const i = this.I(y, l.nm);
      if (i < 0.85) return this.finish(false, `The sensor at ${y > 0 ? '+' : ''}${y.toFixed(1)} mm reads only ${(i * 100).toFixed(0)}%${P.white ? ` in ${l.label.toLowerCase()} light` : ''}. It should sit on a bright fringe.`);
    }
    for (const y of P.dark ?? []) for (const l of this.active()) {
      const i = this.I(y, l.nm);
      if (i > 0.15) return this.finish(false, `The probe at ${y > 0 ? '+' : ''}${y.toFixed(1)} mm reads ${(i * 100).toFixed(0)}%. It must sit in a dark fringe.`);
    }
    this.finish(true, P.white ? 'The white central fringe sits on the sensor.' : `Fringes locked: width ${((this.active()[0].nm * 1e-9 * this.Dm()) / this.dm() * 1000).toFixed(2)} mm.`);
  }
  draw(d: Draw, time: number): void {
    const P = this.params;
    d.clear();
    const v = P.view;
    // Schematic (not to scale) on the left.
    const sy = v.y + v.h / 2;
    const slitX = v.x + 2.2, scrX = v.x + 5.6;
    const lit = this.status !== 'edit';
    const cols = this.active().map((l) => l.color);
    d.rect(v.x + 0.2, sy - 0.15, 0.5, 0.3, C.steel, cols[0], 2);
    d.text(v.x + 0.45, sy - 0.35, P.white ? 'white lamp' : `${this.active()[0].nm} nm`, 12, cols[0]);
    d.line(slitX, v.y + 0.3, slitX, sy - 0.32, C.steelEdge, 6);
    d.line(slitX, sy - 0.18, slitX, sy + 0.18, C.steelEdge, 6);
    d.line(slitX, sy + 0.32, slitX, v.y + v.h - 0.3, C.steelEdge, 6);
    if (P.sheet && (this.values.th ?? 0) > 0) d.rect(slitX + 0.04, sy + 0.18, 0.08, 0.14, C.glass, C.glassEdge, 1.5);
    d.line(scrX, v.y + 0.3, scrX, v.y + v.h - 0.3, '#c9d6e3', 3);
    if (lit) {
      d.line(v.x + 0.7, sy, slitX, sy, cols[0], 2);
      const phase = (this.simT * 1.5) % 0.4;
      for (const yy of [sy + 0.25, sy - 0.25]) {
        for (let r = phase; r < scrX - slitX; r += 0.4) {
          d.ctx.globalAlpha = 0.35;
          d.ctx.strokeStyle = cols[0];
          d.ctx.lineWidth = 1;
          d.ctx.beginPath();
          d.ctx.arc(d.cam.X(slitX), d.cam.Y(yy), r * d.cam.scale, -0.9, 0.9);
          d.ctx.stroke();
          d.ctx.globalAlpha = 1;
        }
      }
    }
    d.text((slitX + scrX) / 2, v.y + 0.15, `d = ${(this.dm() * 1000).toFixed(3)} mm · D = ${this.Dm().toFixed(2)} m (not to scale)`, 12, C.dim);
    // Screen plot on the right: y in mm, intensity across.
    const px0 = v.x + 6.2, pw = v.w - 6.5;
    const Y = (ymm: number) => sy + (ymm / P.half) * (v.h / 2 - 0.35);
    d.line(px0, Y(-P.half), px0, Y(P.half), C.steelEdge, 1.5);
    for (let m = -Math.floor(P.half); m <= P.half; m++) {
      d.line(px0 - 0.05, Y(m), px0, Y(m), C.dim, 1);
      if (m % 2 === 0) d.text(px0 - 0.08, Y(m), `${m}`, 10, C.dim, 'right');
    }
    d.text(px0, Y(P.half) + 0.15, 'screen (mm)', 11, C.dim, 'left');
    if (lit || this.showGuide) {
      for (const l of this.active()) {
        const pts = [];
        for (let i = 0; i <= 400; i++) {
          const ymm = -P.half + (2 * P.half * i) / 400;
          pts.push({ x: px0 + pw * this.I(ymm, l.nm) * (lit ? Math.min(1, this.simT / 1.2) : 0.25), y: Y(ymm) });
        }
        d.ctx.globalCompositeOperation = 'lighter';
        d.path(pts, l.color, 2);
        d.ctx.globalCompositeOperation = 'source-over';
      }
    }
    for (const y of P.bright) { d.rect(px0 - 0.22, Y(y) - 0.05, 0.14, 0.1, C.amber); }
    for (const y of P.dark ?? []) { d.rect(px0 - 0.22, Y(y) - 0.05, 0.14, 0.1, '#5d7186'); }
    d.text(v.x + 0.1, v.y + v.h - 0.08, `Amber sensors must be bright${P.dark?.length ? ' · grey probes must be dark' : ''}${P.white ? ' in every colour at once' : ''}`, 13, C.dim, 'left', 'top');
    void time;
  }
}

registerPuzzleType('string', StringPuzzle as any);
registerPuzzleType('coupled', CoupledPuzzle as any);
registerPuzzleType('doppler', DopplerPuzzle as any);
registerPuzzleType('ydse', YdsePuzzle as any);
export { StringPuzzle, CoupledPuzzle, DopplerPuzzle, YdsePuzzle };
