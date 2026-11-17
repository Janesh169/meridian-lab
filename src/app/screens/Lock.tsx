import { useMemo } from 'preact/hooks';
import { pick, MOSS_LINES } from '../../content/moss';
import { MIN } from '../../core/machine';
import { fmtClock, Portrait, useNow } from '../common';
import type { Controller } from '../lifecycle';

/** Full-screen lock. The only action is "Start study block". */
export function LockScreen(props: { c: Controller }) {
  const { c } = props;
  const now = useNow(c, 500);
  const t = c.save.timer;
  const rules = c.save.rules;
  const line = useMemo(() => pick(MOSS_LINES.lock), [t.lockedAt]);
  const since = t.lockedAt ? now - t.lockedAt : 0;
  const late = since > rules.overrunGraceMin * MIN;
  const reason =
    t.lockReason === 'tamper' ? 'The system clock moved backwards. That has been logged, and the lab stays sealed until you complete a study block.'
    : t.lockReason === 'import' ? 'A save was imported. The lab stays sealed until you complete a study block.'
    : 'Your break is over. Your progress was saved the moment the timer ran out.';
  return (
    <div class={'lock' + (late || since < 15_000 ? ' alarm' : '')} role="alertdialog" aria-labelledby="lock-title" data-testid="lock-screen">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <rect x="22" y="42" width="52" height="40" rx="8" fill="#3a0d16" stroke="#ff4d5e" stroke-width="4" />
        <path d="M32 42 V30 a16 16 0 0 1 32 0 V42" fill="none" stroke="#ff4d5e" stroke-width="6" />
        <circle cx="48" cy="60" r="6" fill="#ff4d5e" />
      </svg>
      <h1 id="lock-title">Lab sealed</h1>
      <p class="reason">{reason}</p>
      <div class="row" style={{ justifyContent: 'center', maxWidth: 640 }}>
        <Portrait who="moss" size={56} />
        <p style={{ flex: 1, textAlign: 'left', minWidth: 220 }}>“{line}”</p>
      </div>
      <p class="mono" style={{ fontSize: '1.2em', color: late ? '#ff4d5e' : '#ffd0d6' }}>
        Locked for {fmtClock(since)}{late ? ' (over the grace period, so this counts as an overrun)' : ` · ${rules.overrunGraceMin} min grace period`}
      </p>
      <button class="btn go big" data-action="start-study" onClick={() => c.startStudy()} data-testid="start-study-block">
        Start study block ({rules.lockReleaseStudyMin} min)
      </button>
      {c.needsTapForAlarm && <p class="dim" style={{ fontSize: '0.85em' }}>The browser keeps sound off until you tap the screen.</p>}
    </div>
  );
}
