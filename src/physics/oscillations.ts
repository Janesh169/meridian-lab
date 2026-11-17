/**
 * Oscillations and waves: the full nonlinear pendulum (RK4), the spring–mass
 * system, the driven damped oscillator, and standing waves on a string.
 */
import { G_EARTH, RK4 } from './integrators';

/** Small-angle pendulum period T = 2π√(L/g). */
export function pendulumPeriod(L: number, g = G_EARTH): number {
  return 2 * Math.PI * Math.sqrt(L / g);
}

/**
 * Exact large-amplitude pendulum period (arithmetic–geometric mean):
 * T = 2π√(L/g) / AGM(1, cos(θ₀/2)).
 */
export function pendulumPeriodExact(L: number, theta0: number, g = G_EARTH): number {
  let a = 1, b = Math.cos(theta0 / 2);
  for (let i = 0; i < 20; i++) { const an = (a + b) / 2; b = Math.sqrt(a * b); a = an; }
  return pendulumPeriod(L, g) / a;
}

/** Spring–mass period T = 2π√(m/k). */
export function springPeriod(m: number, k: number): number {
  return 2 * Math.PI * Math.sqrt(m / k);
}

/** Pendulum simulator: θ'' = −(g/L) sin θ − 2β θ'. */
export class Pendulum {
  y = new Float64Array(2); // [theta, omega]
  t = 0;
  private rk = new RK4(2);
  constructor(public L: number, theta0: number, public beta = 0, public g = G_EARTH) {
    this.y[0] = theta0;
  }
  private f = (_t: number, y: Float64Array, out: Float64Array) => {
    out[0] = y[1];
    out[1] = -(this.g / this.L) * Math.sin(y[0]) - 2 * this.beta * y[1];
  };
  step(dt: number): void {
    this.rk.step(this.f, this.t, this.y, dt);
    this.t += dt;
  }
  get theta() { return this.y[0]; }
  get omega() { return this.y[1]; }
}

/**
 * Driven, damped spring–mass oscillator: m x'' + c x' + k x = F₀ cos(ω t).
 * β = c / 2m, ω₀ = √(k/m).
 */
export class Oscillator {
  y = new Float64Array(2); // [x, v]
  t = 0;
  private rk = new RK4(2);
  constructor(public m: number, public k: number, public c = 0, public F0 = 0, public omega = 0, x0 = 0, v0 = 0) {
    this.y[0] = x0;
    this.y[1] = v0;
  }
  private f = (t: number, y: Float64Array, out: Float64Array) => {
    out[0] = y[1];
    out[1] = (this.F0 * Math.cos(this.omega * t) - this.c * y[1] - this.k * y[0]) / this.m;
  };
  step(dt: number): void {
    this.rk.step(this.f, this.t, this.y, dt);
    this.t += dt;
  }
  get x() { return this.y[0]; }
  get v() { return this.y[1]; }
  energy(): number {
    return 0.5 * this.m * this.y[1] ** 2 + 0.5 * this.k * this.y[0] ** 2;
  }
}

/** Steady-state amplitude A = (F₀/m) / √((ω₀² − ω²)² + (2βω)²). */
export function drivenAmplitude(m: number, k: number, c: number, F0: number, omega: number): number {
  const w0sq = k / m;
  const beta = c / (2 * m);
  return F0 / m / Math.sqrt((w0sq - omega * omega) ** 2 + (2 * beta * omega) ** 2);
}

/** Wave speed on a string: v = √(T/μ). */
export function stringWaveSpeed(tension: number, mu: number): number {
  return Math.sqrt(tension / mu);
}

/** n-th harmonic of a string fixed at both ends: fₙ = n v / 2L. */
export function stringHarmonic(n: number, L: number, tension: number, mu: number): number {
  return (n * stringWaveSpeed(tension, mu)) / (2 * L);
}

/** Standing-wave displacement y(x, t) = A sin(nπx/L) cos(2π f t). */
export function standingWave(x: number, t: number, n: number, L: number, f: number, A: number): number {
  return A * Math.sin((n * Math.PI * x) / L) * Math.cos(2 * Math.PI * f * t);
}
