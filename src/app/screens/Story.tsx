import { audio } from '../../audio/engine';
import { UPGRADES } from '../../content/chapters';
import { FAMILY, puzzleDef } from '../../puzzles';
import { advance, currentNode, nextPuzzleMinutes, segment, speedFactor } from '../../story/engine';
import { fmtMin, Portrait, speakerColor, speakerName, Stars } from '../common';
import type { Controller } from '../lifecycle';

/** Plays the current segment node by node. Tap anywhere to continue. */
export function StoryScreen(props: { c: Controller }) {
  const { c } = props;
  const s = c.save;
  const seg = segment(s.progress.segmentId);
  const node = currentNode(s.progress);

  if (!seg || !node) {
    return (
      <div class="screen center story">
        <p>No section in progress.</p>
        <button class="btn primary" onClick={() => c.go('hub')}>Back to hub</button>
      </div>
    );
  }

  const next = () => {
    audio.tap();
    c.store.update((sv) => { advance(sv); });
    if (!c.save.progress.segmentId) c.go('hub');
  };

  const progress = `${s.progress.nodeIndex + 1} / ${seg.nodes.length}`;

  if (node.t === 'puzzle') {
    const def = puzzleDef(node.id)!;
    const rec = s.progress.puzzles[node.id];
    if (rec) {
      // Solved already (e.g. came back from the puzzle): show the result and move on.
      return (
        <div class="screen center story" style={{ gap: 14 }} onClick={next}>
          <p class="pill">{rec.skipped ? 'Skipped for now' : 'Experiment complete'}</p>
          <h2>{def.title}</h2>
          {!rec.skipped && <Stars n={rec.stars} />}
          <p class="tapnext">Tap to continue</p>
        </div>
      );
    }
    const est = def.estMinutes * speedFactor(s.speedSamples);
    const left = c.breakMsLeft() / 60_000;
    const tight = (nextPuzzleMinutes(s) ?? est) + 0.5 > left;
    return (
      <div class="screen center story" style={{ gap: 14, padding: 20 }}>
        <p class="pill">{FAMILY[def.type]} · experiment</p>
        <h1>{def.title}</h1>
        <p style={{ maxWidth: 680, fontSize: '1.15em' }}>{def.brief}</p>
        <p class="dim">Usually about {fmtMin(est)}</p>
        {tight && (
          <p class="warnc" style={{ maxWidth: 640 }} data-testid="tight-warning">
            Only {fmtMin(left)} left on this break. You can start anyway: everything saves mid-experiment when the timer ends.
          </p>
        )}
        <button class="btn primary big" onClick={() => c.openPuzzle(node.id, 'story')} data-testid="start-experiment">Start experiment</button>
        <p class="dim" style={{ fontSize: '0.8em' }}>{seg.title} · {progress}</p>
      </div>
    );
  }

  if (node.t === 'reward') {
    const up = UPGRADES.find((u) => u.id === node.upgrade);
    return (
      <div class="screen center story" style={{ gap: 14, padding: 20 }} onClick={next} data-testid="story-tap">
        <div class="pill" style={{ color: 'var(--green)' }}>Lab upgrade</div>
        <h2>{up?.label ?? node.upgrade}</h2>
        <p style={{ maxWidth: 620, fontSize: '1.1em' }}>{node.text}</p>
        <p class="tapnext">Tap to continue</p>
      </div>
    );
  }

  if (node.t === 'end') {
    return (
      <div class="screen center story" style={{ gap: 16, padding: 24 }}>
        <p class="pill" style={{ color: 'var(--green)' }}>Section restored · checkpoint saved</p>
        <h1>{seg.title}</h1>
        <p style={{ maxWidth: 680, fontSize: '1.25em', fontStyle: 'italic' }}>{node.cliff}</p>
        <p class="dim">To be continued on your next break.</p>
        <button class="btn primary big" onClick={next} data-testid="segment-done">Back to the lab hub</button>
      </div>
    );
  }

  const who = node.t === 'log' ? 'log' : node.who;
  const name = node.t === 'log' ? node.title : speakerName(node.who);
  const color = node.t === 'log' ? 'var(--amber)' : speakerColor(node.who);
  return (
    <div class="screen story" onClick={next} data-testid="story-tap" style={{ cursor: 'pointer' }}>
      <div style={{ padding: '14px 18px' }} class="dim">{seg.title} · {progress}</div>
      <div class="scene" aria-hidden="true">
        <div class="scene-room">{seg.room}</div>
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" class="scene-svg">
          <path d="M0 200 L0 120 L90 120 L90 70 L150 70 L150 110 L260 110 L260 40 L300 40 L300 110 L420 110 L420 80 L520 80 L520 130 L640 130 L640 60 L700 60 L700 120 L800 120 L800 200 Z" fill="#0c1524" />
          <path d="M0 120 L90 120 L90 70 L150 70 L150 110 L260 110 L260 40 L300 40 L300 110 L420 110 L420 80 L520 80 L520 130 L640 130 L640 60 L700 60 L700 120 L800 120" fill="none" stroke="#1f4d5e" stroke-width="2" />
          {[110, 280, 470, 670].map((x, i) => <circle cx={x} cy={i % 2 ? 70 : 95} r="3" fill={s.progress.completedSegments.length > i ? '#3ee6ff' : '#22344a'} />)}
        </svg>
      </div>
      <div class={'dialog' + (node.t === 'log' ? ' log' : node.who === 'narration' ? ' narration' : '')}>
        {who !== 'narration' && <Portrait who={who} />}
        <div class="grow">
          {name && <div class="who" style={{ color }}>{name}</div>}
          <div class="text">{node.text}</div>
          <div class="tapnext">Tap to continue ▸</div>
        </div>
      </div>
    </div>
  );
}
