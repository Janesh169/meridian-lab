/**
 * Waves and coupled oscillators:
 *  - a vibrating string (finite-difference wave equation, driven at one end, with damping
 *    and optional "touch" dampers that only let through harmonics with a node there)
 *  - two pendulums coupled by a spring (energy transfer, normal modes)
 *  - the Doppler effect and beats
 *  - Young's double slit, including a thin sheet over one slit and white light
 */
import { G_EARTH, RK4 } from './integrators';

/* ------------------------------------------------------------ the string */

export interface StringConfig {
  L: number;
  tension: number;
  mu: number;
  /** Drive amplitude (m) and frequency (Hz) at x = 0. */
  driveA: number;
  driveF: number;
  /** Background damping rate (1/s). */
  gamma: number;
  /** Damper pads: position (m) and local damping rate (1/s). */
  dampers?: { x: number; rate: number }[];
  points?: number;
}

/** Wave speed v = √(T/μ) and harmonics fₙ = n v / 2L for a string fixed at both ends. */
export function waveSpeed(tension: number, mu: number): number {
  return Math.sqrt(tension / mu);
}
export function harmonic(n: number, L: number, tension: number, mu: number): number {
  return (n * waveSpeed(tension, mu)) / (2 * L);
}

/**
 * y_tt + γ y_t = c² y_xx, solved with an explicit leapfrog scheme (stable at CFL < 1).
 * The left end is driven, y(0, t) = A sin(2πft); the right end is fixed.
 */
export class StringSim {
  readonly n: number;
  readonly dx: number;
  readonly dt: number;
  readonly c: number;
  y: Float64Array;
  yOld: Float64Array;
  yNew: Float64Array;
  /** Running envelope: the largest |y| seen at each point since resetEnvelope(). */
  env: Float64Array;
  private damp: Float64Array;
  t = 0;

  constructor(public cfg: StringConfig) {
    this.n = cfg.points ?? 60;
    this.dx = cfg.L / this.n;
    this.c = waveSpeed(cfg.tension, cfg.mu);
    this.dt = (0.8 * this.dx) / this.c;
    this.y = new Float64Array(this.n + 1);
    this.yOld = new Float64Array(this.n + 1);
    this.yNew = new Float64Array(this.n + 1);
    this.env = new Float64Array(this.n + 1);
    this.damp = new Float64Array(this.n + 1).fill(cfg.gamma);
    for (const d of cfg.dampers ?? []) {
      const i = Math.round(d.x / this.dx);
      if (i > 0 && i < this.n) this.damp[i] += d.rate;
    }
  }

  step(): void {
    const { n, dt, y, yOld, yNew, damp } = this;
    const r2 = ((this.c * dt) / this.dx) ** 2;
    for (let i = 1; i < n; i++) {
      const g = damp[i] * dt * 0.5;
      yNew[i] = (2 * y[i] - yOld[i] * (1 - g) + r2 * (y[i + 1] - 2 * y[i] + y[i - 1])) / (1 + g);
    }
    this.t += dt;
    yNew[0] = this.cfg.driveA * Math.sin(2 * Math.PI * this.cfg.driveF * this.t);
    yNew[n] = 0;
    for (let i = 0; i <= n; i++) {
      yOld[i] = y[i];
      y[i] = yNew[i];
      const a = Math.abs(y[i]);
      if (a > this.env[i]) this.env[i] = a;
    }
  }

  advance(seconds: number): void {
    const steps = Math.max(1, Math.round(seconds / this.dt));
    for (let k = 0; k < steps; k++) this.step();
  }

  resetEnvelope(): void {
    this.env.fill(0);
  }

  maxEnvelope(): number {
    let m = 0;
    for (let i = 1; i < this.n; i++) m = Math.max(m, this.env[i]);
    return m;
  }

  /**
   * Which harmonic does the envelope look like? Correlates the envelope with |sin(nπx/L)|
   * for n = 1..maxN and returns the best match.
   */
  bestHarmonic(maxN = 10): { n: number; corr: number } {
    let best = { n: 0, corr: -1 };
    const N = this.n;
    let me = 0;
    for (let i = 0; i <= N; i++) me += this.env[i];
    me /= N + 1;
    for (let h = 1; h <= maxN; h++) {
      let ms = 0;
      const s = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { s[i] = Math.abs(Math.sin((h * Math.PI * i) / N)); ms += s[i]; }
      ms /= N + 1;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i <= N; i++) {
        const a = this.env[i] - me, b = s[i] - ms;
        num += a * b; da += a * a; db += b * b;
      }
      const corr = num / Math.sqrt(da * db || 1);
      if (corr > best.corr) best = { n: h, corr };
    }
    return best;
  }
}

/* ------------------------------------------------------ coupled pendulums */

/**
 * Two identical pendulums (length L, mass m) joined at the bobs by a spring k:
 *   θ₁'' = −(g/L) sin θ₁ − (k/m)(θ₁ − θ₂),   θ₂'' = −(g/L) sin θ₂ − (k/m)(θ₂ − θ₁)
 * Normal modes: ω₁ = √(g/L) (in step), ω₂ = √(g/L + 2k/m) (opposite).
 */
export class CoupledPendulums {
  y = new Float64Array(4); // θ1, ω1, θ2, ω2
  t = 0;
  private rk = new RK4(4);
  constructor(public L: number, public m: number, public k: number, theta0: number, public g = G_EARTH) {
    this.y[0] = theta0;
  }
  private f = (_t: number, y: Float64Array, out: Float64Array) => {
    const w0 = this.g / this.L, c = this.k / this.m;
    out[0] = y[1];
    out[1] = -w0 * Math.sin(y[0]) - c * (y[0] - y[2]);
    out[2] = y[3];
    out[3] = -w0 * Math.sin(y[2]) - c * (y[2] - y[0]);
  };
  step(dt: number): void {
    this.rk.step(this.f, this.t, this.y, dt);
    this.t += dt;
  }
  /** Energy per unit mass of each pendulum on its own (spring energy excluded). */
  energies(): [number, number] {
    const { L, g, y } = this;
    const e = (th: number, w: number) => 0.5 * L * L * w * w + g * L * (1 - Math.cos(th));
    return [e(y[0], y[1]), e(y[2], y[3])];
  }
}

export function normalModes(L: number, m: number, k: number, g = G_EARTH): [number, number] {
  return [Math.sqrt(g / L), Math.sqrt(g / L + (2 * k) / m)];
}

/** Time for all the energy to move from one pendulum to the other: π / (ω₂ − ω₁). */
export function transferTime(L: number, m: number, k: number, g = G_EARTH): number {
  const [a, b] = normalModes(L, m, k, g);
  return Math.PI / (b - a);
}

/* -------------------------------------------------------- Doppler & beats */

/**
 * Doppler shift along the line joining source and observer.
 * vs > 0: source moving TOWARD the observer. vo > 0: observer moving TOWARD the source.
 * f' = f (v + vo) / (v − vs)
 */
export function doppler(f: number, v: number, vs: number, vo: number): number {
  return (f * (v + vo)) / (v - vs);
}

export function beatFrequency(f1: number, f2: number): number {
  return Math.abs(f1 - f2);
}

/* ------------------------------------------------------- double slit */

/**
 * Young's double slit intensity (relative, 0–1) at height y on a screen D away, slits d
 * apart, wavelength λ. A thin sheet (index n, thickness t) over the upper slit adds an
 * optical path (n − 1)t, shifting the pattern by (n − 1)t·D/d toward the covered slit.
 */
export function ydseIntensity(y: number, d: number, D: number, lambda: number, sheet = 0): number {
  const pathDiff = (d * y) / D - sheet;
  const c = Math.cos((Math.PI * pathDiff) / lambda);
  return c * c;
}

export function fringeWidth(lambda: number, D: number, d: number): number {
  return (lambda * D) / d;
}

export function sheetShift(n: number, t: number, D: number, d: number): number {
  return ((n - 1) * t * D) / d;
}
