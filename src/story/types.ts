/** Story script format. Chapters are plain data, so new ones need no engine changes. */

export type Speaker = 'moss' | 'rao' | 'you' | 'tomas' | 'narration';

export type StoryNode =
  /** A line of dialogue or narration. */
  | { t: 'line'; who: Speaker; text: string }
  /** A recovered voice log (displayed as a tape transcript). */
  | { t: 'log'; title: string; text: string }
  /** Play a puzzle; the story waits until it's solved (or skipped). */
  | { t: 'puzzle'; id: string }
  /** Award a cosmetic lab upgrade. */
  | { t: 'reward'; upgrade: string; text: string }
  /** End of the segment: the cliffhanger shown on the "segment complete" card. */
  | { t: 'end'; cliff: string };

export interface Segment {
  id: string;
  title: string;
  /** Rough length for a first-time player, in minutes. */
  estMinutes: number;
  /** Reactor energy (kJ = study minutes) needed to restore this section. */
  energyCost: number;
  /** Tutorial tips that appear on the first puzzle of the segment. */
  room: string;
  nodes: StoryNode[];
}

export interface Chapter {
  id: string;
  title: string;
  segments: Segment[];
}

export interface ChapterOutline {
  id: string;
  title: string;
  topics: string;
  summary: string;
  puzzles: string[];
}

export interface Upgrade {
  id: string;
  label: string;
  description: string;
  /** Beam colour unlocked by this upgrade, if any. */
  beam?: string;
}
