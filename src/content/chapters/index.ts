/** All chapters, in order, plus the outline for chapters still to be written. */
/** Outline entries for chapters that aren't built yet (shown as "coming next"). */
import type { Chapter, Upgrade } from '../../story/types';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import { CH4 } from './ch4';
import { CH5 } from './ch5';
import { CH6 } from './ch6';
import { OUTLINE } from './outline';

export const CHAPTERS: Chapter[] = [CH1, CH2, CH3, CH4, CH5, CH6];
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
  { id: 'garden-light', label: 'Garden lamps', description: 'The orbital garden’s grow-lamps are at full brightness.' },
  { id: 'ring-spin', label: 'Garden ring', description: 'The greenhouse ring turns again.' },
  { id: 'radio', label: 'Radio mast', description: 'Clear radio on every band.' },
  { id: 'vault-log', label: 'Vault signal log', description: 'Every signal the station has heard.' },
  { id: 'telescope', label: 'Telescope', description: 'A view of the whole valley.', beam: '#ff4fd8' },
  { id: 'hall-power', label: 'Particle hall', description: 'The trap’s live status is on the hub.' },
  { id: 'cyclotron', label: 'Cyclotron', description: 'The calibration beam is running.' },
  { id: 'drift', label: 'Drift channel', description: 'Ions move without the main magnets.' },
  { id: 'spectrometer', label: 'Spectrometer', description: 'The trap’s contents can be measured.' },
  { id: 'lantern-core', label: 'Lantern core', description: 'The trap is stable for 90 days.' },
  { id: 'dock-bolt', label: 'Dock bolt', description: 'The dock door is bolted.' },
  { id: 'fringe-net', label: 'Fringe sensors', description: 'Interference motion sensors across the east wing.' },
  { id: 'bells', label: 'Sympathetic bells', description: 'Coupled alarm bells in the gallery.' },
  { id: 'protocol-off', label: 'Protocol 7 suspended', description: 'MOSS overrode itself.' },
  { id: 'hatch-open', label: 'Hatch −4', description: 'Open, at last.' },
  { id: 'rao-lab', label: 'Rao’s lab', description: 'Rao has joined the team.' },
  { id: 'evidence', label: 'Lift log', description: 'Proof of what happened on the night of the test.' },
  { id: 'backup-panel', label: 'Backup panel', description: 'Shared control of the trap.' },
  { id: 'antiphase', label: 'Anti-phase drive', description: 'Cancels unwanted vibration in the cavity.' },
  { id: 'lantern-held', label: 'The Lantern', description: 'Both ions held. Reserve indefinite.', beam: '#bff6ff' },
];

export function nextOutline() {
  return OUTLINE.find((o) => !CHAPTERS.some((c) => c.id === o.id));
}
