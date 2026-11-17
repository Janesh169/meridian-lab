/**
 * Circuit repair. Plug components into sockets, flip batteries, dial a resistance
 * box, then power on. Currents come from a full nodal (Kirchhoff) solve, and
 * capacitor timing uses a transient solve stepped in real time.
 */
import { solve, stepTransient, type CapState, type Component, type Solution } from '../../physics/circuits';
import { C, type Draw, type View } from '../../render/draw';
import { Puzzle, registerPuzzleType, type ControlSpec } from '../framework';

type Num = number | { control: string } | { sum: string[] };

export interface CircuitPart {
  id: string;
  type: 'battery' | 'resistor' | 'bulb' | 'galvanometer' | 'switch' | 'capacitor' | 'sensor' | 'coil';
  from: string;
  to: string;
  label: string;
  ohms?: Num;
  volts?: number;
  r?: number;
  /** Battery orientation control: value 1 = reversed. */
  flip?: string;
  farads?: number;
  /** Max current before it burns out (A). */
  rating?: number;
  /** Bulbs: current (A) at which it is at full brightness. */
  nominal?: number;
  /** Hide the value (e.g. an unknown sensor). */
  hidden?: boolean;
}

export type CircuitGoal =
  | { kind: 'current'; part: string; min: number; max: number; label: string }
  | { kind: 'balanced'; part: string; max: number }
  | { kind: 'notCharging'; part: string }
  | { kind: 'capThreshold'; part: string; volts: number; tMin: number; tMax: number; label: string };

export interface CircuitParams {
  view: View;
  pins: Record<string, { x: number; y: number; node: number }>;
  parts: CircuitPart[];
  wires: string[][];
  controls: ControlSpec[];
  goals: CircuitGoal[];
  /** Meters show readings while editing. */
  live?: boolean;
}

class CircuitPuzzle extends Puzzle<CircuitParams> {
  private sol: Solution | null = null;
  private capV: CapState = {};
  private tOn = 0;
  private phase: Record<string, number> = {};
  private burnt: string | null = null;
  private doorAt: number | null = null;

  view(): View { return this.params.view; }
  controls(): ControlSpec[] { return this.params.controls; }

  num(v: Num | undefined): number {
    if (v === undefined) return 0;
    if (typeof v === 'number') return v;
    if ('control' in v) return this.values[v.control] ?? 0;
    return v.sum.reduce((a, id) => a + (this.values[id] ?? 0), 0);
  }

  components(): Component[] {
    const P = this.params;
    const node = (pin: string) => P.pins[pin].node;
    const out: Component[] = [];
    for (const p of P.parts) {
      const a = node(p.from), b = node(p.to);
      switch (p.type) {
        case 'battery': {
          const rev = p.flip && this.values[p.flip] === 1;
          out.push({ kind: 'V', id: p.id, a: rev ? b : a, b: rev ? a : b, volts: p.volts ?? 0, r: p.r });
          break;
        }
        case 'switch':
          out.push({ kind: 'S', id: p.id, a, b, closed: true });
          break;
        case 'capacitor':
          out.push({ kind: 'C', id: p.id, a, b, farads: p.farads ?? 1e-3 });
          break;
        default: {
          const R = this.num(p.ohms);
          if (R > 0) out.push({ kind: 'R', id: p.id, a, b, ohms: R });
        }
      }
    }
    return out;
  }

  /** Signed current through a part from its `from` pin to its `to` pin (battery: delivered current). */
  currentOf(sol: Solution, id: string): number {
    const part = this.params.parts.find((p) => p.id === id);
    const i = sol.current[id] ?? 0;
    if (part?.type === 'battery' && part.flip && this.values[part.flip] === 1) return i; // already the delivered current
    return i;
  }

  private hasTransient(): boolean {
    return this.params.goals.some((g) => g.kind === 'capThreshold');
  }

  /** DC solution with the current settings (used for live meters and tests). */
  dc(): Solution {
    return solve(this.components());
  }

  protected start(): void {
    this.tOn = 0;
    this.burnt = null;
    this.doorAt = null;
    this.capV = {};
    for (const p of this.params.parts) if (p.type === 'capacitor') this.capV[p.id] = 0;
    this.sol = this.hasTransient() ? stepTransient(this.components(), this.capV, 1e-3).sol : this.dc();
  }

  protected advance(dt: number): void {
    this.tOn += dt;
    const P = this.params;
    if (this.hasTransient()) {
      const comps = this.components();
      const sub = 20;
      for (let i = 0; i < sub; i++) {
        const r = stepTransient(comps, this.capV, dt / sub);
        this.capV = r.capV;
        this.sol = r.sol;
      }
      const g = P.goals.find((q) => q.kind === 'capThreshold') as Extract<CircuitGoal, { kind: 'capThreshold' }>;
      const v = Math.abs(this.capV[g.part] ?? 0);
      if (this.doorAt === null && v >= g.volts) this.doorAt = this.tOn;
      if (this.doorAt !== null) {
        if (this.doorAt < g.tMin) return this.finish(false, `The door opened at ${this.doorAt.toFixed(2)} s, too early (window ${g.tMin}–${g.tMax} s).`);
        if (this.doorAt <= g.tMax) return this.finish(true, `Door opened at ${this.doorAt.toFixed(2)} s, right on cue.`);
      }
      if (this.tOn > g.tMax && this.doorAt === null) {
        if (this.tOn > g.tMax + 0.3) return this.finish(false, `Still closed at ${g.tMax} s. Too late (capacitor at ${v.toFixed(2)} V).`);
      }
      return;
    }
    // DC: let the "power-up" animation play for a moment, then judge.
    const sol = this.sol!;
    for (const p of P.parts) {
      if (p.rating && Math.abs(sol.current[p.id] ?? 0) > p.rating) {
        this.burnt = p.id;
        if (this.tOn > 0.6) return this.finish(false, `${p.label} burnt out: ${Math.abs(sol.current[p.id]).toFixed(2)} A is over its ${p.rating} A rating.`);
        return;
      }
    }
    if (this.tOn < 1.2) return;
    for (const g of P.goals) {
      const part = P.parts.find((p) => p.id === (g as any).part)!;
      const I = sol.current[g.kind === 'capThreshold' ? '' : g.part] ?? 0;
      if (g.kind === 'current') {
        const a = Math.abs(I);
        if (a < g.min) return this.finish(false, `${g.label}: ${a.toFixed(2)} A is too low (needs ${g.min}–${g.max} A).`);
        if (a > g.max) return this.finish(false, `${g.label}: ${a.toFixed(2)} A is too high (needs ${g.min}–${g.max} A).`);
      } else if (g.kind === 'balanced') {
        if (Math.abs(I) > g.max) return this.finish(false, `${part.label} still reads ${(I * 1e6).toFixed(0)} µA. The bridge isn't balanced.`);
      } else if (g.kind === 'notCharging') {
        if (I < -0.01) return this.finish(false, `${part.label} is being pushed backwards (${I.toFixed(2)} A into its + terminal). It's overheating.`);
      }
    }
    this.finish(true, 'All readings in range. Power stable.');
  }

  draw(d: Draw, t: number): void {
    const P = this.params;
    d.clear();
    d.grid(0.5, '', 2);
    const powered = this.status !== 'edit' || !!P.live;
    let sol: Solution | null = null;
    if (this.status === 'running' || this.status === 'win' || this.status === 'fail') sol = this.sol;
    else if (P.live) {
      try { sol = this.dc(); } catch { sol = null; }
    }
    const pin = (n: string) => P.pins[n];
    // Wires
    const wireCol = powered && sol ? 'rgba(62,230,255,0.75)' : 'rgba(127,149,171,0.6)';
    for (const w of P.wires) {
      const pts = w.map(pin);
      if (powered && sol && this.status !== 'edit') d.glowPath(pts, C.cyan, 1.2);
      else d.path(pts, wireCol, 2.5);
    }
    for (const k of Object.keys(P.pins)) d.dot(pin(k).x, pin(k).y, 3.5, '#8fb3cf');

    // Parts
    for (const p of P.parts) {
      const a = pin(p.from), b = pin(p.to);
      const I = sol ? sol.current[p.id] ?? 0 : 0;
      drawPart(d, this, p, a, b, I, sol, t, this.burnt === p.id);
      // Current dots
      if (sol && Math.abs(I) > 1e-6 && this.status !== 'edit') {
        const ph = (this.phase[p.id] = ((this.phase[p.id] ?? 0) + I * 0.02) % 1);
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(2, Math.round(L / 0.5));
        for (let k = 0; k < n; k++) {
          let f = (k + ph) / n;
          f -= Math.floor(f);
          d.dot(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 2.5, C.cyan);
        }
      }
    }
    // Goals panel (top-left)
    let y = P.view.y + P.view.h - 0.1;
    for (const g of P.goals) {
      const label = g.kind === 'current' ? `${g.label}: ${g.min}–${g.max} A` : g.kind === 'balanced' ? `${P.parts.find((q) => q.id === g.part)!.label}: zero deflection` : g.kind === 'notCharging' ? `${P.parts.find((q) => q.id === g.part)!.label}: must not be charged backwards` : `${g.label}: open between ${g.tMin}–${g.tMax} s`;
      d.text(P.view.x + 0.1, y, '◇ ' + label, 13, C.dim, 'left', 'top');
      y -= 26 / d.cam.scale;
    }
    if (this.hasTransient() && this.status !== 'edit') {
      d.text(P.view.x + P.view.w - 0.1, P.view.y + P.view.h - 0.1, `t = ${this.tOn.toFixed(2)} s`, 16, C.amber, 'right', 'top');
    }
  }
}

function drawPart(d: Draw, pz: CircuitPuzzle, p: CircuitPart, a: { x: number; y: number }, b: { x: number; y: number }, I: number, sol: Solution | null, t: number, burnt: boolean): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const s = Math.min(0.45, L * 0.3); // half-size of symbol
  const lead = (col = 'rgba(127,149,171,0.8)') => {
    d.line(a.x, a.y, mx - ux * s, my - uy * s, col, 2.5);
    d.line(mx + ux * s, my + uy * s, b.x, b.y, col, 2.5);
  };
  const labelOff = 0.42;
  // Put text on either side of the part, aligned away from it so it never sits on the wire.
  const side = (sgn: number, txt: string, col: string, size = 13, extra = 0) => {
    const ox = nx * sgn, oy = ny * sgn;
    const align: CanvasTextAlign = ox > 0.5 ? 'left' : ox < -0.5 ? 'right' : 'center';
    d.text(mx + ox * (labelOff + extra), my + oy * (labelOff + extra), txt, size, col, align);
  };
  const label = (txt: string, col = C.text) => side(1, txt, col);
  const amps = sol ? `${Math.abs(I) < 0.01 ? (Math.abs(I) * 1000).toFixed(1) + ' mA' : Math.abs(I).toFixed(2) + ' A'}` : '';
  switch (p.type) {
    case 'battery': {
      lead();
      const rev = p.flip && pz.values[p.flip] === 1;
      // long plate = +
      const plus = rev ? -1 : 1;
      const pa = { x: mx + ux * 0.08 * plus, y: my + uy * 0.08 * plus };
      const pb = { x: mx - ux * 0.08 * plus, y: my - uy * 0.08 * plus };
      d.line(mx - ux * s, my - uy * s, mx + ux * s, my + uy * s, C.bg, 6);
      d.line(mx - ux * s, my - uy * s, pb.x, pb.y, 'rgba(127,149,171,0.8)', 2.5);
      d.line(pa.x, pa.y, mx + ux * s, my + uy * s, 'rgba(127,149,171,0.8)', 2.5);
      d.line(pa.x - nx * 0.32, pa.y - ny * 0.32, pa.x + nx * 0.32, pa.y + ny * 0.32, C.amber, 4);
      d.line(pb.x - nx * 0.16, pb.y - ny * 0.16, pb.x + nx * 0.16, pb.y + ny * 0.16, C.amber, 7);
      d.text(pa.x + ux * 0.14 + nx * 0.3, pa.y + uy * 0.14 + ny * 0.3, '+', 16, C.amber);
      label(`${p.label} ${p.volts} V${p.r ? `, r = ${p.r} Ω` : ''}`, C.amber);
      if (sol) side(-1, amps, I < -0.01 ? C.red : C.cyan, 12);
      break;
    }
    case 'resistor':
    case 'sensor':
    case 'coil': {
      const R = pz.num(p.ohms);
      if (R <= 0) {
        // empty socket
        d.line(a.x, a.y, mx - ux * s, my - uy * s, 'rgba(127,149,171,0.8)', 2.5);
        d.line(mx + ux * s, my + uy * s, b.x, b.y, 'rgba(127,149,171,0.8)', 2.5);
        d.ring(mx - ux * s, my - uy * s, 5, C.dim, 2);
        d.ring(mx + ux * s, my + uy * s, 5, C.dim, 2);
        label(`${p.label}: empty`, C.dim);
        break;
      }
      lead();
      const pts = [];
      const zig = 6;
      pts.push({ x: mx - ux * s, y: my - uy * s });
      for (let k = 0; k < zig; k++) {
        const f = (k + 0.5) / zig;
        const side = k % 2 === 0 ? 1 : -1;
        pts.push({ x: mx - ux * s + ux * 2 * s * f + nx * 0.14 * side, y: my - uy * s + uy * 2 * s * f + ny * 0.14 * side });
      }
      pts.push({ x: mx + ux * s, y: my + uy * s });
      const hot = sol ? Math.min(1, (sol.power[p.id] ?? 0) / 40) : 0;
      d.path(pts, burnt ? C.red : hot > 0.05 ? mix(hot) : p.type === 'sensor' ? C.violet : '#c9d6e3', 2.5);
      label(`${p.label} ${p.hidden ? '? Ω' : fmtOhm(R)}`, p.type === 'sensor' ? C.violet : C.text);
      if (sol) side(-1, amps, C.cyan, 12);
      break;
    }
    case 'bulb': {
      lead();
      const R = pz.num(p.ohms);
      const nominal = p.nominal ?? 1;
      const glow = sol ? Math.min(1.6, Math.abs(I) / nominal) : 0;
      if (glow > 0.02 && !burnt) {
        d.ctx.globalAlpha = Math.min(1, glow * 0.8);
        d.dot(mx, my, 10 + glow * 18, glow > 1.08 ? '#ffe9b0' : C.amber, true);
        d.ctx.globalAlpha = 1;
      }
      d.circleW(mx, my, s * 0.75, burnt ? C.red : '#c9d6e3', 'rgba(7,11,18,0.8)', 2.5);
      d.line(mx - ux * s * 0.5 - nx * s * 0.5, my - uy * s * 0.5 - ny * s * 0.5, mx + ux * s * 0.5 + nx * s * 0.5, my + uy * s * 0.5 + ny * s * 0.5, burnt ? C.red : C.amber, 2);
      d.line(mx - ux * s * 0.5 + nx * s * 0.5, my - uy * s * 0.5 + ny * s * 0.5, mx + ux * s * 0.5 - nx * s * 0.5, my + uy * s * 0.5 - ny * s * 0.5, burnt ? C.red : C.amber, 2);
      label(`${p.label} ${fmtOhm(R)}`);
      if (sol) side(-1, amps, C.cyan, 12, 0.15);
      break;
    }
    case 'galvanometer': {
      lead();
      d.circleW(mx, my, s * 0.8, '#c9d6e3', 'rgba(7,11,18,0.9)', 2.5);
      // needle: ±90° full scale at ±200 µA (log-ish for visibility)
      const uA = I * 1e6;
      const defl = Math.sign(uA) * Math.min(1, Math.log10(1 + Math.abs(uA)) / Math.log10(1 + 2000)) * 1.2;
      const wob = sol && Math.abs(uA) > 1 ? Math.sin(t * 25) * 0.02 : 0;
      const ang = Math.PI / 2 - defl - wob;
      d.line(mx, my - s * 0.4, mx + Math.cos(ang) * s * 0.75, my - s * 0.4 + Math.sin(ang) * s * 0.75, Math.abs(uA) < 20 ? C.green : C.red, 2);
      d.text(mx, my - s * 0.15, 'G', 13, C.dim);
      label(`${p.label}`);
      if (sol) side(-1, `${uA.toFixed(1)} µA`, Math.abs(uA) < 20 ? C.green : C.red);
      break;
    }
    case 'switch': {
      d.line(a.x, a.y, mx - ux * s, my - uy * s, 'rgba(127,149,171,0.8)', 2.5);
      d.line(mx + ux * s, my + uy * s, b.x, b.y, 'rgba(127,149,171,0.8)', 2.5);
      const on = pz.status !== 'edit';
      const tip = on ? { x: mx + ux * s, y: my + uy * s } : { x: mx + ux * s * 0.7 + nx * 0.3, y: my + uy * s * 0.7 + ny * 0.3 };
      d.line(mx - ux * s, my - uy * s, tip.x, tip.y, on ? C.green : C.amber, 3);
      label(p.label, on ? C.green : C.amber);
      break;
    }
    case 'capacitor': {
      lead();
      d.line(mx - ux * 0.07 - nx * 0.3, my - uy * 0.07 - ny * 0.3, mx - ux * 0.07 + nx * 0.3, my - uy * 0.07 + ny * 0.3, '#c9d6e3', 4);
      d.line(mx + ux * 0.07 - nx * 0.3, my + uy * 0.07 - ny * 0.3, mx + ux * 0.07 + nx * 0.3, my + uy * 0.07 + ny * 0.3, '#c9d6e3', 4);
      label(`${p.label} ${(p.farads! * 1e6).toFixed(0)} µF`);
      const v = sol ? (sol.v[pz.params.pins[p.from].node] - sol.v[pz.params.pins[p.to].node]) : 0;
      side(-1, `${Math.abs(v).toFixed(2)} V`, C.cyan);
      break;
    }
  }
}

function mix(h: number): string {
  const r = Math.round(201 + (255 - 201) * h), g = Math.round(214 - 120 * h), b = Math.round(227 - 180 * h);
  return `rgb(${r},${g},${b})`;
}

export function fmtOhm(R: number): string {
  if (R >= 1e6) return `${+(R / 1e6).toFixed(2)} MΩ`;
  if (R >= 1e3) return `${+(R / 1e3).toFixed(2)} kΩ`;
  return `${+R.toFixed(2)} Ω`;
}

registerPuzzleType('circuit', CircuitPuzzle as any);
export { CircuitPuzzle };
