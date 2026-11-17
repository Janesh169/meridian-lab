/**
 * Projectile launcher. Lob a supply capsule into a cradle. The flight follows the
 * exact solution x = x₀ + u cosθ t, y = y₀ + u sinθ t − ½gt², and collisions are
 * checked on the segment between frames, so nothing tunnels through walls.
 */
import { DEG, G_EARTH } from '../../physics/integrators';
import { posAt, segmentHitsRect, type Launch, type Rect } from '../../physics/projectile';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

export interface ProjectileParams {
  view: View;
  launcher: { x: number; y: number };
  /** Angle slider (degrees); omit min/max to fix the angle at `fixed`. */
  angle: { min: number; max: number; step?: number } | { fixed: number };
  speed: { min: number; max: number; step?: number } | { fixed: number };
  /** The cradle. Its top edge is the opening. vx makes it move (cart). */
  target: Rect & { vx?: number };
  /** Solid terrain (drawn as floor slabs). */
  platforms: Rect[];
  /** Other obstacles (walls, ceilings). */
  hazards?: Rect[];
  g?: number;
  /** Show Δx/Δy dimension lines to the target. */
  showDims?: boolean;
}

class ProjectilePuzzle extends Puzzle<ProjectileParams> {
  private launch: Launch | null = null;
  private path: Pt[] = [];
  private cap: Pt | null = null;
  private landed: Pt | null = null;

  view(): View { return this.params.view; }

  controls(): ControlSpec[] {
    const p = this.params;
    const out: ControlSpec[] = [];
    if (!('fixed' in p.angle)) out.push({ kind: 'slider', id: 'angle', label: 'Launch angle', min: p.angle.min, max: p.angle.max, step: p.angle.step ?? 0.5, unit: '°', fmt: (v) => `${v.toFixed(1)}°` });
    if (!('fixed' in p.speed)) out.push({ kind: 'slider', id: 'speed', label: 'Launch speed', min: p.speed.min, max: p.speed.max, step: p.speed.step ?? 0.1, fmt: (v) => `${v.toFixed(1)} m/s` });
    return out;
  }

  angle(): number { return 'fixed' in this.params.angle ? this.params.angle.fixed : this.values.angle; }
  speed(): number { return 'fixed' in this.params.speed ? this.params.speed.fixed : this.values.speed; }
  g(): number { return this.params.g ?? G_EARTH; }

  targetX(t: number): number {
    return this.params.target.x + (this.params.target.vx ?? 0) * t;
  }

  protected start(): void {
    const p = this.params;
    this.launch = { x0: p.launcher.x, y0: p.launcher.y, speed: this.speed(), angle: this.angle() * DEG, g: this.g() };
    this.path = [{ x: p.launcher.x, y: p.launcher.y }];
    this.cap = { x: p.launcher.x, y: p.launcher.y };
    this.landed = null;
  }

  protected currentPath(): Pt[] { return this.path; }

  protected advance(dt: number): void {
    if (!this.launch) return;
    const p = this.params;
    // Sub-step for precise collision checks.
    const sub = 8;
    for (let i = 0; i < sub && this.status === 'running'; i++) {
      const t0 = this.simT;
      const t1 = t0 + dt / sub;
      const a = posAt(this.launch, t0), b = posAt(this.launch, t1);
      this.simT = t1;
      this.cap = { x: b.x, y: b.y };
      this.path.push({ x: b.x, y: b.y });
      const tx = this.targetX(t1);
      const T = { ...p.target, x: tx };
      const top = T.y + T.h;
      // Into the cradle: crosses the top opening while falling.
      if (a.y >= top && b.y < top) {
        const f = (a.y - top) / (a.y - b.y);
        const cx = a.x + (b.x - a.x) * f;
        if (cx > T.x + 0.05 && cx < T.x + T.w - 0.05) {
          this.landed = { x: cx, y: top };
          this.finish(true, 'Capsule secured.');
          return;
        }
      }
      const solids: Rect[] = [...p.platforms, ...(p.hazards ?? []), T];
      for (const r of solids) {
        if (segmentHitsRect(a.x, a.y, b.x, b.y, r)) {
          this.landed = { x: b.x, y: b.y };
          const miss = b.x - (tx + T.w / 2);
          const hitWall = (p.hazards ?? []).includes(r);
          const where = r === T ? 'Bounced off the cradle rim' : hitWall ? 'Hit the wall' : Math.abs(miss) < 0.05 ? 'Just missed' : `Landed ${Math.abs(miss).toFixed(1)} m ${miss < 0 ? 'short' : 'long'}`;
          this.finish(false, where + '.');
          return;
        }
      }
      const v = p.view;
      if (b.y < v.y - 2 || b.x > v.x + v.w + 3 || b.x < v.x - 3 || this.simT > 30) {
        const miss = b.x - (tx + T.w / 2);
        this.finish(false, miss > 0 ? 'Overshot. It flew out of the bay.' : 'Fell short. It dropped out of the bay.');
        return;
      }
    }
  }

  draw(d: Draw, t: number): void {
    const p = this.params;
    d.clear();
    d.grid(1, 'm', 5);
    // Platforms and hazards
    for (const r of p.platforms) d.slab(r.x, r.y, r.w, r.h);
    for (const r of p.hazards ?? []) {
      d.rect(r.x, r.y, r.w, r.h, '#1d1622', C.red, 1.5);
      // hazard stripes
      const ctx = d.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(d.cam.X(r.x), d.cam.Y(r.y + r.h), r.w * d.cam.scale, r.h * d.cam.scale);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,77,94,0.25)';
      ctx.lineWidth = 4;
      for (let k = -r.h; k < r.w + r.h; k += 0.5) d.line(r.x + k, r.y, r.x + k + r.h, r.y + r.h, 'rgba(255,77,94,0.18)', 4);
      ctx.restore();
    }
    // Ruler ticks along the launcher's level
    const L = p.launcher;
    const tx = this.status === 'edit' ? p.target.x : this.targetX(this.simT);
    const T = p.target;
    // Ghost paths
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      d.ctx.globalAlpha = 0.18 + 0.12 * (i / this.ghosts.length);
      d.path(g, C.cyan, 1.5, false, undefined, [5, 6]);
      d.ctx.globalAlpha = 1;
    }
    // Calibration guide: first 35% of a correct arc.
    if (this.showGuide && this.status !== 'running') {
      const sol = this.def.solution;
      const ang = 'fixed' in p.angle ? p.angle.fixed : sol.angle;
      const spd = 'fixed' in p.speed ? p.speed.fixed : sol.speed;
      const ln: Launch = { x0: L.x, y0: L.y, speed: spd, angle: ang * DEG, g: this.g() };
      const tFlight = ((spd * Math.sin(ang * DEG)) / this.g()) * 0.8;
      const pts: Pt[] = [];
      for (let k = 0; k <= 20; k++) { const q = posAt(ln, (tFlight * k) / 20); pts.push({ x: q.x, y: q.y }); }
      d.path(pts, C.amber, 2, false, undefined, [2, 8]);
      d.text(pts[pts.length - 1].x, pts[pts.length - 1].y, 'calibration trace', 12, C.amber, 'left', 'bottom', 6, -4);
    }
    // Target cradle
    const glow = this.status === 'win' ? C.green : C.amber;
    d.rect(tx, T.y, T.w, T.h, this.status === 'win' ? 'rgba(77,255,154,0.18)' : 'rgba(255,182,72,0.16)');
    d.text(tx + T.w / 2, T.y + T.h, 'CRADLE', 11, glow, 'center', 'bottom', 0, -8);
    d.line(tx, T.y, tx, T.y + T.h, glow, 3);
    d.line(tx + T.w, T.y, tx + T.w, T.y + T.h, glow, 3);
    d.line(tx, T.y, tx + T.w, T.y, glow, 3);
    d.glowPath([{ x: tx, y: T.y + T.h }, { x: tx + T.w, y: T.y + T.h }], glow, 1.5);
    if (T.vx) {
      // wheels
      d.dot(tx + 0.25, T.y - 0.12, 5, C.dim);
      d.dot(tx + T.w - 0.25, T.y - 0.12, 5, C.dim);
      if (this.status === 'edit') d.arrow(tx + T.w / 2, T.y + T.h + 0.6, tx + T.w / 2 + Math.sign(T.vx) * 1.2, T.y + T.h + 0.6, C.amber);
      if (this.status === 'edit') d.text(tx + T.w / 2, T.y + T.h + 1.0, `${Math.abs(T.vx).toFixed(1)} m/s`, 12, C.amber);
    }
    // Dimensions (measured from the launcher to the cradle opening)
    if (p.showDims !== false && this.status !== 'running') {
      const cx = tx + T.w / 2;
      const top = T.y + T.h;
      const dimY = Math.min(L.y, top) - Math.max(1.2, p.view.h * 0.09);
      d.dimension(L.x, dimY, cx, dimY, `Δx = ${(cx - L.x).toFixed(1)} m`, 0);
      if (Math.abs(top - L.y) > 0.3) d.dimension(tx + T.w + 0.6, L.y, tx + T.w + 0.6, top, `Δy = ${(top - L.y > 0 ? '+' : '') + (top - L.y).toFixed(1)} m`, 0);
    }
    // Launcher
    const ang = this.angle() * DEG;
    const len = Math.max(0.6, p.view.w * 0.035);
    d.circleW(L.x, L.y, len * 0.45, C.steelEdge, C.steel, 2);
    d.ctx.lineCap = 'round';
    d.line(L.x, L.y, L.x + Math.cos(ang) * len, L.y + Math.sin(ang) * len, C.cyan, 9);
    d.line(L.x, L.y, L.x + Math.cos(ang) * len, L.y + Math.sin(ang) * len, C.bg2, 4);
    // Angle arc + label
    if (this.status !== 'running') {
      const ctx = d.ctx;
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(d.cam.X(L.x), d.cam.Y(L.y), len * d.cam.scale * 1.4, -ang, 0);
      ctx.stroke();
      d.text(L.x + len * 1.6, L.y + len * 0.45, `${this.angle().toFixed(1)}°`, 13, C.cyan, 'left');
      d.text(L.x, L.y + len * 1.5, `${this.speed().toFixed(1)} m/s`, 13, C.cyan);
    }
    // Live path + capsule
    if (this.status === 'running' || this.status === 'win' || this.status === 'fail') {
      if (this.path.length > 1) d.glowPath(this.path, C.cyan, 1.8);
      const c = this.status === 'running' ? this.cap : this.landed ?? this.cap;
      if (c) d.dot(c.x, c.y, 6, this.status === 'fail' ? C.red : C.white, true);
    }
    void t;
  }
}

registerPuzzleType('projectile', ProjectilePuzzle as any);
export { ProjectilePuzzle };
