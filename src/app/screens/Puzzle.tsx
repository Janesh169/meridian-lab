import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { ENGINE } from '../../config';
import { codexEntry } from '../../content/codex';
import { createPuzzle, puzzleDef } from '../../puzzles';
import type { Puzzle } from '../../puzzles/framework';
import { advance } from '../../story/engine';
import { PuzzleCanvas } from '../../input/PuzzleCanvas';
import { Choice, Slider } from '../../input/widgets';
import { Portrait, Stars } from '../common';
import type { Controller } from '../lifecycle';

/**
 * A puzzle: canvas plus controls. State is auto-saved every few seconds, when the
 * page is hidden, and synchronously when the break ends, so a lock never loses a
 * slider position.
 */
export function PuzzleScreen(props: { c: Controller; id: string; from: 'story' | 'side' }) {
  const { c, id, from } = props;
  const def = puzzleDef(id)!;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [showNote, setShowNote] = useState(false);
  const dirty = useRef(false);

  const pz: Puzzle = useMemo(() => {
    const p = createPuzzle(def);
    const snap = c.save.puzzleState;
    if (snap && snap.puzzleId === id) {
      p.restore(snap.data);
      p.runs = snap.runs;
      p.elapsedMs = snap.elapsedMs;
    }
    if (__TEST_BUILD__) (window as any).__puzzle = p;
    return p;
  }, [id]);

  const persist = () => {
    if (!dirty.current || pz.status === 'win') return;
    dirty.current = false;
    c.store.update((s) => {
      s.puzzleState = { puzzleId: id, data: pz.serialize(), runs: pz.runs, elapsedMs: pz.elapsedMs, savedAt: c.nowMs() };
    });
  };

  useEffect(() => {
    let prevStatus = pz.status;
    pz.onChange = () => {
      dirty.current = true;
      if (pz.status !== prevStatus) {
        if (pz.status === 'win') onWin();
        if (pz.status === 'fail') { audio.fail(); persist(); }
        prevStatus = pz.status;
      }
      force(0);
    };
    const hook = () => { dirty.current = true; persist(); };
    c.saveHooks.add(hook);
    const auto = setInterval(persist, ENGINE.autosaveMs);
    const clock = setInterval(() => { if (document.visibilityState === 'visible') pz.elapsedMs += 1000; }, 1000);
    return () => {
      pz.onChange = null;
      c.saveHooks.delete(hook);
      clearInterval(auto);
      clearInterval(clock);
      hook();
    };
  }, [pz]);

  const onWin = () => {
    audio.win();
    const stars = pz.stars();
    c.store.update((s) => {
      const prev = s.progress.puzzles[id];
      s.progress.puzzles[id] = { runs: pz.runs, timeMs: pz.elapsedMs, stars: Math.max(stars, prev?.stars ?? 0), solvedAt: c.nowMs() };
      if (!s.progress.codex.includes(def.codex)) { s.progress.codex.push(def.codex); s.progress.codexUnread.push(def.codex); }
      if (!prev) {
        s.speedSamples.push(pz.elapsedMs / 60_000 / def.estMinutes);
        if (s.speedSamples.length > 20) s.speedSamples.shift();
      }
      if (from === 'side' && !s.progress.sideExperimentsDone.includes(id)) s.progress.sideExperimentsDone.push(id);
      if (s.puzzleState?.puzzleId === id) s.puzzleState = null;
    });
  };

  const done = () => {
    if (from === 'story') {
      c.store.update((s) => { advance(s); });
      c.go('story');
    } else c.go('hub');
  };

  const skip = () => {
    c.store.update((s) => {
      s.progress.puzzles[id] = { runs: pz.runs, timeMs: pz.elapsedMs, stars: 0, solvedAt: c.nowMs(), skipped: true };
      if (s.puzzleState?.puzzleId === id) s.puzzleState = null;
    });
    done();
  };

  const running = pz.status === 'running';
  const hint = pz.hint();
  const note = codexEntry(def.codex);
  const prevRec = c.save.progress.puzzles[id];

  return (
    <div class="screen puzzle" data-testid="puzzle-screen" data-puzzle={id} data-status={pz.status}>
      <div class="stage">
        <PuzzleCanvas puzzle={pz} />
        <div class="brief">{def.brief}</div>
      </div>
      <div class="side">
        <div class="controls">
          {pz.controls().map((spec) =>
            spec.kind === 'slider' ? (
              <Slider spec={spec} value={pz.values[spec.id]} disabled={running || pz.status === 'win'} onChange={(v) => pz.set(spec.id, v)} />
            ) : (
              <Choice spec={spec} value={pz.values[spec.id]} disabled={running || pz.status === 'win'} onChange={(v) => pz.set(spec.id, v)} />
            ),
          )}
          {pz.message && (pz.status === 'fail' || pz.status === 'win') && (
            <div class={'result ' + pz.status} data-testid="result">{pz.message}</div>
          )}
          {def.bonus && pz.status !== 'win' && <p class="dim" style={{ fontSize: '0.85em', margin: 0 }}>★ Bonus: {def.bonus.text}</p>}
          {hint && pz.status !== 'win' && (
            <div class="hint" data-testid="hint"><Portrait who="moss" size={36} /><span>{hint}</span></div>
          )}
          {pz.showGuide && pz.status !== 'win' && <p class="warnc" style={{ fontSize: '0.85em', margin: 0 }}>MOSS has overlaid a calibration trace from Rao’s old logs.</p>}
          <p class="dim" style={{ fontSize: '0.8em', margin: 0 }}>Runs: {pz.runs}{prevRec ? ` · best ${prevRec.stars}★` : ''}</p>
        </div>
        {pz.status === 'win' ? (
          <div class="col" style={{ padding: 14, borderTop: '1px solid var(--line)', gap: 10 }} data-testid="win-panel">
            <div class="row" style={{ justifyContent: 'space-between' }}>
              <b style={{ color: 'var(--green)' }}>Solved</b>
              <Stars n={pz.stars()} />
            </div>
            {def.bonus && <p class="dim" style={{ margin: 0, fontSize: '0.85em' }}>{pz.bonusEarned ? '★ Bonus earned: ' : 'Bonus missed: '}{def.bonus.text}</p>}
            {note && !showNote && <button class="btn" onClick={() => { setShowNote(true); c.store.update((s) => { s.progress.codexUnread = s.progress.codexUnread.filter((x) => x !== note.id); }); }}>📓 Lab Note unlocked: {note.title}</button>}
            {note && showNote && (
              <div class="card" style={{ padding: 12 }}>
                <b>{note.title}</b>
                <p style={{ margin: '6px 0' }}>{note.body}</p>
                {note.formula && <p class="mono" style={{ color: 'var(--cyan)', margin: 0 }}>{note.formula}</p>}
              </div>
            )}
            <button class="btn go" onClick={done} data-testid="continue">Continue</button>
          </div>
        ) : (
          <div class="runbar">
            {running ? (
              <button class="btn" onClick={() => pz.abort()}>Stop</button>
            ) : (
              <button class="btn go" onClick={() => { audio.run(); pz.run(); }} data-testid="run">▶ Run</button>
            )}
            {pz.canSkip() && !running && <button class="btn ghost" onClick={skip}>Skip for now</button>}
          </div>
        )}
      </div>
    </div>
  );
}
