/** All chapters, in order, plus the outline for chapters still to be written. */
import type { Chapter, Upgrade } from '../../story/types';
import { CH1 } from './ch1';
import { OUTLINE } from './outline';

export const CHAPTERS: Chapter[] = [CH1];
export { OUTLINE };

export const UPGRADES: Upgrade[] = [
  { id: 'dock-lights', label: 'Dock lights', description: 'The cable-car bay is lit again.' },
  { id: 'beam-violet', label: 'Violet laser', description: 'A new beam colour for the optics bench.', beam: '#9d7bff' },
  { id: 'annex-lights', label: 'Reactor gauge', description: 'The reactor gauge in the hub shows live energy.' },
  { id: 'beam-green', label: 'Green laser', description: 'A new beam colour for the optics bench.', beam: '#4dff9a' },
  { id: 'lantern-key', label: 'Lantern key', description: 'Access to the Lantern Room.' },
];
