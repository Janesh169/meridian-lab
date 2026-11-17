/**
 * Rotation and 2D collisions:
 *  - rolling without slipping down an incline (with a slip check against static friction)
 *  - 2D collisions between discs (impulse along the line of centres, restitution e)
 *  - conical pendulum / flyball governor, simulated in the rotating frame
 */
import { G_EARTH, RK4 } from './integrators';

/* ------------------------------------------------------------- rolling */

/** k = I / (m R²): ring 1, hollow sphere 2/3, disc 1/2, solid sphere 2/5. */
export const SHAPE_K = { ring: 1, hollowSphere: 2 / 3, disc: 0.5, solidSphere: 0.4 };

/** Acceleration of a body rolling without slipping: a = g sinθ / (1 + k). */
export function rollAccel(theta: number, k: number, g = G_EARTH): number {
  return (g * Math.sin(theta)) / (1 + k);
}

/** Minimum static friction coefficient needed to roll without slipping: μ ≥ k tanθ / (1 + k). */
export function muToRoll(theta: number, k: number): number {
  return (k * Math.tan(theta)) / (1 + k);
}

/**
 * Motion down a rough incline for a round body. If static friction can supply the
 * torque, it rolls (a = g sinθ/(1+k)). Otherwise it skids: the centre accelerates at
 * g(sinθ − μk cosθ), and the spin builds up from the kinetic friction torque.
 */
export function inclineMotion(theta: number, k: number, muS: number, muK: number, g = G_EARTH): { rolls: boolean; a: number; alphaR: number } {
  if (muToRoll(theta, k) <= muS) {
    const a = rollAccel(theta, k, g);
    return { rolls: true, a, alphaR: a };
  }
  const a = g * (Math.sin(theta) - muK * Math.cos(theta));
  // Friction torque μk m g cosθ R = k m R² α  ⇒  αR = μk g cosθ / k
  return { rolls: false, a, alphaR: (muK * g * Math.cos(theta)) / Math.max(k, 1e-9) };
}

/* -------------------------------------------------------- 2D collisions */

export interface Disc { x: number; y: number; vx: number; vy: number; m: number; r: number }

/**
 * Resolve a collision between two touching discs (smooth, so there's no tangential
 * impulse). Momentum is conserved, and the normal relative speed is reversed and
 * scaled by e. Returns false if they're already separating.
 */
export function collide2D(a: Disc, b: Disc, e: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-12;
  const nx = dx / d, ny = dy / d;
  const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vrel <= 0) return false;
  const J = ((1 + e) * vrel) / (1 / a.m + 1 / b.m);
  a.vx -= (J / a.m) * nx; a.vy -= (J / a.m) * ny;
  b.vx += (J / b.m) * nx; b.vy += (J / b.m) * ny;
  // Separate any overlap so they don't stick.
  const overlap = a.r + b.r - d;
  if (overlap > 0) {
    const tot = a.m + b.m;
    a.x -= nx * overlap * (b.m / tot); a.y -= ny * overlap * (b.m / tot);
    b.x += nx * overlap * (a.m / tot); b.y += ny * overlap * (a.m / tot);
  }
  return true;
}

/** Slow a disc by sliding friction μ for dt (it stops cleanly instead of reversing). */
export function applyFriction(p: Disc, mu: number, dt: number, g = G_EARTH): void {
  const v = Math.hypot(p.vx, p.vy);
  const dv = mu * g * dt;
  if (v <= dv) { p.vx = 0; p.vy = 0; return; }
  const f = (v - dv) / v;
  p.vx *= f; p.vy *= f;
}

/* ----------------------------------------------- conical pendulum / governor */

/** Steady arm angle from the vertical for spin rate ω: cosθ = g/(ω²L); 0 below ω² = g/L. */
export function conicalAngle(omega: number, L: number, g = G_EARTH): number {
  const c = g / (omega * omega * L);
  return c >= 1 ? 0 : Math.acos(c);
}

/** Spin rate needed for a given steady angle: ω = √(g / (L cosθ)). */
export function omegaForAngle(theta: number, L: number, g = G_EARTH): number {
  return Math.sqrt(g / (L * Math.cos(theta)));
}

/**
 * Flyball arm in the frame rotating at ω (fixed): θ'' = ω² sinθ cosθ − (g/L) sinθ − c θ'.
 * With damping it settles to the conical-pendulum angle.
 */
export class Governor {
  y = new Float64Array(2);
  t = 0;
  private rk = new RK4(2);
  constructor(public L: number, public omega: number, public damping = 1.5, theta0 = 0.05, public g = G_EARTH) {
    this.y[0] = theta0;
  }
  private f = (_t: number, y: Float64Array, out: Float64Array) => {
    const s = Math.sin(y[0]), c = Math.cos(y[0]);
    out[0] = y[1];
    out[1] = this.omega * this.omega * s * c - (this.g / this.L) * s - this.damping * y[1];
  };
  step(dt: number): void {
    this.rk.step(this.f, this.t, this.y, dt);
    this.t += dt;
  }
  get theta() { return this.y[0]; }
}

export const rpmToOmega = (rpm: number) => (rpm * 2 * Math.PI) / 60;
