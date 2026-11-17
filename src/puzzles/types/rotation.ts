/**
 * Rotation puzzles:
 *  - rolling:  roll a drum, disc, ball or ring down a ramp to arrive at the right speed
 *  - puck:     2D collisions on an air table: knock the target puck into the slot
 *  - governor: a flyball governor (conical pendulum): set the spin so the arms open just right
 */
import { DEG, G_EARTH } from '../../physics/integrators';
import { applyFriction, collide2D, Governor, inclineMotion, rpmToOmega, type Disc } from '../../physics/rotation';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

/* ================================================================ rolling */

export interface RollingParams {
  view: View;
  /** Length of the slope (m). */
  L: number;
  angle: { min: number; max: number } | { fixed: number };
  shapes: { label: string; k: number }[];
  surface: { label: string; muS: number; muK: number };
  goal: { kind: 'speed' | 'time'; min: number; max: number };
  /** The body must roll, not skid. */
  mustRoll?: boolean;
}

class RollingPuzzle extends Puzzle<RollingParams> {
  private s = 0; private v = 0; private spin = 0; private rolls = true;
  private readonly R = 0.22;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!('fixed' in P.angle)) out.push({ kind: 'slider', id: 'angle', label: 'Ramp angle', min: P.angle.min, max: P.angle.max, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` });
    out.push({ kind: 'choice', id: 'shape', label: 'What to roll', options: P.shapes.map((s, i) => ({ value: i, label: s.label })) });
    return out;
  }
  angle(): number { return 'fixed' in this.params.angle ? this.params.angle.fixed : this.values.angle; }
  shape() { return this.params.shapes[this.values.shape ?? 0]; }
  protected start(): void { this.s = 0; this.v = 0; this.spin = 0; }
  protected advance(dt: number): void {
    const P = this.params;
    const m = inclineMotion(this.angle() * DEG, this.shape().k, P.surface.muS, P.surface.muK);
    this.rolls = m.rolls;
    const tPrev = this.simT;
    this.simT += dt;
    let t = this.simT;
    // Exact constant-acceleration kinematics; find the arrival time precisely.
    const tArr = Math.sqrt((2 * P.L) / m.a);
    if (t >= tArr) t = tArr;
    this.s = 0.5 * m.a * t * t;
    this.v = m.a * t;
    this.spin = (0.5 * m.alphaR * t * t) / this.R;
    if (t === tArr && tPrev < tArr) {
      if (P.mustRoll && !m.rolls) return this.finish(false, `It skidded instead of rolling: ${P.surface.label.toLowerCase()} can’t grip a ${this.shape().label.toLowerCase()} at ${this.angle().toFixed(1)}°.`);
      const val = P.goal.kind === 'speed' ? this.v : tArr;
      const unit = P.goal.kind === 'speed' ? 'm/s' : 's';
      const txt = `${val.toFixed(2)} ${unit}`;
      if (val < P.goal.min) return this.finish(false, P.goal.kind === 'speed' ? `Arrived at ${txt}: too slow (needs ${P.goal.min}–${P.goal.max}).` : `Arrived after ${txt}: too early (window ${P.goal.min}–${P.goal.max} s).`);
      if (val > P.goal.max) return this.finish(false, P.goal.kind === 'speed' ? `Arrived at ${txt}: too fast (needs ${P.goal.min}–${P.goal.max}).` : `Arrived after ${txt}: too late (window ${P.goal.min}–${P.goal.max} s).`);
      return this.finish(true, `Caught at ${txt}.`);
    }
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, 'm', 2);
    const th = this.angle() * DEG;
    const top = { x: 0, y: P.L * Math.sin(th) };
    const bot = { x: P.L * Math.cos(th), y: 0 };
    d.path([top, bot, { x: 0, y: 0 }], C.steelEdge, 2, true, C.steel);
    d.line(top.x, top.y, bot.x, bot.y, '#a6865a', 4);
    d.slab(P.view.x, -0.3, P.view.w, 0.3);
    // Catch cradle
    d.rect(bot.x + 0.2, 0, 0.9, 0.5, this.status === 'win' ? 'rgba(77,255,154,0.15)' : 'rgba(255,182,72,0.12)', this.status === 'win' ? C.green : C.amber, 2);
    d.text(bot.x + 0.65, 0.7, `CATCH: ${P.goal.min}–${P.goal.max} ${P.goal.kind === 'speed' ? 'm/s' : 's'}`, 12, this.status === 'win' ? C.green : C.amber);
    d.dimension(-0.3, 0, -0.3, top.y, `h = ${top.y.toFixed(2)} m`, 0);
    d.text(bot.x - 0.3, 0.12, `${this.angle().toFixed(1)}°`, 13, C.cyan, 'right');
    d.text(P.view.x + P.view.w - 0.1, P.view.y + P.view.h - 0.1, `Slope ${P.L} m · ${P.surface.label} (μs ${P.surface.muS})`, 13, C.dim, 'right', 'top');
    // Body
    const s = this.status === 'edit' ? 0 : this.s;
    const cx = top.x + s * Math.cos(th) + this.R * Math.sin(th);
    const cy = top.y - s * Math.sin(th) + this.R * Math.cos(th);
    const k = this.shape().k;
    d.circleW(cx, cy, this.R, C.cyan, k >= 1 ? 'rgba(7,11,18,0.9)' : 'rgba(62,230,255,0.25)', 3);
    if (k >= 0.6) d.circleW(cx, cy, this.R * 0.8, C.cyan, undefined, k >= 1 ? 1 : 2);
    for (let i = 0; i < 3; i++) {
      const a = -this.spin + (i * 2 * Math.PI) / 3;
      d.line(cx, cy, cx + Math.cos(a) * this.R, cy + Math.sin(a) * this.R, C.cyan, 1.5);
    }
    if (this.status !== 'edit') {
      d.text(P.view.x + P.view.w - 0.1, P.view.y + P.view.h - 0.1, `t = ${this.simT.toFixed(2)} s   v = ${this.v.toFixed(2)} m/s`, 15, C.cyan, 'right', 'top', 0, 22);
      if (!this.rolls) d.text(cx, cy + 0.5, 'SKIDDING', 13, C.red);
    }
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.1, P.view.y + P.view.h - 0.45, `Calibration log: the ${P.shapes[this.def.solution.shape].label.toLowerCase()} worked.`, 13, C.amber, 'left', 'top');
  }
}

/* ================================================================== puck */

export interface PuckParams {
  view: View;
  table: { x: number; y: number; w: number; h: number };
  cue: { x: number; y: number; m: number; r: number };
  target: { x: number; y: number; m: number; r: number };
  /** Extra stationary pucks that just get in the way (they move when hit). */
  others?: { x: number; y: number; m: number; r: number }[];
  aim: { min: number; max: number };
  speed: { min: number; max: number };
  /** Selectable cue masses (control `mc`). */
  cueMasses?: number[];
  e: number;
  eWall: number;
  mu: number;
  pocket: { x: number; y: number; r: number };
}

class PuckPuzzle extends Puzzle<PuckParams> {
  private pucks: Disc[] = [];
  private trail: Pt[] = [];
  private hitTarget = false;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [
      { kind: 'slider', id: 'aim', label: 'Aim', min: P.aim.min, max: P.aim.max, step: 0.25, fmt: (v) => `${v.toFixed(2)}°` },
      { kind: 'slider', id: 'speed', label: 'Push speed', min: P.speed.min, max: P.speed.max, step: 0.05, fmt: (v) => `${v.toFixed(2)} m/s` },
    ];
    if (P.cueMasses) out.push({ kind: 'choice', id: 'mc', label: 'Striker puck', options: P.cueMasses.map((m) => ({ value: m, label: `${m} kg` })) });
    return out;
  }
  private cueMass(): number { return this.params.cueMasses ? this.values.mc : this.params.cue.m; }
  protected start(): void {
    const P = this.params;
    const a = this.values.aim * DEG;
    this.pucks = [
      { x: P.cue.x, y: P.cue.y, vx: this.values.speed * Math.cos(a), vy: this.values.speed * Math.sin(a), m: this.cueMass(), r: P.cue.r },
      { x: P.target.x, y: P.target.y, vx: 0, vy: 0, m: P.target.m, r: P.target.r },
      ...(P.others ?? []).map((o) => ({ x: o.x, y: o.y, vx: 0, vy: 0, m: o.m, r: o.r })),
    ];
    this.trail = [{ x: P.target.x, y: P.target.y }];
    this.hitTarget = false;
  }
  protected currentPath(): Pt[] { return this.trail; }
  protected advance(dt: number): void {
    const P = this.params;
    const T = P.table;
    const sub = 20, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (const p of this.pucks) {
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.x - p.r < T.x && p.vx < 0) { p.x = T.x + p.r; p.vx = -p.vx * P.eWall; }
        if (p.x + p.r > T.x + T.w && p.vx > 0) { p.x = T.x + T.w - p.r; p.vx = -p.vx * P.eWall; }
        if (p.y - p.r < T.y && p.vy < 0) { p.y = T.y + p.r; p.vy = -p.vy * P.eWall; }
        if (p.y + p.r > T.y + T.h && p.vy > 0) { p.y = T.y + T.h - p.r; p.vy = -p.vy * P.eWall; }
        applyFriction(p, P.mu, h);
      }
      for (let i = 0; i < this.pucks.length; i++) {
        for (let j = i + 1; j < this.pucks.length; j++) {
          const a = this.pucks[i], b = this.pucks[j];
          if (Math.hypot(b.x - a.x, b.y - a.y) <= a.r + b.r && collide2D(a, b, P.e)) {
            if ((i === 0 && j === 1)) this.hitTarget = true;
          }
        }
      }
      const tg = this.pucks[1];
      const cue = this.pucks[0];
      if (Math.hypot(tg.x - P.pocket.x, tg.y - P.pocket.y) < P.pocket.r) {
        this.trail.push({ x: tg.x, y: tg.y });
        return this.finish(true, 'Bearing ball seated in the race.');
      }
      if (Math.hypot(cue.x - P.pocket.x, cue.y - P.pocket.y) < P.pocket.r) return this.finish(false, 'Your striker went into the slot instead.');
    }
    const tg = this.pucks[1];
    this.trail.push({ x: tg.x, y: tg.y });
    this.simT += dt;
    if (this.pucks.every((p) => p.vx === 0 && p.vy === 0) || this.simT > 20) {
      if (!this.hitTarget) return this.finish(false, 'The striker missed the target puck.');
      const d = Math.hypot(tg.x - P.pocket.x, tg.y - P.pocket.y) - P.pocket.r;
      this.finish(false, `The target stopped ${(d * 100).toFixed(0)} cm from the slot.`);
    }
  }
  draw(d: Draw): void {
    const P = this.params;
    const T = P.table;
    d.clear();
    d.rect(T.x, T.y, T.w, T.h, '#0b1a22', C.steelEdge, 4);
    for (let x = T.x + 0.1; x < T.x + T.w; x += 0.2) for (let y = T.y + 0.1; y < T.y + T.h; y += 0.2) d.dot(x, y, 1, 'rgba(62,230,255,0.15)');
    d.circleW(P.pocket.x, P.pocket.y, P.pocket.r, this.status === 'win' ? C.green : C.amber, 'rgba(0,0,0,0.6)', 3);
    d.text(P.pocket.x, P.pocket.y - P.pocket.r - 0.08, 'RACE SLOT', 11, this.status === 'win' ? C.green : C.amber);
    d.text(T.x + 0.05, T.y + T.h + 0.08, `Air table · friction μ = ${P.mu} · walls e = ${P.eWall} · pucks e = ${P.e}`, 12, C.dim, 'left', 'bottom');
    for (let i = 0; i < this.ghosts.length; i++) {
      d.ctx.globalAlpha = 0.2;
      d.path(this.ghosts[i], C.amber, 1.5, false, undefined, [4, 5]);
      d.ctx.globalAlpha = 1;
    }
    const show = this.status === 'edit' ? null : this.pucks;
    const cue = show ? show[0] : { ...P.cue, vx: 0, vy: 0 };
    const tg = show ? show[1] : { ...P.target, vx: 0, vy: 0 };
    const others = show ? show.slice(2) : (P.others ?? []);
    for (const o of others) d.circleW(o.x, o.y, o.r, C.dim, 'rgba(127,149,171,0.2)', 2);
    d.circleW(tg.x, tg.y, tg.r, C.amber, 'rgba(255,182,72,0.3)', 2.5);
    d.text(tg.x, tg.y, `${P.target.m}`, 11, C.amber);
    d.circleW(cue.x, cue.y, cue.r, C.cyan, 'rgba(62,230,255,0.3)', 2.5);
    d.text(cue.x, cue.y, `${this.cueMass()}`, 11, C.cyan);
    if (this.status !== 'running') {
      const a = this.values.aim * DEG;
      const len = 0.25 + this.values.speed * 0.12;
      d.arrow(P.cue.x, P.cue.y, P.cue.x + Math.cos(a) * len, P.cue.y + Math.sin(a) * len, C.cyan, 2);
    }
    if (this.trail.length > 1 && this.status !== 'edit') d.glowPath(this.trail, C.amber, 1.5);
    if (this.showGuide && this.status !== 'running') {
      const a = this.def.solution.aim * DEG;
      d.line(P.cue.x, P.cue.y, P.cue.x + Math.cos(a) * 0.6, P.cue.y + Math.sin(a) * 0.6, C.amber, 1.5, [3, 5]);
    }
  }
}

/* ============================================================== governor */

export interface GovernorParams {
  view: View;
  L: { fixed: number } | { min: number; max: number; step: number };
  rpm: { fixed: number } | { min: number; max: number; step: number };
  window: { min: number; max: number };
  settle: number;
}

class GovernorPuzzle extends Puzzle<GovernorParams> {
  private gov = new Governor(1, 1);
  private phase = 0;
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    const out: ControlSpec[] = [];
    if (!('fixed' in P.rpm)) out.push({ kind: 'slider', id: 'rpm', label: 'Spindle speed', min: P.rpm.min, max: P.rpm.max, step: P.rpm.step, fmt: (v) => `${v.toFixed(0)} rpm (${rpmToOmega(v).toFixed(2)} rad/s)` });
    if (!('fixed' in P.L)) out.push({ kind: 'slider', id: 'L', label: 'Arm length', min: P.L.min, max: P.L.max, step: P.L.step, fmt: (v) => `${v.toFixed(3)} m` });
    return out;
  }
  L(): number { return 'fixed' in this.params.L ? this.params.L.fixed : this.values.L; }
  rpm(): number { return 'fixed' in this.params.rpm ? this.params.rpm.fixed : this.values.rpm; }
  protected start(): void {
    this.gov = new Governor(this.L(), rpmToOmega(this.rpm()), 2.5, 0.02);
    this.phase = 0;
  }
  protected advance(dt: number): void {
    const P = this.params;
    const sub = 20;
    for (let i = 0; i < sub; i++) this.gov.step(dt / sub);
    this.simT = this.gov.t;
    this.phase += rpmToOmega(this.rpm()) * dt * 0.25;
    if (this.simT >= P.settle) {
      const deg = this.gov.theta / DEG;
      if (deg < P.window.min) return this.finish(false, deg < 0.5 ? 'The arms just hang: the spindle is too slow to lift them at all.' : `The arms settled at ${deg.toFixed(1)}°. The valve stays shut (needs ${P.window.min}–${P.window.max}°).`);
      if (deg > P.window.max) return this.finish(false, `The arms flew out to ${deg.toFixed(1)}° and slammed the valve (needs ${P.window.min}–${P.window.max}°).`);
      this.finish(true, `Arms steady at ${deg.toFixed(1)}°. The valve is regulating.`);
    }
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.1, 'm', 5);
    const top = { x: 0, y: P.view.y + P.view.h - 0.15 };
    const L = this.L();
    const th = this.status === 'edit' ? 0.02 : this.gov.theta;
    d.line(0, P.view.y + 0.05, 0, top.y + 0.05, '#c9d6e3', 4);
    // Window band
    const ctx = d.ctx;
    for (const [a, col] of [[P.window.min, 'rgba(77,255,154,0.35)'], [P.window.max, 'rgba(77,255,154,0.35)']] as const) {
      for (const sgn of [-1, 1]) d.line(0, top.y, sgn * L * Math.sin(a * DEG), top.y - L * Math.cos(a * DEG), col, 1, [4, 4]);
    }
    ctx.globalAlpha = 1;
    // Arms, foreshortened as they spin
    const fs = Math.cos(this.phase);
    for (const sgn of [-1, 1]) {
      const bx = sgn * L * Math.sin(th) * fs, by = top.y - L * Math.cos(th);
      d.line(0, top.y, bx, by, '#c9d6e3', 2.5);
      d.circleW(bx, by, 0.035, C.cyan, 'rgba(62,230,255,0.35)', 2);
    }
    // Valve collar rises with the arms
    const collar = top.y - L * 1.15 + L * (1 - Math.cos(th)) * 0.8;
    d.rect(-0.07, collar - 0.03, 0.14, 0.06, C.steel, C.amber, 2);
    d.text(0.12, collar, 'valve', 12, C.amber, 'left');
    d.text(P.view.x + 0.02, P.view.y + P.view.h - 0.02, `Arm ${L.toFixed(3)} m · ${this.rpm().toFixed(0)} rpm · valve works at ${P.window.min}–${P.window.max}°`, 13, C.dim, 'left', 'top');
    if (this.status !== 'edit') d.text(P.view.x + P.view.w - 0.02, P.view.y + 0.05, `θ = ${(th / DEG).toFixed(1)}°   t = ${this.simT.toFixed(1)} s`, 15, C.cyan, 'right', 'bottom');
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.02, P.view.y + P.view.h - 0.1, `Calibration log: ${'fixed' in P.rpm ? `L ≈ ${this.def.solution.L.toFixed(2)} m` : `≈ ${this.def.solution.rpm} rpm`}`, 13, C.amber, 'left', 'top');
    void G_EARTH;
  }
}

registerPuzzleType('rolling', RollingPuzzle as any);
registerPuzzleType('puck', PuckPuzzle as any);
registerPuzzleType('governor', GovernorPuzzle as any);
export { RollingPuzzle, PuckPuzzle, GovernorPuzzle };
