/**
 * Cyclotron. Two hollow "dees" sit in a uniform magnetic field with a narrow gap
 * between them. An oscillator alternates the gap voltage, and the ion gets a kick
 * every time it crosses in step. It works only if the oscillator frequency matches
 * the cyclotron frequency f = qB / (2πm), which doesn't depend on speed.
 * Integrated with the Boris pusher, with the gap field updated every step.
 */
import { AMU, borisStep, E_CHARGE, type FieldRegion, type Particle } from '../../physics/em';
import { Trail } from '../../physics/integrators';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

export interface CyclotronParams {
  view: View;
  ion: { label: string; charge: number; massAmu: number };
  /** Magnetic field: fixed (T) or a slider (T). */
  B: { fixed: number } | { min: number; max: number; step: number };
  /** Oscillator frequency: fixed (MHz) or a slider (MHz). */
  f: { fixed: number } | { min: number; max: number; step: number };
  /** Peak gap voltage (V). */
  V0: number;
  /** Gap width (m). */
  gap: number;
  /** Radius of the dees (m). */
  R: number;
  /** Extraction radius (m). */
  rExtract: number;
  /** Give up after this many cyclotron periods. */
  maxTurns: number;
}

export function cyclotronFreq(q: number, B: number, m: number): number {
  return (Math.abs(q) * B) / (2 * Math.PI * m);
}

class CyclotronPuzzle extends Puzzle<CyclotronParams> {
  private p: Particle = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, q: 1, m: 1 };
  private trail = new Trail(6000);
  private regions: FieldRegion[] = [];
  private dt = 1e-10;
  private timeScale = 1e-6;
  private peakKeV = 0;
  private tMax = 0;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!('fixed' in P.f)) out.push({ kind: 'slider', id: 'f', label: 'Oscillator frequency', min: P.f.min, max: P.f.max, step: P.f.step, fmt: (v) => `${v.toFixed(2)} MHz` });
    if (!('fixed' in P.B)) out.push({ kind: 'slider', id: 'B', label: 'Magnet field', min: P.B.min, max: P.B.max, step: P.B.step, fmt: (v) => `${v.toFixed(3)} T` });
    return out;
  }
  B(): number { return 'fixed' in this.params.B ? this.params.B.fixed : this.values.B; }
  fMHz(): number { return 'fixed' in this.params.f ? this.params.f.fixed : this.values.f; }
  private m(): number { return this.params.ion.massAmu * AMU; }
  private q(): number { return this.params.ion.charge * E_CHARGE; }
  keV(): number {
    const p = this.p;
    return (0.5 * p.m * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz)) / E_CHARGE / 1000;
  }

  protected start(): void {
    const P = this.params;
    const B = this.B();
    this.p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, q: this.q(), m: this.m() };
    this.regions = [
      { x: -P.R, y: -P.R, w: 2 * P.R, h: 2 * P.R, E: { x: 0, y: 0, z: 0 }, B: { x: 0, y: 0, z: B } },
      { x: -P.gap / 2, y: -P.R, w: P.gap, h: 2 * P.R, E: { x: 0, y: 0, z: 0 }, B: { x: 0, y: 0, z: 0 } },
    ];
    const Tc = 1 / cyclotronFreq(this.q(), B, this.m());
    this.dt = Math.min(Tc, 1 / (this.fMHz() * 1e6)) / 500;
    // About 1.6 real seconds per turn at the start, speeding up so a full run stays short.
    this.timeScale = Tc / 0.35;
    this.tMax = P.maxTurns * Tc;
    this.trail.clear();
    this.trail.push(0, 0);
    this.peakKeV = 0;
  }
  protected currentPath(): Pt[] { return this.trail.toArray().map(([x, y]) => ({ x, y })); }

  protected advance(dt: number): void {
    const P = this.params;
    const w = 2 * Math.PI * this.fMHz() * 1e6;
    const gapE = this.regions[1].E;
    const simDt = dt * this.timeScale;
    let t = 0;
    let k = 0;
    while (t < simDt) {
      const h = Math.min(this.dt, simDt - t);
      // The gap field points from the + dee to the − dee and reverses with the oscillator.
      gapE.x = (P.V0 / P.gap) * Math.cos(w * (this.simT + t));
      borisStep(this.p, this.regions, h);
      t += h;
      if (++k % 12 === 0) this.trail.push(this.p.x, this.p.y);
      const r = Math.hypot(this.p.x, this.p.y);
      if (r >= P.rExtract) {
        this.trail.push(this.p.x, this.p.y);
        this.simT += t;
        // A real orbit at the extraction radius has KE = q²B²r²/2m. An ion that merely
        // drifted out along the gap (E×B) arrives with a fraction of that.
        const design = (this.q() * this.B() * P.rExtract) ** 2 / (2 * this.m()) / E_CHARGE / 1000;
        if (this.keV() < 0.6 * design) return this.finish(false, `The ${P.ion.label.toLowerCase()} drifted out along the gap at only ${this.keV().toFixed(0)} keV. It was never kicked in step.`);
        return this.finish(true, `Extracted at ${this.keV().toFixed(0)} keV. The ${P.ion.label.toLowerCase()} beam is up to energy.`);
      }
    }
    this.simT += simDt;
    this.peakKeV = Math.max(this.peakKeV, this.keV());
    if (this.simT > this.tMax) {
      this.finish(false, `The ${P.ion.label.toLowerCase()} fell out of step with the oscillator: peak energy ${this.peakKeV.toFixed(0)} keV, never reaching the extraction radius.`);
    }
  }

  draw(d: Draw, time: number): void {
    const P = this.params;
    d.clear();
    d.grid(0.02, 'm', 5);
    const g = P.gap / 2;
    // Dees
    const phase = this.status === 'running' ? Math.cos(2 * Math.PI * this.fMHz() * 1e6 * this.simT) : Math.cos(time * 3);
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 40;
      right.push({ x: g + P.R * Math.cos(a), y: P.R * Math.sin(a) });
      left.push({ x: -g - P.R * Math.cos(a), y: P.R * Math.sin(a) });
    }
    const posCol = 'rgba(255,79,216,0.10)', negCol = 'rgba(62,230,255,0.10)';
    d.path(left, '#3b5671', 2.5, true, phase > 0 ? posCol : negCol);
    d.path(right, '#3b5671', 2.5, true, phase > 0 ? negCol : posCol);
    d.text(-P.R * 0.55, P.R * 0.85, phase > 0 ? '+' : '−', 22, phase > 0 ? C.magenta : C.cyan);
    d.text(P.R * 0.55, P.R * 0.85, phase > 0 ? '−' : '+', 22, phase > 0 ? C.cyan : C.magenta);
    d.fieldSymbols(-P.R * 0.9, -P.R * 0.9, P.R * 1.8, P.R * 1.8, 1, P.R / 4, 'rgba(157,123,255,0.25)');
    // Extraction port
    d.ring(0, 0, P.rExtract * d.cam.scale, 'rgba(255,182,72,0.35)', 1, [4, 6]);
    d.text(P.rExtract * 0.72, -P.rExtract * 0.72, 'extraction radius', 11, C.amber, 'left');
    // Ghosts
    for (const gh of this.ghosts) { d.ctx.globalAlpha = 0.2; d.path(gh, C.cyan, 1, false, undefined, [3, 5]); d.ctx.globalAlpha = 1; }
    if (this.trail.length > 1 && this.status !== 'edit') d.glowXY(this.trail.xs, this.trail.ys, this.trail.length, this.status === 'fail' ? C.red : C.cyan, 1.4);
    if (this.status === 'running') d.dot(this.p.x, this.p.y, 4, C.white, true);
    // Readouts
    const v = P.view;
    d.text(v.x + 0.005, v.y + v.h - 0.005, `${P.ion.label} (q = ${P.ion.charge > 0 ? '+' : ''}${P.ion.charge}e, m = ${P.ion.massAmu} u) · B = ${this.B().toFixed(3)} T ⊙ · oscillator ${this.fMHz().toFixed(2)} MHz · gap ${(P.V0 / 1000).toFixed(0)} kV`, 12, C.dim, 'left', 'top');
    if (this.status !== 'edit') {
      d.text(v.x + v.w - 0.005, v.y + 0.005, `E = ${this.keV().toFixed(0)} keV   r = ${(Math.hypot(this.p.x, this.p.y) * 100).toFixed(1)} cm   t = ${(this.simT * 1e6).toFixed(2)} µs`, 14, C.cyan, 'right', 'bottom');
    }
    if (this.showGuide && this.status !== 'running') {
      const sol = this.def.solution;
      d.text(v.x + 0.005, v.y + 0.005, `Calibration log: ${sol.f !== undefined ? `${sol.f.toFixed(2)} MHz` : `${sol.B.toFixed(3)} T`} worked`, 13, C.amber, 'left', 'bottom');
    }
  }
}

registerPuzzleType('cyclotron', CyclotronPuzzle as any);
export { CyclotronPuzzle };
