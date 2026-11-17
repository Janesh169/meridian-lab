/**
 * Side experiments: short standalone puzzles (3–5 min). The hub offers them when
 * the next story segment won't fit in the time left, or when reactor energy is
 * low. They unlock as each puzzle type appears in the story.
 */
import type { PuzzleDef } from '../../puzzles/framework';
import { C } from '../../render/draw';

export interface SideExperiment {
  def: PuzzleDef;
  /** Unlocked after this story puzzle is solved. */
  unlockAfter: string;
}

export const SIDE_EXPERIMENTS: SideExperiment[] = [
  {
    unlockAfter: 'ch1.drop1',
    def: {
      id: 'sx.cart',
      type: 'projectile',
      title: 'Moving Cart',
      brief: 'A supply cart rolls toward you at 2 m/s. Drop the capsule into it.',
      estMinutes: 3,
      params: {
        view: { x: -2, y: -1, w: 28, h: 13 },
        launcher: { x: 0, y: 0.5 },
        angle: { min: 5, max: 85, step: 0.5 },
        speed: { fixed: 15 },
        target: { x: 24, y: 0.05, w: 1.6, h: 0.6, vx: -2 },
        platforms: [{ x: -2, y: -1, w: 28, h: 1 }],
      },
      initial: { angle: 45 },
      solution: { angle: 35 },
      hints: ['While the capsule flies, the cart keeps rolling. Aim for where the cart will be.', 'A higher lob stays in the air longer, so the cart travels further to meet it.'],
      codex: 'proj.moving',
    },
  },
  {
    unlockAfter: 'ch1.laser2',
    def: {
      id: 'sx.focus',
      type: 'laser',
      title: 'Focus',
      brief: 'Three parallel beams must all land on a tiny sensor. Slide the converging lens (f = 1.2 m) into place.',
      estMinutes: 3,
      params: {
        view: { x: 0, y: 0.5, w: 7.2, h: 3 },
        source: { x: 0.3, y: 2, angle: 0 },
        beams: [-0.15, 0, 0.15],
        fixed: [{ kind: 'wall', id: 'back', x1: 7, y1: 0.5, x2: 7, y2: 3.5 }],
        movables: [{ id: 'L', label: 'Lens', kind: 'lens', rail: { x1: 1, y1: 2, x2: 6, y2: 2 }, fixedAngle: 90, length: 0.8, focal: 1.2 }],
        target: { x1: 6.5, y1: 1.96, x2: 6.5, y2: 2.04 },
        preview: 2,
      },
      initial: { 'L.pos': 20 },
      solution: { 'L.pos': 86 },
      hints: ['A converging lens brings parallel light together at one point: its focal point.', 'The sensor must sit exactly one focal length behind the lens.'],
      codex: 'optics.lens',
    },
  },
  {
    unlockAfter: 'ch1.circ2',
    def: {
      id: 'sx.rc',
      type: 'circuit',
      title: 'Timed Door',
      brief: 'The blast door opens when its capacitor reaches 5 V. It must open 2.0–2.5 s after you close the switch.',
      estMinutes: 3,
      params: {
        view: { x: -1.8, y: 0, w: 11.8, h: 6 },
        pins: {
          b0: { x: 1, y: 1, node: 0 }, b1: { x: 1, y: 4.5, node: 1 },
          s1: { x: 2.6, y: 4.5, node: 1 }, s2: { x: 4.4, y: 4.5, node: 2 },
          r1: { x: 5, y: 4.5, node: 2 }, r2: { x: 8.5, y: 4.5, node: 3 },
          c0: { x: 8.5, y: 1, node: 0 },
        },
        wires: [['b1', 's1'], ['s2', 'r1'], ['c0', 'b0']],
        parts: [
          { id: 'E', type: 'battery', from: 'b0', to: 'b1', label: 'Supply', volts: 9 },
          { id: 'SW', type: 'switch', from: 's1', to: 's2', label: 'Switch' },
          { id: 'R', type: 'resistor', from: 'r1', to: 'r2', label: 'R', ohms: { control: 'R' } },
          { id: 'C', type: 'capacitor', from: 'r2', to: 'c0', label: 'C', farads: 470e-6 },
        ],
        controls: [{ kind: 'choice', id: 'R', label: 'Resistor', options: [1000, 2200, 4700, 5600, 6800, 10000].map((v) => ({ value: v, label: v >= 1000 ? `${v / 1000} kΩ` : `${v} Ω` })) }],
        goals: [{ kind: 'capThreshold', part: 'C', volts: 5, tMin: 2.0, tMax: 2.5, label: 'Door' }],
      },
      initial: { R: 1000 },
      solution: { R: 5600 },
      hints: ['A bigger resistor lets charge trickle in more slowly.', 'Charging slows down as the capacitor fills. 5 V of 9 V is a little over half full.'],
      codex: 'circ.rc',
    },
  },
  {
    unlockAfter: 'ch1.mech3',
    def: {
      id: 'sx.torque',
      type: 'torque',
      title: 'Balance Beam',
      brief: 'Hang a counterweight so the gantry beam stays level.',
      estMinutes: 2,
      params: {
        view: { x: -1.3, y: -1.2, w: 2.6, h: 1.9 },
        beamL: 2,
        beamM: 2,
        fixed: [{ m: 6, x: -0.6, label: 'toolbox' }],
        masses: [2, 3, 4, 5, 8],
        pos: { min: 0.1, max: 1.0 },
        holdTime: 3,
        tipAngle: 8,
      },
      initial: { m: 2, x: 0.5 },
      solution: { m: 4, x: 0.9 },
      hints: ['What matters is weight times distance from the pivot.', 'Half the mass needs twice the distance.'],
      codex: 'mech.torque',
    },
  },
  {
    unlockAfter: 'ch1.part1',
    def: {
      id: 'sx.spectro',
      type: 'particle',
      title: 'Isotope Sorter',
      brief: 'Neon-20 and neon-22 ions come in together. Only neon-22 may land in the collector.',
      estMinutes: 3,
      params: {
        view: { x: 0, y: 0, w: 0.8, h: 0.6 },
        emitter: { x: 0.05, y: 0.02, angle: 90 },
        species: [
          { label: 'Ne-20⁺', charge: 1, massAmu: 19.992, color: C.amber, mustHit: false },
          { label: 'Ne-22⁺', charge: 1, massAmu: 21.991, color: C.cyan, mustHit: true },
        ],
        regions: [{ id: 'mag', x: 0, y: 0.05, w: 0.8, h: 0.55, B: { control: 'B' }, label: 'Analyser' }],
        controls: [{ kind: 'slider', id: 'B', label: 'Analyser field (+ out of page)', min: -200, max: 200, step: 0.5, fmt: (v: number) => `${v.toFixed(1)} mT` }],
        walls: [
          { x1: 0, y1: 0, x2: 0.8, y2: 0 }, { x1: 0, y1: 0.6, x2: 0.8, y2: 0.6 },
          { x1: 0, y1: 0, x2: 0, y2: 0.6 }, { x1: 0.8, y1: 0, x2: 0.8, y2: 0.6 },
        ],
        detector: { x1: 0.55, y1: 0.005, x2: 0.58, y2: 0.005 },
        symbolSpacing: 0.05,
      },
      initial: { B: 60, V: 2000 },
      solution: { B: 118, V: 2000 },
      hints: ['Both ions get the same kinetic energy, so the heavier one moves more slowly but carries more momentum.', 'More momentum means a wider circle. Tune the field until the wider one lands in the slot.'],
      codex: 'em.spectrometer',
    },
  },
  {
    unlockAfter: 'ch1.osc1',
    def: {
      id: 'sx.spring',
      type: 'spring',
      title: 'Spring Metronome',
      brief: 'Tune the mass on a 40 N/m spring to beat once per second.',
      estMinutes: 2,
      params: { view: { x: 0, y: 0, w: 1.4, h: 1.0 }, period: 1.0, beats: 5, tol: 0.08, k: 40, amplitude: 0.08, mass: { min: 0.1, max: 3, step: 0.01 } },
      initial: { m: 0.4 },
      solution: { m: 1.01 },
      hints: ['A heavier mass oscillates more slowly on the same spring.', 'Doubling the period takes four times the mass.'],
      codex: 'osc.spring',
    },
  },
  {
    unlockAfter: 'ch1.osc1',
    def: {
      id: 'sx.resonance',
      type: 'resonance',
      title: 'Rattle the Latch',
      brief: 'A jammed hatch sits on springs. Shake it at the right frequency to rattle the latch free.',
      estMinutes: 3,
      params: { view: { x: 0, y: 0, w: 2.4, h: 1.6 }, m: 2, k: 320, c: 2, F0: 2, threshold: 0.06, maxTime: 12, f: { min: 0.5, max: 5, step: 0.01 } },
      initial: { f: 1.0 },
      solution: { f: 2.01 },
      hints: ['Every springy object has a natural frequency it prefers to vibrate at.', 'Drive it at its natural frequency and each push adds to the last.'],
      codex: 'osc.resonance',
    },
  },
];
