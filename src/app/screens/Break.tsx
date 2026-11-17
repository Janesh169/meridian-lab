import { useState } from 'preact/hooks';
import { CHAPTERS, nextOutline, UPGRADES } from '../../content/chapters';
import { codexEntry } from '../../content/codex';
import { FAMILY, puzzleDef } from '../../puzzles';
import {
  availableSideExperiments, energyAvailable, pacingAdvice, segmentState, startSegment, speedFactor, type SegmentState,
} from '../../story/engine';
import type { Segment } from '../../story/types';
import { fmtClock, fmtMin, Stars, useController, useNow } from '../common';
import type { Controller } from '../lifecycle';
import { CodexScreen } from './Codex';
import { PuzzleScreen } from './Puzzle';
import { SaveScreen } from './SaveScreen';
import { SettingsScreen } from './Settings';
import { StatsScreen } from './Stats';
import { StoryScreen } from './Story';

/** Always-visible break countdown with the diegetic warning flash. */
export function Countdown(props: { c: Controller }) {
  const { c } = props;
  const now = useNow(c, 250);
  const left = c.breakMsLeft();
  const cls = left <= 60_000 ? 'crit' : left <= 5 * 60_000 ? 'low' : '';
  const flash = now < c.hudFlashUntil ? ' flash' : '';
  return <div class={'countdown ' + cls + flash} role="timer" aria-label="Break time left" data-testid="countdown">{fmtClock(left)}</div>;
}

export function BreakShell(props: { c: Controller }) {
  const { c } = props;
  useController(c);
  const v = c.view;
  const title = v === 'puzzle' && c.activePuzzle ? puzzleDef(c.activePuzzle.id)?.title : v === 'story' ? 'Story' : v === 'codex' ? 'Lab Notes' : v === 'stats' ? 'Stats' : v === 'settings' ? 'Settings' : v === 'save' ? 'Save backup' : 'Lab hub';
  return (
    <div class="screen" data-testid="break-shell">
      <div class="topbar">
        {v !== 'hub' && <button class="btn small ghost" onClick={() => { c.flushSaves(); c.go('hub'); }} data-testid="to-hub">← Hub</button>}
        <div class="title grow">{title}</div>
        <Countdown c={c} />
      </div>
      <div class="grow" style={{ position: 'relative' }}>
        {v === 'hub' && <Hub c={c} />}
        {v === 'story' && <StoryScreen c={c} />}
        {v === 'puzzle' && c.activePuzzle && <PuzzleScreen key={c.activePuzzle.id} c={c} id={c.activePuzzle.id} from={c.activePuzzle.from} />}
        {v === 'codex' && <CodexScreen c={c} onBack={() => c.go('hub')} embedded />}
        {v === 'stats' && <StatsScreen c={c} onBack={() => c.go('hub')} embedded />}
        {v === 'settings' && <SettingsScreen c={c} onBack={() => c.go('hub')} embedded />}
        {v === 'save' && <SaveScreen c={c} onBack={() => c.go('hub')} embedded />}
      </div>
      {c.otherTabPlaying && (
        <div class="modal-bg">
          <div class="card modal col center">
            <h2>Open in another tab</h2>
            <p>The lab is already open in another tab. They share one break timer.</p>
            <button class="btn primary" onClick={() => c.takeOverTab()}>Play here instead</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Hub(props: { c: Controller }) {
  const { c } = props;
  const s = c.save;
  const minutesLeft = c.breakMsLeft() / 60_000;
  const [ask, setAsk] = useState<{ seg: Segment; est: number; side: string | null } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const energy = energyAvailable(s);
  const sides = availableSideExperiments(s.progress);
  const allDone = CHAPTERS.every((ch) => ch.segments.every((sg) => s.progress.completedSegments.includes(sg.id)));
  const f = speedFactor(s.speedSamples);

  const open = (seg: Segment) => {
    const st = segmentState(s, seg);
    if (st !== 'current' && st !== 'available') return;
    const adv = pacingAdvice(s, seg, minutesLeft);
    if (!adv.fits && !ask) { setAsk({ seg, est: adv.estMinutes, side: adv.suggestion }); return; }
    setAsk(null);
    c.store.update((sv) => { startSegment(sv, seg.id); });
    c.go('story');
  };

  return (
    <div class="screen scroll">
      <div class="page col" style={{ gap: 16 }}>
        {CHAPTERS.map((ch, ci) => (
          <div class="col" style={{ gap: 10 }}>
            <div class="row" style={{ justifyContent: 'space-between' }}>
              <h2>Chapter {ci + 1}: {ch.title}</h2>
              <span class="pill">Reactor {energy} kJ</span>
            </div>
            {ch.segments.map((seg, i) => {
              const st = segmentState(s, seg);
              return <SegRow seg={seg} i={i} st={st} onOpen={() => open(seg)} est={seg.estMinutes * f} />;
            })}
          </div>
        ))}

        {ask && (
          <div class="card col" style={{ borderColor: 'var(--amber)' }} data-testid="pacing-ask">
            <p style={{ margin: 0 }}><b>{ask.seg.title}</b> usually takes about {fmtMin(ask.est)}, and you have {fmtMin(minutesLeft)} left. You can start it anyway: the lab saves mid-puzzle when the break ends.</p>
            <div class="row">
              {ask.side && <button class="btn go" onClick={() => { setAsk(null); c.openPuzzle(ask.side!, 'side'); }}>Try “{puzzleDef(ask.side)?.title}” instead (~{fmtMin((puzzleDef(ask.side)?.estMinutes ?? 3) * f)})</button>}
              <button class="btn" onClick={() => open(ask.seg)}>Start anyway</button>
              <button class="btn ghost" onClick={() => setAsk(null)}>Cancel</button>
            </div>
          </div>
        )}

        {allDone && nextOutline() && (
          <div class="card col">
            <h3>Coming next: Chapter {CHAPTERS.length + 1}, “{nextOutline()!.title}”</h3>
            <p class="dim">{nextOutline()!.summary}</p>
            <p class="dim">Until then, the side experiments below are always available.</p>
          </div>
        )}

        <h3>Side experiments</h3>
        {sides.length === 0 ? (
          <p class="dim">Short standalone experiments unlock as you restore the lab.</p>
        ) : (
          <div class="hubgrid">
            {sides.map((sx) => {
              const rec = s.progress.puzzles[sx.def.id];
              return (
                <button class="seg" onClick={() => c.openPuzzle(sx.def.id, 'side')} data-testid={`side-${sx.def.id}`}>
                  <div class="num">⚗</div>
                  <div class="grow">
                    <div style={{ fontWeight: 700 }}>{sx.def.title}</div>
                    <div class="dim" style={{ fontSize: '0.85em' }}>{FAMILY[sx.def.type]} · ~{fmtMin(sx.def.estMinutes * f)}</div>
                  </div>
                  {rec && <Stars n={rec.stars} />}
                </button>
              );
            })}
          </div>
        )}

        {s.progress.upgrades.length > 0 && (
          <div class="col" style={{ gap: 8 }}>
            <h3>Lab upgrades</h3>
            <div class="row">{s.progress.upgrades.map((u) => <span class="pill">{UPGRADES.find((x) => x.id === u)?.label ?? u}</span>)}</div>
          </div>
        )}

        <div class="row" style={{ marginTop: 8 }}>
          <button class="btn" onClick={() => c.go('codex')}>Lab Notes{s.progress.codexUnread.length ? ` (${s.progress.codexUnread.length} new)` : ''}</button>
          <button class="btn" onClick={() => c.go('stats')}>Stats</button>
          <button class="btn" onClick={() => c.go('save')}>Save backup</button>
          <div class="grow" />
          {!confirmEnd ? (
            <button class="btn warn" onClick={() => setConfirmEnd(true)} data-testid="end-break">End break early</button>
          ) : (
            <div class="row">
              <span class="dim">The remaining {fmtClock(c.breakMsLeft())} is forfeited.</span>
              <button class="btn warn" onClick={() => c.endBreakEarly()} data-testid="end-break-confirm">End break</button>
              <button class="btn ghost" onClick={() => setConfirmEnd(false)}>Keep playing</button>
            </div>
          )}
        </div>
        <p class="dim" style={{ fontSize: '0.8em' }}>Recent notes: {s.progress.codex.slice(-3).map((id) => codexEntry(id)?.title).filter(Boolean).join(' · ') || 'none yet'}</p>
      </div>
    </div>
  );
}

function SegRow(props: { seg: Segment; i: number; st: SegmentState; est: number; onOpen: () => void }) {
  const { seg, i, st } = props;
  const label = st === 'done' ? 'Restored' : st === 'current' ? 'Continue' : st === 'available' ? `Restore (${seg.energyCost} kJ)` : st === 'needs-energy' ? `Needs ${seg.energyCost} kJ. Study to charge the reactor.` : 'Locked';
  return (
    <button class={'seg ' + st} onClick={props.onOpen} disabled={st === 'locked' || st === 'needs-energy' || st === 'done'} data-testid={`seg-${seg.id}`}>
      <div class="num">{st === 'done' ? '✓' : i + 1}</div>
      <div class="grow">
        <div style={{ fontWeight: 700 }}>{seg.title}</div>
        <div class="dim" style={{ fontSize: '0.85em' }}>{seg.room} · ~{fmtMin(props.est)}</div>
      </div>
      <span class={'pill ' + (st === 'current' || st === 'available' ? 'ok' : '')}>{label}</span>
    </button>
  );
}
