import { useMemo, useState } from 'preact/hooks';
import { pick, MOSS_LINES } from '../../content/moss';
import { CHAPTERS } from '../../content/chapters';
import { energyAvailable, nextSegment, segment } from '../../story/engine';
import { dailyStats, dayKey, streak } from '../../core/stats';
import { fmtMin, Portrait } from '../common';
import type { Controller } from '../lifecycle';
import { platform } from '../platform';
import { StatsScreen } from './Stats';
import { SettingsScreen } from './Settings';
import { SaveScreen } from './SaveScreen';
import { CodexScreen } from './Codex';

type Sub = null | 'stats' | 'settings' | 'save' | 'codex';

/** IDLE and BREAK_AVAILABLE: study, start a break, stats, settings and backups. The game itself is not playable here. */
export function HomeScreen(props: { c: Controller }) {
  const { c } = props;
  const [sub, setSub] = useState<Sub>(null);
  const s = c.save;
  const t = s.timer;
  const line = useMemo(() => pick(MOSS_LINES.idle), []);
  if (sub === 'stats') return <StatsScreen c={c} onBack={() => setSub(null)} />;
  if (sub === 'settings') return <SettingsScreen c={c} onBack={() => setSub(null)} />;
  if (sub === 'save') return <SaveScreen c={c} onBack={() => setSub(null)} />;
  if (sub === 'codex') return <CodexScreen c={c} onBack={() => setSub(null)} />;

  const days = dailyStats(s, s.rules);
  const today = days.get(dayKey(c.nowMs()));
  const st = streak(days, c.nowMs());
  const energy = energyAvailable(s);
  const next = nextSegment(s.progress);
  const lastDone = [...s.progress.completedSegments].reverse().map((id) => segment(id)).find(Boolean);
  const lastCliff = lastDone?.nodes.find((n) => n.t === 'end') as { cliff: string } | undefined;
  const firstTime = s.sessions.length === 0 && t.bankMin === 0;
  const unread = s.progress.codexUnread.length;

  return (
    <div class="screen scroll" data-testid="home-screen">
      <div class="page col" style={{ gap: 18 }}>
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1>Meridian Lab</h1>
            <p class="dim" style={{ margin: 0 }}>{CHAPTERS[0].title} · {s.progress.completedSegments.length} of {CHAPTERS.flatMap((ch) => ch.segments).length} sections restored</p>
          </div>
          <div class="row">
            <span class="pill">Today: {fmtMin(today?.studyMin ?? 0)}</span>
            <span class="pill">🔥 Streak {st.current}</span>
          </div>
        </div>

        {!c.storagePersistent && (
          <div class="card" style={{ borderColor: 'var(--red)' }}>
            <b>Saving is not working in this browser.</b> Your progress will be lost when you close the page. Try opening the file in Chrome, and use Save backup often. ({c.storageError})
          </div>
        )}
        {platform.fileProtocol && !s.prefs.seenFileTip && (
          <div class="card row" style={{ borderColor: 'var(--amber)' }}>
            <p style={{ flex: 1, minWidth: 240, margin: 0 }}>
              <b>Tablet tip:</b> set the screen timeout to more than 40 minutes (Settings → Display → Screen timeout). Opened from a file, the game can’t keep the screen awake by itself, and the end-of-break alarm is most reliable while the screen is on.
            </p>
            <button class="btn small" onClick={() => c.dismissFileTip()}>Got it</button>
          </div>
        )}

        {t.phase === 'BREAK_AVAILABLE' ? (
          <div class="card col center" style={{ borderColor: 'var(--green)', padding: 28 }}>
            <p class="pill" style={{ color: 'var(--green)' }}>Break ready</p>
            <h2 data-testid="bank">{t.bankMin} min banked</h2>
            <p class="dim" style={{ maxWidth: 560 }}>The break runs non-stop once started. When it ends, the lab locks and sounds an alarm. Starting it also turns on the alarm sound for this session.</p>
            <button class="btn go big" onClick={() => c.startBreak()} data-testid="start-break">Start {t.bankMin}-minute break</button>
            <button class="btn ghost small" onClick={() => c.startStudy()}>Study more first (bank up to {s.rules.maxBreakMin} min)</button>
          </div>
        ) : (
          <div class="card col center" style={{ padding: 28 }}>
            <div class="row" style={{ maxWidth: 640 }}>
              <Portrait who="moss" size={64} />
              <p style={{ flex: 1, textAlign: 'left', minWidth: 220, fontSize: '1.1em' }}>“{firstTime ? 'A new researcher? Study first. Every minute you study charges my reactor, and then you can come in and play with the expensive equipment.' : line}”</p>
            </div>
            <button class="btn primary big" onClick={() => c.startStudy()} data-testid="start-study">Start study session</button>
            <p class="dim" style={{ fontSize: '0.9em' }}>{s.rules.studyMinPerBreakMin} min of study = 1 min of break · at least {s.rules.minStudyToEarnMin} min · up to {s.rules.maxBreakMin} min</p>
          </div>
        )}

        <div class="hubgrid">
          <div class="card col">
            <h3>Reactor</h3>
            <div class="reactor"><div style={{ width: `${Math.min(100, (energy / Math.max(20, next?.energyCost ?? 20)) * 100)}%` }} /></div>
            <p class="dim" style={{ margin: 0 }}>{energy} kJ in reserve{next ? ` · next section “${next.title}” needs ${next.energyCost} kJ` : ' · all sections restored'}</p>
            {lastCliff && <p style={{ margin: 0 }}><span class="dim">Last time:</span> {lastCliff.cliff}</p>}
          </div>
          <div class="card col">
            <h3>Lab</h3>
            <div class="row">
              <button class="btn" onClick={() => setSub('stats')} data-testid="open-stats">Stats</button>
              <button class="btn" onClick={() => setSub('codex')}>Lab Notes{unread ? ` (${unread})` : ''}</button>
              <button class="btn" onClick={() => setSub('settings')} data-testid="open-settings">Settings</button>
              <button class="btn" onClick={() => setSub('save')} data-testid="open-save">Save backup</button>
            </div>
          </div>
        </div>
        {c.restoredFromMirror && <p class="dim">Restored from the backup copy in this browser.</p>}
      </div>
    </div>
  );
}
