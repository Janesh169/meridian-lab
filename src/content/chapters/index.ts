/** All chapters, in order, plus the outline for chapters still to be written. */
/** Outline entries for chapters that aren't built yet (shown as "coming next"). */
import type { Chapter, Upgrade } from '../../story/types';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { OUTLINE } from './outline';

export const CHAPTERS: Chapter[] = [CH1, CH2];
export { OUTLINE };

export const UPGRADES: Upgrade[] = [
  { id: 'dock-lights', label: 'Dock lights', description: 'The cable-car bay is lit again.' },
  { id: 'beam-violet', label: 'Violet laser', description: 'A new beam colour for the optics bench.', beam: '#9d7bff' },
  { id: 'annex-lights', label: 'Reactor gauge', description: 'The reactor gauge in the hub shows live energy.' },
  { id: 'beam-green', label: 'Green laser', description: 'A new beam colour for the optics bench.', beam: '#4dff9a' },
  { id: 'lantern-key', label: 'Lantern key', description: 'Access to the Lantern Room.' },
  { id: 'east-heat', label: 'East wing heating', description: 'The ferns are warm again.' },
  { id: 'beam-amber', label: 'Amber laser', description: 'A new beam colour for the optics bench.', beam: '#ffb648' },
  { id: 'grid-map', label: 'Grid map', description: 'A live map of every load in the station.' },
  { id: 'probe', label: 'Branch probe', description: 'MOSS can listen to the hidden circuit.' },
  { id: 'shaft-lights', label: 'Shaft lights', description: 'The descent shaft is lit.' },
];

export function nextOutline() {
  return OUTLINE.find((o) => !CHAPTERS.some((c) => c.id === o.id));
}
