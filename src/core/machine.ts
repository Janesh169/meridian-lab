/**
 * The study/break state machine. It is pure, with no clocks, storage or DOM.
 *
 *   IDLE ─startStudy─► STUDYING ─endStudy─► BREAK_AVAILABLE (bank > 0) or IDLE
 *   BREAK_AVAILABLE ─startBreak─► ON_BREAK ─time up─► LOCKED
 *   ON_BREAK ─endBreakEarly─► IDLE (the rest of the break is forfeited)
 *   LOCKED ─startStudy─► STUDYING(release) ─endStudy ≥ lockRelease─► unlocked
 *                                          ─endStudy < lockRelease─► LOCKED again
 *   any ─clock moved backwards─► LOCKED (tamper)
 *
 * Every time-based transition happens in `resolve(state, now)`, which compares
 * `now` with absolute timestamps stored in the state. Nothing counts time, so a
 * reload, a sleeping tablet or a frozen tab can never stretch a break.
 */
import type { Rules } from '../config';
import { ENGINE } from '../config';

export type Phase = 'IDLE' | 'STUDYING' | 'BREAK_AVAILABLE' | 'ON_BREAK' | 'LOCKED';
export type LockReason = 'break_end' | 'tamper' | 'import';

export interface TimerState {
  phase: Phase;
  /** Banked break minutes (may be fractional only if rules make it so). */
  bankMin: number;
  studyStartedAt: number | null;
  /** True when this study session was started from LOCKED. */
  studyIsRelease: boolean;
  breakStartedAt: number | null;
  breakEndsAt: number | null;
  lockedAt: number | null;
  lockReason: LockReason | null;
  /** Highest wall-clock time ever observed, used to detect backward jumps. */
  lastSeenWall: number;
  /** Warnings already fired for the current break (minutes values). */
  warned: number[];
}

export type MachineEvent =
  | { type: 'startStudy' }
  | { type: 'endStudy' }
  | { type: 'startBreak' }
  | { type: 'endBreakEarly' }
  | { type: 'importLock' };

/** Side-effect records the app turns into log entries, sounds and so on. */
export type Effect =
  | { kind: 'studyLogged'; start: number; end: number; minutes: number; earnedMin: number; release: boolean; autoCapped: boolean; voided?: boolean }
  | { kind: 'breakStarted'; start: number; endsAt: number; minutes: number }
  | { kind: 'breakEnded'; start: number; plannedEnd: number; end: number; endedEarly: boolean }
  | { kind: 'locked'; at: number; reason: LockReason }
  | { kind: 'lockStudyStarted'; lockedAt: number; startedAt: number; lateMin: number; overrun: boolean }
  | { kind: 'unlocked'; at: number }
  | { kind: 'tamper'; at: number; lastSeen: number }
  | { kind: 'warning'; minutesLeft: number }
  | { kind: 'rejected'; reason: string };

export interface Result {
  state: TimerState;
  effects: Effect[];
}

export const MIN = 60_000;

export function initialTimer(now: number): TimerState {
  return {
    phase: 'IDLE',
    bankMin: 0,
    studyStartedAt: null,
    studyIsRelease: false,
    breakStartedAt: null,
    breakEndsAt: null,
    lockedAt: null,
    lockReason: null,
    lastSeenWall: now,
    warned: [],
  };
}

/** Break minutes earned by a study session of `studyMin` minutes. */
export function earnedFor(studyMin: number, rules: Rules): number {
  if (studyMin < rules.minStudyToEarnMin) return 0;
  return Math.min(rules.maxBreakMin, Math.floor(studyMin / rules.studyMinPerBreakMin));
}

/** The phase to rest in when not studying, on a break or locked. */
function restPhase(bankMin: number): Phase {
  return bankMin > 0 ? 'BREAK_AVAILABLE' : 'IDLE';
}

function lock(s: TimerState, at: number, reason: LockReason, effects: Effect[]): TimerState {
  effects.push({ kind: 'locked', at, reason });
  return {
    ...s,
    phase: 'LOCKED',
    studyStartedAt: null,
    studyIsRelease: false,
    breakStartedAt: null,
    breakEndsAt: null,
    lockedAt: at,
    lockReason: reason,
    warned: [],
  };
}

/** Finish a study session that ran from studyStartedAt to `end`. */
function finishStudy(s: TimerState, end: number, rules: Rules, autoCapped: boolean, effects: Effect[]): TimerState {
  const start = s.studyStartedAt ?? end;
  const minutes = Math.max(0, (end - start) / MIN);
  const release = s.studyIsRelease;
  const earned = earnedFor(minutes, rules);

  if (release && minutes < rules.lockReleaseStudyMin) {
    // The lock-release block was abandoned early: log the study, go back to LOCKED.
    effects.push({ kind: 'studyLogged', start, end, minutes, earnedMin: 0, release, autoCapped });
    effects.push({ kind: 'locked', at: end, reason: s.lockReason ?? 'break_end' });
    return {
      ...s,
      phase: 'LOCKED',
      studyStartedAt: null,
      studyIsRelease: false,
      lockedAt: s.lockedAt ?? end,
    };
  }

  effects.push({ kind: 'studyLogged', start, end, minutes, earnedMin: earned, release, autoCapped });
  if (release) effects.push({ kind: 'unlocked', at: end });
  const bankMin = Math.min(rules.maxBreakMin, s.bankMin + earned);
  return {
    ...s,
    phase: restPhase(bankMin),
    bankMin,
    studyStartedAt: null,
    studyIsRelease: false,
    lockedAt: null,
    lockReason: null,
  };
}

/**
 * Apply time-based transitions. Call it on every tick, render, focus and load.
 * It is idempotent: calling it twice with the same `now` changes nothing.
 */
export function resolve(state: TimerState, now: number, rules: Rules): Result {
  const effects: Effect[] = [];
  let s = state;

  // 1. Backward clock jump means tampering.
  const tooEarly =
    now < s.lastSeenWall - ENGINE.backwardToleranceMs ||
    (s.phase === 'STUDYING' && s.studyStartedAt !== null && now < s.studyStartedAt - ENGINE.backwardToleranceMs) ||
    (s.phase === 'ON_BREAK' && s.breakStartedAt !== null && now < s.breakStartedAt - ENGINE.backwardToleranceMs);
  if (tooEarly) {
    effects.push({ kind: 'tamper', at: now, lastSeen: s.lastSeenWall });
    if (s.phase === 'STUDYING' && s.studyStartedAt !== null) {
      effects.push({ kind: 'studyLogged', start: s.studyStartedAt, end: s.studyStartedAt, minutes: 0, earnedMin: 0, release: s.studyIsRelease, autoCapped: false, voided: true });
    }
    // A clock that moves backwards voids the bank too.
    s = lock({ ...s, bankMin: 0 }, now, 'tamper', effects);
    s = { ...s, lastSeenWall: now };
    return { state: s, effects };
  }

  // 2. Break expiry.
  if (s.phase === 'ON_BREAK' && s.breakEndsAt !== null) {
    if (now >= s.breakEndsAt) {
      effects.push({ kind: 'breakEnded', start: s.breakStartedAt ?? s.breakEndsAt, plannedEnd: s.breakEndsAt, end: s.breakEndsAt, endedEarly: false });
      s = lock(s, s.breakEndsAt, 'break_end', effects);
    } else {
      const leftMin = (s.breakEndsAt - now) / MIN;
      const fired: number[] = [];
      for (const w of rules.warnAtMin) {
        if (leftMin <= w && !s.warned.includes(w)) fired.push(w);
      }
      if (fired.length) {
        // Only announce the most urgent one if several are due at once (e.g. after a sleep).
        effects.push({ kind: 'warning', minutesLeft: Math.min(...fired) });
        s = { ...s, warned: [...s.warned, ...fired] };
      }
    }
  }

  // 3. Forgotten study timer.
  if (s.phase === 'STUDYING' && s.studyStartedAt !== null) {
    const capAt = s.studyStartedAt + rules.maxStudySessionMin * MIN;
    if (now >= capAt) s = finishStudy(s, capAt, rules, true, effects);
  }

  if (now > s.lastSeenWall) s = { ...s, lastSeenWall: now };
  return { state: s, effects };
}

/** Apply a user action. Always resolves time first. */
export function dispatch(state: TimerState, ev: MachineEvent, now: number, rules: Rules): Result {
  const r = resolve(state, now, rules);
  const effects = r.effects;
  let s = r.state;
  // A tamper lock in the same instant overrides the user's action.
  if (effects.some((e) => e.kind === 'tamper') && ev.type !== 'importLock') return { state: s, effects };

  const reject = (reason: string): Result => ({ state: s, effects: [...effects, { kind: 'rejected', reason }] });

  switch (ev.type) {
    case 'startStudy': {
      if (s.phase === 'STUDYING') return reject('already studying');
      if (s.phase === 'ON_BREAK') {
        // Ending a break early to go and study: allowed, and the rest is forfeited.
        effects.push({ kind: 'breakEnded', start: s.breakStartedAt ?? now, plannedEnd: s.breakEndsAt ?? now, end: now, endedEarly: true });
        s = { ...s, phase: 'IDLE', breakStartedAt: null, breakEndsAt: null, warned: [] };
      }
      const release = s.phase === 'LOCKED';
      if (release && s.lockedAt !== null) {
        const lateMin = Math.max(0, (now - s.lockedAt) / MIN);
        effects.push({ kind: 'lockStudyStarted', lockedAt: s.lockedAt, startedAt: now, lateMin, overrun: lateMin > rules.overrunGraceMin });
      }
      s = { ...s, phase: 'STUDYING', studyStartedAt: now, studyIsRelease: release };
      return { state: s, effects };
    }
    case 'endStudy': {
      if (s.phase !== 'STUDYING') return reject('not studying');
      s = finishStudy(s, now, rules, false, effects);
      return { state: s, effects };
    }
    case 'startBreak': {
      if (s.phase !== 'BREAK_AVAILABLE' || s.bankMin <= 0) return reject('no break available');
      const minutes = Math.min(s.bankMin, rules.maxBreakMin);
      const endsAt = now + minutes * MIN;
      effects.push({ kind: 'breakStarted', start: now, endsAt, minutes });
      s = { ...s, phase: 'ON_BREAK', bankMin: 0, breakStartedAt: now, breakEndsAt: endsAt, warned: [] };
      return { state: s, effects };
    }
    case 'endBreakEarly': {
      if (s.phase !== 'ON_BREAK') return reject('not on a break');
      effects.push({ kind: 'breakEnded', start: s.breakStartedAt ?? now, plannedEnd: s.breakEndsAt ?? now, end: now, endedEarly: true });
      s = { ...s, phase: 'IDLE', breakStartedAt: null, breakEndsAt: null, warned: [] };
      return { state: s, effects };
    }
    case 'importLock': {
      s = lock({ ...s, bankMin: 0 }, now, 'import', effects);
      return { state: s, effects };
    }
  }
}

/** Milliseconds left on the current break (0 if not on a break). */
export function breakMsLeft(s: TimerState, now: number): number {
  if (s.phase !== 'ON_BREAK' || s.breakEndsAt === null) return 0;
  return Math.max(0, s.breakEndsAt - now);
}

/** Minutes studied so far in the current session. */
export function studyMinSoFar(s: TimerState, now: number): number {
  if (s.phase !== 'STUDYING' || s.studyStartedAt === null) return 0;
  return Math.max(0, (now - s.studyStartedAt) / MIN);
}

/** True when the game itself (puzzles, story) may be played. */
export function canPlay(s: TimerState): boolean {
  return s.phase === 'ON_BREAK';
}
