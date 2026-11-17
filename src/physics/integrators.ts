/** Small numeric helpers shared by the simulators. They don't allocate in the hot path. */

export type Deriv = (t: number, y: Float64Array, out: Float64Array) => void;

/** Classic 4th-order Runge–Kutta with caller-owned scratch buffers. */
export class RK4 {
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private tmp: Float64Array;
  constructor(public readonly n: number) {
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.tmp = new Float64Array(n);
  }
  step(f: Deriv, t: number, y: Float64Array, h: number): void {
    const { n, k1, k2, k3, k4, tmp } = this;
    f(t, y, k1);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k1[i];
    f(t + 0.5 * h, tmp, k2);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k2[i];
    f(t + 0.5 * h, tmp, k3);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i];
    f(t + h, tmp, k4);
    for (let i = 0; i < n; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
}

/** A fixed-capacity ring of 2D points, for trails without allocations. */
export class Trail {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  length = 0;
  constructor(public readonly capacity: number) {
    this.xs = new Float64Array(capacity);
    this.ys = new Float64Array(capacity);
  }
  push(x: number, y: number): void {
    if (this.length < this.capacity) {
      this.xs[this.length] = x;
      this.ys[this.length] = y;
      this.length++;
    } else {
      // Full: thin the trail by half and keep going, so long runs still fit.
      for (let i = 0; i < this.capacity / 2; i++) {
        this.xs[i] = this.xs[i * 2];
        this.ys[i] = this.ys[i * 2];
      }
      this.length = this.capacity / 2;
      this.xs[this.length] = x;
      this.ys[this.length] = y;
      this.length++;
    }
  }
  clear(): void {
    this.length = 0;
  }
  toArray(): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.length; i++) out.push([this.xs[i], this.ys[i]]);
    return out;
  }
}

export const G_EARTH = 9.8;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Solve A x = b in place with partial pivoting (A is n×n row-major). Returns x (in b). */
export function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = Math.abs(A[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(A[r * n + c]);
      if (v > best) { best = v; p = r; }
    }
    if (best < 1e-15) throw new Error('Singular circuit matrix');
    if (p !== c) {
      for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; }
      const t = b[c]; b[c] = b[p]; b[p] = t;
    }
    const piv = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
    b[r] = s / A[r * n + r];
  }
  return b;
}
