import { describe, expect, it } from 'vitest';
import { DEG, G_EARTH } from '../../../src/physics/integrators';
import { anglesToHit, levelRange, maxHeight, minSpeedToHit, posAt, rangeToHeight, timeToHeight } from '../../../src/physics/projectile';
import { criticalAngle, lensImage, prismMinDeviation, rayCross, trace, type OpticalElement } from '../../../src/physics/optics';
import { borisStep, cyclotronPeriod, E_CHARGE, gyroRadius, helixPitch, kineticEnergy, M_PROTON, selectorSpeed, type FieldRegion, type Particle } from '../../../src/physics/em';
import { parallelR, solve, stepTransient, type Component } from '../../../src/physics/circuits';
import { atwood, collide1D, inclineExitSpeed, slideStep, stoppingDistance, tablePulley, netTorque, type TrackPiece } from '../../../src/physics/mechanics';
import { drivenAmplitude, Oscillator, Pendulum, pendulumPeriod, pendulumPeriodExact, springPeriod, stringHarmonic } from '../../../src/physics/oscillations';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('projectile', () => {
  it('range on level ground matches u² sin2θ / g', () => {
    for (const [u, deg] of [[10, 30], [20, 45], [15, 60], [7, 75]]) {
      const l = { x0: 0, y0: 0, speed: u, angle: deg * DEG };
      expect(rel(rangeToHeight(l, 0), levelRange(u, deg * DEG))).toBeLessThan(1e-12);
      expect(rel(levelRange(u, deg * DEG), (u * u * Math.sin(2 * deg * DEG)) / G_EARTH)).toBeLessThan(1e-12);
    }
  });
  it('max height matches u² sin²θ / 2g and is reached at t = u sinθ / g', () => {
    const l = { x0: 0, y0: 0, speed: 20, angle: 50 * DEG };
    const tTop = (20 * Math.sin(50 * DEG)) / G_EARTH;
    expect(rel(posAt(l, tTop).y, maxHeight(20, 50 * DEG))).toBeLessThan(1e-12);
  });
  it('45° is optimal only for equal heights', () => {
    const best = (h: number) => {
      let bestA = 0, bestR = 0;
      for (let a = 1; a < 90; a += 0.1) {
        const R = rangeToHeight({ x0: 0, y0: h, speed: 12, angle: a * DEG }, 0);
        if (R > bestR) { bestR = R; bestA = a; }
      }
      return bestA;
    };
    expect(best(0)).toBeCloseTo(45, 0);
    expect(best(10)).toBeLessThan(40); // launching from a height: lower angle is better
  });
  it('anglesToHit actually hits the target, and min speed has a single solution', () => {
    const dx = 12, dy = 3, u = 15;
    for (const a of anglesToHit(u, dx, dy)) {
      const l = { x0: 0, y0: 0, speed: u, angle: a };
      const t = dx / (u * Math.cos(a));
      expect(posAt(l, t).y).toBeCloseTo(dy, 9);
    }
    const um = minSpeedToHit(dx, dy);
    expect(anglesToHit(um * 0.999, dx, dy)).toHaveLength(0);
    expect(anglesToHit(um * 1.001, dx, dy)).toHaveLength(2);
  });
  it('time of flight to a lower ledge', () => {
    const l = { x0: 0, y0: 5, speed: 10, angle: 30 * DEG };
    const t = timeToHeight(l, 0);
    expect(posAt(l, t).y).toBeCloseTo(0, 9);
  });
});

describe('ray optics', () => {
  it('plane mirror: angle of incidence = angle of reflection', () => {
    const els: OpticalElement[] = [{ kind: 'mirror', id: 'm', x: 0, y: 0, length: 2, angle: 0 }];
    const r = trace({ x: -1, y: 1, dx: 1, dy: -1 }, els, 4, 1);
    const p = r.points;
    expect(p[1].x).toBeCloseTo(0, 9);
    expect(p[1].y).toBeCloseTo(0, 9);
    // Outgoing direction is (1, 1)/√2.
    expect((p[2].y - p[1].y) / (p[2].x - p[1].x)).toBeCloseTo(1, 9);
  });

  it('thin lens image distance matches 1/v − 1/u = 1/f', () => {
    for (const [u, f] of [[-0.3, 0.1], [-0.15, 0.1], [-0.5, 0.2], [-0.2, -0.1]]) {
      const lens: OpticalElement = { kind: 'lens', id: 'L', x: 0, y: 0, angle: Math.PI / 2, height: 0.2, focal: f };
      const obj = { x: u, y: 0.01 };
      const outs = [0.03, -0.04].map((h) => {
        const tr = trace({ x: obj.x, y: obj.y, dx: -obj.x, dy: h - obj.y }, [lens], 2, 1);
        const a = tr.points[1], b = tr.points[2];
        return { p: a, d: { x: b.x - a.x, y: b.y - a.y } };
      });
      const img = rayCross(outs[0].p, outs[0].d, outs[1].p, outs[1].d)!;
      const v = lensImage(u, f);
      expect(rel(img.x, v)).toBeLessThan(1e-9);
      // Magnification m = v/u
      expect(rel(img.y, (obj.y * v) / u)).toBeLessThan(1e-9);
    }
  });

  it('concave mirror focuses paraxial parallel rays at R/2', () => {
    const R = 1.0;
    const m: OpticalElement = { kind: 'curvedMirror', id: 'cm', x: 0, y: 0, angle: Math.PI, radius: R, aperture: 0.2 };
    // Mirror faces −x (toward incoming light from the left); centre at (−R, 0).
    const hits = [0.002, -0.003].map((h) => {
      const tr = trace({ x: -2, y: h, dx: 1, dy: 0 }, [m], 2, 1);
      const a = tr.points[1], b = tr.points[2];
      return { p: a, d: { x: b.x - a.x, y: b.y - a.y } };
    });
    const axisCross = (k: number) => {
      const { p, d } = hits[k];
      return p.x - (p.y * d.x) / d.y;
    };
    expect(axisCross(0)).toBeCloseTo(-R / 2, 4);
    expect(axisCross(1)).toBeCloseTo(-R / 2, 4);
  });

  it('concave mirror images an object per 1/v + 1/u = 1/f', () => {
    const R = 0.6, f = -R / 2, u = -0.9;
    const m: OpticalElement = { kind: 'curvedMirror', id: 'cm', x: 0, y: 0, angle: Math.PI, radius: R, aperture: 0.05 };
    const obj = { x: u, y: 0.001 };
    const outs = [0.004, -0.005].map((h) => {
      const tr = trace({ x: obj.x, y: obj.y, dx: -obj.x, dy: h - obj.y }, [m], 2, 1);
      const a = tr.points[1], b = tr.points[2];
      return { p: a, d: { x: b.x - a.x, y: b.y - a.y } };
    });
    const img = rayCross(outs[0].p, outs[0].d, outs[1].p, outs[1].d)!;
    const v = 1 / (1 / f - 1 / u);
    expect(rel(img.x, v)).toBeLessThan(5e-3);
  });

  it('Snell refraction through a slab gives a parallel, shifted ray', () => {
    const n = 1.5;
    const slab: OpticalElement = { kind: 'block', id: 'g', n, points: [{ x: 0, y: -1 }, { x: 0.1, y: -1 }, { x: 0.1, y: 1 }, { x: 0, y: 1 }] };
    const i = 40 * DEG;
    const tr = trace({ x: -0.2, y: 0, dx: Math.cos(i), dy: Math.sin(i) }, [slab], 6, 1);
    const [p0, p1, p2, p3] = tr.points;
    const rIn = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    expect(Math.sin(i)).toBeCloseTo(n * Math.sin(rIn), 9);
    const out = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    expect(out).toBeCloseTo(i, 9);
    expect(p0.x).toBe(-0.2);
  });

  it('total internal reflection just above the critical angle', () => {
    const n = 1.5;
    const tc = criticalAngle(n);
    // Ray inside glass heading to the top face y=0 at angle of incidence tc ± 1°.
    const glass: OpticalElement = { kind: 'block', id: 'g', n, points: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 0 }, { x: -5, y: 0 }] };
    const go = (inc: number) => trace({ x: 0, y: -1, dx: Math.sin(inc), dy: Math.cos(inc) }, [glass], 1, 1);
    expect(go(tc + 1 * DEG).tirPoints.length).toBe(1);
    expect(go(tc - 1 * DEG).tirPoints.length).toBe(0);
  });

  it('prism minimum deviation matches 2·asin(n sin(A/2)) − A', () => {
    const n = 1.5, A = 60 * DEG;
    const h = 1;
    const pts = [{ x: -h * Math.tan(A / 2), y: 0 }, { x: h * Math.tan(A / 2), y: 0 }, { x: 0, y: h }];
    const prism: OpticalElement = { kind: 'block', id: 'p', n, points: pts };
    let minDev = Infinity;
    const p0 = pts[0], p2 = pts[2];
    const fl = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const f = { x: (p2.x - p0.x) / fl, y: (p2.y - p0.y) / fl };
    const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const cen = { x: 0, y: h / 3 };
    let nIn = { x: -f.y, y: f.x };
    if (nIn.x * (cen.x - mid.x) + nIn.y * (cen.y - mid.y) < 0) nIn = { x: -nIn.x, y: -nIn.y };
    for (let inc = -85; inc < 85; inc += 0.02) {
      const a = inc * DEG;
      const d = { x: nIn.x * Math.cos(a) - nIn.y * Math.sin(a), y: nIn.x * Math.sin(a) + nIn.y * Math.cos(a) };
      const tr = trace({ x: mid.x - d.x * 2, y: mid.y - d.y * 2, dx: d.x, dy: d.y }, [prism], 3, 2);
      if (tr.points.length < 4 || tr.tirPoints.length || tr.points[2].x <= 0 || tr.points[2].y <= 1e-9) continue;
      const q = tr.points[2], r = tr.points[3];
      const out = { x: r.x - q.x, y: r.y - q.y };
      const dev = Math.acos((out.x * d.x + out.y * d.y) / Math.hypot(out.x, out.y));
      minDev = Math.min(minDev, dev);
    }
    expect(minDev).toBeCloseTo(prismMinDeviation(n, A), 3);
  });
});

describe('charged particles', () => {
  const B = 0.1;
  const v = 1e6;
  const makeP = (): Particle => ({ x: 0, y: 0, z: 0, vx: v, vy: 0, vz: 0, q: E_CHARGE, m: M_PROTON });
  const field = (Bz: number, Ey = 0, Bx = 0): FieldRegion[] => [{ x: -10, y: -10, w: 20, h: 20, E: { x: 0, y: Ey, z: 0 }, B: { x: Bx, y: 0, z: Bz } }];

  it('circle radius = mv/qB and period = 2πm/qB, energy conserved', () => {
    const p = makeP();
    const T = cyclotronPeriod(M_PROTON, E_CHARGE, B);
    const dt = T / 2000;
    let minY = 0, maxY = 0;
    const ke0 = kineticEnergy(p);
    for (let i = 0; i < 2000; i++) {
      borisStep(p, field(B), dt);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const r = gyroRadius(M_PROTON, v, E_CHARGE, B);
    expect(rel((maxY - minY) / 2, r)).toBeLessThan(1e-3);
    // After one period it is back at the start.
    expect(Math.hypot(p.x, p.y)).toBeLessThan(r * 2e-3);
    expect(rel(kineticEnergy(p), ke0)).toBeLessThan(1e-12);
    // Positive charge, B out of page (+z), moving +x: force is −y (v × B = x × z = −y).
    expect(minY).toBeLessThan(-r * 1.9);
  });

  it('helix pitch = v∥ · 2πm/qB', () => {
    const p = makeP();
    p.vx = 0; p.vy = 6e5; p.vz = 0; p.vx = 8e5; // v∥ along x (B along x), v⊥ along y
    const T = cyclotronPeriod(M_PROTON, E_CHARGE, B);
    const n = 4000;
    for (let i = 0; i < n; i++) borisStep(p, field(0, 0, B), T / n);
    expect(rel(p.x, helixPitch(M_PROTON, 8e5, E_CHARGE, B))).toBeLessThan(1e-9);
  });

  it('velocity selector passes v = E/B undeflected', () => {
    const E = v * B;
    expect(selectorSpeed(E, B)).toBe(v);
    const p = makeP();
    // Force from B is −y for +q; E must point +y to cancel.
    for (let i = 0; i < 1000; i++) borisStep(p, field(B, E), 1e-9);
    expect(Math.abs(p.y)).toBeLessThan(1e-9);
    const slow = makeP();
    slow.vx = 0.8 * v;
    for (let i = 0; i < 1000; i++) borisStep(slow, field(B, E), 1e-9);
    expect(slow.y).toBeGreaterThan(1e-4); // slower particles are pushed by E
  });
});

describe('circuits (MNA)', () => {
  it('series and parallel resistors', () => {
    const c: Component[] = [
      { kind: 'V', id: 'E', a: 1, b: 0, volts: 12 },
      { kind: 'R', id: 'R1', a: 1, b: 2, ohms: 4 },
      { kind: 'R', id: 'R2', a: 2, b: 0, ohms: 6 },
      { kind: 'R', id: 'R3', a: 2, b: 0, ohms: 3 },
    ];
    const s = solve(c);
    const Req = 4 + parallelR(6, 3);
    expect(s.current.E).toBeCloseTo(12 / Req, 10);
    expect(s.current.R2 + s.current.R3).toBeCloseTo(s.current.R1, 10);
  });

  it('two-source network obeys Kirchhoff (hand-solved)', () => {
    // E1=10V (r=1) and E2=5V (r=0.5) in parallel feeding R=4Ω.
    const c: Component[] = [
      { kind: 'V', id: 'E1', a: 1, b: 0, volts: 10, r: 1 },
      { kind: 'V', id: 'E2', a: 1, b: 0, volts: 5, r: 0.5 },
      { kind: 'R', id: 'R', a: 1, b: 0, ohms: 4 },
    ];
    const s = solve(c);
    // Node voltage V: (10−V)/1 + (5−V)/0.5 = V/4 → V = 20/(3.25) = 6.1538…
    const V = 20 / 3.25;
    expect(s.v[1]).toBeCloseTo(V, 10);
    expect(s.current.E1).toBeCloseTo(10 - V, 10);
    expect(s.current.E2).toBeCloseTo((5 - V) / 0.5, 10);
  });

  it('balanced Wheatstone bridge: galvanometer current is zero', () => {
    const bridge = (R4: number): Component[] => [
      { kind: 'V', id: 'E', a: 1, b: 0, volts: 6 },
      { kind: 'R', id: 'P', a: 1, b: 2, ohms: 100 },
      { kind: 'R', id: 'Q', a: 2, b: 0, ohms: 200 },
      { kind: 'R', id: 'R', a: 1, b: 3, ohms: 50 },
      { kind: 'R', id: 'S', a: 3, b: 0, ohms: R4 },
      { kind: 'R', id: 'G', a: 2, b: 3, ohms: 10 },
    ];
    expect(Math.abs(solve(bridge(100)).current.G)).toBeLessThan(1e-9); // P/Q = R/S
    expect(Math.abs(solve(bridge(120)).current.G)).toBeGreaterThan(1e-4);
  });

  it('RC charging follows V0(1 − e^(−t/RC))', () => {
    const R = 1000, C = 1e-3, V0 = 9;
    const comps: Component[] = [
      { kind: 'V', id: 'E', a: 1, b: 0, volts: V0 },
      { kind: 'R', id: 'R', a: 1, b: 2, ohms: R },
      { kind: 'C', id: 'C', a: 2, b: 0, farads: C },
    ];
    let cap = { C: 0 };
    const dt = 1e-4;
    const tau = R * C;
    for (let t = 0; t < tau - 1e-12; t += dt) cap = stepTransient(comps, cap, dt).capV as { C: number };
    expect(rel(cap.C, V0 * (1 - Math.exp(-1)))).toBeLessThan(2e-3);
  });
});

describe('mechanics', () => {
  it('incline then rough floor: stopping point matches energy method', () => {
    const theta = 30 * DEG, L = 4, mu1 = 0.2, mu2 = 0.4;
    const track: TrackPiece[] = [
      { length: L, angle: theta, muK: mu1, muS: 0.25 },
      { length: 50, angle: 0, muK: mu2, muS: 0.5 },
    ];
    const st = { s: 0, v: 0, t: 0, stopped: false, piece: 0 };
    for (let i = 0; i < 100000 && !st.stopped; i++) slideStep(track, st, 1 / 240);
    const vBottom = inclineExitSpeed(L, theta, mu1);
    const expected = L + stoppingDistance(vBottom, mu2);
    expect(st.stopped).toBe(true);
    expect(rel(st.s, expected)).toBeLessThan(1e-9);
  });

  it('block stays put when tan θ ≤ μs', () => {
    const st = { s: 0, v: 0, t: 0, stopped: false, piece: 0 };
    slideStep([{ length: 5, angle: 20 * DEG, muK: 0.3, muS: 0.4 }], st, 1);
    expect(st.s).toBe(0);
    expect(st.stopped).toBe(true);
  });

  it('Atwood machine', () => {
    const { a, T } = atwood(5, 3);
    expect(a).toBeCloseTo((2 * G_EARTH) / 8, 12);
    expect(T).toBeCloseTo((2 * 5 * 3 * G_EARTH) / 8, 12);
    expect(tablePulley(1, 10, 0.3, 0.2).a).toBe(0);
    expect(tablePulley(5, 10, 0.3, 0.2).a).toBeCloseTo(((5 - 2) * G_EARTH) / 15, 12);
  });

  it('collisions conserve momentum; elastic conserves KE; e=0 sticks', () => {
    const [v1, v2] = collide1D(2, 3, 1, -1, 1);
    expect(2 * v1 + v2).toBeCloseTo(2 * 3 - 1, 12);
    expect(0.5 * 2 * v1 * v1 + 0.5 * v2 * v2).toBeCloseTo(0.5 * 2 * 9 + 0.5, 12);
    const [w1, w2] = collide1D(2, 3, 1, 0, 0);
    expect(w1).toBeCloseTo(w2, 12);
    expect(w1).toBeCloseTo(2, 12);
    const [e1, e2] = collide1D(1, 4, 1, 0, 1); // equal masses swap
    expect(e1).toBeCloseTo(0, 12);
    expect(e2).toBeCloseTo(4, 12);
  });

  it('torque balance', () => {
    expect(netTorque([{ m: 2, x: -0.3 }, { m: 3, x: 0.2 }])).toBeCloseTo(0, 12);
  });
});

describe('oscillations', () => {
  const period = (sim: { step(dt: number): void; t: number }, get: () => number, dt: number) => {
    // time between two successive upward zero crossings
    const crossings: number[] = [];
    let prev = get();
    while (crossings.length < 3) {
      sim.step(dt);
      const cur = get();
      if (prev < 0 && cur >= 0) crossings.push(sim.t - dt * (cur / (cur - prev)));
      prev = cur;
    }
    return crossings[2] - crossings[1];
  };

  it('small-angle pendulum period = 2π√(L/g)', () => {
    const p = new Pendulum(1.2, 2 * DEG);
    expect(rel(period(p, () => p.theta, 1e-3), pendulumPeriod(1.2))).toBeLessThan(1e-3);
  });

  it('large-angle pendulum matches the exact (AGM) period', () => {
    const p = new Pendulum(1, 60 * DEG);
    expect(rel(period(p, () => p.theta, 1e-3), pendulumPeriodExact(1, 60 * DEG))).toBeLessThan(1e-5);
  });

  it('spring–mass period = 2π√(m/k), energy conserved', () => {
    const o = new Oscillator(0.5, 20, 0, 0, 0, 0.1);
    const e0 = o.energy();
    expect(rel(period(o, () => o.x, 1e-3), springPeriod(0.5, 20))).toBeLessThan(1e-5);
    expect(rel(o.energy(), e0)).toBeLessThan(1e-6);
  });

  it('driven damped oscillator reaches the predicted steady-state amplitude', () => {
    const m = 1, k = 40, c = 0.8, F0 = 2, w = Math.sqrt(k / m);
    const o = new Oscillator(m, k, c, F0, w);
    for (let i = 0; i < 60_000; i++) o.step(1e-3); // 60 s, transients gone (τ = 2.5 s)
    let amp = 0;
    for (let i = 0; i < 3000; i++) { o.step(1e-3); amp = Math.max(amp, Math.abs(o.x)); }
    expect(rel(amp, drivenAmplitude(m, k, c, F0, w))).toBeLessThan(2e-3);
  });

  it('string harmonics fₙ = n v / 2L', () => {
    expect(stringHarmonic(2, 0.5, 100, 0.01)).toBeCloseTo((2 * 100) / (2 * 0.5), 9);
  });
});
