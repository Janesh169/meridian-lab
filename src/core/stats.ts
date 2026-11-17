/** Daily totals and the study streak, computed from the session log. */
import type { Rules } from '../config';
import type { Save, SessionRecord } from './save';

export interface DayStats {
  /** Local date, YYYY-MM-DD */
  date: string;
  studyMin: number;
  breakMin: number;
  breaks: number;
  overruns: number;
  tampers: number;
  /** Meets the streak rule (enough study, no overruns, no tampering). */
  ok: boolean;
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1, 12);
  return dayKey(dt.getTime());
}

export function dailyStats(save: Pick<Save, 'sessions' | 'tamperLog'>, rules: Rules): Map<string, DayStats> {
  const days = new Map<string, DayStats>();
  const get = (k: string) => {
    let d = days.get(k);
    if (!d) { d = { date: k, studyMin: 0, breakMin: 0, breaks: 0, overruns: 0, tampers: 0, ok: false }; days.set(k, d); }
    return d;
  };
  for (const r of save.sessions) {
    const d = get(dayKey(r.start));
    if (r.kind === 'study') {
      if (!r.voided) d.studyMin += r.minutes;
    } else {
      d.breakMin += r.minutes;
      d.breaks += 1;
      if (r.overrun) d.overruns += 1;
    }
  }
  for (const t of save.tamperLog) get(dayKey(t.at)).tampers += 1;
  for (const d of days.values()) d.ok = d.studyMin >= rules.streakMinStudyHours * 60 && d.overruns === 0 && d.tampers === 0;
  return days;
}

export interface StreakInfo { current: number; best: number }

/**
 * Current streak: consecutive qualifying days ending today. If today doesn't
 * qualify *yet*, the streak counts up to yesterday, so it isn't shown as broken
 * at 9 a.m. A day with an overrun or tampering breaks it straight away.
 */
export function streak(days: Map<string, DayStats>, now: number): StreakInfo {
  const today = dayKey(now);
  let key = today;
  const t = days.get(today);
  if (!t || !t.ok) {
    if (t && (t.overruns > 0 || t.tampers > 0)) return { current: 0, best: bestStreak(days) };
    key = prevDayKey(today);
  }
  let current = 0;
  while (days.get(key)?.ok) {
    current++;
    key = prevDayKey(key);
  }
  return { current, best: Math.max(current, bestStreak(days)) };
}

function bestStreak(days: Map<string, DayStats>): number {
  const keys = [...days.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    const ok = days.get(k)!.ok;
    if (ok && prev !== null && prevDayKey(k) === prev && run > 0) run++;
    else run = ok ? 1 : 0;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export function breakOnTime(r: SessionRecord): 'on time' | 'overrun' | 'ended early' | 'pending' {
  if (r.kind !== 'break') return 'pending';
  if (r.endedEarly) return 'ended early';
  if (r.overrun === null || r.overrun === undefined) return 'pending';
  return r.overrun ? 'overrun' : 'on time';
}
