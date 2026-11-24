/**
 * Penning trap. A uniform magnetic field along z plus a quadrupole electric field.
 * The electric field pulls a positive ion back toward the centre along z but pushes
 * it outward radially; the magnetic field turns that outward push into a slow
 * "magnetron" circling, as long as ω_c² > 2ω_z². Each ion is integrated in 3D with
 * the Boris pusher. Top view shows the rosette; the side gauge shows the axial bounce.
 */
import { AMU, borisStepEB, E_CHARGE, penningAxialOmega, penningField, type Particle, type V3 } from '../../physics/em';
import { Trail } from '../../physics/integrators';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

type Knob = { fixed: number } | { min: number; max: number; step: number };

export interface PenningParams {
  view: View;
  /** Characteristic trap size d (m). */
  d: number;
  /** Ring electrode radius (m): beyond it an ion is lost. */
  rMax: number;
  /** End-cap distance (m): beyond it an ion is lost along the axis. */
  zMax: number;
  ions: { label: string; charge: number; massAmu: number; color: string }[];
  B: Knob;
  V: Knob;
  /** The detector locks onto this ion's axial frequency (kHz window). */
  lock?: { ion: number; min: number; max: number };
  /** How long the ions must stay trapped (simulated seconds). */
  hold: number;
  /** Starting offsets (m). */
  r0: number;
  z0: number;
  /** A saboteur's extra field along z that slowly ramps up (V/m per second of sim), if any. */
  jam?: number;
}

interface IonLive { p: Particle; trail: Trail; zs: number[]; lost: 'radial' | 'axial' | null; color: string; label: string }

class PenningPuzzle extends Puzzle<PenningParams> {
  private ions: IonLive[] = [];
  private dt = 1e-9;
  private timeScale = 1e-4;
  private E: V3 = { x: 0, y: 0, z: 0 };
  private Bv: V3 = { x: 0, y: 0, z: 0 };

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!('fixed' in P.V)) out.push({ kind: 'slider', id: 'V', label: 'Trap voltage (ring to end caps)', min: P.V.min, max: P.V.max, step: P.V.step, fmt: (v) => `${v.toFixed(2)} V` });
    if (!('fixed' in P.B)) out.push({ kind: 'slider', id: 'B', label: 'Magnet field', min: P.B.min, max: P.B.max, step: P.B.step, fmt: (v) => `${v.toFixed(2)} T` });
    return out;
  }
  B(): number { return 'fixed' in this.params.B ? this.params.B.fixed : this.values.B; }
  V(): number { return 'fixed' in this.params.V ? this.params.V.fixed : this.values.V; }
  /** Axial frequency in kHz for ion i (from theory; the run shows it bouncing at this rate). */
  fz(i: number): number {
    const ion = this.params.ions[i];
    const V = this.V();
    if (V <= 0) return 0;
    return penningAxialOmega(ion.charge * E_CHARGE, ion.massAmu * AMU, V, this.params.d) / (2 * Math.PI) / 1000;
  }

  protected start(): void {
    const P = this.params;
    const B = this.B();
    this.Bv = { x: 0, y: 0, z: B };
    let minPeriod = Infinity, slowest = 0;
    this.ions = P.ions.map((ion, i) => {
      const q = ion.charge * E_CHARGE, m = ion.massAmu * AMU;
      const wc = Math.abs(q * B) / m;
      const wz = Math.sqrt(Math.abs(q * this.V()) / (m * P.d * P.d)) || wc;
      minPeriod = Math.min(minPeriod, (2 * Math.PI) / Math.max(wc, wz, 1));
      slowest = Math.max(slowest, (2 * Math.PI) / Math.max(1, Math.min(wc, wz)));
      const a = (i * 2 * Math.PI) / P.ions.length;
      const p: Particle = { x: P.r0 * Math.cos(a), y: P.r0 * Math.sin(a), z: P.z0 * (i % 2 ? -1 : 1), vx: 0, vy: 0, vz: 0, q, m };
      const tr = new Trail(5000);
      tr.push(p.x, p.y);
      return { p, trail: tr, zs: [], lost: null, color: ion.color, label: ion.label };
    });
    this.dt = minPeriod / 120;
    this.timeScale = P.hold / 4.5;
  }
  protected currentPath(): Pt[] { return this.ions[0] ? this.ions[0].trail.toArray().map(([x, y]) => ({ x, y })) : []; }

  protected advance(dt: number): void {
    const P = this.params;
    const simDt = dt * this.timeScale;
    const V = this.V();
    for (const ion of this.ions) {
      if (ion.lost) continue;
      let t = 0, k = 0;
      while (t < simDt) {
        const h = Math.min(this.dt, simDt - t);
        penningField(ion.p.x, ion.p.y, ion.p.z, V, P.d, this.E);
        if (P.jam) this.E.z += P.jam * (this.simT + t);
        borisStepEB(ion.p, this.E, this.Bv, h);
        t += h;
        if (++k % 6 === 0) ion.trail.push(ion.p.x, ion.p.y);
        if (Math.hypot(ion.p.x, ion.p.y) > P.rMax) { ion.lost = 'radial'; break; }
        if (Math.abs(ion.p.z) > P.zMax) { ion.lost = 'axial'; break; }
      }
    }
    this.simT += simDt;
    const lost = this.ions.find((i) => i.lost);
    if (lost) {
      return this.finish(false, lost.lost === 'radial'
        ? `${lost.label} spiralled out to the ring electrode. The magnetic field isn’t strong enough to hold it radially.`
        : `${lost.label} shot out through an end cap. The voltage isn’t holding it along the axis.`);
    }
    if (this.simT >= P.hold) {
      if (P.lock) {
        const f = this.fz(P.lock.ion);
        if (f < P.lock.min || f > P.lock.max) return this.finish(false, `Both ions are trapped, but ${P.ions[P.lock.ion].label} bounces at ${f.toFixed(1)} kHz. The detector only locks at ${P.lock.min}–${P.lock.max} kHz.`);
      }
      this.finish(true, `Both ions held for ${(P.hold * 1e6).toFixed(0)} µs. Containment stable.`);
    }
  }

  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    const v = P.view;
    // Top view centred at (0,0) in metres; side gauge to the right.
    d.circleW(0, 0, P.rMax, C.amber, 'rgba(255,182,72,0.04)', 2.5);
    d.text(0, -P.rMax, 'ring electrode', 11, C.amber, 'center', 'top', 0, 4);
    d.fieldSymbols(-P.rMax * 0.9, -P.rMax * 0.9, P.rMax * 1.8, P.rMax * 1.8, 1, P.rMax / 3, 'rgba(157,123,255,0.25)');
    for (const g of this.ghosts) { d.ctx.globalAlpha = 0.15; d.path(g, C.cyan, 1, false, undefined, [3, 5]); d.ctx.globalAlpha = 1; }
    if (this.status !== 'edit') for (const ion of this.ions) {
      if (ion.trail.length > 1) d.glowXY(ion.trail.xs, ion.trail.ys, ion.trail.length, ion.lost ? C.red : ion.color, 1.2);
      d.dot(ion.p.x, ion.p.y, 4, C.white, true);
    }
    // Side gauge: z positions between the end caps.
    const gx = P.rMax * 1.9, gh = P.rMax * 0.9;
    d.line(gx - P.rMax * 0.3, gh, gx + P.rMax * 0.3, gh, C.steelEdge, 4);
    d.line(gx - P.rMax * 0.3, -gh, gx + P.rMax * 0.3, -gh, C.steelEdge, 4);
    d.text(gx, gh, 'end cap', 10, C.dim, 'center', 'bottom', 0, -4);
    d.line(gx, -gh, gx, gh, 'rgba(127,149,171,0.3)', 1, [3, 4]);
    this.ions.forEach((ion, i) => {
      if (this.status === 'edit') return;
      const zy = Math.max(-1.2, Math.min(1.2, ion.p.z / P.zMax)) * gh;
      d.dot(gx + (i - (this.ions.length - 1) / 2) * P.rMax * 0.25, zy, 5, ion.color, true);
    });
    d.text(gx, -gh, 'axial', 10, C.dim, 'center', 'top', 0, 4);
    // Readouts
    const lines = P.ions.map((ion, i) => `${ion.label} (${ion.massAmu} u, ${ion.charge > 0 ? '+' : ''}${ion.charge}e): axial ${this.fz(i).toFixed(1)} kHz`);
    const top = v.y + v.h - 0.0002 - (P.jam ? 2 : 1) * (20 / d.cam.scale);
    lines.forEach((ln, i) => d.text(v.x + 0.0002, top - i * (20 / d.cam.scale), ln, 12, P.ions[i].color, 'left', 'top'));
    d.text(v.x + 0.0002, v.y + v.h - 0.0002, `B = ${this.B().toFixed(2)} T ⊙ · V = ${this.V().toFixed(2)} V · d = ${(P.d * 1000).toFixed(1)} mm${P.lock ? ` · lock ${P.lock.min}–${P.lock.max} kHz` : ''}`, 12, C.dim, 'left', 'top');
    if (P.jam) d.text(v.x + 0.0002, v.y + v.h - 0.0002 - 20 / d.cam.scale, 'Jammer active: a stray axial field is ramping up', 12, C.red, 'left', 'top');
    if (this.status !== 'edit') d.text(v.x + v.w - 0.0002, v.y + 0.0002, `t = ${(this.simT * 1e6).toFixed(0)} / ${(P.hold * 1e6).toFixed(0)} µs`, 14, C.cyan, 'right', 'bottom');
    if (this.showGuide && this.status !== 'running') {
      const s = this.def.solution;
      d.text(v.x + 0.0002, v.y + 0.0002, `Calibration log: ${Object.entries(s).map(([k, x]) => `${k} = ${x}`).join(', ')}`, 13, C.amber, 'left', 'bottom');
    }
  }
}

registerPuzzleType('penning', PenningPuzzle as any);
export { PenningPuzzle };
