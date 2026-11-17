/**
 * Charged particles in electric and magnetic fields: F = q(E + v × B).
 * Integrated with the Boris pusher, which conserves kinetic energy exactly in a
 * pure magnetic field, so circles stay circles (r = mv/qB, T = 2πm/qB).
 */

export const E_CHARGE = 1.602176634e-19;
export const M_PROTON = 1.67262192e-27;
export const M_ELECTRON = 9.1093837e-31;
export const AMU = 1.66053907e-27;

export interface V3 { x: number; y: number; z: number }

/** A rectangular field region in the x–y plane (it extends infinitely in z). */
export interface FieldRegion {
  x: number; y: number; w: number; h: number;
  E: V3;
  B: V3;
}

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  q: number;
  m: number;
}

/** Field at a point: the sum of every region containing it. Writes into outE/outB. */
export function fieldAt(regions: FieldRegion[], x: number, y: number, outE: V3, outB: V3): void {
  outE.x = outE.y = outE.z = 0;
  outB.x = outB.y = outB.z = 0;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      outE.x += r.E.x; outE.y += r.E.y; outE.z += r.E.z;
      outB.x += r.B.x; outB.y += r.B.y; outB.z += r.B.z;
    }
  }
}

const _E: V3 = { x: 0, y: 0, z: 0 };
const _B: V3 = { x: 0, y: 0, z: 0 };

/** Advance one Boris step of length dt (seconds). Mutates p. */
export function borisStep(p: Particle, regions: FieldRegion[], dt: number): void {
  fieldAt(regions, p.x, p.y, _E, _B);
  const qm = (p.q / p.m) * 0.5 * dt;
  // half electric kick
  let vx = p.vx + qm * _E.x;
  let vy = p.vy + qm * _E.y;
  let vz = p.vz + qm * _E.z;
  // magnetic rotation
  const tx = qm * _B.x, ty = qm * _B.y, tz = qm * _B.z;
  const t2 = tx * tx + ty * ty + tz * tz;
  const sx = (2 * tx) / (1 + t2), sy = (2 * ty) / (1 + t2), sz = (2 * tz) / (1 + t2);
  const px = vx + (vy * tz - vz * ty);
  const py = vy + (vz * tx - vx * tz);
  const pz = vz + (vx * ty - vy * tx);
  vx += py * sz - pz * sy;
  vy += pz * sx - px * sz;
  vz += px * sy - py * sx;
  // half electric kick
  vx += qm * _E.x;
  vy += qm * _E.y;
  vz += qm * _E.z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.x += vx * dt; p.y += vy * dt; p.z += vz * dt;
}

/** Radius of the circular path: r = m v⊥ / |q| B. */
export function gyroRadius(m: number, vPerp: number, q: number, B: number): number {
  return (m * vPerp) / (Math.abs(q) * B);
}

/** Period of circular motion: T = 2π m / |q| B (independent of speed). */
export function cyclotronPeriod(m: number, q: number, B: number): number {
  return (2 * Math.PI * m) / (Math.abs(q) * B);
}

/** Pitch of a helix: p = v∥ · T. */
export function helixPitch(m: number, vPar: number, q: number, B: number): number {
  return vPar * cyclotronPeriod(m, q, B);
}

/** Speed passed undeflected by crossed fields: v = E / B. */
export function selectorSpeed(E: number, B: number): number {
  return E / B;
}

export function kineticEnergy(p: Particle): number {
  return 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
}
