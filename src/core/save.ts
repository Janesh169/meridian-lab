/**
 * The save file: its shape, defaults and migrations.
 *
 * SCHEMA must go up by one whenever the shape changes, with a matching step in
 * MIGRATIONS. Old saves are upgraded on load, so copying a newer index.html over
 * an older one never loses progress.
 */
import { DEFAULT_RULES, type Rules } from '../config';
import { initialTimer, type TimerState } from './machine';

export const SCHEMA = 1;

export interface SessionRecord {
  kind: 'study' | 'break';
  start: number;
  end: number;
  minutes: number;
  /** study: break minutes earned */
  earnedMin?: number;
  release?: boolean;
  autoCapped?: boolean;
  voided?: boolean;
  /** break */
  plannedMin?: number;
  endedEarly?: boolean;
  /** break: minutes between the lock and starting the study block (null = not resolved yet) */
  lateMin?: number | null;
  overrun?: boolean | null;
}

export interface PuzzleRecord {
  runs: number;
  timeMs: number;
  stars: number;
  solvedAt: number;
  skipped?: boolean;
}

export interface PuzzleSnapshot {
  puzzleId: string;
  /** Controls / placement state of the puzzle, owned by the puzzle type. */
  data: unknown;
  runs: number;
  elapsedMs: number;
  savedAt: number;
}

export interface Progress {
  /** Story cursor */
  chapterId: string;
  segmentId: string | null;
  nodeIndex: number;
  completedSegments: string[];
  puzzles: Record<string, PuzzleRecord>;
  codex: string[];
  /** Codex entries unlocked but not yet opened */
  codexUnread: string[];
  energySpent: number;
  upgrades: string[];
  sideExperimentsDone: string[];
}

export interface Prefs {
  textScale: number;
  ambience: boolean;
  sfxVolume: number;
  seenFileTip: boolean;
  seenIntro: boolean;
}

export interface Save {
  schema: number;
  rev: number;
  installId: string;
  createdAt: number;
  timer: TimerState;
  rules: Rules;
  pendingRules: { rules: Rules; effectiveAt: number } | null;
  prefs: Prefs;
  progress: Progress;
  puzzleState: PuzzleSnapshot | null;
  sessions: SessionRecord[];
  /** Total study minutes ever (reactor energy earned). */
  energyEarned: number;
  tamperLog: { at: number; lastSeen: number }[];
  /** Ratios of actual/estimated puzzle time, used for the pacing helper. */
  speedSamples: number[];
  importedAt: number | null;
}

export function randomId(): string {
  const a = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else { a[0] = Math.random() * 2 ** 32; a[1] = Math.random() * 2 ** 32; }
  return a[0].toString(36) + a[1].toString(36);
}

export function defaultProgress(): Progress {
  return {
    chapterId: 'ch1',
    segmentId: null,
    nodeIndex: 0,
    completedSegments: [],
    puzzles: {},
    codex: [],
    codexUnread: [],
    energySpent: 0,
    upgrades: [],
    sideExperimentsDone: [],
  };
}

export function defaultSave(now: number): Save {
  return {
    schema: SCHEMA,
    rev: 0,
    installId: randomId(),
    createdAt: now,
    timer: initialTimer(now),
    rules: { ...DEFAULT_RULES, warnAtMin: [...DEFAULT_RULES.warnAtMin] },
    pendingRules: null,
    prefs: { textScale: 1, ambience: true, sfxVolume: 0.7, seenFileTip: false, seenIntro: false },
    progress: defaultProgress(),
    puzzleState: null,
    sessions: [],
    energyEarned: 0,
    tamperLog: [],
    speedSamples: [],
    importedAt: null,
  };
}

type Migration = (old: any) => any;
/** MIGRATIONS[n] upgrades a schema-n save to schema n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // 1: (s) => ({ ...s, schema: 2, newField: default }),
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fill in any missing fields with defaults, so a partial or older save always loads. */
function deepFill<T>(value: unknown, def: T): T {
  if (Array.isArray(def)) return (Array.isArray(value) ? value : def) as T;
  if (isObj(def)) {
    if (!isObj(value)) return def;
    const out: Record<string, unknown> = { ...value };
    for (const k of Object.keys(def)) out[k] = deepFill((value as any)[k], (def as any)[k]);
    return out as T;
  }
  if (def === null) return (value === undefined ? null : value) as T;
  return (typeof value === typeof def ? value : def) as T;
}

/**
 * Turn whatever was in storage into a valid current-schema Save.
 * Throws if the data is not a save at all.
 */
export function upgradeSave(raw: unknown, now: number): Save {
  if (!isObj(raw) || typeof raw.schema !== 'number') throw new Error('Not a Meridian Lab save');
  let s: any = raw;
  if (s.schema > SCHEMA) throw new Error(`This save comes from a newer version (schema ${s.schema}). Update the game file.`);
  while (s.schema < SCHEMA) {
    const m = MIGRATIONS[s.schema];
    if (!m) throw new Error(`No migration from schema ${s.schema}`);
    s = m(s);
  }
  const def = defaultSave(now);
  const filled = deepFill<Save>(s, def);
  // Nullable nested objects need special care.
  filled.timer = deepFill(s.timer, def.timer);
  filled.pendingRules = isObj(s.pendingRules) ? { rules: deepFill(s.pendingRules.rules, def.rules), effectiveAt: Number(s.pendingRules.effectiveAt) || 0 } : null;
  filled.puzzleState = isObj(s.puzzleState) && typeof s.puzzleState.puzzleId === 'string' ? (s.puzzleState as PuzzleSnapshot) : null;
  filled.importedAt = typeof s.importedAt === 'number' ? s.importedAt : null;
  if (typeof filled.installId !== 'string' || !filled.installId) filled.installId = def.installId;
  return filled;
}
