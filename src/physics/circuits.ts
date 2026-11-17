/**
 * DC circuit solver using modified nodal analysis (MNA), which is Kirchhoff's
 * current law at every node plus one equation per voltage source. Capacitors use a
 * backward-Euler companion model for transients, which converges to the exact
 * V₀(1 − e^(−t/RC)) as dt → 0.
 *
 * Node 0 is ground. Node numbers are any small non-negative integers.
 */
import { solveLinear } from './integrators';

export type Component =
  | { kind: 'R'; id: string; a: number; b: number; ohms: number }
  /** EMF from b (−) to a (+), with internal resistance r (0 allowed). */
  | { kind: 'V'; id: string; a: number; b: number; volts: number; r?: number }
  | { kind: 'C'; id: string; a: number; b: number; farads: number }
  /** An open switch is left out of the matrix; a closed one is a 1 µΩ link. */
  | { kind: 'S'; id: string; a: number; b: number; closed: boolean };

export interface Solution {
  /** Node voltages (index = node). */
  v: number[];
  /** Current through each component from a to b (for sources: out of + terminal through the external circuit). */
  current: Record<string, number>;
  /** Power dissipated in each resistor. */
  power: Record<string, number>;
}

export interface CapState { [id: string]: number /* voltage a−b */ }

/**
 * Solve the circuit. If `dt` is given, capacitors are treated with backward Euler
 * from `capV` (the previous voltages). Otherwise capacitors are open (DC steady state).
 */
export function solve(components: Component[], capV?: CapState, dt?: number): Solution {
  // Expand internal resistances of sources into an extra node.
  const comps: Component[] = [];
  let maxNode = 0;
  for (const c of components) maxNode = Math.max(maxNode, c.a, c.b);
  let extra = maxNode + 1;
  const internalR = new Map<string, string>();
  for (const c of components) {
    if (c.kind === 'V' && c.r && c.r > 0) {
      const mid = extra++;
      comps.push({ kind: 'V', id: c.id, a: mid, b: c.b, volts: c.volts });
      comps.push({ kind: 'R', id: c.id + '#r', a: c.a, b: mid, ohms: c.r });
      internalR.set(c.id, c.id + '#r');
    } else comps.push(c);
  }
  const nNodes = extra; // includes ground (0)
  const vsrc = comps.filter((c) => c.kind === 'V');
  const N = nNodes - 1 + vsrc.length;
  const A = new Float64Array(N * N);
  const z = new Float64Array(N);
  const idx = (node: number) => node - 1; // ground is removed
  const stamp = (a: number, b: number, g: number) => {
    if (a > 0) A[idx(a) * N + idx(a)] += g;
    if (b > 0) A[idx(b) * N + idx(b)] += g;
    if (a > 0 && b > 0) { A[idx(a) * N + idx(b)] -= g; A[idx(b) * N + idx(a)] -= g; }
  };
  const inject = (a: number, b: number, i: number) => { // current i into a, out of b
    if (a > 0) z[idx(a)] += i;
    if (b > 0) z[idx(b)] -= i;
  };
  // Tiny leak to ground keeps floating nodes solvable (e.g. a node only touching a capacitor in DC).
  for (let n = 1; n < nNodes; n++) A[idx(n) * N + idx(n)] += 1e-12;

  for (const c of comps) {
    if (c.kind === 'R') stamp(c.a, c.b, 1 / c.ohms);
    else if (c.kind === 'S' && c.closed) stamp(c.a, c.b, 1e6);
    else if (c.kind === 'C' && dt) {
      const g = c.farads / dt;
      stamp(c.a, c.b, g);
      inject(c.a, c.b, g * (capV?.[c.id] ?? 0));
    }
  }
  vsrc.forEach((c, k) => {
    if (c.kind !== 'V') return;
    const row = nNodes - 1 + k;
    if (c.a > 0) { A[row * N + idx(c.a)] += 1; A[idx(c.a) * N + row] += 1; }
    if (c.b > 0) { A[row * N + idx(c.b)] -= 1; A[idx(c.b) * N + row] -= 1; }
    z[row] = c.volts;
  });
  const x = solveLinear(A, z, N);
  const v = [0];
  for (let n = 1; n < nNodes; n++) v.push(x[idx(n)]);
  const current: Record<string, number> = {};
  const power: Record<string, number> = {};
  for (const c of comps) {
    if (c.kind === 'R') {
      const i = (v[c.a] - v[c.b]) / c.ohms;
      current[c.id] = i;
      power[c.id] = i * i * c.ohms;
    } else if (c.kind === 'S') {
      current[c.id] = c.closed ? (v[c.a] - v[c.b]) * 1e6 : 0;
    } else if (c.kind === 'C') {
      current[c.id] = dt ? (c.farads / dt) * ((v[c.a] - v[c.b]) - (capV?.[c.id] ?? 0)) : 0;
    }
  }
  vsrc.forEach((c, k) => {
    // MNA current variable flows from + through the source to −; we report the external current.
    current[c.id] = -x[nNodes - 1 + k];
  });
  // Report the original sources' currents (the internal resistor carries the same current).
  for (const [id] of internalR) {
    power[id + '#internal'] = power[id + '#r'] ?? 0;
  }
  return { v: v.slice(0, maxNode + 1), current, power };
}

/** Step a circuit with capacitors forward by dt and return the new capacitor voltages. */
export function stepTransient(components: Component[], capV: CapState, dt: number): { sol: Solution; capV: CapState } {
  const sol = solve(components, capV, dt);
  const next: CapState = {};
  for (const c of components) if (c.kind === 'C') next[c.id] = sol.v[c.a] - sol.v[c.b];
  return { sol, capV: next };
}

export function seriesR(...r: number[]): number {
  return r.reduce((a, b) => a + b, 0);
}
export function parallelR(...r: number[]): number {
  return 1 / r.reduce((a, b) => a + 1 / b, 0);
}
