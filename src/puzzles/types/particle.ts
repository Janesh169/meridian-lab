/**
 * Particle steering. Set the accelerating voltage and the E and B fields in the
 * chamber regions, then release the beam. Each species is integrated with the
 * Boris pusher in real SI units (metres, tesla, V/m), and the animation is slowed
 * down by about a million times so you can watch it.
 */
import { AMU, borisStep, cyclotronPeriod, E_CHARGE, type FieldRegion, type Particle } from '../../physics/em';
import { Trail } from '../../physics/integrators';
import { C, sci, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

export interface Species {
  label: string;
  /** charge in units of e (sign matters) */
  charge: number;
  /** mass in atomic mass units */
  massAmu: number;
  color: string;
  /** Fixed speed (m/s). If absent, the speed comes from the accelerating voltage control `V`. */
  speed?: number;
  /** Must this species reach the detector (true) or must it be kept out (false)? */
  mustHit: boolean;
  /** Launch direction offset from the emitter's angle, in degrees (for beams with a spread). */
  angleOffset?: number;
}

export interface RegionSpec {
  id: string;
  x: number; y: number; w: number; h: number;
  /** B (tesla, + = out of the page): a fixed value or a control id (millitesla). */
  B?: number | { control: string };
  /** E along y (V/m): a fixed value or a control id (kV/m). */
  Ey?: number | { control: string };
  /** B along +x, i.e. along the chamber axis (tesla): a fixed value or a control id (millitesla). */
  Bx?: number | { control: string };
  label?: string;
}

/**
 * A plane across the chamber at position x (perpendicular to the axis). It's a plate
 * with a round hole of radius r centred on (y0, z = 0), checked in 3D. 'ring': the
 * particle must thread the hole. 'detector': the hole is the detector entrance.
 */
export interface PlaneSpec { x: number; y0: number; r: number; kind: 'ring' | 'detector'; label?: string }

export interface ParticleParams {
  view: View;
  emitter: { x: number; y: number; angle: number };
  species: Species[];
  regions: RegionSpec[];
  /** Extra controls (B in mT, E in kV/m, V in volts). */
  controls: ControlSpec[];
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  /** Detector segment (2D). Optional when a 'detector' plane is used instead. */
  detector?: { x1: number; y1: number; x2: number; y2: number };
  planes?: PlaneSpec[];
  /** Grid spacing for field symbols (m). */
  symbolSpacing?: number;
  /** Simulated seconds shown per real second (default: one chamber crossing in about 2.2 s). */
  timeScale?: number;
  /** Must-hit particles have to arrive before this simulated time (s). */
  deadline?: { t: number; label: string };
}

interface Live {
  p: Particle;
  sp: Species;
  trail: Trail;
  done: boolean;
  hit: 'detector' | 'wall' | 'escaped' | 'ring' | 'plate' | null;
  dt: number;
  ringsPassed: number;
}

class ParticlePuzzle extends Puzzle<ParticleParams> {
  private live: Live[] = [];
  private timeScale = 1;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] { return this.params.controls; }

  speedOf(sp: Species): number {
    if (sp.speed !== undefined) return sp.speed;
    const V = this.values.V ?? 0;
    return Math.sqrt((2 * Math.abs(sp.charge) * E_CHARGE * V) / (sp.massAmu * AMU));
  }

  fieldRegions(): FieldRegion[] {
    return this.params.regions.map((r) => {
      const B = r.B === undefined ? 0 : typeof r.B === 'number' ? r.B : (this.values[r.B.control] ?? 0) / 1000;
      const Ey = r.Ey === undefined ? 0 : typeof r.Ey === 'number' ? r.Ey : (this.values[r.Ey.control] ?? 0) * 1000;
      const Bx = r.Bx === undefined ? 0 : typeof r.Bx === 'number' ? r.Bx : (this.values[r.Bx.control] ?? 0) / 1000;
      return { x: r.x, y: r.y, w: r.w, h: r.h, E: { x: 0, y: Ey, z: 0 }, B: { x: Bx, y: 0, z: B } };
    });
  }

  protected start(): void {
    const P = this.params;
    const regions = this.fieldRegions();
    const size = Math.max(P.view.w, P.view.h);
    let slowest = Infinity;
    const maxB = Math.max(1e-9, ...regions.map((r) => Math.hypot(r.B.x, r.B.y, r.B.z)));
    this.live = P.species.map((sp) => {
      const a = ((P.emitter.angle + (sp.angleOffset ?? 0)) * Math.PI) / 180;
      const v = Math.max(1, this.speedOf(sp));
      slowest = Math.min(slowest, v);
      const m = sp.massAmu * AMU;
      const q = sp.charge * E_CHARGE;
      // Step: small fraction of the gyration period and of the chamber crossing time.
      const dt = Math.min(cyclotronPeriod(m, q, maxB) / 300, size / v / 600);
      return { p: { x: P.emitter.x, y: P.emitter.y, z: 0, vx: v * Math.cos(a), vy: v * Math.sin(a), vz: 0, q, m } as Particle, sp, trail: new Trail(4000), done: false, hit: null, dt, ringsPassed: 0 };
    });
    for (const l of this.live) l.trail.push(l.p.x, l.p.y);
    // Show a chamber crossing by the slowest particle in about 2.2 s of real time.
    this.timeScale = P.timeScale ?? size / slowest / 2.2;
  }

  protected currentPath(): Pt[] {
    const l = this.live.find((q) => q.sp.mustHit) ?? this.live[0];
    return l ? l.trail.toArray().map(([x, y]) => ({ x, y })) : [];
  }

  protected advance(dt: number): void {
    const P = this.params;
    const regions = this.fieldRegions();
    const simDt = dt * this.timeScale;
    for (const l of this.live) {
      if (l.done) continue;
      let t = 0;
      let guard = 0;
      while (t < simDt && !l.done && guard++ < 5000) {
        const h = Math.min(l.dt, simDt - t);
        const ox = l.p.x, oy = l.p.y, oz = l.p.z;
        borisStep(l.p, regions, h);
        t += h;
        const plane = this.crossPlane(ox, oy, oz, l.p);
        if (plane) {
          if (plane === 'pass') l.ringsPassed++;
          else { l.done = true; l.hit = plane; }
        } else if (P.detector && segCross(ox, oy, l.p.x, l.p.y, P.detector)) { l.done = true; l.hit = 'detector'; }
        else if (P.walls.some((w) => segCross(ox, oy, l.p.x, l.p.y, w))) { l.done = true; l.hit = 'wall'; }
        else {
          const v = P.view;
          if (l.p.x < v.x - 0.02 || l.p.x > v.x + v.w + 0.02 || l.p.y < v.y - 0.02 || l.p.y > v.y + v.h + 0.02) { l.done = true; l.hit = 'escaped'; }
        }
        if (guard % 4 === 0 || l.done) l.trail.push(l.p.x, l.p.y);
      }
    }
    this.simT += simDt;
    const late = !!P.deadline && this.simT > P.deadline.t && this.live.some((l) => l.sp.mustHit && !l.done);
    if (late || this.live.every((l) => l.done) || this.simT > this.timeScale * 12) {
      const wrongIn = this.live.filter((l) => !l.sp.mustHit && l.hit === 'detector');
      const missing = this.live.filter((l) => l.sp.mustHit && l.hit !== 'detector');
      if (!wrongIn.length && !missing.length) this.finish(true, this.live.length > 1 ? 'Clean beam: only the right particles reach the detector.' : 'Beam locked on the detector.');
      else if (wrongIn.length) this.finish(false, `${wrongIn.map((l) => l.sp.label).join(', ')} also got in. The detector is contaminated.`);
      else {
        const l = missing[0];
        if (!l.done && P.deadline) return this.finish(false, `The ${P.deadline.label} closed at ${sci(P.deadline.t * 1e6, 2)} µs. The ${l.sp.label} beam was still on its way.`);
        const why = l.hit === 'wall' ? 'hit the chamber wall' : l.hit === 'escaped' ? 'left the chamber' : l.hit === 'ring' ? 'clipped a focusing ring' : l.hit === 'plate' ? 'hit the end plate beside the pinhole' : 'is still circling';
        this.finish(false, `The ${l.sp.label} beam ${why}.`);
      }
    }
  }

  /** Check crossings of the x-planes in 3D. Returns null if no plane was crossed. */
  private crossPlane(ox: number, oy: number, oz: number, p: Particle): null | 'pass' | 'ring' | 'plate' | 'detector' {
    const planes = this.params.planes;
    if (!planes) return null;
    for (const pl of planes) {
      if ((ox < pl.x && p.x >= pl.x) || (ox > pl.x && p.x <= pl.x)) {
        const f = (pl.x - ox) / (p.x - ox);
        const y = oy + (p.y - oy) * f, z = oz + (p.z - oz) * f;
        const inside = Math.hypot(y - pl.y0, z) <= pl.r;
        if (pl.kind === 'ring') return inside ? 'pass' : 'ring';
        return inside ? 'detector' : 'plate';
      }
    }
    return null;
  }

  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.05, 'm', 2);
    const regions = this.fieldRegions();
    // Field regions
    P.regions.forEach((r, i) => {
      const f = regions[i];
      const tint = f.B.z !== 0 || f.E.y !== 0 || f.B.x !== 0;
      d.rect(r.x, r.y, r.w, r.h, tint ? 'rgba(157,123,255,0.07)' : 'rgba(255,255,255,0.02)', 'rgba(157,123,255,0.35)', 1);
      d.fieldSymbols(r.x, r.y, r.w, r.h, Math.sign(f.B.z), P.symbolSpacing ?? 0.05, 'rgba(157,123,255,0.45)');
      if (f.E.y !== 0) {
        for (let x = r.x + 0.03; x < r.x + r.w; x += 0.08) d.arrow(x, f.E.y > 0 ? r.y + 0.01 : r.y + r.h - 0.01, x, f.E.y > 0 ? r.y + r.h - 0.01 : r.y + 0.01, 'rgba(255,182,72,0.35)', 1.5);
      }
      if (f.B.x !== 0) {
        for (let y = r.y + r.h * 0.2; y < r.y + r.h; y += r.h * 0.3) {
          const x0 = f.B.x > 0 ? r.x + 0.01 : r.x + r.w - 0.01;
          d.arrow(x0, y, f.B.x > 0 ? r.x + r.w - 0.01 : r.x + 0.01, y, 'rgba(157,123,255,0.35)', 1.5);
        }
      }
      const parts: string[] = [];
      if (f.B.x !== 0) parts.push(`B = ${(Math.abs(f.B.x) * 1000).toFixed(1)} mT ${f.B.x > 0 ? '→' : '←'} (along the axis)`);
      if (f.B.z !== 0) parts.push(`B = ${(Math.abs(f.B.z) * 1000).toFixed(1)} mT ${f.B.z > 0 ? '⊙' : '⊗'}`);
      if (f.E.y !== 0) parts.push(`E = ${(Math.abs(f.E.y) / 1000).toFixed(1)} kV/m ${f.E.y > 0 ? '↑' : '↓'}`);
      d.text(r.x + 0.01, r.y + r.h - 0.01, (r.label ? r.label + '  ' : '') + parts.join('   '), 12, C.violet, 'left', 'top', 2, 4);
    });
    // Walls and detector
    for (const w of P.walls) { d.line(w.x1, w.y1, w.x2, w.y2, C.steelEdge, 7); d.line(w.x1, w.y1, w.x2, w.y2, C.steel, 3); }
    const lit = this.status === 'win';
    const det = P.detector;
    if (det) {
      d.glowPath([{ x: det.x1, y: det.y1 }, { x: det.x2, y: det.y2 }], lit ? C.green : C.amber, 3);
      d.text((det.x1 + det.x2) / 2, (det.y1 + det.y2) / 2, 'DETECTOR', 11, lit ? C.green : C.amber, 'center', 'middle', 0, -16);
    }
    for (const pl of P.planes ?? []) {
      const top = P.view.y + P.view.h, bot = P.view.y;
      if (pl.kind === 'detector') {
        d.line(pl.x, bot, pl.x, pl.y0 - pl.r, C.steelEdge, 6);
        d.line(pl.x, pl.y0 + pl.r, pl.x, top, C.steelEdge, 6);
        d.glowPath([{ x: pl.x, y: pl.y0 - pl.r }, { x: pl.x, y: pl.y0 + pl.r }], lit ? C.green : C.amber, 2.5);
        d.text(pl.x, pl.y0 + pl.r, pl.label ?? 'PINHOLE', 11, lit ? C.green : C.amber, 'center', 'bottom', 0, -6);
      } else {
        // A ring seen edge-on: a short slot in a thin frame.
        d.line(pl.x, pl.y0 + pl.r, pl.x, pl.y0 + pl.r * 3, C.amber, 3);
        d.line(pl.x, pl.y0 - pl.r, pl.x, pl.y0 - pl.r * 3, C.amber, 3);
        d.ctx.strokeStyle = 'rgba(255,182,72,0.5)';
        d.ctx.lineWidth = 1.5;
        d.ctx.beginPath();
        d.ctx.ellipse(d.cam.X(pl.x), d.cam.Y(pl.y0), 4, pl.r * d.cam.scale, 0, 0, Math.PI * 2);
        d.ctx.stroke();
        if (pl.label) d.text(pl.x, pl.y0 - pl.r * 3, pl.label, 11, C.amber, 'center', 'top', 0, 6);
      }
    }

    // Emitter
    const E = P.emitter;
    d.rect(E.x - 0.03, E.y - 0.012, 0.03, 0.024, C.steel, C.cyan, 1.5);
    // Species legend with speeds
    let ly = P.view.y + P.view.h - 0.005;
    for (const sp of P.species) {
      const v = this.speedOf(sp);
      d.text(P.view.x + P.view.w - 0.01, ly, `${sp.label}: v = ${sci(v, 2)} m/s`, 12, sp.color, 'right', 'top', 0, 4);
      ly -= 22 / d.cam.scale;
    }
    // Ghosts
    for (let i = 0; i < this.ghosts.length; i++) {
      d.ctx.globalAlpha = 0.15 + 0.1 * (i / this.ghosts.length);
      d.path(this.ghosts[i], C.cyan, 1.2, false, undefined, [4, 6]);
      d.ctx.globalAlpha = 1;
    }
    // Calibration guide: an arc of the correct path for the first must-hit species.
    if (this.showGuide && this.status !== 'running') this.drawGuide(d);
    // Live trails
    for (const l of this.live) {
      if (l.trail.length > 1) d.glowXY(l.trail.xs, l.trail.ys, l.trail.length, l.sp.color, 1.8);
      if (this.status === 'running' && !l.done) d.dot(l.p.x, l.p.y, 4, C.white, true);
    }
  }

  private drawGuide(d: Draw): void {
    const saved = { ...this.values };
    Object.assign(this.values, this.def.solution);
    const P = this.params;
    const regions = this.fieldRegions();
    const sp = P.species.find((s) => s.mustHit) ?? P.species[0];
    const v = this.speedOf(sp);
    const a = ((P.emitter.angle + (sp.angleOffset ?? 0)) * Math.PI) / 180;
    const p: Particle = { x: P.emitter.x, y: P.emitter.y, z: 0, vx: v * Math.cos(a), vy: v * Math.sin(a), vz: 0, q: sp.charge * E_CHARGE, m: sp.massAmu * AMU };
    const size = Math.max(P.view.w, P.view.h);
    const dt = Math.max(1, v) > 1 ? size / v / 400 : (P.timeScale ?? 1e-6) / 200;
    const pts: Pt[] = [{ x: p.x, y: p.y }];
    for (let i = 0; i < 160; i++) { borisStep(p, regions, dt); if (i % 4 === 0) pts.push({ x: p.x, y: p.y }); }
    this.values = saved;
    d.path(pts, C.amber, 2, false, undefined, [2, 7]);
  }
}

function segCross(ax: number, ay: number, bx: number, by: number, s: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const d1x = bx - ax, d1y = by - ay, d2x = s.x2 - s.x1, d2y = s.y2 - s.y1;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-18) return false;
  const t = ((s.x1 - ax) * d2y - (s.y1 - ay) * d2x) / den;
  const u = ((s.x1 - ax) * d1y - (s.y1 - ay) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

registerPuzzleType('particle', ParticlePuzzle as any);
export { ParticlePuzzle };
