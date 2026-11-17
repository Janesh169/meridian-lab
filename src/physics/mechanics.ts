/**
 * Newtonian mechanics: blocks on rough inclines and floors, Atwood machines,
 * collisions with a coefficient of restitution, and torque on a beam.
 */
import { G_EARTH } from './integrators';

/* ------------------------------------------------------------------ inclines */

/** One straight piece of track: length (m), slope angle (rad, + means going down), kinetic/static friction. */
export interface TrackPiece { length: number; angle: number; muK: number; muS: number }

export interface SlideState { s: number; v: number; t: number; stopped: boolean; piece: number }

/**
 * Acceleration along the track for a block on a piece sloping down at `angle`:
 *  moving forward (v > 0): a = g(sin θ − μk cos θ)
 *  moving backward (v < 0): a = g(sin θ + μk cos θ)
 *  at rest: it stays put if tan θ ≤ μs, otherwise it starts sliding down.
 */
export function slideAccel(angle: number, v: number, muK: number, muS: number, g = G_EARTH): number {
  const s = Math.sin(angle), c = Math.cos(angle);
  if (Math.abs(v) < 1e-9) {
    if (Math.abs(s) <= muS * c) return 0;
    return g * (s - Math.sign(s) * muK * c);
  }
  return g * (s - Math.sign(v) * muK * c);
}

/**
 * Exact piecewise simulation: on each piece the acceleration is constant, so we
 * step with closed-form kinematics and handle stops (v = 0) analytically.
 */
export function slideStep(track: TrackPiece[], st: SlideState, dt: number, g = G_EARTH): void {
  let remaining = dt;
  let guard = 0;
  while (remaining > 1e-12 && !st.stopped && guard++ < 50) {
    const p = track[st.piece];
    if (!p) { st.stopped = true; break; }
    const start = track.slice(0, st.piece).reduce((a, q) => a + q.length, 0);
    const local = st.s - start;
    const a = slideAccel(p.angle, st.v, p.muK, p.muS, g);
    if (Math.abs(st.v) < 1e-9 && a === 0) { st.v = 0; st.stopped = true; break; }
    // Time until velocity crosses zero (friction stop), if the speed is decreasing.
    let tStop = Infinity;
    if (st.v !== 0 && Math.sign(a) === -Math.sign(st.v)) tStop = -st.v / a;
    // Time to reach the end (or start) of the piece.
    const target = st.v + a * 1e-9 >= 0 ? p.length - local : -local;
    let tEdge = Infinity;
    const disc = st.v * st.v + 2 * a * target;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of a !== 0 ? [(-st.v + sq) / a, (-st.v - sq) / a] : [target / st.v]) {
        if (t > 1e-12 && t < tEdge) tEdge = t;
      }
    }
    const h = Math.min(remaining, tStop, tEdge);
    st.s += st.v * h + 0.5 * a * h * h;
    st.v += a * h;
    st.t += h;
    remaining -= h;
    if (h === tStop) {
      st.v = 0;
      // Static friction holds it here? If not, it will start sliding back next loop.
      if (Math.abs(Math.sin(p.angle)) <= p.muS * Math.cos(p.angle)) { st.stopped = true; break; }
    }
    if (h === tEdge) {
      if (target > 0) {
        st.piece++;
        if (st.piece >= track.length) { st.stopped = true; break; }
      } else {
        st.piece = Math.max(0, st.piece - 1);
        if (local + target <= 0 && st.piece === 0 && st.v < 0) { st.v = 0; st.stopped = true; break; }
      }
    }
  }
}

/** Speed at the bottom of an incline of length L after starting from rest: v² = 2 L g (sin θ − μ cos θ). */
export function inclineExitSpeed(L: number, angle: number, muK: number, g = G_EARTH): number {
  const a = g * (Math.sin(angle) - muK * Math.cos(angle));
  return a > 0 ? Math.sqrt(2 * a * L) : 0;
}

/** Stopping distance on a level floor: d = v² / 2 μ g. */
export function stoppingDistance(v: number, muK: number, g = G_EARTH): number {
  return (v * v) / (2 * muK * g);
}

/* --------------------------------------------------------------- Atwood */

/**
 * Atwood machine with an ideal pulley: m1 hangs on one side, m2 on the other.
 * Positive a means m1 goes down. a = (m1 − m2) g / (m1 + m2), T = 2 m1 m2 g / (m1 + m2).
 */
export function atwood(m1: number, m2: number, g = G_EARTH): { a: number; T: number } {
  return { a: ((m1 - m2) * g) / (m1 + m2), T: (2 * m1 * m2 * g) / (m1 + m2) };
}

/**
 * A hanging mass m1 pulls m2 along a rough horizontal table (one pulley at the edge).
 * Returns acceleration (0 if static friction holds) and tension.
 */
export function tablePulley(m1: number, m2: number, muS: number, muK: number, g = G_EARTH): { a: number; T: number } {
  if (m1 * g <= muS * m2 * g) return { a: 0, T: m1 * g };
  const a = ((m1 - muK * m2) * g) / (m1 + m2);
  return { a, T: m1 * (g - a) };
}

/* ------------------------------------------------------------- collisions */

/**
 * 1D collision with coefficient of restitution e (1 = elastic, 0 = perfectly inelastic).
 * Momentum is conserved, and the relative speed of separation is e times the speed of approach.
 */
export function collide1D(m1: number, u1: number, m2: number, u2: number, e: number): [number, number] {
  const M = m1 + m2;
  const v1 = (m1 * u1 + m2 * u2 - m2 * e * (u1 - u2)) / M;
  const v2 = (m1 * u1 + m2 * u2 + m1 * e * (u1 - u2)) / M;
  return [v1, v2];
}

/* ---------------------------------------------------------------- torque */

export interface PointMass { m: number; x: number /* position along beam from pivot, m */ }

/** Net torque about the pivot (counter-clockwise positive, masses at +x pull clockwise). */
export function netTorque(masses: PointMass[], g = G_EARTH): number {
  return masses.reduce((t, p) => t - p.m * g * p.x, 0);
}

/** Moment of inertia of point masses plus a uniform beam (mass M, length L, pivot at centre). */
export function beamInertia(masses: PointMass[], beamM: number, beamL: number): number {
  return masses.reduce((I, p) => I + p.m * p.x * p.x, (beamM * beamL * beamL) / 12);
}

/**
 * Angular acceleration of a beam tilted by φ (masses' lever arms shrink with cos φ).
 */
export function beamAlpha(masses: PointMass[], beamM: number, beamL: number, phi: number, g = G_EARTH): number {
  return (netTorque(masses, g) * Math.cos(phi)) / beamInertia(masses, beamM, beamL);
}
