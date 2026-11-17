import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, STORAGE_KEYS } from '../../src/config';
import { dispatch, earnedFor, initialTimer, resolve, MIN, type TimerState } from '../../src/core/machine';
import { MemoryKV, Store, isLooser, type ChannelLike } from '../../src/core/store';
import { encodeSave, decodeSave } from '../../src/core/saveCode';
import { dailyStats, streak } from '../../src/core/stats';
import { Lease } from '../../src/core/lease';

const R = DEFAULT_RULES;
const T0 = Date.UTC(2026, 10, 17, 4, 0, 0);

class FakeClock {
  t = T0;
  now = () => this.t;
  advance(ms: number) { this.t += ms; }
}

/** A BroadcastChannel stand-in shared by several "tabs". */
class Bus {
  members: { fn: (e: { data: any }) => void; self: ChannelLike }[] = [];
  channel(): ChannelLike {
    const self: ChannelLike = {
      postMessage: (msg) => { for (const m of this.members) if (m.self !== self) m.fn({ data: msg }); },
      addEventListener: (_t, fn) => { this.members.push({ fn, self }); },
    };
    return self;
  }
}

function study(s: TimerState, minutes: number, clock: FakeClock): TimerState {
  s = dispatch(s, { type: 'startStudy' }, clock.t, R).state;
  clock.advance(minutes * MIN);
  return dispatch(s, { type: 'endStudy' }, clock.t, R).state;
}

describe('earning rules', () => {
  it('earns nothing under 25 minutes', () => {
    expect(earnedFor(24.9, R)).toBe(0);
    expect(earnedFor(25, R)).toBe(6);
  });
  it('earns 1 min per 4 min, capped at 40', () => {
    expect(earnedFor(60, R)).toBe(15);
    expect(earnedFor(160, R)).toBe(40);
    expect(earnedFor(300, R)).toBe(40);
  });
  it('does not stack past the cap across sessions', () => {
    const c = new FakeClock();
    let s = initialTimer(c.t);
    s = study(s, 120, c); // 30
    expect(s.bankMin).toBe(30);
    expect(s.phase).toBe('BREAK_AVAILABLE');
    s = study(s, 120, c); // +30 -> capped 40
    expect(s.bankMin).toBe(40);
  });
  it('a short session leaves the state IDLE', () => {
    const c = new FakeClock();
    const s = study(initialTimer(c.t), 10, c);
    expect(s.phase).toBe('IDLE');
    expect(s.bankMin).toBe(0);
  });
});

describe('state machine transitions', () => {
  it('runs IDLE → STUDYING → BREAK_AVAILABLE → ON_BREAK → LOCKED → STUDYING → unlocked', () => {
    const c = new FakeClock();
    let s = initialTimer(c.t);
    s = dispatch(s, { type: 'startStudy' }, c.t, R).state;
    expect(s.phase).toBe('STUDYING');
    c.advance(100 * MIN);
    s = dispatch(s, { type: 'endStudy' }, c.t, R).state;
    expect(s.phase).toBe('BREAK_AVAILABLE');
    expect(s.bankMin).toBe(25);

    let r = dispatch(s, { type: 'startBreak' }, c.t, R);
    s = r.state;
    expect(s.phase).toBe('ON_BREAK');
    expect(s.breakEndsAt).toBe(c.t + 25 * MIN);
    expect(s.bankMin).toBe(0);

    c.advance(20 * MIN); // 5 min left
    r = resolve(s, c.t, R);
    s = r.state;
    expect(r.effects).toContainEqual({ kind: 'warning', minutesLeft: 5 });
    // The same warning does not fire twice.
    expect(resolve(s, c.t + 1000, R).effects.filter((e) => e.kind === 'warning')).toHaveLength(0);

    c.advance(4 * MIN);
    r = resolve(s, c.t, R);
    s = r.state;
    expect(r.effects).toContainEqual({ kind: 'warning', minutesLeft: 1 });

    c.advance(1 * MIN);
    r = resolve(s, c.t, R);
    s = r.state;
    expect(s.phase).toBe('LOCKED');
    expect(s.lockedAt).toBe(c.t);
    expect(r.effects.some((e) => e.kind === 'locked')).toBe(true);

    // Cannot start a break while locked.
    expect(dispatch(s, { type: 'startBreak' }, c.t, R).effects.some((e) => e.kind === 'rejected')).toBe(true);

    c.advance(1 * MIN);
    r = dispatch(s, { type: 'startStudy' }, c.t, R);
    s = r.state;
    expect(s.phase).toBe('STUDYING');
    expect(s.studyIsRelease).toBe(true);
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: 'lockStudyStarted', overrun: false }));

    // Quitting the release block early sends it straight back to LOCKED.
    c.advance(10 * MIN);
    r = dispatch(s, { type: 'endStudy' }, c.t, R);
    expect(r.state.phase).toBe('LOCKED');

    // Doing the full block unlocks it.
    s = dispatch(r.state, { type: 'startStudy' }, c.t, R).state;
    c.advance(25 * MIN);
    r = dispatch(s, { type: 'endStudy' }, c.t, R);
    expect(r.state.phase).toBe('BREAK_AVAILABLE');
    expect(r.state.bankMin).toBe(6);
    expect(r.effects.some((e) => e.kind === 'unlocked')).toBe(true);
  });

  it('marks a late return as an overrun', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 40, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    c.advance(10 * MIN + 4 * MIN); // 4 min after the lock
    s = resolve(s, c.t, R).state;
    const r = dispatch(s, { type: 'startStudy' }, c.t, R);
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: 'lockStudyStarted', overrun: true }));
  });

  it('ending a break early goes to IDLE and forfeits the rest', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 80, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    c.advance(3 * MIN);
    const r = dispatch(s, { type: 'endBreakEarly' }, c.t, R);
    expect(r.state.phase).toBe('IDLE');
    expect(r.state.bankMin).toBe(0);
  });

  it('auto-caps a forgotten study session', () => {
    const c = new FakeClock();
    let s = dispatch(initialTimer(c.t), { type: 'startStudy' }, c.t, R).state;
    c.advance(10 * 60 * MIN);
    const r = resolve(s, c.t, R);
    expect(r.state.phase).toBe('BREAK_AVAILABLE');
    const log = r.effects.find((e) => e.kind === 'studyLogged');
    expect(log && log.kind === 'studyLogged' && log.minutes).toBe(R.maxStudySessionMin);
  });

  it('resolve is idempotent', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 40, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    c.advance(30 * MIN);
    const a = resolve(s, c.t, R).state;
    const b = resolve(a, c.t, R);
    expect(b.state).toEqual(a);
    expect(b.effects).toHaveLength(0);
  });
});

describe('time robustness', () => {
  it('sleep: a large forward jump locks at the original end time', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 80, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    const endsAt = s.breakEndsAt!;
    c.advance(2 * 60 * MIN); // tablet slept for 2 hours
    const r = resolve(s, c.t, R);
    expect(r.state.phase).toBe('LOCKED');
    expect(r.state.lockedAt).toBe(endsAt);
    // A woken tablet should not fire the stale 5/1-min warnings.
    expect(r.effects.some((e) => e.kind === 'warning')).toBe(false);
  });

  it('backward clock jump during a break locks and logs tampering', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 160, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    c.advance(10 * MIN);
    s = resolve(s, c.t, R).state;
    c.advance(-30 * MIN); // someone sets the clock back to gain time
    const r = resolve(s, c.t, R);
    expect(r.state.phase).toBe('LOCKED');
    expect(r.state.lockReason).toBe('tamper');
    expect(r.effects.some((e) => e.kind === 'tamper')).toBe(true);
  });

  it('backward jump during study voids the session', () => {
    const c = new FakeClock();
    let s = dispatch(initialTimer(c.t), { type: 'startStudy' }, c.t, R).state;
    c.advance(30 * MIN);
    s = resolve(s, c.t, R).state;
    c.advance(-60 * MIN);
    const r = resolve(s, c.t, R);
    expect(r.state.phase).toBe('LOCKED');
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: 'studyLogged', voided: true }));
  });

  it('small backward corrections (network time sync) are tolerated', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 80, c);
    s = dispatch(s, { type: 'startBreak' }, c.t, R).state;
    c.advance(5 * MIN);
    s = resolve(s, c.t, R).state;
    c.advance(-30_000);
    expect(resolve(s, c.t, R).state.phase).toBe('ON_BREAK');
  });

  it('a user action in the same instant as a tamper is ignored', () => {
    const c = new FakeClock();
    let s = study(initialTimer(c.t), 80, c);
    c.advance(-60 * MIN);
    const r = dispatch(s, { type: 'startBreak' }, c.t, R);
    expect(r.state.phase).toBe('LOCKED');
  });
});

describe('Store: persistence, reload, tabs, import', () => {
  function makeStore(kv: MemoryKV, clock: FakeClock, bus?: Bus) {
    return new Store({ storage: kv, now: clock.now, channel: bus ? bus.channel() : null });
  }

  it('reload: a new store picks up the running break exactly', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    let st = makeStore(kv, c);
    st.act({ type: 'startStudy' });
    c.advance(80 * MIN);
    st.act({ type: 'endStudy' });
    st.act({ type: 'startBreak' });
    const endsAt = st.save.timer.breakEndsAt;
    c.advance(5 * MIN);
    // "Refresh the page"
    st = makeStore(kv, c);
    expect(st.save.timer.phase).toBe('ON_BREAK');
    expect(st.save.timer.breakEndsAt).toBe(endsAt);
    c.advance(16 * MIN);
    st = makeStore(kv, c);
    st.tick();
    expect(st.save.timer.phase).toBe('LOCKED');
  });

  it('reload during STUDYING keeps studying (no game) and keeps the start time', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    let st = makeStore(kv, c);
    st.act({ type: 'startStudy' });
    const start = st.save.timer.studyStartedAt;
    c.advance(MIN);
    st = makeStore(kv, c);
    st.tick();
    expect(st.save.timer.phase).toBe('STUDYING');
    expect(st.save.timer.studyStartedAt).toBe(start);
  });

  it('two tabs share one break timer', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    const bus = new Bus();
    const a = makeStore(kv, c, bus);
    const b = makeStore(kv, c, bus);
    a.act({ type: 'startStudy' });
    c.advance(160 * MIN);
    a.act({ type: 'endStudy' });
    expect(b.save.timer.phase).toBe('BREAK_AVAILABLE'); // got the broadcast
    a.act({ type: 'startBreak' });
    const endsAt = a.save.timer.breakEndsAt;
    // Tab B tries to start a second break: rejected, the same timer is shown.
    const eff = b.act({ type: 'startBreak' });
    expect(eff.some((e) => e.kind === 'rejected')).toBe(true);
    expect(b.save.timer.breakEndsAt).toBe(endsAt);
    c.advance(40 * MIN);
    b.tick();
    a.tick();
    expect(a.save.timer.phase).toBe('LOCKED');
    expect(b.save.timer.phase).toBe('LOCKED');
    // Only one break was logged.
    expect(a.save.sessions.filter((r) => r.kind === 'break')).toHaveLength(1);
  });

  it('two tabs stay in sync without BroadcastChannel (storage polling)', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    const a = makeStore(kv, c);
    const b = makeStore(kv, c);
    a.act({ type: 'startStudy' });
    b.tick();
    expect(b.save.timer.phase).toBe('STUDYING');
  });

  it('import lands in LOCKED with no bank, but keeps story progress', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    const st = makeStore(kv, c);
    st.act({ type: 'startStudy' });
    c.advance(160 * MIN);
    st.act({ type: 'endStudy' }); // 40 banked
    st.update((s) => { s.progress.completedSegments.push('ch1.s1'); });
    const code = encodeSave(st.save);

    // Wipe site data, then import the code that still has 40 minutes banked.
    const kv2 = new MemoryKV();
    const st2 = makeStore(kv2, c);
    st2.importSave(decodeSave(code, c.t));
    expect(st2.save.timer.phase).toBe('LOCKED');
    expect(st2.save.timer.bankMin).toBe(0);
    expect(st2.save.progress.completedSegments).toEqual(['ch1.s1']);
    expect(st2.save.energyEarned).toBeCloseTo(160);
  });

  it('rejects damaged save codes', () => {
    const c = new FakeClock();
    const st = makeStore(new MemoryKV(), c);
    const code = encodeSave(st.save);
    const broken = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(() => decodeSave(broken, c.t)).toThrow(/damaged/);
  });

  it('loads older/partial saves by filling defaults (update-safe)', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    kv.setItem(STORAGE_KEYS.save, JSON.stringify({ schema: 1, rev: 3, progress: { completedSegments: ['x'] } }));
    const st = makeStore(kv, c);
    expect(st.save.progress.completedSegments).toEqual(['x']);
    expect(st.save.progress.codex).toEqual([]);
    expect(st.save.timer.phase).toBe('IDLE');
    expect(st.save.rules.maxBreakMin).toBe(40);
  });

  it('recovers from a corrupt save using the backup', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    kv.setItem(STORAGE_KEYS.save, '{not json');
    kv.setItem(STORAGE_KEYS.backup, JSON.stringify({ schema: 1, rev: 1, progress: { completedSegments: ['ok'] } }));
    const st = makeStore(kv, c);
    expect(st.save.progress.completedSegments).toEqual(['ok']);
  });

  it('loosening rules is delayed; tightening is immediate', () => {
    const c = new FakeClock();
    const st = makeStore(new MemoryKV(), c);
    expect(st.setRules({ ...R, maxBreakMin: 30 })).toBe('applied');
    expect(st.rules.maxBreakMin).toBe(30);
    expect(st.setRules({ ...R, maxBreakMin: 40 })).toBe('scheduled');
    expect(st.rules.maxBreakMin).toBe(30);
    c.advance(25 * 60 * MIN);
    st.tick();
    expect(st.rules.maxBreakMin).toBe(40);
    expect(isLooser(R, { ...R, studyMinPerBreakMin: 2 })).toBe(true);
  });

  it('logs breaks and overruns for stats and streaks', () => {
    const c = new FakeClock();
    const st = makeStore(new MemoryKV(), c);
    for (let i = 0; i < 2; i++) {
      st.act({ type: 'startStudy' });
      c.advance(130 * MIN);
      st.act({ type: 'endStudy' });
      st.act({ type: 'startBreak' });
      c.advance(33 * MIN);
      st.tick();
      c.advance(MIN);
      st.act({ type: 'startStudy' });
      c.advance(1);
    }
    st.act({ type: 'endStudy' });
    const breaks = st.save.sessions.filter((r) => r.kind === 'break');
    expect(breaks).toHaveLength(2);
    expect(breaks.every((b) => b.overrun === false)).toBe(true);
    const days = dailyStats(st.save, R);
    const total = [...days.values()].reduce((a, d) => a + d.studyMin, 0);
    expect(total).toBeGreaterThan(260);
    expect(streak(days, c.t).current).toBeGreaterThanOrEqual(1);
  });
});

describe('Lease (one playing tab)', () => {
  it('only one tab holds the lease; takeover works; expiry frees it', () => {
    const kv = new MemoryKV();
    const c = new FakeClock();
    const a = new Lease(kv, 'A', c.now);
    const b = new Lease(kv, 'B', c.now);
    expect(a.acquire()).toBe(true);
    expect(b.acquire()).toBe(false);
    expect(b.acquire(true)).toBe(true);
    expect(a.held()).toBe(false);
    c.advance(10_000);
    expect(a.acquire()).toBe(true);
  });
});
