/** Importing this module registers every puzzle type and gathers all puzzle defs. */
import './types/projectile';
import './types/laser';
import './types/particle';
import './types/circuit';
import './types/mechanism';
import './types/oscillation';
import './types/rotation';
import { CH1_PUZZLES } from '../content/puzzles/ch1';
import { CH2_PUZZLES } from '../content/puzzles/ch2';
import { CH3_PUZZLES } from '../content/puzzles/ch3';
import { SIDE_EXPERIMENTS } from '../content/puzzles/side';
import type { PuzzleDef } from './framework';

export { createPuzzle } from './framework';

const all = new Map<string, PuzzleDef>();
for (const d of [...CH1_PUZZLES, ...CH2_PUZZLES, ...CH3_PUZZLES]) all.set(d.id, d);
for (const s of SIDE_EXPERIMENTS) all.set(s.def.id, s.def);

export function puzzleDef(id: string): PuzzleDef | undefined {
  return all.get(id);
}
export function allPuzzleDefs(): PuzzleDef[] {
  return [...all.values()];
}

/** Which of the six JEE families a puzzle type belongs to (for the hub and codex). */
export const FAMILY: Record<string, string> = {
  projectile: 'Kinematics',
  laser: 'Ray optics',
  particle: 'E & B fields',
  circuit: 'Current electricity',
  incline: 'Newton’s laws',
  atwood: 'Newton’s laws',
  collision: 'Momentum',
  torque: 'Rotation',
  pendulum: 'SHM',
  spring: 'SHM',
  resonance: 'Oscillations',
  rolling: 'Rotation',
  puck: 'Momentum (2D)',
  governor: 'Circular motion',
};
