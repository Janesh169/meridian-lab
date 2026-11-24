/**
 * The original story outline for Chapters 2–6, kept as design notes. All six
 * chapters are now built (ch1.ts … ch6.ts); the hub only shows an outline entry
 * as "coming next" if its chapter doesn't exist yet, so a future Chapter 7 can be
 * announced by adding it here first.
 */
import type { ChapterOutline } from '../../story/types';

export const OUTLINE: ChapterOutline[] = [
  {
    id: 'ch2',
    title: 'Reserve Power',
    topics: 'Current electricity (RC circuits, networks) · Ray optics (lenses)',
    summary:
      'MOSS finally talks. On the night of the test, the Lantern drew so much power that the east wing failed, and MOSS sealed the lower levels by protocol. You restore the east wing’s power grid and its optics lab. Rao’s notes describe the Lantern as a “resonant trap for light and charge.” The chapter ends when the restored grid shows a second, hidden load: something below Level −3 has been drawing power all along.',
    puzzles: ['circuit: RC timing doors in series', 'circuit: Kirchhoff network with three sources', 'laser: converging and diverging lens pairs (telescope)', 'laser: concave mirror focus with spherical aberration', 'circuit: potentiometer EMF comparison'],
  },
  {
    id: 'ch3',
    title: 'The Orbital Garden',
    topics: 'Rotation, torque, collisions, circular motion',
    summary:
      'The atrium where MOSS kept its ferns is a slowly rotating greenhouse ring, and its bearings have seized. While you restore it, a crackling radio voice cuts in: Tomas Okafor, a former technician, claims he’s been sheltering in the old observatory since the night of the test. He’s friendly and helpful, and he knows things he shouldn’t.',
    puzzles: ['torque: balance a rotating boom with moving loads', 'collision: 2D billiard-style docking with restitution', 'projectile: launch seed pods across a rotating frame', 'mechanism: rolling without slipping down an incline', 'mechanism: conical pendulum speed governor'],
  },
  {
    id: 'ch4',
    title: 'Fields',
    topics: 'E and B fields: helices, mass spectrometer, cyclotron',
    summary:
      'In the particle hall you learn the Lantern is a Penning trap built to hold a single exotic ion. The “dated tomorrow” logs turn out to be a deliberate clock-sync trick Rao planted so that only a researcher who rebuilt the station would find them. The trap is still running on a trickle of power, and it is failing.',
    puzzles: ['particle: helical path threading through rings (pitch)', 'particle: cyclotron frequency matching', 'particle: mass spectrometer with three isotopes', 'particle: E×B drift through a gap', 'circuit: charging the trap capacitor bank'],
  },
  {
    id: 'ch5',
    title: 'Standing Waves',
    topics: 'SHM, resonance, waves on strings, sound',
    summary:
      'Tomas arrives by cable car. The trap’s containment is tuned by resonating strings and cavities, and he tries to detune them to force the trap open, while MOSS has to choose between its sealing protocol and opening hatch −4 for Rao.',
    puzzles: ['oscillation: standing-wave node placement on a tensioned wire', 'oscillation: coupled pendulums energy transfer', 'oscillation: driven damped oscillator with damping control', 'oscillation: beats between two tuning forks', 'laser: interference timing via path length'],
  },
  {
    id: 'ch6',
    title: 'Lantern',
    topics: 'Mixed finale: every puzzle type',
    summary:
      'The full truth: during the containment failure, MOSS sealed Rao inside the deep lab, where the shielding kept her alive, and has kept her supplied ever since. Its sarcasm was hiding seven years of guilt about not being able to get her out. You rebuild the Lantern’s containment, lock Tomas out of the systems, and open the deep lab together. The final puzzle uses all six disciplines in one chained experiment.',
    puzzles: ['chain: projectile → laser trigger → circuit → particle → resonance', 'boss: rebuild containment with live E/B tuning', 'epilogue: free-play lab sandbox'],
  },
];
