import { useState } from 'preact/hooks';
import { CHAPTERS, nextOutline, UPGRADES } from '../../content/chapters';
import { codexEntry } from '../../content/codex';
import { FAMILY, puzzleDef } from '../../puzzles';
import {
  availableSideExperiments, energyAvailable, nextSegment, pacingAdvice, segmentState, startSegment, speedFactor, type SegmentState,
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
  const [openCh, setOpenCh] = useState<Record<string, boolean>>({});
  const [showArchive, setShowArchive] = useState(false);
  const nextSeg = nextSegment(s.progress);
  const currentCh = Math.max(0, nextSeg ? CHAPTERS.findIndex((ch) => ch.segments.some((sg) => sg.id === nextSeg.id)) : CHAPTERS.length - 1);
  const archive = CHAPTERS.map((ch, ci) => ({
    ch, ci,
    ids: ch.segments.flatMap((sg) => sg.nodes.flatMap((n) => (n.t === 'puzzle' ? [n.id] : []))).filter((id) => s.progress.puzzles[id]),
  })).filter((a) => a.ids.length);
  const starTotal = archive.reduce((a, x) => a + x.ids.reduce((b, id) => b + (s.progress.puzzles[id]?.stars ?? 0), 0), 0);
  const starMax = CHAPTERS.reduce((a, ch) => a + ch.segments.reduce((b, sg) => b + sg.nodes.filter((n) => n.t === 'puzzle').length, 0), 0) * 3;
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
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <span class="dim">{s.progress.completedSegments.length} of {CHAPTERS.reduce((a, ch) => a + ch.segments.length, 0)} sections restored · {starTotal} of {starMax} ★</span>
          <span class="pill">Reactor {energy} kJ</span>
        </div>
        {CHAPTERS.map((ch, ci) => {
          const done = ch.segments.every((sg) => s.progress.completedSegments.includes(sg.id));
          const expanded = openCh[ch.id] ?? ci === currentCh;
          const status = done ? '✓ Restored' : ci === currentCh ? 'In progress' : ci > currentCh ? 'Locked' : '';
          return (
            <div class="col" style={{ gap: 10 }}>
              <button class="row" style={{ justifyContent: 'space-between', background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', minHeight: 48 }} onClick={() => setOpenCh({ ...openCh, [ch.id]: !expanded })} aria-expanded={expanded}>
                <h2 style={{ opacity: ci > currentCh ? 0.5 : 1 }}>Chapter {ci + 1}: {ch.title}</h2>
                <span class={'pill ' + (done ? 'ok' : '')}>{status} {expanded ? '▾' : '▸'}</span>
              </button>
              {expanded && ch.segments.map((seg, i) => {
                const st = segmentState(s, seg);
                return <SegRow seg={seg} i={i} st={st} onOpen={() => open(seg)} est={seg.estMinutes * f} />;
              })}
            </div>
          );
        })}

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

        {allDone && !nextOutline() && (
          <div class="card col" style={{ borderColor: 'var(--green)' }} data-testid="the-end">
            <h3>The Meridian Institute is restored</h3>
            <p class="dim" style={{ margin: 0 }}>Rao is free, the Lantern is safe, and MOSS has taken up gardening. Replay any experiment from the archive below to earn all three stars ({starTotal} of {starMax} so far), or try the side experiments.</p>
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

        {archive.length > 0 && (
          <div class="col" style={{ gap: 8 }}>
            <button class="row" style={{ justifyContent: 'space-between', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', minHeight: 48 }} onClick={() => setShowArchive(!showArchive)} aria-expanded={showArchive} data-testid="archive-toggle">
              <h3>Experiment archive</h3>
              <span class="pill">replay for stars {showArchive ? '▾' : '▸'}</span>
            </button>
            {showArchive && archive.map((a) => (
              <div class="col" style={{ gap: 6 }}>
                <span class="dim" style={{ fontSize: '0.85em' }}>Chapter {a.ci + 1}: {a.ch.title}</span>
                <div class="row" style={{ gap: 8 }}>
                  {a.ids.map((id) => {
                    const rec = s.progress.puzzles[id]!;
                    return (
                      <button class="chip" onClick={() => c.openPuzzle(id, 'side')} data-testid={`archive-${id}`}>
                        {puzzleDef(id)?.title} {rec.skipped ? <span class="warnc">(skipped)</span> : <Stars n={rec.stars} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
