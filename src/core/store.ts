/**
 * The single source of truth for the save, shared by every tab.
 *
 * Before each change, the store re-reads storage, and if another tab wrote a newer
 * revision it adopts that first. It then applies the change, bumps `rev`, writes
 * synchronously and tells the other tabs. Since the break timer is just one
 * stored timestamp, two tabs can never run two timers.
 */
import { ENGINE, STORAGE_KEYS, type Rules } from '../config';
import { dispatch, resolve, type Effect, type MachineEvent } from './machine';
import { defaultSave, upgradeSave, type Save, type SessionRecord } from './save';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface ChannelLike {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', fn: (e: { data: any }) => void): void;
  close?(): void;
}

export type Listener = (save: Save, effects: Effect[]) => void;

export interface StoreOptions {
  storage: KV;
  now: () => number;
  channel?: ChannelLike | null;
  /** Called after every successful write (e.g. to mirror the save into IndexedDB). */
  onPersist?: (json: string) => void;
}

export class Store {
  private s!: Save;
  private listeners = new Set<Listener>();
  readonly tabId = Math.random().toString(36).slice(2);
  /** Set when the stored save could not be read and a fresh one was started. */
  loadError: string | null = null;
  /** True if this load started a brand new save (nothing was in storage). */
  freshStart = false;

  constructor(private o: StoreOptions) {
    this.s = this.readStorage() ?? this.createFresh();
    o.channel?.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'changed' && e.data.from !== this.tabId) this.syncFromStorage();
    });
  }

  get save(): Save {
    return this.s;
  }

  get rules(): Rules {
    return this.s.rules;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private createFresh(): Save {
    this.freshStart = true;
    const s = defaultSave(this.o.now());
    this.write(s);
    return s;
  }

  private readStorage(): Save | null {
    let raw: string | null = null;
    try {
      raw = this.o.storage.getItem(STORAGE_KEYS.save);
    } catch (e) {
      this.loadError = 'Storage is not available: ' + String(e);
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schema !== undefined && parsed.schema < (defaultSave(0).schema)) {
        // Keep a copy of the old-format save before migrating it.
        try { this.o.storage.setItem(STORAGE_KEYS.backup, raw); } catch { /* ignore */ }
      }
      return upgradeSave(parsed, this.o.now());
    } catch (e) {
      // Corrupt main save: try the backup before giving up.
      try {
        const bak = this.o.storage.getItem(STORAGE_KEYS.backup);
        if (bak) return upgradeSave(JSON.parse(bak), this.o.now());
      } catch { /* fall through */ }
      this.loadError = 'Save could not be read: ' + String(e);
      try { this.o.storage.setItem(STORAGE_KEYS.save + '.corrupt.' + Date.now(), raw); } catch { /* ignore */ }
      return null;
    }
  }

  private write(s: Save): void {
    const json = JSON.stringify(s);
    try {
      this.o.storage.setItem(STORAGE_KEYS.save, json);
      this.o.storage.setItem(STORAGE_KEYS.rev, String(s.rev));
    } catch (e) {
      this.loadError = 'Could not write save: ' + String(e);
    }
    this.o.onPersist?.(json);
  }

  /** Adopt a newer save written by another tab. Returns true if something changed. */
  syncFromStorage(): boolean {
    // Cheap check first: only parse the whole save if another tab bumped the revision.
    try {
      const rev = this.o.storage.getItem(STORAGE_KEYS.rev);
      if (rev !== null && Number(rev) <= this.s.rev) return false;
    } catch { return false; }
    const latest = this.readStorage();
    if (latest && latest.rev > this.s.rev) {
      this.s = latest;
      this.emit([]);
      return true;
    }
    return false;
  }

  private emit(effects: Effect[]) {
    for (const fn of this.listeners) fn(this.s, effects);
  }

  /** Read-latest, mutate, write, broadcast. The mutator may return effects. */
  private commit(mut: (s: Save) => Effect[] | void): Effect[] {
    const latest = this.readStorage();
    if (latest && latest.rev > this.s.rev) this.s = latest;
    const next: Save = structuredCloneSafe(this.s);
    const effects = mut(next) || [];
    next.rev = this.s.rev + 1;
    this.s = next;
    this.write(next);
    try { this.o.channel?.postMessage({ type: 'changed', rev: next.rev, from: this.tabId }); } catch { /* closed */ }
    this.emit(effects);
    return effects;
  }

  /** Re-check the clock. Only writes when something actually changed. */
  tick(): Effect[] {
    const now = this.o.now();
    // Another tab may have moved the state on; pick that up first.
    this.syncFromStorage();
    const r = resolve(this.s.timer, now, this.s.rules);
    const rulesDue = this.s.pendingRules && this.s.pendingRules.effectiveAt <= now;
    const changedTimer = JSON.stringify(r.state) !== JSON.stringify(this.s.timer);
    // lastSeenWall moves forward all the time; persist it at most every 5 s to save writes.
    const onlyLastSeen = changedTimer && r.effects.length === 0 && sameExceptLastSeen(r.state, this.s.timer);
    if (!r.effects.length && !rulesDue && (!changedTimer || (onlyLastSeen && r.state.lastSeenWall - this.s.timer.lastSeenWall < 5000))) {
      return [];
    }
    return this.commit((s) => {
      const rr = resolve(s.timer, now, s.rules);
      s.timer = rr.state;
      applyEffects(s, rr.effects);
      if (s.pendingRules && s.pendingRules.effectiveAt <= now) {
        s.rules = s.pendingRules.rules;
        s.pendingRules = null;
      }
      return rr.effects;
    });
  }

  act(ev: MachineEvent): Effect[] {
    const now = this.o.now();
    return this.commit((s) => {
      const r = dispatch(s.timer, ev, now, s.rules);
      s.timer = r.state;
      applyEffects(s, r.effects);
      return r.effects;
    });
  }

  /** Change non-timer data (progress, prefs, puzzle state). */
  update(mut: (s: Save) => void): void {
    this.commit((s) => {
      mut(s);
    });
  }

  /**
   * Replace progress, stats and settings with an imported save. The timer is NOT
   * imported: an import always lands in LOCKED with no banked break, so it can't
   * be used to escape a lock or bring back break time.
   */
  importSave(imported: Save): Effect[] {
    const now = this.o.now();
    return this.commit((s) => {
      const keepInstall = s.installId;
      const lastSeen = Math.max(s.timer.lastSeenWall, imported.timer.lastSeenWall);
      const sessions = mergeSessions(s.sessions, imported.sessions);
      const timer = s.timer;
      Object.assign(s, imported);
      s.installId = keepInstall;
      s.sessions = sessions;
      s.energyEarned = Math.max(s.energyEarned, imported.energyEarned);
      s.timer = { ...timer, lastSeenWall: Math.max(lastSeen, now) };
      s.importedAt = now;
      const r = dispatch(s.timer, { type: 'importLock' }, Math.max(lastSeen, now), s.rules);
      s.timer = r.state;
      applyEffects(s, r.effects);
      return r.effects;
    });
  }

  /** Propose new rules: stricter ones apply now, looser ones after a delay. */
  setRules(next: Rules): 'applied' | 'scheduled' {
    const now = this.o.now();
    const looser = isLooser(this.s.rules, next);
    this.commit((s) => {
      if (looser) {
        s.pendingRules = { rules: next, effectiveAt: now + ENGINE.loosenDelayMs };
      } else {
        s.rules = next;
        s.pendingRules = null;
      }
    });
    return looser ? 'scheduled' : 'applied';
  }

  /** Testing / debugging: wipe everything (like clearing site data). */
  hardReset(): void {
    try { this.o.storage.removeItem(STORAGE_KEYS.save); } catch { /* ignore */ }
    this.s = this.createFresh();
    this.emit([]);
  }
}

function sameExceptLastSeen(a: object, b: object): boolean {
  return JSON.stringify({ ...a, lastSeenWall: 0 }) === JSON.stringify({ ...b, lastSeenWall: 0 });
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Does `next` give the player more break or less study than `cur`? */
export function isLooser(cur: Rules, next: Rules): boolean {
  return (
    next.studyMinPerBreakMin < cur.studyMinPerBreakMin ||
    next.minStudyToEarnMin < cur.minStudyToEarnMin ||
    next.maxBreakMin > cur.maxBreakMin ||
    next.lockReleaseStudyMin < cur.lockReleaseStudyMin ||
    next.maxStudySessionMin > cur.maxStudySessionMin ||
    next.overrunGraceMin > cur.overrunGraceMin ||
    next.streakMinStudyHours < cur.streakMinStudyHours
  );
}

function mergeSessions(a: SessionRecord[], b: SessionRecord[]): SessionRecord[] {
  const map = new Map<string, SessionRecord>();
  for (const r of [...a, ...b]) map.set(r.kind + ':' + r.start, r);
  return [...map.values()].sort((x, y) => x.start - y.start).slice(-ENGINE.maxLogEntries);
}

/** Turn machine effects into log entries and stats. */
export function applyEffects(s: Save, effects: Effect[]): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'studyLogged':
        s.sessions.push({ kind: 'study', start: e.start, end: e.end, minutes: e.minutes, earnedMin: e.earnedMin, release: e.release, autoCapped: e.autoCapped, voided: !!e.voided });
        if (!e.voided) s.energyEarned += e.minutes;
        break;
      case 'breakEnded':
        s.sessions.push({
          kind: 'break', start: e.start, end: e.end, minutes: (e.end - e.start) / 60_000,
          plannedMin: (e.plannedEnd - e.start) / 60_000, endedEarly: e.endedEarly,
          lateMin: e.endedEarly ? 0 : null, overrun: e.endedEarly ? false : null,
        });
        break;
      case 'lockStudyStarted': {
        for (let i = s.sessions.length - 1; i >= 0; i--) {
          const r = s.sessions[i];
          if (r.kind === 'break' && r.lateMin === null) {
            r.lateMin = e.lateMin;
            r.overrun = e.overrun;
            break;
          }
        }
        break;
      }
      case 'tamper':
        s.tamperLog.push({ at: e.at, lastSeen: e.lastSeen });
        if (s.tamperLog.length > 200) s.tamperLog.splice(0, s.tamperLog.length - 200);
        break;
      default:
        break;
    }
  }
  if (s.sessions.length > ENGINE.maxLogEntries) s.sessions.splice(0, s.sessions.length - ENGINE.maxLogEntries);
}

/** In-memory storage used by tests and as a last-resort fallback. */
export class MemoryKV implements KV {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
