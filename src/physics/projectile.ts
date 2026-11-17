/**
 * Projectile motion near Earth's surface (uniform g, no air resistance, as in JEE).
 * Positions come from the exact closed-form solution, so there is no integration error.
 */
import { G_EARTH } from './integrators';

export interface Launch {
  x0: number;
  y0: number;
  /** launch speed, m/s */
  speed: number;
  /** launch angle above horizontal, radians */
  angle: number;
  g?: number;
}

export function posAt(l: Launch, t: number): { x: number; y: number; vx: number; vy: number } {
  const g = l.g ?? G_EARTH;
  const vx = l.speed * Math.cos(l.angle);
  const vy0 = l.speed * Math.sin(l.angle);
  return { x: l.x0 + vx * t, y: l.y0 + vy0 * t - 0.5 * g * t * t, vx, vy: vy0 - g * t };
}

/** Horizontal range on level ground: R = u² sin 2θ / g. */
export function levelRange(speed: number, angle: number, g = G_EARTH): number {
  return (speed * speed * Math.sin(2 * angle)) / g;
}

/** Maximum height above the launch point: H = u² sin²θ / 2g. */
export function maxHeight(speed: number, angle: number, g = G_EARTH): number {
  const s = Math.sin(angle);
  return (speed * speed * s * s) / (2 * g);
}

/** Time to come back down to height y (descending branch). NaN if it never gets there. */
export function timeToHeight(l: Launch, y: number): number {
  const g = l.g ?? G_EARTH;
  const vy = l.speed * Math.sin(l.angle);
  const disc = vy * vy + 2 * g * (l.y0 - y);
  if (disc < 0) return NaN;
  return (vy + Math.sqrt(disc)) / g;
}

/** Horizontal distance travelled when the projectile comes down to height y. */
export function rangeToHeight(l: Launch, y: number): number {
  const t = timeToHeight(l, y);
  return l.speed * Math.cos(l.angle) * t;
}

/** Launch angles (radians) that hit the point (dx, dy) at speed u; empty if out of reach. */
export function anglesToHit(u: number, dx: number, dy: number, g = G_EARTH): number[] {
  const u2 = u * u;
  const disc = u2 * u2 - g * (g * dx * dx + 2 * dy * u2);
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  return [Math.atan2(u2 - r, g * dx), Math.atan2(u2 + r, g * dx)];
}

/** Minimum launch speed to reach (dx, dy): u² = g (dy + √(dx² + dy²)). */
export function minSpeedToHit(dx: number, dy: number, g = G_EARTH): number {
  return Math.sqrt(g * (dy + Math.hypot(dx, dy)));
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Does segment (ax,ay)→(bx,by) cross the axis-aligned rectangle? */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  // Liang–Barsky clipping
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
