/**
 * The story engine: a cursor (chapter, segment, node index) moving through the
 * chapter data, with reactor-energy gates and a pacing estimate. These are pure
 * functions over the save's Progress.
 */
import { ENGINE } from '../config';
import { CHAPTERS } from '../content/chapters';
import { SIDE_EXPERIMENTS } from '../content/puzzles/side';
import { puzzleDef } from '../puzzles';
import type { Progress, Save } from '../core/save';
import type { Chapter, Segment, StoryNode } from './types';

export type SegmentState = 'done' | 'current' | 'available' | 'needs-energy' | 'locked';

export function chapter(id: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export function allSegments(): Segment[] {
  return CHAPTERS.flatMap((c) => c.segments);
}

export function segment(id: string | null): Segment | undefined {
  return id ? allSegments().find((s) => s.id === id) : undefined;
}

export function energyAvailable(save: Pick<Save, 'energyEarned' | 'progress'>): number {
  return Math.floor(save.energyEarned) - save.progress.energySpent;
}

/** The next segment that isn't done (in story order), or undefined when everything is finished. */
export function nextSegment(p: Progress): Segment | undefined {
  return allSegments().find((s) => !p.completedSegments.includes(s.id));
}

export function segmentState(save: Pick<Save, 'energyEarned' | 'progress'>, seg: Segment): SegmentState {
  const p = save.progress;
  if (p.completedSegments.includes(seg.id)) return 'done';
  if (p.segmentId === seg.id) return 'current';
  const next = nextSegment(p);
  if (!next || next.id !== seg.id) return 'locked';
  return energyAvailable(save) >= seg.energyCost ? 'available' : 'needs-energy';
}

/** Begin (or resume) a segment, paying its energy cost once. Mutates progress. */
export function startSegment(save: Save, segId: string): boolean {
  const seg = segment(segId);
  if (!seg) return false;
  const st = segmentState(save, seg);
  if (st === 'current') return true;
  if (st !== 'available') return false;
  save.progress.energySpent += seg.energyCost;
  save.progress.segmentId = seg.id;
  save.progress.nodeIndex = 0;
  return true;
}

export function currentNode(p: Progress): StoryNode | undefined {
  return segment(p.segmentId)?.nodes[p.nodeIndex];
}

/**
 * Move past the current node. A puzzle node can only be passed once it's solved
 * or skipped. Returns the new node, or undefined when the segment has ended.
 */
export function advance(save: Save): StoryNode | undefined {
  const p = save.progress;
  const seg = segment(p.segmentId);
  if (!seg) return undefined;
  const node = seg.nodes[p.nodeIndex];
  if (node?.t === 'puzzle' && !p.puzzles[node.id]) return node;
  if (node?.t === 'reward' && !p.upgrades.includes(node.upgrade)) p.upgrades.push(node.upgrade);
  if (node?.t === 'end' || p.nodeIndex >= seg.nodes.length - 1) {
    if (!p.completedSegments.includes(seg.id)) p.completedSegments.push(seg.id);
    p.segmentId = null;
    p.nodeIndex = 0;
    return undefined;
  }
  p.nodeIndex++;
  return seg.nodes[p.nodeIndex];
}

/** Side experiments currently available (their unlocking story puzzle is solved). */
export function availableSideExperiments(p: Progress) {
  return SIDE_EXPERIMENTS.filter((s) => p.puzzles[s.unlockAfter]);
}

/* ------------------------------------------------------------------ pacing */

/** The player's speed relative to estimates (median, clamped to 0.6–2.5). */
export function speedFactor(samples: number[]): number {
  if (samples.length < 2) return 1;
  const s = [...samples].sort((a, b) => a - b);
  const m = s[Math.floor(s.length / 2)];
  return Math.min(2.5, Math.max(0.6, m));
}

/** Estimated minutes left in a segment from a node index. */
export function segmentMinutesLeft(seg: Segment, fromNode: number, p: Progress, samples: number[]): number {
  const f = speedFactor(samples);
  let min = 0;
  for (let i = fromNode; i < seg.nodes.length; i++) {
    const n = seg.nodes[i];
    if (n.t === 'puzzle') {
      if (!p.puzzles[n.id]) min += (puzzleDef(n.id)?.estMinutes ?? 3) * f;
    } else min += n.t === 'log' ? 0.35 : 0.12;
  }
  return min;
}

export interface PacingAdvice {
  estMinutes: number;
  fits: boolean;
  /** A side experiment that fits, if the segment doesn't. */
  suggestion: string | null;
}

export function pacingAdvice(save: Save, seg: Segment, minutesLeft: number): PacingAdvice {
  const from = save.progress.segmentId === seg.id ? save.progress.nodeIndex : 0;
  const est = segmentMinutesLeft(seg, from, save.progress, save.speedSamples);
  // Fitting = we can at least finish the next puzzle and reach a checkpoint inside the break.
  const fits = est + ENGINE.pacingBufferMin <= minutesLeft;
  let suggestion: string | null = null;
  if (!fits) {
    const f = speedFactor(save.speedSamples);
    const opts = availableSideExperiments(save.progress)
      .filter((s) => s.def.estMinutes * f + ENGINE.pacingBufferMin <= minutesLeft)
      .sort((a, b) => Number(save.progress.puzzles[a.def.id] ? 1 : 0) - Number(save.progress.puzzles[b.def.id] ? 1 : 0));
    suggestion = opts[0]?.def.id ?? null;
  }
  return { estMinutes: est, fits, suggestion };
}

/** Estimated minutes until the next puzzle in the segment is done (for the in-segment check). */
export function nextPuzzleMinutes(save: Save): number | null {
  const seg = segment(save.progress.segmentId);
  if (!seg) return null;
  const f = speedFactor(save.speedSamples);
  for (let i = save.progress.nodeIndex; i < seg.nodes.length; i++) {
    const n = seg.nodes[i];
    if (n.t === 'puzzle' && !save.progress.puzzles[n.id]) return (puzzleDef(n.id)?.estMinutes ?? 3) * f;
  }
  return null;
}
