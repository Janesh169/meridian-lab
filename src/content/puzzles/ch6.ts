/**
 * Chapter 6 puzzles: "Lantern". The finale mixes every discipline and builds up to
 * the Penning trap: the Lantern itself. The last segment is a chained experiment.
 */
import type { PuzzleDef } from '../../puzzles/framework';
import { C } from '../../render/draw';

const GREEN = { label: 'Green', nm: 532, color: C.green };
const TRAP_VIEW = { x: -0.0048, y: -0.0045, w: 0.0135, h: 0.009 };
const flip = (id: string, label: string) => ({ kind: 'choice' as const, id, label, options: [{ value: 0, label: 'forward' }, { value: 1, label: 'reversed' }] });

export const CH6_PUZZLES: PuzzleDef[] = [
  /* -------------------------------------------- Segment 1: Rao */
  {
    id: 'ch6.circ1',
    type: 'circuit',
    title: 'Life Support',
    brief: 'Rao’s air scrubber needs 9.5–10.5 V. Three old cells in series, each can be flipped, and the fan has four taps.',
    estMinutes: 4,
    params: {
      view: { x: -1.8, y: 0, w: 13.6, h: 6.4 },
      pins: {
        g: { x: 0.8, y: 1, node: 0 }, a: { x: 0.8, y: 2.6, node: 1 }, a2: { x: 0.8, y: 3.0, node: 1 }, b: { x: 0.8, y: 4.6, node: 2 }, b2: { x: 0.8, y: 5.0, node: 2 }, c: { x: 3.4, y: 5.0, node: 3 },
        c2: { x: 4.4, y: 5.0, node: 3 }, f1: { x: 8.6, y: 5.0, node: 3 }, f0: { x: 8.6, y: 1, node: 0 },
      },
      wires: [['a', 'a2'], ['b', 'b2'], ['c', 'c2', 'f1'], ['f0', 'g']],
      parts: [
        { id: 'C1', type: 'battery', from: 'g', to: 'a', label: 'Cell 1', volts: 6, r: 0.5, flip: 'f1' },
        { id: 'C2', type: 'battery', from: 'a2', to: 'b', label: 'Cell 2', volts: 6, r: 0.5, flip: 'f2' },
        { id: 'C3', type: 'battery', from: 'b2', to: 'c', label: 'Cell 3', volts: 1.5, r: 0.2, flip: 'f3' },
        { id: 'F', type: 'coil', from: 'f1', to: 'f0', label: 'Scrubber fan', ohms: { control: 'R' } },
      ],
      controls: [flip('f1', 'Cell 1 (6 V)'), flip('f2', 'Cell 2 (6 V)'), flip('f3', 'Cell 3 (1.5 V)'), { kind: 'choice', id: 'R', label: 'Fan tap', options: [4, 6, 8, 12].map((v) => ({ value: v, label: `${v} Ω` })) }],
      goals: [{ kind: 'voltage', part: 'F', min: 9.5, max: 10.5, label: 'Fan voltage' }],
    },
    initial: { f1: 0, f2: 1, f3: 0, R: 8 },
    solution: { f1: 0, f2: 0, f3: 0, R: 4 },
    hints: ['In series, EMFs add, and a reversed cell subtracts.', 'The cells’ internal resistance eats some voltage. Heavier loads (smaller taps) eat more.'],
    codex: 'circ.series',
  },
  {
    id: 'ch6.cpl1',
    type: 'coupled',
    title: 'Rao’s Door',
    brief: 'Rao’s inner door uses her favourite lock: coupled pendulums (0.8 m, 1 kg). The energy must reach the bolt in 5.5–6.2 s.',
    estMinutes: 3,
    params: { view: { x: -1.1, y: -0.3, w: 2.4, h: 1.5 }, L: 0.8, m: 1, k: { min: 0.05, max: 5, step: 0.01 }, theta0: 5, window: { min: 5.5, max: 6.2 }, maxT: 8 },
    initial: { k: 3 },
    solution: { k: 1.8 },
    hints: ['Transfer time is π divided by the gap between the two normal-mode frequencies.', 'A stiffer spring widens the gap and shortens the transfer.'],
    codex: 'osc.coupled',
  },
  {
    id: 'ch6.str1',
    type: 'string',
    title: 'Rao’s Sonometer',
    brief: 'Rao tuned the trap by ear. Pick a wire and a hanging mass so it rings in two loops at 60 Hz.',
    estMinutes: 3,
    params: { view: { x: -0.25, y: -0.4, w: 1.6, h: 0.8 }, L: { fixed: 0.8 }, mass: { min: 0.1, max: 4, step: 0.01 }, wires: [{ label: 'Nylon', mu: 0.002 }, { label: 'Steel', mu: 0.005 }, { label: 'Bronze', mu: 0.012 }], f: { fixed: 60 }, driveA: 0.0015, gamma: 6, goalN: 2, settle: 4 },
    initial: { M: 0.5, wire: 2 },
    solution: { M: 1.17, wire: 1 },
    hints: ['Two loops: the wire is one wavelength, so v = f × 0.8 m.', 'Tension T = μv². A lighter wire needs less tension for the same wave speed.'],
    codex: 'wave.string',
  },

  /* -------------------------------------------- Segment 2: The Truth */
  {
    id: 'ch6.ydse1',
    type: 'ydse',
    title: 'Motion Grid',
    brief: 'Rao’s green interferometer guards the corridor. Set both slit separation and screen distance so fringes fall every 2.5 mm.',
    estMinutes: 3,
    params: { view: { x: 0, y: 0, w: 9.5, h: 5 }, lambdas: [GREEN], d: { min: 0.1, max: 1, step: 0.005 }, D: { min: 0.5, max: 2.5, step: 0.01 }, bright: [0, 2.5, -2.5], dark: [1.25, -1.25], half: 4 },
    initial: { d: 0.5, D: 1 },
    solution: { d: 0.4, D: 1.88 },
    hints: ['Fringe width = λD/d. Many pairs of d and D give the same width.', 'Keep the ratio D/d at 2.5 mm ÷ 532 nm.'],
    codex: 'wo.fringe',
  },
  {
    id: 'ch6.puck1',
    type: 'puck',
    title: 'Off the Cushion',
    brief: 'Rao’s evidence drive sits on her air table behind a jammed puck. Bank the striker off the top cushion to knock the drive into the slot.',
    estMinutes: 4,
    params: {
      view: { x: -0.1, y: -0.15, w: 2.2, h: 1.45 }, table: { x: 0, y: 0, w: 2, h: 1.2 },
      cue: { x: 0.3, y: 0.6, m: 0.5, r: 0.05 }, target: { x: 1.5, y: 0.6, m: 0.5, r: 0.05 },
      others: [{ x: 0.9, y: 0.6, m: 3, r: 0.08 }],
      aim: { min: -80, max: 80 }, speed: { min: 0.3, max: 2.5 }, e: 0.95, eWall: 0.9, mu: 0.04,
      pocket: { x: 1.85, y: 0.6, r: 0.08 },
    },
    initial: { aim: 0, speed: 1.5 },
    solution: { aim: 46, speed: 2 },
    hints: ['Reflect the target in the cushion and aim at the reflection.', 'The cushion keeps the velocity along it and reverses (and shrinks) the part into it.'],
    codex: 'mom.bank',
  },
  {
    id: 'ch6.dop1',
    type: 'doppler',
    title: 'Track Tomas',
    brief: 'Tomas is backing away down the corridor at 6 m/s with his 800 Hz beacon. Zero-beat it to confirm his speed.',
    estMinutes: 3,
    params: { view: { x: 0, y: 0, w: 9, h: 4 }, f0: 800, v: 340, vs: { fixed: -6 }, vo: { fixed: 0 }, ref: { min: 760, max: 840, step: 0.1 }, tol: 0.5, sourceLabel: 'Tomas’s beacon' },
    initial: { fr: 800 },
    solution: { fr: 786.1 },
    hints: ['A receding source stretches its waves, so the pitch drops.', 'f′ = f v / (v + v_s) when the source moves away.'],
    codex: 'snd.doppler',
  },

  /* -------------------------------------------- Segment 3: The Lantern Room */
  {
    id: 'ch6.pen1',
    type: 'penning',
    title: 'The Lantern',
    brief: 'The Lantern is a Penning trap: magnet plus electrodes. Set the trap voltage so ion A bounces at 150–160 kHz and both ions stay trapped.',
    estMinutes: 4,
    params: {
      view: TRAP_VIEW, d: 0.005, rMax: 0.004, zMax: 0.003,
      ions: [{ label: 'Ion A', charge: 1, massAmu: 40, color: C.cyan }, { label: 'Ion B', charge: 1, massAmu: 120, color: C.magenta }],
      B: { fixed: 1.4 }, V: { min: 0, max: 25, step: 0.05 }, lock: { ion: 0, min: 150, max: 160 }, hold: 3e-4, r0: 0.001, z0: 0.001,
    },
    initial: { V: 4 },
    solution: { V: 10 },
    hints: ['The axial bounce frequency grows with the square root of the voltage.', 'Too much voltage pushes the heavy ion outward faster than the magnet can hold it.'],
    codex: 'em.penning',
  },
  {
    id: 'ch6.cyc1',
    type: 'cyclotron',
    title: 'Helion Booster',
    brief: 'The Lantern’s booster accelerates helium-3 ions (charge +2, mass 3) at 1.20 T. Tune the oscillator.',
    estMinutes: 3,
    params: { view: { x: -0.16, y: -0.15, w: 0.32, h: 0.31 }, ion: { label: 'Helion', charge: 2, massAmu: 3.0149 }, B: { fixed: 1.2 }, f: { min: 2, max: 20, step: 0.01 }, V0: 15000, gap: 0.01, R: 0.14, rExtract: 0.12, maxTurns: 40 },
    initial: { f: 9 },
    solution: { f: 12.21 },
    hints: ['What matters is q/m, and B.', 'f = qB / (2πm).'],
    codex: 'em.qm',
  },
  {
    id: 'ch6.gov1',
    type: 'governor',
    title: 'Pump Regulator',
    brief: 'The Lantern’s coolant pump regulator has 0.25 m arms. Spin it so they settle between 45° and 50°.',
    estMinutes: 3,
    params: { view: { x: -0.4, y: -0.05, w: 0.8, h: 0.5 }, L: { fixed: 0.25 }, rpm: { min: 30, max: 150, step: 1 }, window: { min: 45, max: 50 }, settle: 4 },
    initial: { rpm: 70 },
    solution: { rpm: 73 },
    hints: ['cos θ = g / (ω² L).', 'The angle changes quickly near the window. Use small steps.'],
    codex: 'circ.conical',
  },

  /* -------------------------------------------- Segment 4: Sabotage */
  {
    id: 'ch6.pen2',
    type: 'penning',
    title: 'Heavy Ions',
    brief: 'Tomas cut the Lantern’s magnet supply. The voltage is fixed at 12 V; bring the magnet back up enough to hold both heavy ions.',
    estMinutes: 3,
    params: {
      view: TRAP_VIEW, d: 0.005, rMax: 0.004, zMax: 0.003,
      ions: [{ label: 'Lantern-1', charge: 1, massAmu: 90, color: C.cyan }, { label: 'Lantern-2', charge: 1, massAmu: 120, color: C.magenta }],
      B: { min: 0.2, max: 2.5, step: 0.01 }, V: { fixed: 12 }, hold: 3e-4, r0: 0.001, z0: 0.001,
    },
    initial: { B: 0.7 },
    solution: { B: 1.3 },
    hints: ['The magnet must win against the outward electric push: ω_c² > 2ω_z².', 'Heavier ions need a stronger field. The threshold is B = √(2mV/(qd²)).'],
    codex: 'em.penningB',
  },
  {
    id: 'ch6.str2',
    type: 'string',
    title: 'Five Loops',
    brief: 'Tomas detuned the containment wire. A felt sits at two-fifths of its length. Find the drive frequency for five loops.',
    estMinutes: 4,
    params: { view: STRING_VIEW_6(), L: { fixed: 1.0 }, mass: { fixed: 1.0 }, wires: [{ label: 'Steel', mu: 0.006 }], f: { min: 5, max: 250, step: 0.1 }, driveA: 0.0015, gamma: 6, dampers: [0.4], goalN: 5, settle: 4 },
    initial: { f: 40 },
    solution: { f: 101 },
    hints: ['Felt at 2/5 allows only harmonics with a node there: the 5th, 10th…', 'Find the wave speed √(T/μ) first; then fₙ = n v / 2L.'],
    codex: 'wave.touch',
  },
  {
    id: 'ch6.res1',
    type: 'resonance',
    title: 'Retune the Cavity',
    brief: 'The trap’s RF cavity has a mechanical mode Tomas is exciting to shake the trap. Find it first: drive the 3 kg mass on 900 N/m.',
    estMinutes: 3,
    params: { view: { x: 0, y: 0, w: 2.4, h: 1.6 }, m: 3, k: 900, c: 3, F0: 3, threshold: 0.05, maxTime: 15, f: { min: 0.5, max: 6, step: 0.01 } },
    initial: { f: 1.5 },
    solution: { f: 2.76 },
    hints: ['Natural frequency (1/2π)√(k/m).', 'Close is not enough. Damping is light, so the peak is narrow.'],
    codex: 'osc.resonance',
  },

  /* -------------------------------------------- Segment 5: Lantern (chained finale) */
  {
    id: 'ch6.fin1',
    type: 'projectile',
    title: 'Key Throw',
    brief: 'Chain step 1: Tomas is dragging the trap cart away at 1 m/s. Throw the containment key into it, under the crane beam.',
    estMinutes: 3,
    params: {
      view: { x: -2, y: -1, w: 22, h: 10 },
      launcher: { x: 0, y: 0.5 },
      angle: { min: 5, max: 80, step: 0.5 },
      speed: { min: 6, max: 20, step: 0.1 },
      target: { x: 13, y: 0.05, w: 1.6, h: 0.6, vx: 1 },
      platforms: [{ x: -2, y: -1, w: 22, h: 1 }],
      hazards: [{ x: 4, y: 5.2, w: 9, h: 0.8 }],
    },
    initial: { angle: 60, speed: 14 },
    solution: { angle: 30, speed: 13.5 },
    hints: ['The beam blocks high lobs, so keep the arc under about 5 m.', 'Aim for where the cart will be when the key lands, not where it is now.'],
    codex: 'proj.moving',
  },
  {
    id: 'ch6.fin2',
    type: 'laser',
    title: 'Containment Light',
    brief: 'Chain step 2: turn the three-beam laser up into the trap with a prism (no mirrors survive), through the fixed lens, into the viewport.',
    estMinutes: 4,
    params: {
      view: { x: 0, y: 0.4, w: 7, h: 3.6 },
      source: { x: 0.3, y: 1, angle: 0 },
      beams: [-0.08, 0, 0.08],
      fixed: [
        { kind: 'lens', id: 'Lfix', x: 4, y: 2.4, angle: 0, height: 1.2, focal: 1.0 },
        { kind: 'wall', id: 'roofL', x1: 0, y1: 3.5, x2: 3.96, y2: 3.5 },
        { kind: 'wall', id: 'roofR', x1: 4.04, y1: 3.5, x2: 7, y2: 3.5 },
        { kind: 'wall', id: 'right', x1: 7, y1: 0.4, x2: 7, y2: 3.5 },
      ],
      movables: [{
        id: 'P', label: 'Prism', kind: 'block', rail: { x1: 2, y1: 1, x2: 6, y2: 1 }, angle: { min: -45, max: 45, step: 0.5 },
        shape: [{ x: -0.4, y: -0.4 }, { x: 0.4, y: 0.4 }, { x: -0.4, y: 0.4 }],
        materials: [{ label: 'Water cell', n: 1.33 }, { label: 'Crown glass', n: 1.52 }],
      }],
      target: { x1: 3.96, y1: 3.4, x2: 4.04, y2: 3.4 },
      preview: 2,
    },
    initial: { 'P.pos': 20, 'P.ang': 15, 'P.mat': 0 },
    solution: { 'P.pos': 50, 'P.ang': 0, 'P.mat': 1 },
    hints: ['A 45° face only totally reflects light if n > √2.', 'Then the beams go straight up, parallel to the lens axis, and the lens gathers them at its focus.'],
    codex: 'optics.tir',
  },
  {
    id: 'ch6.fin3',
    type: 'penning',
    title: 'Hold the Light',
    brief: 'Final step: Tomas’s jammer is ramping up a stray axial field. Set voltage and magnet so ion A locks at 160–175 kHz and both ions survive the jam.',
    estMinutes: 5,
    params: {
      view: TRAP_VIEW, d: 0.005, rMax: 0.004, zMax: 0.003,
      ions: [{ label: 'Ion A', charge: 1, massAmu: 40, color: C.cyan }, { label: 'Ion B', charge: 1, massAmu: 120, color: C.magenta }],
      B: { min: 0.2, max: 2, step: 0.01 }, V: { min: 0, max: 20, step: 0.05 }, lock: { ion: 0, min: 160, max: 175 }, hold: 3e-4, r0: 0.001, z0: 0.001, jam: 3e6,
    },
    initial: { V: 8, B: 0.8 },
    solution: { V: 12, B: 1.4 },
    hints: ['The jammer’s push is resisted by the axial “spring” qV/d²: more voltage holds the ions closer to the centre.', 'More voltage also pushes harder outward, so the heavy ion then needs a stronger magnet.'],
    codex: 'em.penningJam',
  },
];

function STRING_VIEW_6() {
  return { x: -0.2, y: -0.45, w: 1.8, h: 0.9 };
}
