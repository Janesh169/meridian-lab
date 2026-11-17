import { useMemo, useState } from 'preact/hooks';
import { pick, MOSS_LINES } from '../../content/moss';
import { earnedFor, MIN } from '../../core/machine';
import { fmtClock, fmtMin, Portrait, useNow } from '../common';
import type { Controller } from '../lifecycle';

/** The only screen while studying: a calm timer. The game can't be opened. */
export function StudyScreen(props: { c: Controller }) {
  const { c } = props;
  const now = useNow(c, 500);
  const t = c.save.timer;
  const R = c.save.rules;
  const [confirm, setConfirm] = useState(false);
  const line = useMemo(() => pick(MOSS_LINES.study), [t.studyStartedAt]);
  const ms = t.studyStartedAt ? Math.max(0, now - t.studyStartedAt) : 0;
  const min = ms / MIN;
  const earned = earnedFor(min, R);
  const bankAfter = Math.min(R.maxBreakMin, t.bankMin + earned);
  const release = t.studyIsRelease;
  const target = release ? R.lockReleaseStudyMin : earned === 0 ? R.minStudyToEarnMin : Math.min(R.maxBreakMin * R.studyMinPerBreakMin, (Math.floor(min / R.studyMinPerBreakMin) + 1) * R.studyMinPerBreakMin);
  const capMin = R.maxBreakMin * R.studyMinPerBreakMin;
  const frac = Math.min(1, min / capMin);
  const short = release ? min < R.lockReleaseStudyMin : min < R.minStudyToEarnMin;

  return (
    <div class="screen study center" style={{ gap: 18, padding: 20 }} data-testid="study-screen">
      <p class="pill">{release ? 'Study block (lab sealed)' : 'Studying'} · the lab runs on reserve power</p>
      <div class="bigclock" data-testid="study-clock">{fmtClock(ms, true)}</div>
      <div class="meter" aria-label="Progress toward the maximum break"><div style={{ width: `${frac * 100}%` }} /></div>
      {release && min < R.lockReleaseStudyMin ? (
        <p style={{ fontSize: '1.15em' }}>The lab unlocks after <b>{fmtClock((R.lockReleaseStudyMin - min) * MIN)}</b> more.</p>
      ) : earned === 0 ? (
        <p style={{ fontSize: '1.15em' }}>Break time starts counting at {R.minStudyToEarnMin} min. <b>{fmtClock((R.minStudyToEarnMin - min) * MIN)}</b> to go.</p>
      ) : (
        <p style={{ fontSize: '1.15em' }} data-testid="earned">
          Break earned: <b style={{ color: 'var(--green)' }}>{earned} min</b>
          {t.bankMin > 0 && <span class="dim"> (+{t.bankMin} banked → {bankAfter} min)</span>}
          {bankAfter < R.maxBreakMin ? <span class="dim"> · next minute at {fmtMin(target)}</span> : <span class="dim"> · maximum reached</span>}
        </p>
      )}
      <p class="dim">Reactor energy: +{Math.floor(min)} kJ this session</p>
      <div class="row" style={{ maxWidth: 620, justifyContent: 'center' }}>
        <Portrait who="moss" size={52} />
        <p style={{ flex: 1, minWidth: 200, textAlign: 'left' }} class="dim">“{line}”</p>
      </div>
      {!confirm ? (
        <button class="btn primary big" onClick={() => (short ? setConfirm(true) : c.endStudy())} data-testid="finish-study">Finish study session</button>
      ) : (
        <div class="card col" style={{ maxWidth: 560 }}>
          <p>
            {release
              ? `You've studied ${fmtMin(min)}. Stopping before ${R.lockReleaseStudyMin} min keeps the lab sealed.`
              : `You've studied ${fmtMin(min)}. Sessions under ${R.minStudyToEarnMin} min earn no break.`}
          </p>
          <div class="row" style={{ justifyContent: 'center' }}>
            <button class="btn go" onClick={() => setConfirm(false)}>Keep studying</button>
            <button class="btn ghost" onClick={() => { setConfirm(false); c.endStudy(); }} data-testid="finish-anyway">Finish anyway</button>
          </div>
        </div>
      )}
      <p class="dim" style={{ fontSize: '0.8em', maxWidth: 560 }}>Every {R.studyMinPerBreakMin} min of study earns 1 min of break, up to {R.maxBreakMin} min. You can close this screen: the timer runs on the clock, not on this page.</p>
    </div>
  );
}
