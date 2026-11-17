/**
 * Mechanism builder: four rigs from Newtonian mechanics.
 *  - incline:   release a crate down a rough ramp so it stops on a floor pad
 *  - atwood:    pick a counterweight so a lift docks gently and on time
 *  - collision: couple a launch cart to a cargo cart so the cargo stops in the dock
 *  - torque:    balance a beam on a pivot
 */
import { DEG, G_EARTH } from '../../physics/integrators';
import { atwood, beamAlpha, beamInertia, collide1D, slideStep, type SlideState, type TrackPiece } from '../../physics/mechanics';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec, type Pt } from '../framework';

/* =========================================================== incline */

export interface InclineParams {
  view: View;
  baseX: number;
  angle: { min: number; max: number };
  release: { min: number; max: number };
  surfaces: { label: string; muK: number; muS: number }[];
  floor: { muK: number; muS: number; length: number; label: string };
  pad: { x1: number; x2: number };
  crateM: number;
}

class InclinePuzzle extends Puzzle<InclineParams> {
  private st: SlideState = { s: 0, v: 0, t: 0, stopped: false, piece: 0 };
  private track: TrackPiece[] = [];
  private path: Pt[] = [];

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    return [
      { kind: 'slider', id: 'angle', label: 'Ramp angle', min: P.angle.min, max: P.angle.max, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` },
      { kind: 'slider', id: 'L', label: 'Release point (along ramp)', min: P.release.min, max: P.release.max, step: 0.05, fmt: (v) => `${v.toFixed(2)} m` },
      { kind: 'choice', id: 'surface', label: 'Ramp surface', options: P.surfaces.map((s, i) => ({ value: i, label: `${s.label} (μk ${s.muK}, μs ${s.muS})` })) },
    ];
  }
  private surface() { return this.params.surfaces[this.values.surface ?? 0]; }

  /** World position of a point at arc length s along the track. */
  posAt(s: number): Pt {
    const P = this.params;
    const th = this.values.angle * DEG;
    const L = this.values.L;
    if (s <= L) return { x: P.baseX - (L - s) * Math.cos(th), y: (L - s) * Math.sin(th) };
    return { x: P.baseX + (s - L), y: 0 };
  }

  protected start(): void {
    const sf = this.surface();
    const F = this.params.floor;
    this.track = [
      { length: this.values.L, angle: this.values.angle * DEG, muK: sf.muK, muS: sf.muS },
      { length: F.length, angle: 0, muK: F.muK, muS: F.muS },
    ];
    this.st = { s: 0, v: 0, t: 0, stopped: false, piece: 0 };
    this.path = [this.posAt(0)];
  }
  protected currentPath(): Pt[] { return this.path; }

  protected advance(dt: number): void {
    slideStep(this.track, this.st, dt);
    this.path.push(this.posAt(this.st.s));
    if (this.st.stopped) {
      const P = this.params;
      const p = this.posAt(this.st.s);
      if (this.st.s === 0) return this.finish(false, `It doesn't budge: static friction holds the crate on a ${this.values.angle.toFixed(1)}° ${this.surface().label.toLowerCase()} ramp.`);
      if (p.x >= P.pad.x1 && p.x <= P.pad.x2) return this.finish(true, `Crate parked on the pad at ${(p.x - P.baseX).toFixed(2)} m.`);
      if (this.st.piece >= this.track.length) return this.finish(false, 'The crate slid off the end of the bay.');
      const mid = (P.pad.x1 + P.pad.x2) / 2;
      return this.finish(false, p.x < mid ? `Stopped ${(P.pad.x1 - p.x).toFixed(2)} m short of the pad.` : `Slid ${(p.x - P.pad.x2).toFixed(2)} m past the pad.`);
    }
  }

  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, 'm', 2);
    const th = this.values.angle * DEG;
    const L = this.values.L;
    const rampLen = P.release.max + 0.4;
    const top = { x: P.baseX - rampLen * Math.cos(th), y: rampLen * Math.sin(th) };
    // Floor
    d.slab(P.view.x, -0.4, P.view.w, 0.4);
    d.text(P.baseX + 0.3, -0.2, `${P.floor.label} floor  μk = ${P.floor.muK}`, 12, C.dim, 'left');
    // Ramp body
    d.path([{ x: top.x, y: top.y }, { x: P.baseX, y: 0 }, { x: top.x, y: 0 }], C.steelEdge, 2, true, C.steel);
    d.line(top.x, top.y, P.baseX, 0, this.surface().muK < 0.2 ? '#cfe3f5' : this.surface().muK > 0.5 ? '#6b5a4a' : '#a6865a', 4);
    // Pad
    d.rect(P.pad.x1, -0.02, P.pad.x2 - P.pad.x1, 0.04, null);
    d.glowPath([{ x: P.pad.x1, y: 0.01 }, { x: P.pad.x2, y: 0.01 }], this.status === 'win' ? C.green : C.amber, 3);
    d.text((P.pad.x1 + P.pad.x2) / 2, 0.2, 'PAD', 12, this.status === 'win' ? C.green : C.amber);
    d.dimension(P.baseX, -0.55, P.pad.x1, -0.55, `${(P.pad.x1 - P.baseX).toFixed(1)} m`, 0);
    // Release marker
    const rel = this.posAt(0);
    if (this.status !== 'running') {
      d.ring(rel.x, rel.y, 6, C.cyan, 2);
      d.dimension(rel.x, rel.y, P.baseX, 0, `L = ${L.toFixed(2)} m`, 22);
      const ctx = d.ctx;
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(d.cam.X(P.baseX), d.cam.Y(0), 40, Math.PI, Math.PI + th);
      ctx.stroke();
      d.text(P.baseX, 0, `${this.values.angle.toFixed(1)}°`, 13, C.cyan, 'right', 'bottom', -46, -6);
    }
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      const end = g[g.length - 1];
      d.ctx.globalAlpha = 0.25;
      d.rect(end.x - 0.15, end.y, 0.3, 0.3, null, C.cyan, 1);
      d.ctx.globalAlpha = 1;
    }
    if (this.showGuide && this.status !== 'running') {
      const s = this.def.solution;
      d.text(P.view.x + 0.2, P.view.y + P.view.h - 0.2, `Calibration log: a ${s.angle}° ramp worked before.`, 13, C.amber, 'left', 'top');
    }
    // Crate
    const s = this.status === 'edit' ? 0 : this.st.s;
    const c = this.posAt(s);
    const onRamp = s < L;
    const a = onRamp ? -th : 0;
    const size = 0.3;
    const ctx = d.ctx;
    ctx.save();
    ctx.translate(d.cam.X(c.x), d.cam.Y(c.y));
    ctx.rotate(-a);
    const px = size * d.cam.scale;
    ctx.fillStyle = '#7a5a30';
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2;
    ctx.fillRect(-px / 2, -px, px, px);
    ctx.strokeRect(-px / 2, -px, px, px);
    ctx.beginPath(); ctx.moveTo(-px / 2, -px); ctx.lineTo(px / 2, 0); ctx.moveTo(px / 2, -px); ctx.lineTo(-px / 2, 0); ctx.stroke();
    ctx.restore();
    d.text(c.x, c.y + size + 0.15, `${P.crateM} kg`, 12, C.amber);
    if (this.status === 'running') d.text(P.view.x + P.view.w - 0.2, P.view.y + P.view.h - 0.2, `v = ${Math.abs(this.st.v).toFixed(2)} m/s`, 16, C.cyan, 'right', 'top');
  }
}

/* =========================================================== atwood */

export interface AtwoodParams {
  view: View;
  cargo: number;
  counter: { min: number; max: number; step: number };
  height: number;
  maxSpeed: number;
  maxTime: number;
}

class AtwoodPuzzle extends Puzzle<AtwoodParams> {
  private y = 0;
  private v = 0;
  private a = 0;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const c = this.params.counter;
    return [{ kind: 'slider', id: 'm2', label: 'Counterweight mass', min: c.min, max: c.max, step: c.step, fmt: (v) => `${v.toFixed(1)} kg` }];
  }
  protected start(): void {
    this.y = 0; this.v = 0;
    this.a = -atwood(this.params.cargo, this.values.m2).a; // + means the lift rises
  }
  protected advance(dt: number): void {
    const P = this.params;
    if (this.a <= 0) {
      this.simT += dt;
      if (this.simT > 1) this.finish(false, this.a === 0 ? 'Perfectly balanced, so nothing moves. The lift needs a net pull.' : 'The counterweight is lighter than the lift. It stays on the floor.');
      return;
    }
    const tPrev = this.simT;
    this.simT += dt;
    const tArr = Math.sqrt((2 * P.height) / this.a);
    if (tArr <= this.simT) {
      this.y = P.height;
      this.v = this.a * tArr;
      if (tArr > P.maxTime) return this.finish(false, `Arrived after ${tArr.toFixed(1)} s, but the clamp released at ${P.maxTime} s.`);
      if (this.v > P.maxSpeed) return this.finish(false, `Slammed into the dock at ${this.v.toFixed(2)} m/s (limit ${P.maxSpeed} m/s).`);
      return this.finish(true, `Docked at ${this.v.toFixed(2)} m/s after ${tArr.toFixed(1)} s.`);
    }
    if (this.simT > P.maxTime && tPrev <= P.maxTime) return this.finish(false, `Too slow: the docking clamp released at ${P.maxTime} s with the lift at ${(0.5 * this.a * P.maxTime ** 2).toFixed(1)} m.`);
    this.y = 0.5 * this.a * this.simT * this.simT;
    this.v = this.a * this.simT;
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, 'm', 2);
    const px = 0, topY = P.height + 1.6;
    const R = 0.35;
    const liftX = px - R, cwX = px + R;
    const lift = this.status === 'edit' ? 0 : this.y;
    const cwY = topY - 1.1 - lift;
    // Shaft
    d.slab(-2.5, -0.3, 5, 0.3);
    d.line(-1.1, 0, -1.1, topY, C.steelEdge, 3);
    d.line(-1.1 + 0.9, 0, -1.1 + 0.9, topY, 'rgba(59,86,113,0.4)', 1);
    // Dock
    d.glowPath([{ x: -1.1, y: P.height + 0.9 }, { x: liftX - 0.5, y: P.height + 0.9 }], this.status === 'win' ? C.green : C.amber, 3);
    d.text(-1.6, P.height + 0.9, 'DOCK', 12, this.status === 'win' ? C.green : C.amber, 'right');
    d.dimension(-1.9, 0, -1.9, P.height, `${P.height} m`, 0);
    // Pulley
    d.circleW(px, topY, R, C.steelEdge, C.steel, 3);
    d.dot(px, topY, 4, C.dim);
    // Ropes
    d.line(liftX, topY, liftX, lift + 0.9, '#c9d6e3', 2);
    d.line(cwX, topY, cwX, cwY + 0.5, '#c9d6e3', 2);
    // Lift cage
    d.rect(liftX - 0.45, lift, 0.9, 0.9, 'rgba(62,230,255,0.08)', C.cyan, 2);
    d.rect(liftX - 0.3, lift, 0.5, 0.45, '#7a5a30', C.amber, 1.5);
    d.text(liftX, lift + 0.65, `${P.cargo} kg`, 12, C.cyan);
    // Counterweight
    d.rect(cwX - 0.25, cwY, 0.5, 0.5, '#2a2f3a', C.violet, 2);
    d.text(cwX + 0.35, cwY + 0.25, `${this.values.m2.toFixed(1)} kg`, 13, C.violet, 'left');
    // Readouts
    const { a, T } = atwood(this.values.m2, P.cargo);
    const x0 = P.view.x + P.view.w - 0.1, y0 = P.view.y + P.view.h - 0.4;
    d.text(x0, y0, `Clamp holds: ${P.maxTime} s · Max docking speed: ${P.maxSpeed} m/s`, 13, C.dim, 'right', 'top');
    if (this.status !== 'edit') {
      d.text(x0, y0 - 0.45, `t = ${Math.min(this.simT, 99).toFixed(2)} s   v = ${this.v.toFixed(2)} m/s`, 16, C.cyan, 'right', 'top');
      d.text(x0, y0 - 0.85, `a = ${a.toFixed(3)} m/s²   T = ${T.toFixed(0)} N`, 13, C.dim, 'right', 'top');
    }
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.1, y0, `Calibration log: counterweight ≈ ${Math.round(this.def.solution.m2)} kg`, 13, C.amber, 'left', 'top');
  }
}

/* =========================================================== collision */

export interface CollisionParams {
  view: View;
  massesA: number[];
  speed: { min: number; max: number };
  couplers: { label: string; e: number }[];
  mB: number;
  gap: number;
  muRoll: number;
  dock: { x1: number; x2: number };
  trackEnd: number;
}

class CollisionPuzzle extends Puzzle<CollisionParams> {
  private xA = 0; private xB = 0; private vA = 0; private vB = 0; private hit = false; private stuck = false;
  private path: Pt[] = [];
  readonly w = 0.6;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    return [
      { kind: 'choice', id: 'mA', label: 'Launch cart load', options: P.massesA.map((m) => ({ value: m, label: `${m} kg` })) },
      { kind: 'slider', id: 'u', label: 'Launch speed', min: P.speed.min, max: P.speed.max, step: 0.05, fmt: (v) => `${v.toFixed(2)} m/s` },
      { kind: 'choice', id: 'cpl', label: 'Coupler', options: P.couplers.map((c, i) => ({ value: i, label: `${c.label} (e = ${c.e})` })) },
    ];
  }
  protected start(): void {
    this.xA = 0; this.xB = this.params.gap + this.w; this.vA = this.values.u; this.vB = 0; this.hit = false; this.stuck = false;
    this.path = [{ x: this.xB, y: 0 }];
  }
  protected currentPath(): Pt[] { return this.path; }
  private decel(v: number, dt: number): number {
    const dv = this.params.muRoll * G_EARTH * dt;
    return Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;
  }
  protected advance(dt: number): void {
    const P = this.params;
    const sub = 10, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      if (this.stuck) {
        this.vA = this.vB = this.decel(this.vA, h);
        this.xA += this.vA * h; this.xB += this.vB * h;
      } else {
        this.vA = this.decel(this.vA, h); this.vB = this.decel(this.vB, h);
        this.xA += this.vA * h; this.xB += this.vB * h;
        if (this.xB - this.xA <= this.w && this.vA > this.vB) {
          const e = P.couplers[this.values.cpl].e;
          const [a, b] = collide1D(this.values.mA, this.vA, P.mB, this.vB, e);
          this.vA = a; this.vB = b; this.hit = true;
          if (e === 0) this.stuck = true;
          this.xA = this.xB - this.w;
        }
      }
    }
    this.path.push({ x: this.xB, y: 0 });
    this.simT += dt;
    if (this.xB > P.trackEnd) return this.finish(false, 'The cargo cart ran off the end of the track.');
    if (this.vA === 0 && this.vB === 0 && this.simT > 0.2) {
      if (!this.hit) return this.finish(false, 'The launch cart stopped before reaching the cargo cart.');
      const c = this.xB;
      if (c >= P.dock.x1 && c <= P.dock.x2) return this.finish(true, `Cargo docked at ${c.toFixed(2)} m.`);
      return this.finish(false, c < P.dock.x1 ? `Cargo stopped ${(P.dock.x1 - c).toFixed(2)} m short of the dock.` : `Cargo overshot the dock by ${(c - P.dock.x2).toFixed(2)} m.`);
    }
    if (this.simT > 60) this.finish(false, 'Timed out.');
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, 'm', 2);
    d.slab(P.view.x, -0.35, P.view.w, 0.2);
    d.line(P.view.x, -0.15, P.trackEnd, -0.15, '#8fb3cf', 2);
    d.rect(P.trackEnd, -0.35, 0.15, 0.6, C.steel, C.red, 2);
    d.rect(P.dock.x1, -0.15, P.dock.x2 - P.dock.x1, 0.03, null);
    d.glowPath([{ x: P.dock.x1, y: -0.1 }, { x: P.dock.x2, y: -0.1 }], this.status === 'win' ? C.green : C.amber, 3);
    d.text((P.dock.x1 + P.dock.x2) / 2, -0.55, 'DOCK', 12, this.status === 'win' ? C.green : C.amber);
    d.text(P.view.x + 0.1, P.view.y + P.view.h - 0.1, `Rolling friction μ = ${P.muRoll}`, 13, C.dim, 'left', 'top');
    for (const g of this.ghosts) {
      const e = g[g.length - 1];
      d.ctx.globalAlpha = 0.25;
      d.rect(e.x - this.w / 2, -0.1, this.w, 0.45, null, C.cyan, 1);
      d.ctx.globalAlpha = 1;
    }
    const xA = this.status === 'edit' ? 0 : this.xA, xB = this.status === 'edit' ? P.gap + this.w : this.xB;
    const cart = (x: number, label: string, col: string, m: number) => {
      d.rect(x - this.w / 2, -0.1, this.w, 0.45, 'rgba(255,255,255,0.04)', col, 2);
      d.dot(x - this.w / 3, -0.12, 5, C.dim);
      d.dot(x + this.w / 3, -0.12, 5, C.dim);
      d.text(x, 0.12, `${m} kg`, 12, col);
      d.text(x, 0.48, label, 11, C.dim);
    };
    cart(xA, 'launch', C.cyan, this.values.mA);
    cart(xB, 'cargo', C.amber, P.mB);
    // coupler
    const e = P.couplers[this.values.cpl];
    d.rect(xA + this.w / 2, 0.02, 0.06, 0.15, e.e === 0 ? C.violet : '#c9d6e3');
    if (this.status === 'edit') d.arrow(xA, 0.75, xA + 0.4 + this.values.u * 0.25, 0.75, C.cyan);
    if (this.status !== 'edit') d.text(P.view.x + P.view.w - 0.1, P.view.y + P.view.h - 0.1, `vA = ${this.vA.toFixed(2)}   vB = ${this.vB.toFixed(2)} m/s`, 15, C.cyan, 'right', 'top');
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.1, P.view.y + P.view.h - 0.5, `Calibration log: ${this.def.solution.mA} kg and the ${P.couplers[this.def.solution.cpl].label.toLowerCase()} worked.`, 13, C.amber, 'left', 'top');
  }
}

/* =========================================================== torque */

export interface TorqueParams {
  view: View;
  beamL: number;
  beamM: number;
  fixed: { m: number; x: number; label: string }[];
  masses: number[];
  pos: { min: number; max: number };
  holdTime: number;
  tipAngle: number;
}

class TorquePuzzle extends Puzzle<TorqueParams> {
  private phi = 0;
  private w = 0;
  view(): View { return this.params.view; }
  controls(): ControlSpec[] {
    const P = this.params;
    return [
      { kind: 'choice', id: 'm', label: 'Counterweight', options: P.masses.map((m) => ({ value: m, label: `${m} kg` })) },
      { kind: 'slider', id: 'x', label: 'Distance from pivot', min: P.pos.min, max: P.pos.max, step: 0.05, fmt: (v) => `${v.toFixed(2)} m` },
    ];
  }
  private masses() {
    return [...this.params.fixed.map((f) => ({ m: f.m, x: f.x })), { m: this.values.m, x: this.values.x }];
  }
  protected start(): void { this.phi = 0; this.w = 0; }
  protected advance(dt: number): void {
    const P = this.params;
    const sub = 10, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      // Torque sign: positive φ = counter-clockwise.
      const alpha = beamAlpha(this.masses(), P.beamM, P.beamL, this.phi);
      this.w += alpha * h;
      this.phi += this.w * h;
    }
    this.simT += dt;
    if (Math.abs(this.phi) > P.tipAngle * DEG) return this.finish(false, this.phi > 0 ? 'The beam tipped to the left.' : 'The beam tipped to the right.');
    if (this.simT >= P.holdTime) this.finish(true, `Level for ${P.holdTime} s. Balanced.`);
  }
  draw(d: Draw): void {
    const P = this.params;
    d.clear();
    d.grid(0.25, 'm', 4);
    d.path([{ x: -0.2, y: -1 }, { x: 0.2, y: -1 }, { x: 0, y: 0 }], C.steelEdge, 2, true, C.steel);
    const phi = this.status === 'edit' ? 0 : this.phi;
    const c = Math.cos(phi), s = Math.sin(phi);
    const at = (x: number) => ({ x: x * c, y: x * s });
    const a = at(-P.beamL / 2), b = at(P.beamL / 2);
    d.line(a.x, a.y, b.x, b.y, '#c9d6e3', 8);
    for (let x = -P.beamL / 2; x <= P.beamL / 2 + 1e-9; x += 0.1) {
      const q = at(x);
      d.line(q.x, q.y - 0.03, q.x, q.y + 0.03, C.bg, 1.5);
    }
    const hang = (x: number, m: number, col: string, label: string) => {
      const q = at(x);
      d.line(q.x, q.y, q.x, q.y - 0.35, '#8fb3cf', 1.5);
      const sz = 0.08 + Math.sqrt(m) * 0.04;
      d.rect(q.x - sz / 2, q.y - 0.35 - sz, sz, sz, '#2a2f3a', col, 2);
      d.text(q.x, q.y - 0.45 - sz, `${m} kg`, 12, col);
      d.text(q.x, q.y + 0.12, label, 11, C.dim);
    };
    for (const f of P.fixed) hang(f.x, f.m, C.amber, f.label);
    hang(this.values.x, this.values.m, C.cyan, `${this.values.x.toFixed(2)} m`);
    d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.05, `Beam ${P.beamM} kg, ${P.beamL} m · must stay level for ${P.holdTime} s`, 13, C.dim, 'left', 'top');
    if (this.status !== 'edit') d.text(P.view.x + P.view.w - 0.05, P.view.y + P.view.h - 0.05, `tilt ${(phi / DEG).toFixed(2)}°`, 15, C.cyan, 'right', 'top');
    if (this.showGuide && this.status !== 'running') d.text(P.view.x + 0.05, P.view.y + P.view.h - 0.3, `Calibration log: ${this.def.solution.m} kg worked.`, 13, C.amber, 'left', 'top');
    void beamInertia;
  }
}

registerPuzzleType('incline', InclinePuzzle as any);
registerPuzzleType('atwood', AtwoodPuzzle as any);
registerPuzzleType('collision', CollisionPuzzle as any);
registerPuzzleType('torque', TorquePuzzle as any);
export { InclinePuzzle, AtwoodPuzzle, CollisionPuzzle, TorquePuzzle };
