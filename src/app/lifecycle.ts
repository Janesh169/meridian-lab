/**
 * The app controller ties the pure core (store and state machine) to the browser:
 * ticks, page visibility, the lock sequence (save → alarm → vibrate → overlay),
 * warnings, the wake lock, the single-playing-tab lease, and save import/export.
 */
import { ENGINE, STORAGE_KEYS } from '../config';
import { audio } from '../audio/engine';
import { Lease } from '../core/lease';
import { breakMsLeft, MIN, type Phase } from '../core/machine';
import { upgradeSave, type Save } from '../core/save';
import { decodeSave, encodeSave } from '../core/saveCode';
import { Store, type ChannelLike } from '../core/store';
import { MOSS_LINES, pick } from '../content/moss';
import {
  askNotificationPermission, mirrorSave, notify, pickStorage, platform, reacquireWakeLock,
  readMirror, registerServiceWorker, releaseWakeLock, requestWakeLock, vibrate,
} from './platform';

export type View = 'hub' | 'story' | 'puzzle' | 'codex' | 'stats' | 'settings' | 'save';

export interface Toast {
  id: number;
  who: 'moss' | 'system';
  text: string;
  kind: 'warning' | 'info' | 'error';
  at: number;
}

type Listener = () => void;

export class Controller {
  store: Store;
  lease: Lease;
  storagePersistent: boolean;
  storageError: string | null;
  restoredFromMirror = false;

  view: View = 'hub';
  /** Puzzle being played: story puzzles come from the story; side ones from the hub. */
  activePuzzle: { id: string; from: 'story' | 'side' } | null = null;
  toasts: Toast[] = [];
  hudFlashUntil = 0;
  /** The lock screen needs a tap before the alarm can sound (audio still locked). */
  needsTapForAlarm = false;
  /** Another tab is playing; this one shows a takeover screen. */
  otherTabPlaying = false;

  private listeners = new Set<Listener>();
  private lastAlarmAt = 0;
  private prevPhase: Phase;
  private precise: ReturnType<typeof setTimeout> | null = null;
  private toastId = 0;
  /** Called synchronously right before lock, so open puzzles save their state. */
  saveHooks = new Set<() => void>();

  constructor(private now: () => number = () => Date.now()) {
    const st = pickStorage();
    this.storagePersistent = st.persistent;
    this.storageError = st.error;
    let channel: ChannelLike | null = null;
    try {
      if (platform.broadcast) channel = new BroadcastChannel(STORAGE_KEYS.channel) as unknown as ChannelLike;
    } catch { channel = null; }
    this.store = new Store({ storage: st.kv, now, channel, onPersist: st.persistent ? mirrorSave : undefined });
    this.lease = new Lease(st.kv, this.store.tabId, now);
    this.prevPhase = this.store.save.timer.phase;
    this.lastWarnCount = this.store.save.timer.warned.length;
    if (this.prevPhase === 'LOCKED') this.needsTapForAlarm = true;
    this.store.subscribe((s) => this.onStoreChange(s));
  }

  /** Start ticking and listening to page events. Call once after construction. */
  async start(): Promise<void> {
    // If this looks like a brand-new save, check the IndexedDB mirror first.
    if (this.store.freshStart && this.storagePersistent) {
      const json = await readMirror();
      if (json) {
        try {
          const s = upgradeSave(JSON.parse(json), this.now());
          // A mirror restore keeps the full state (including timers): it's this device's own save.
          this.store.update((cur) => { Object.assign(cur, s, { rev: cur.rev }); });
          this.restoredFromMirror = true;
          this.toast('system', 'Your save was restored from the backup copy.', 'info');
        } catch { /* ignore a bad mirror */ }
      }
    }
    this.tick();
    setInterval(() => this.tick(), ENGINE.tickMs);
    const wake = () => { this.tick(); reacquireWakeLock(); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushSaves();
      wake();
    });
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    document.addEventListener('resume', wake);
    window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEYS.rev || e.key === STORAGE_KEYS.save) this.tick(); });
    window.addEventListener('pagehide', () => { this.flushSaves(); this.lease.release(); });
    // Any tap unlocks audio; on the lock screen it also starts the alarm.
    const onTap = (e: Event) => {
      audio.unlock();
      this.ensureBreakAudio();
      // Tapping "Start study block" itself shouldn't set off the alarm.
      const onStart = (e.target as Element | null)?.closest?.('[data-action="start-study"]');
      if (this.store.save.timer.phase === 'LOCKED' && this.needsTapForAlarm && !onStart) {
        if (audio.alarmNow()) {
          this.needsTapForAlarm = false;
          this.lastAlarmAt = this.now();
          vibrate(ENGINE.vibratePattern);
          this.emit();
        }
      }
    };
    window.addEventListener('pointerdown', onTap, { capture: true });
    window.addEventListener('keydown', onTap, { capture: true });
    void registerServiceWorker();
    this.armPrecise();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    for (const fn of this.listeners) fn();
  }

  get save(): Save { return this.store.save; }
  get phase(): Phase { return this.store.save.timer.phase; }
  breakMsLeft(): number { return breakMsLeft(this.store.save.timer, this.now()); }
  nowMs(): number { return this.now(); }

  /* -------------------------------------------------------------- ticking */

  tick(): void {
    this.store.tick();
    const s = this.store.save;
    const now = this.now();
    // Alarm repeats every minute while LOCKED.
    if (s.timer.phase === 'LOCKED' && !this.needsTapForAlarm && now - this.lastAlarmAt >= ENGINE.alarmRepeatMs) {
      if (audio.alarmNow()) {
        this.lastAlarmAt = now;
        vibrate(ENGINE.vibratePattern);
      } else {
        this.needsTapForAlarm = true;
        this.emit();
      }
    }
    // Single playing tab during a break.
    if (s.timer.phase === 'ON_BREAK') {
      const holder = this.lease.holder();
      if (!holder || holder === this.store.tabId) {
        this.lease.acquire();
        if (this.otherTabPlaying) { this.otherTabPlaying = false; this.emit(); }
      } else if (!this.otherTabPlaying) {
        this.otherTabPlaying = true;
        this.flushSaves();
        this.emit();
      }
    } else if (this.otherTabPlaying) {
      this.otherTabPlaying = false;
      this.emit();
    }
  }

  /** Fire exactly at the break's end (setInterval can drift or be throttled). */
  private armPrecise(): void {
    if (this.precise) clearTimeout(this.precise);
    this.precise = null;
    const t = this.store.save.timer;
    if (t.phase === 'ON_BREAK' && t.breakEndsAt) {
      const ms = Math.max(0, t.breakEndsAt - this.now());
      this.precise = setTimeout(() => this.tick(), Math.min(ms + 5, 2 ** 31 - 1));
    }
  }

  private onStoreChange(s: Save): void {
    const phase = s.timer.phase;
    const prev = this.prevPhase;
    this.prevPhase = phase;
    if (phase !== prev) {
      if (phase === 'LOCKED') this.onLocked(prev);
      if (prev === 'ON_BREAK' && phase !== 'LOCKED') this.onBreakOver();
      if (phase === 'ON_BREAK') this.armPrecise();
      if (phase !== 'ON_BREAK') {
        this.activePuzzle = null;
        this.view = 'hub';
      }
    }
    // Diegetic warnings (5 min, 1 min).
    const warned = s.timer.warned;
    if (phase === 'ON_BREAK' && warned.length > this.lastWarnCount) {
      const newest = Math.min(...warned.slice(this.lastWarnCount));
      this.warn(newest);
    }
    this.lastWarnCount = phase === 'ON_BREAK' ? warned.length : 0;
    this.emit();
  }
  private lastWarnCount = 0;

  private warn(minutesLeft: number): void {
    const line = minutesLeft <= 1 ? pick(MOSS_LINES.warn1) : pick(MOSS_LINES.warn5);
    this.toast('moss', line, 'warning');
    this.hudFlashUntil = this.now() + 4000;
    audio.warning();
    vibrate([120]);
  }

  private onLocked(prev: Phase): void {
    this.flushSaves();
    audio.stopAmbience();
    releaseWakeLock();
    const now = this.now();
    // If a pre-scheduled siren is already playing on the audio clock, don't double it.
    let played = prev === 'ON_BREAK' && audio.scheduledAlarmCovers(now);
    if (!played) {
      audio.cancelScheduledAlarm();
      played = audio.alarmNow();
    }
    this.needsTapForAlarm = !played;
    this.lastAlarmAt = played ? now : 0;
    vibrate(ENGINE.vibratePattern);
    if (document.visibilityState === 'hidden') notify('Break over', 'Meridian Lab is locked. Time to start your study block.');
    this.lease.release();
  }

  private onBreakOver(): void {
    audio.cancelScheduledAlarm();
    audio.stopAmbience();
    releaseWakeLock();
    this.lease.release();
  }

  flushSaves(): void {
    for (const h of this.saveHooks) {
      try { h(); } catch { /* never block the lock */ }
    }
  }

  toast(who: Toast['who'], text: string, kind: Toast['kind'] = 'info'): void {
    const t: Toast = { id: ++this.toastId, who, text, kind, at: this.now() };
    this.toasts = [...this.toasts.slice(-2), t];
    this.emit();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.emit();
    }, kind === 'warning' ? 9000 : 6000);
  }

  /* -------------------------------------------------------------- actions */

  startStudy(): void {
    audio.unlock();
    this.store.act({ type: 'startStudy' });
  }

  endStudy(): void {
    this.store.act({ type: 'endStudy' });
  }

  /** Must be called from a tap: it unlocks audio for the end-of-break alarm. */
  startBreak(): void {
    audio.unlock();
    const eff = this.store.act({ type: 'startBreak' });
    if (eff.some((e) => e.kind === 'breakStarted')) {
      this.ensureBreakAudio();
      void askNotificationPermission();
      this.lease.acquire(true);
      this.view = 'hub';
      this.emit();
    }
  }

  /** After a reload mid-break, the first tap re-arms the alarm and ambience. */
  private ensureBreakAudio(): void {
    const t = this.store.save.timer;
    if (t.phase !== 'ON_BREAK' || !t.breakEndsAt || !audio.ctx || this.breakAudioArmed === t.breakEndsAt) return;
    this.breakAudioArmed = t.breakEndsAt;
    audio.scheduleAlarmAt(t.breakEndsAt);
    if (this.store.save.prefs.ambience) audio.startAmbience();
    void requestWakeLock();
  }
  private breakAudioArmed = 0;

  endBreakEarly(): void {
    this.flushSaves();
    this.store.act({ type: 'endBreakEarly' });
  }

  takeOverTab(): void {
    this.lease.acquire(true);
    this.otherTabPlaying = false;
    this.store.syncFromStorage();
    this.emit();
  }

  go(view: View): void {
    this.view = view;
    this.emit();
  }

  openPuzzle(id: string, from: 'story' | 'side'): void {
    this.activePuzzle = { id, from };
    this.view = 'puzzle';
    this.emit();
  }

  exportCode(): string {
    this.flushSaves();
    return encodeSave(this.store.save);
  }

  exportFile(): void {
    this.flushSaves();
    const blob = new Blob([JSON.stringify(this.store.save, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `meridian-lab-save-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /** Import a code or JSON text. Always lands in LOCKED with no bank. */
  importText(text: string): void {
    const s = decodeSave(text, this.now());
    this.store.importSave(s);
    this.toast('system', 'Save imported. The lab is locked until you finish a study block.', 'info');
  }

  /** Minutes the study timer has run. */
  studyMinutes(): number {
    const t = this.store.save.timer;
    return t.phase === 'STUDYING' && t.studyStartedAt ? (this.now() - t.studyStartedAt) / MIN : 0;
  }

  dismissFileTip(): void {
    this.store.update((s) => { s.prefs.seenFileTip = true; });
  }
}
