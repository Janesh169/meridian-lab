/**
 * Lab Notes: one short codex entry per concept, unlocked after a puzzle is solved.
 * Each is written in Dr. Rao's voice. Keep them to one or two lines plus the
 * relation, so they read in ten seconds.
 */
export interface CodexEntry {
  id: string;
  title: string;
  topic: string;
  /** One or two lines of plain explanation. */
  body: string;
  /** The relation, for anyone who wants it. */
  formula?: string;
  /** The JEE tie-in: a quick "where this shows up". */
  jee?: string;
}

export const CODEX: CodexEntry[] = [
  { id: 'proj.complementary', topic: 'Kinematics', title: 'Twin angles', body: 'On level ground, angles θ and 90° − θ give the same range. 45° gives the most range only when the launch and landing heights are equal.', formula: 'R = u² sin 2θ / g', jee: 'Watch for "same range" questions: the two angles add up to 90°.' },
  { id: 'proj.minspeed', topic: 'Kinematics', title: 'Cheapest shot', body: 'To reach a point above you with the least speed, aim halfway between straight up and the line to the target.', formula: 'u²min = g(y + √(x² + y²)),  θ = 45° + ½·tan⁻¹(y/x)', jee: 'The "bounding parabola" (parabola of safety) idea.' },
  { id: 'proj.height', topic: 'Kinematics', title: 'Launching from a height', body: 'When you launch from above your landing point, the angle for maximum range is below 45°. The extra fall time does part of the work.', formula: 'y = x tanθ − g x² / (2u² cos²θ)', jee: 'Use the trajectory equation with a negative y for a landing point below the launch.' },
  { id: 'proj.moving', topic: 'Kinematics', title: 'Leading a target', body: 'Work out where the target will be at the moment of landing. Time of flight links the two motions.', formula: 'x_target(t) = x₀ + v t', jee: 'Relative-motion and "two bodies meet" problems.' },
  { id: 'optics.reflection', topic: 'Ray optics', title: 'Turning a beam', body: 'Angle of incidence equals angle of reflection. Rotating a mirror by α swings the reflected beam by 2α.', formula: 'i = r;  deviation = 180° − 2i', jee: 'Rotating-mirror and multiple-mirror deviation problems.' },
  { id: 'optics.slab', topic: 'Ray optics', title: 'Lateral shift', body: 'A beam crossing a parallel slab comes out parallel to itself but shifted sideways. A higher index or more tilt gives a bigger shift.', formula: 'd = t·sin(i − r) / cos r,   sin i = n sin r', jee: 'Lateral displacement and normal-shift questions.' },
  { id: 'optics.tir', topic: 'Ray optics', title: 'Total internal reflection', body: 'Light inside a dense medium that hits a surface beyond the critical angle reflects completely. A 45° prism face needs n > √2 ≈ 1.414.', formula: 'sin C = 1/n', jee: 'Prism, optical-fibre and "will light emerge?" questions.' },
  { id: 'optics.lens', topic: 'Ray optics', title: 'Focal point', body: 'A converging lens brings parallel rays together at its focal point. An object at distance u forms an image at distance v.', formula: '1/v − 1/u = 1/f', jee: 'Use sign conventions carefully: real images have positive v.' },
  { id: 'circ.parallel', topic: 'Current electricity', title: 'Parallel paths', body: 'Resistors in parallel always combine to less than the smallest one. Every source also has internal resistance, which eats some of the voltage.', formula: '1/R = 1/R₁ + 1/R₂;   I = E / (R + r)', jee: 'Terminal-voltage and equivalent-resistance problems.' },
  { id: 'circ.kirchhoff', topic: 'Current electricity', title: 'Batteries in parallel', body: 'Kirchhoff’s junction rule says current in = current out, and the loop rule says EMFs equal the IR drops. A weaker battery in parallel can be charged backwards by a stronger one.', formula: 'ΣI = 0 at a node;   ΣE = ΣIR round a loop', jee: 'Parallel cells: E_eq = (E₁/r₁ + E₂/r₂)/(1/r₁ + 1/r₂).' },
  { id: 'circ.wheatstone', topic: 'Current electricity', title: 'Balanced bridge', body: 'No current flows through the galvanometer when both arms divide the voltage in the same ratio. That gives an unknown resistance without measuring any current.', formula: 'P/Q = R/S  (equivalently P·S = Q·R)', jee: 'Metre bridge and post-office box questions.' },
  { id: 'circ.rc', topic: 'Current electricity', title: 'Charging a capacitor', body: 'A capacitor charges quickly at first, then more and more slowly. After one time constant RC it reaches about 63% of the supply voltage.', formula: 'V = V₀(1 − e^(−t/RC))', jee: 'Time to reach a given voltage: t = RC·ln(V₀/(V₀ − V)).' },
  { id: 'mech.friction', topic: 'Newton’s laws', title: 'Friction on a ramp', body: 'A block stays put while tan θ ≤ μs. Once it slides, kinetic friction removes μk·N of force all the way.', formula: 'a = g(sin θ − μk cos θ);   d_floor = v² / (2 μ g)', jee: 'Angle of repose: tan θ = μs.' },
  { id: 'mech.atwood', topic: 'Newton’s laws', title: 'Atwood machine', body: 'The weight difference accelerates both masses, so a small surplus gives a gentle acceleration.', formula: 'a = (m₁ − m₂) g / (m₁ + m₂);   T = 2 m₁ m₂ g / (m₁ + m₂)', jee: 'Constraint and pulley problems.' },
  { id: 'mech.momentum', topic: 'Momentum', title: 'Coupling carts', body: 'Momentum is conserved in every collision, but kinetic energy only in elastic ones. A latch (e = 0) gives the smallest final speed to the struck cart.', formula: 'm₁u₁ + m₂u₂ = m₁v₁ + m₂v₂;   e = (v₂ − v₁)/(u₁ − u₂)', jee: 'Coefficient of restitution problems.' },
  { id: 'mech.torque', topic: 'Rotation', title: 'Balance', body: 'A beam balances when the clockwise and anticlockwise torques about the pivot are equal.', formula: 'Σ m g x = 0  (τ = r × F)', jee: 'Equilibrium of rigid bodies.' },
  { id: 'em.radius', topic: 'E & B fields', title: 'Circles in a magnet', body: 'A uniform magnetic field bends a charge into a circle. A stronger field makes a tighter circle, and reversing the field reverses the turn.', formula: 'r = mv / qB;   v = √(2qV/m)', jee: 'Radius after acceleration through V: r = √(2mV/q) / B.' },
  { id: 'em.selector', topic: 'E & B fields', title: 'Velocity selector', body: 'Crossed E and B fields push in opposite directions. Only particles with speed E/B fly straight through.', formula: 'qE = qvB  ⇒  v = E/B', jee: 'Bainbridge mass spectrometer and Thomson e/m experiments.' },
  { id: 'em.spectrometer', topic: 'E & B fields', title: 'Sorting isotopes', body: 'Ions with the same charge and the same accelerating voltage separate by mass, because r ∝ √m.', formula: 'r = √(2mV/q) / B', jee: 'Ratio questions: r₁/r₂ = √(m₁/m₂).' },
  { id: 'osc.pendulum', topic: 'SHM', title: 'Pendulum period', body: 'For small swings the period depends only on length and g, not on mass. Large swings run slightly slow.', formula: 'T = 2π√(L/g)', jee: 'A 1 m pendulum has a period close to 2 s (the "seconds pendulum").' },
  { id: 'osc.spring', topic: 'SHM', title: 'Spring–mass', body: 'A stiffer spring is faster and a heavier mass is slower. Period goes as the square root of mass.', formula: 'T = 2π√(m/k)', jee: 'Springs in series and parallel change k.' },
  { id: 'osc.resonance', topic: 'Oscillations', title: 'Resonance', body: 'Driving a system at its natural frequency adds energy every cycle, so the amplitude builds up until damping balances it.', formula: 'f₀ = (1/2π)√(k/m)', jee: 'Forced oscillations and sharpness of resonance.' },
];

export function codexEntry(id: string): CodexEntry | undefined {
  return CODEX.find((c) => c.id === id);
}
