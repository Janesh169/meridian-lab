/**
 * Laser routing. Slide mirrors, prisms and lenses along their mounting rails,
 * rotate them, and fire. The beam is traced with exact reflection, Snell's law
 * and total internal reflection (see physics/optics.ts).
 *
 * Before firing you only see a faint low-power "alignment beam" for the first
 * couple of segments, so the puzzle is still about predicting where light goes.
 */
import { DEG } from '../../physics/integrators';
import { curvedMirrorCenter, trace, type OpticalElement, type TraceResult, type Vec } from '../../physics/optics';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

export interface Movable {
  id: string;
  label: string;
  kind: 'mirror' | 'block' | 'curvedMirror' | 'lens';
  rail: { x1: number; y1: number; x2: number; y2: number };
  /** Angle limits in degrees. Omit to fix the angle at fixedAngle. */
  angle?: { min: number; max: number; step?: number };
  fixedAngle?: number;
  length?: number;
  /** Block outline in local coordinates (rotated by the angle, centred on the rail point). */
  shape?: Vec[];
  n?: number;
  /** Selectable materials for blocks: control `${id}.mat` picks the index. */
  materials?: { label: string; n: number }[];
  radius?: number;
  aperture?: number;
  focal?: number;
  /** Swappable lenses: control `${id}.f` picks the focal length (m) from these options. */
  focals?: number[];
}

export interface LaserParams {
  view: View;
  source: { x: number; y: number; angle: number };
  /** Parallel rays offset perpendicular to the source direction (metres). Default [0]. */
  beams?: number[];
  /** A point source: rays fan out at these angles (degrees) around the source direction. */
  fan?: number[];
  fixed: OpticalElement[];
  movables: Movable[];
  target: { x1: number; y1: number; x2: number; y2: number };
  /** How many segments of the alignment beam to show while editing. */
  preview?: number;
}

class LaserPuzzle extends Puzzle<LaserParams> {
  private version = 0;
  private cacheVer = -1;
  private cache: { els: OpticalElement[]; rays: TraceResult[] } | null = null;
  private reveal = 0; // metres of beam revealed during a run
  private totalLen = 0;
  private drag: { id: string; mode: 'move' | 'rotate'; grab: number } | null = null;

  view(): View { return this.params.view; }

  controls(): ControlSpec[] {
    const out: ControlSpec[] = [];
    for (const m of this.params.movables) {
      out.push({ kind: 'slider', id: `${m.id}.pos`, label: `${m.label}: position`, min: 0, max: 100, step: 0.5, fmt: (v) => `${v.toFixed(1)}%` });
      if (m.angle) out.push({ kind: 'slider', id: `${m.id}.ang`, label: `${m.label}: angle`, min: m.angle.min, max: m.angle.max, step: m.angle.step ?? 0.5, fmt: (v) => `${v.toFixed(1)}°` });
      if (m.focals) out.push({ kind: 'choice', id: `${m.id}.f`, label: `${m.label}: lens`, options: m.focals.map((f) => ({ value: f, label: `f = ${f > 0 ? '+' : ''}${f} m` })) });
      if (m.materials) out.push({ kind: 'choice', id: `${m.id}.mat`, label: `${m.label}: material`, options: m.materials.map((mt, i) => ({ value: i, label: `${mt.label} (n = ${mt.n})` })) });
    }
    return out;
  }

  protected changed(): void {
    this.version++;
    super.changed();
  }

  private placement(m: Movable): { x: number; y: number; ang: number } {
    const t = (this.values[`${m.id}.pos`] ?? 50) / 100;
    const r = m.rail;
    return { x: r.x1 + (r.x2 - r.x1) * t, y: r.y1 + (r.y2 - r.y1) * t, ang: (m.angle ? this.values[`${m.id}.ang`] : m.fixedAngle ?? 0) * DEG };
  }

  elements(): OpticalElement[] {
    const els: OpticalElement[] = [...this.params.fixed];
    for (const m of this.params.movables) {
      const { x, y, ang } = this.placement(m);
      switch (m.kind) {
        case 'mirror':
          els.push({ kind: 'mirror', id: m.id, x, y, length: m.length ?? 1, angle: ang });
          break;
        case 'lens':
          els.push({ kind: 'lens', id: m.id, x, y, angle: ang, height: m.length ?? 1, focal: m.focals ? this.values[`${m.id}.f`] ?? m.focals[0] : m.focal ?? 1 });
          break;
        case 'curvedMirror':
          els.push({ kind: 'curvedMirror', id: m.id, x, y, angle: ang, radius: m.radius ?? 2, aperture: m.aperture ?? 1 });
          break;
        case 'block': {
          const c = Math.cos(ang), s = Math.sin(ang);
          const n = m.materials ? m.materials[this.values[`${m.id}.mat`] ?? 0].n : m.n ?? 1.5;
          els.push({ kind: 'block', id: m.id, n, points: (m.shape ?? []).map((q) => ({ x: x + q.x * c - q.y * s, y: y + q.x * s + q.y * c })) });
          break;
        }
      }
    }
    els.push({ kind: 'target', id: 'target', ...this.params.target });
    return els;
  }

  private rayStarts(): { x: number; y: number; dx: number; dy: number }[] {
    const s = this.params.source;
    const a = s.angle * DEG;
    const dx = Math.cos(a), dy = Math.sin(a);
    if (this.params.fan) return this.params.fan.map((g) => ({ x: s.x, y: s.y, dx: Math.cos(a + g * DEG), dy: Math.sin(a + g * DEG) }));
    return (this.params.beams ?? [0]).map((o) => ({ x: s.x - dy * o, y: s.y + dx * o, dx, dy }));
  }

  traced(): { els: OpticalElement[]; rays: TraceResult[] } {
    if (this.cacheVer !== this.version || !this.cache) {
      const els = this.elements();
      const maxLen = Math.hypot(this.params.view.w, this.params.view.h) * 1.5;
      this.cache = { els, rays: this.rayStarts().map((r) => trace(r, els, 64, maxLen)) };
      this.cacheVer = this.version;
    }
    return this.cache;
  }

  protected start(): void {
    const { rays } = this.traced();
    this.totalLen = Math.max(...rays.map((r) => pathLength(r.points)));
    this.reveal = 0;
  }

  protected currentPath(): Pt[] {
    return this.traced().rays[0].points;
  }

  protected advance(dt: number): void {
    const speed = Math.max(this.params.view.w, this.params.view.h) / 1.1;
    this.reveal += speed * dt;
    if (this.reveal >= this.totalLen) {
      const { rays } = this.traced();
      const allHit = rays.every((r) => r.hitTarget === 'target');
      if (allHit) this.finish(true, rays.length > 1 ? 'Every ray converges on the photocell.' : 'Photocell lit.');
      else {
        const hits = rays.filter((r) => r.hitTarget === 'target').length;
        if (rays.length > 1 && hits > 0) this.finish(false, `${hits} of ${rays.length} rays reach the photocell. Bring them to one point.`);
        else {
          const r = rays[0];
          const miss = missDistance(r.points, this.params.target);
          const lastEl = r.touched[r.touched.length - 1];
          const what = r.escaped ? 'The beam left the room' : lastEl && this.params.fixed.find((e) => e.id === lastEl)?.kind === 'wall' ? 'The beam hit a wall' : 'The beam was blocked';
          this.finish(false, `${what}${miss < 5 ? `, missing the photocell by ${(miss * 100).toFixed(0)} cm` : ''}.`);
        }
      }
    }
  }

  /* ------------------------------------------------------------ input */

  pointerDown(p: Pt, pxPerM: number): boolean {
    if (this.status === 'running') return false;
    const grabR = 40 / pxPerM;
    let best: { id: string; mode: 'move' | 'rotate'; d: number } | null = null;
    for (const m of this.params.movables) {
      const c = this.placement(m);
      const dMove = Math.hypot(p.x - c.x, p.y - c.y);
      if (dMove < grabR && (!best || dMove < best.d)) best = { id: m.id, mode: 'move', d: dMove };
      if (m.angle) {
        const h = this.handle(m, pxPerM);
        const dRot = Math.hypot(p.x - h.x, p.y - h.y);
        if (dRot < grabR * 0.8 && (!best || dRot < best.d)) best = { id: m.id, mode: 'rotate', d: dRot };
      }
    }
    if (!best) return false;
    this.selected = best.id;
    const m = this.params.movables.find((q) => q.id === best!.id)!;
    const c = this.placement(m);
    this.drag = { id: best.id, mode: best.mode, grab: Math.atan2(p.y - c.y, p.x - c.x) - c.ang };
    if (this.status === 'fail') this.retry();
    this.changed();
    return true;
  }

  private handleDist(m: Movable, pxPerM: number): number {
    const size = m.kind === 'block' ? Math.max(...(m.shape ?? [{ x: 0.5, y: 0 }]).map((q) => Math.hypot(q.x, q.y))) : (m.length ?? 1) / 2;
    return size + 30 / pxPerM;
  }

  handle(m: Movable, pxPerM: number): Pt {
    const c = this.placement(m);
    const r = this.handleDist(m, pxPerM);
    // Handle sits along the element's own axis (along a mirror's surface, or a block's local x).
    return { x: c.x + Math.cos(c.ang) * r, y: c.y + Math.sin(c.ang) * r };
  }

  pointerMove(p: Pt): void {
    if (!this.drag) return;
    const m = this.params.movables.find((q) => q.id === this.drag!.id)!;
    if (this.drag.mode === 'move') {
      const r = m.rail;
      const ex = r.x2 - r.x1, ey = r.y2 - r.y1;
      const t = ((p.x - r.x1) * ex + (p.y - r.y1) * ey) / (ex * ex + ey * ey);
      this.set(`${m.id}.pos`, t * 100);
    } else if (m.angle) {
      const c = this.placement(m);
      let a = Math.atan2(p.y - c.y, p.x - c.x) / DEG;
      // Pick the equivalent angle closest to the current one, inside the limits.
      const cur = this.values[`${m.id}.ang`];
      while (a - cur > 180) a -= 360;
      while (cur - a > 180) a += 360;
      this.set(`${m.id}.ang`, a);
    }
  }

  pointerUp(): void { this.drag = null; }

  twist(dAngle: number): boolean {
    const m = this.params.movables.find((q) => q.id === this.selected);
    if (!m || !m.angle || this.status === 'running') return false;
    this.set(`${m.id}.ang`, this.values[`${m.id}.ang`] + dAngle / DEG);
    return true;
  }

  /* ------------------------------------------------------------ drawing */

  draw(d: Draw, t: number): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, 'm', 2);
    const { els, rays } = this.traced();
    const pxPerM = d.cam.scale;

    // Rails
    for (const m of P.movables) {
      d.line(m.rail.x1, m.rail.y1, m.rail.x2, m.rail.y2, this.selected === m.id ? 'rgba(62,230,255,0.45)' : 'rgba(127,149,171,0.35)', 6);
      d.line(m.rail.x1, m.rail.y1, m.rail.x2, m.rail.y2, C.bg, 2, [3, 5]);
    }
    // Ghost beams
    for (let i = 0; i < this.ghosts.length; i++) {
      d.ctx.globalAlpha = 0.14 + 0.1 * (i / this.ghosts.length);
      d.path(this.ghosts[i], C.magenta, 1.5, false, undefined, [4, 6]);
      d.ctx.globalAlpha = 1;
    }
    // Elements
    for (const e of els) drawElement(d, e, this.selected === e.id, rays.some((r) => r.hitTarget === 'target') && this.status !== 'edit');

    // Source
    const s = P.source;
    d.rect(s.x - 0.25, s.y - 0.15, 0.3, 0.3, C.steel, C.magenta, 2);
    d.dot(s.x, s.y, 4, C.magenta, true);

    // Beams
    if (this.status === 'edit' || (this.status === 'fail' && this.runs === 0)) {
      const n = (P.preview ?? 2) + 1;
      for (const r of rays) {
        const pts = r.points.slice(0, n);
        // Fade the last preview segment out.
        d.ctx.globalAlpha = 0.55;
        d.path(pts, C.magenta, 1.5, false, undefined, [6, 6]);
        d.ctx.globalAlpha = 1;
      }
    } else {
      const lim = this.status === 'running' ? this.reveal : Infinity;
      for (const r of rays) d.glowPath(clipPath(r.points, lim), C.magenta, 2.2);
      if (this.status !== 'running') for (const r of rays) for (const q of r.tirPoints) d.ring(q.x, q.y, 9, C.amber, 1.5);
    }

    // Calibration guide: shows where the first movable should sit.
    if (this.showGuide && this.status !== 'running' && P.movables.length) {
      const m = P.movables[0];
      const tpos = (this.def.solution[`${m.id}.pos`] ?? 50) / 100;
      const gx = m.rail.x1 + (m.rail.x2 - m.rail.x1) * tpos, gy = m.rail.y1 + (m.rail.y2 - m.rail.y1) * tpos;
      d.ring(gx, gy, 16 + 3 * Math.sin(t * 4), C.amber, 2, [3, 4]);
      d.text(gx, gy, 'calibration mark', 12, C.amber, 'center', 'top', 0, 22);
    }

    // Handles and labels
    if (this.status !== 'running') {
      for (const m of P.movables) {
        const c = this.placement(m);
        const sel = this.selected === m.id;
        d.text(c.x, c.y, m.label, 12, sel ? C.cyan : C.dim, 'center', 'bottom', 0, -26);
        if (m.angle) {
          const h = this.handle(m, pxPerM);
          d.line(c.x, c.y, h.x, h.y, sel ? 'rgba(62,230,255,0.6)' : 'rgba(127,149,171,0.4)', 1.5, [3, 3]);
          d.ring(h.x, h.y, 12, sel ? C.cyan : C.dim, 2);
          d.text(h.x, h.y, '⟳', 14, sel ? C.cyan : C.dim);
        }
        d.ring(c.x, c.y, 18, sel ? C.cyan : 'rgba(127,149,171,0.5)', sel ? 2 : 1, [4, 4]);
      }
    }
  }
}

function drawElement(d: Draw, e: OpticalElement, selected: boolean, lit: boolean): void {
  switch (e.kind) {
    case 'mirror': {
      const hx = (Math.cos(e.angle) * e.length) / 2, hy = (Math.sin(e.angle) * e.length) / 2;
      d.line(e.x - hx, e.y - hy, e.x + hx, e.y + hy, selected ? C.cyan : '#c9d6e3', 6);
      d.line(e.x - hx, e.y - hy, e.x + hx, e.y + hy, '#5d7186', 2);
      break;
    }
    case 'curvedMirror': {
      const c = curvedMirrorCenter(e);
      const R = Math.abs(e.radius);
      const half = Math.asin(Math.min(1, e.aperture / 2 / R));
      const axis = Math.atan2(e.y - c.y, e.x - c.x);
      const pts: Pt[] = [];
      for (let k = 0; k <= 24; k++) {
        const a = axis - half + (2 * half * k) / 24;
        pts.push({ x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) });
      }
      d.path(pts, selected ? C.cyan : '#c9d6e3', 6);
      d.path(pts, '#5d7186', 2);
      break;
    }
    case 'lens': {
      const hx = (Math.cos(e.angle) * e.height) / 2, hy = (Math.sin(e.angle) * e.height) / 2;
      const nx = -Math.sin(e.angle), ny = Math.cos(e.angle);
      const bulge = (e.focal > 0 ? 1 : -1) * e.height * 0.12;
      const pts: Pt[] = [];
      for (let k = 0; k <= 16; k++) { const u = k / 16 - 0.5; const b = bulge * (1 - 4 * u * u); pts.push({ x: e.x + hx * 2 * u + nx * b, y: e.y + hy * 2 * u + ny * b }); }
      for (let k = 16; k >= 0; k--) { const u = k / 16 - 0.5; const b = bulge * (1 - 4 * u * u); pts.push({ x: e.x + hx * 2 * u - nx * b, y: e.y + hy * 2 * u - ny * b }); }
      d.path(pts, selected ? C.cyan : C.glassEdge, 2, true, C.glass);
      break;
    }
    case 'block':
      d.path(e.points, selected ? C.cyan : C.glassEdge, 2, true, C.glass);
      d.text(centroid(e.points).x, centroid(e.points).y, `n=${e.n}`, 11, C.dim);
      break;
    case 'wall':
      d.line(e.x1, e.y1, e.x2, e.y2, C.steelEdge, 8);
      d.line(e.x1, e.y1, e.x2, e.y2, C.steel, 4);
      break;
    case 'target': {
      const col = lit ? C.green : C.amber;
      d.line(e.x1, e.y1, e.x2, e.y2, '#2a2a20', 10);
      d.glowPath([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }], col, lit ? 4 : 2);
      d.text((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, 'PHOTOCELL', 11, col, 'center', 'middle', 0, 18);
      break;
    }
  }
}

function centroid(pts: Vec[]): Vec {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

function pathLength(pts: Vec[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

function clipPath(pts: Vec[], len: number): Vec[] {
  if (len === Infinity) return pts;
  const out: Vec[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= len) {
      const f = (len - acc) / seg;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f });
      return out;
    }
    acc += seg;
    out.push(pts[i]);
  }
  return out;
}

/** Closest distance from the target's centre to any segment of the beam. */
function missDistance(pts: Vec[], t: { x1: number; y1: number; x2: number; y2: number }): number {
  const cx = (t.x1 + t.x2) / 2, cy = (t.y1 + t.y2) / 2;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ex = b.x - a.x, ey = b.y - a.y;
    const L2 = ex * ex + ey * ey || 1;
    const u = Math.max(0, Math.min(1, ((cx - a.x) * ex + (cy - a.y) * ey) / L2));
    best = Math.min(best, Math.hypot(a.x + ex * u - cx, a.y + ey * u - cy));
  }
  return Math.max(0, best - Math.hypot(t.x2 - t.x1, t.y2 - t.y1) / 2);
}

registerPuzzleType('laser', LaserPuzzle as any);
export { LaserPuzzle };
