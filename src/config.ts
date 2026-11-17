/**
 * Every tunable number in the game lives here.
 *
 * RULES are the study/break discipline rules. They are copied into the save as the
 * player's settings and can be edited in-game (Settings screen). Changes that make
 * the rules stricter apply at once, and changes that loosen them apply after
 * ENGINE.loosenDelayMs. Edit DEFAULT_RULES to change the defaults for a fresh save.
 */
export interface Rules {
  /** Minutes of study needed to earn one minute of break. */
  studyMinPerBreakMin: number;
  /** A study session shorter than this earns nothing. */
  minStudyToEarnMin: number;
  /** Banked break time never exceeds this (it doesn't stack past the cap). */
  maxBreakMin: number;
  /** After a lock, you must study at least this long before the lock lifts. */
  lockReleaseStudyMin: number;
  /** A forgotten study timer stops counting after this many minutes. */
  maxStudySessionMin: number;
  /** Starting the study block later than this after a lock counts as an overrun. */
  overrunGraceMin: number;
  /** Streak day: at least this many hours studied and no overruns. */
  streakMinStudyHours: number;
  /** Diegetic warnings fire at these many minutes remaining. */
  warnAtMin: number[];
}

export const DEFAULT_RULES: Rules = {
  studyMinPerBreakMin: 4,
  minStudyToEarnMin: 25,
  maxBreakMin: 40,
  lockReleaseStudyMin: 25,
  maxStudySessionMin: 300,
  overrunGraceMin: 3,
  streakMinStudyHours: 4,
  warnAtMin: [5, 1],
};

/** Limits for the in-game rules editor, so a typo can't break the game. */
export const RULE_LIMITS: Record<keyof Omit<Rules, 'warnAtMin'>, [number, number, number]> = {
  // [min, max, step]
  studyMinPerBreakMin: [2, 10, 0.5],
  minStudyToEarnMin: [10, 90, 5],
  maxBreakMin: [5, 40, 5],
  lockReleaseStudyMin: [10, 90, 5],
  maxStudySessionMin: [60, 480, 30],
  overrunGraceMin: [0, 15, 1],
  streakMinStudyHours: [1, 12, 0.5],
};

export const ENGINE = {
  /** How often the app re-checks the clock (it never counts time, it only compares timestamps). */
  tickMs: 250,
  /** Backward clock jumps smaller than this are tolerated (network time sync). */
  backwardToleranceMs: 2 * 60_000,
  /** The alarm repeats this often while LOCKED. */
  alarmRepeatMs: 60_000,
  /** Length of one alarm burst, in seconds. */
  alarmDurationS: 8,
  /** Vibration pattern for the lock (ms on/off). */
  vibratePattern: [800, 200, 800, 200, 800, 200, 1500],
  /** Tab lease: only one tab may play at a time. */
  leaseHeartbeatMs: 2_000,
  leaseTtlMs: 6_000,
  /** Loosening a rule takes effect after this delay. */
  loosenDelayMs: 24 * 60 * 60_000,
  /** Puzzle progress is auto-saved at least this often while playing. */
  autosaveMs: 3_000,
  /** Extra minutes the pacing helper keeps in reserve. */
  pacingBufferMin: 1,
  /** How many study sessions to keep in the log. */
  maxLogEntries: 2000,
};

export const STORAGE_KEYS = {
  save: 'meridianlab.save',
  backup: 'meridianlab.save.bak',
  rev: 'meridianlab.rev',
  lease: 'meridianlab.lease',
  channel: 'meridianlab',
  idbName: 'meridianlab',
};

/** Reactor energy: 1 study minute = 1 kJ of "reserve". */
export const ENERGY_PER_STUDY_MIN = 1;
