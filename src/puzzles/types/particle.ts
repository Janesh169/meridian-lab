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
}

export interface RegionSpec {
  id: string;
  x: number; y: number; w: number; h: number;
  /** B (tesla, + = out of the page): a fixed value or a control id (millitesla). */
  B?: number | { control: string };
  /** E along y (V/m): a fixed value or a control id (kV/m). */
  Ey?: number | { control: string };
  label?: string;
}

export interface ParticleParams {
  view: View;
  emitter: { x: number; y: number; angle: number };
  species: Species[];
  regions: RegionSpec[];
  /** Extra controls (B in mT, E in kV/m, V in volts). */
  controls: ControlSpec[];
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  detector: { x1: number; y1: number; x2: number; y2: number };
  /** Grid spacing for field symbols (m). */
  symbolSpacing?: number;
}

interface Live {
  p: Particle;
  sp: Species;
  trail: Trail;
  done: boolean;
  hit: 'detector' | 'wall' | 'escaped' | null;
  dt: number;
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
      return { x: r.x, y: r.y, w: r.w, h: r.h, E: { x: 0, y: Ey, z: 0 }, B: { x: 0, y: 0, z: B } };
    });
  }

  protected start(): void {
    const P = this.params;
    const regions = this.fieldRegions();
    const a = (P.emitter.angle * Math.PI) / 180;
    const size = Math.max(P.view.w, P.view.h);
    let slowest = Infinity;
    this.live = P.species.map((sp) => {
      const v = Math.max(1, this.speedOf(sp));
      slowest = Math.min(slowest, v);
      const m = sp.massAmu * AMU;
      const q = sp.charge * E_CHARGE;
      const maxB = Math.max(1e-9, ...regions.map((r) => Math.abs(r.B.z)));
      // Step: small fraction of the gyration period and of the chamber crossing time.
      const dt = Math.min(cyclotronPeriod(m, q, maxB) / 300, size / v / 600);
      return { p: { x: P.emitter.x, y: P.emitter.y, z: 0, vx: v * Math.cos(a), vy: v * Math.sin(a), vz: 0, q, m } as Particle, sp, trail: new Trail(4000), done: false, hit: null, dt };
    });
    for (const l of this.live) l.trail.push(l.p.x, l.p.y);
    // Show a chamber crossing by the slowest particle in about 2.2 s of real time.
    this.timeScale = size / slowest / 2.2;
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
        const ox = l.p.x, oy = l.p.y;
        borisStep(l.p, regions, h);
        t += h;
        if (segCross(ox, oy, l.p.x, l.p.y, P.detector)) { l.done = true; l.hit = 'detector'; }
        else if (P.walls.some((w) => segCross(ox, oy, l.p.x, l.p.y, w))) { l.done = true; l.hit = 'wall'; }
        else {
          const v = P.view;
          if (l.p.x < v.x - 0.02 || l.p.x > v.x + v.w + 0.02 || l.p.y < v.y - 0.02 || l.p.y > v.y + v.h + 0.02) { l.done = true; l.hit = 'escaped'; }
        }
        if (guard % 4 === 0 || l.done) l.trail.push(l.p.x, l.p.y);
      }
    }
    this.simT += simDt;
    if (this.live.every((l) => l.done) || this.simT > this.timeScale * 12) {
      const wrongIn = this.live.filter((l) => !l.sp.mustHit && l.hit === 'detector');
      const missing = this.live.filter((l) => l.sp.mustHit && l.hit !== 'detector');
      if (!wrongIn.length && !missing.length) this.finish(true, this.live.length > 1 ? 'Clean beam: only the right particles reach the detector.' : 'Beam locked on the detector.');
      else if (wrongIn.length) this.finish(false, `${wrongIn.map((l) => l.sp.label).join(', ')} also got in. The detector is contaminated.`);
      else {
        const l = missing[0];
        const why = l.hit === 'wall' ? 'hit the chamber wall' : l.hit === 'escaped' ? 'left the chamber' : 'is still circling';
        this.finish(false, `The ${l.sp.label} beam ${why}.`);
      }
    }
  }

  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.05, 'm', 2);
    const regions = this.fieldRegions();
    // Field regions
    P.regions.forEach((r, i) => {
      const f = regions[i];
      const tint = f.B.z !== 0 || f.E.y !== 0;
      d.rect(r.x, r.y, r.w, r.h, tint ? 'rgba(157,123,255,0.07)' : 'rgba(255,255,255,0.02)', 'rgba(157,123,255,0.35)', 1);
      d.fieldSymbols(r.x, r.y, r.w, r.h, Math.sign(f.B.z), P.symbolSpacing ?? 0.05, 'rgba(157,123,255,0.45)');
      if (f.E.y !== 0) {
        for (let x = r.x + 0.03; x < r.x + r.w; x += 0.08) d.arrow(x, f.E.y > 0 ? r.y + 0.01 : r.y + r.h - 0.01, x, f.E.y > 0 ? r.y + r.h - 0.01 : r.y + 0.01, 'rgba(255,182,72,0.35)', 1.5);
      }
      const parts: string[] = [];
      if (f.B.z !== 0) parts.push(`B = ${(Math.abs(f.B.z) * 1000).toFixed(1)} mT ${f.B.z > 0 ? '⊙' : '⊗'}`);
      if (f.E.y !== 0) parts.push(`E = ${(Math.abs(f.E.y) / 1000).toFixed(1)} kV/m ${f.E.y > 0 ? '↑' : '↓'}`);
      d.text(r.x + 0.01, r.y + r.h - 0.01, (r.label ? r.label + '  ' : '') + parts.join('   '), 12, C.violet, 'left', 'top', 2, 4);
    });
    // Walls and detector
    for (const w of P.walls) { d.line(w.x1, w.y1, w.x2, w.y2, C.steelEdge, 7); d.line(w.x1, w.y1, w.x2, w.y2, C.steel, 3); }
    const det = P.detector;
    const lit = this.status === 'win';
    d.glowPath([{ x: det.x1, y: det.y1 }, { x: det.x2, y: det.y2 }], lit ? C.green : C.amber, 3);
    d.text((det.x1 + det.x2) / 2, (det.y1 + det.y2) / 2, 'DETECTOR', 11, lit ? C.green : C.amber, 'center', 'middle', 0, -16);

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
    const a = (P.emitter.angle * Math.PI) / 180;
    const p: Particle = { x: P.emitter.x, y: P.emitter.y, z: 0, vx: v * Math.cos(a), vy: v * Math.sin(a), vz: 0, q: sp.charge * E_CHARGE, m: sp.massAmu * AMU };
    const size = Math.max(P.view.w, P.view.h);
    const dt = size / v / 400;
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
