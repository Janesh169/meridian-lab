import { useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { RULE_LIMITS, type Rules } from '../../config';
import { isLooser } from '../../core/store';
import { Slider } from '../../input/widgets';
import { Back } from '../common';
import type { Controller } from '../lifecycle';
import { platform } from '../platform';

const LABELS: Record<keyof typeof RULE_LIMITS, [string, string]> = {
  studyMinPerBreakMin: ['Study minutes per break minute', 'min'],
  minStudyToEarnMin: ['Minimum session to earn a break', 'min'],
  maxBreakMin: ['Maximum break', 'min'],
  lockReleaseStudyMin: ['Study block to unlock after a break', 'min'],
  maxStudySessionMin: ['Auto-stop a forgotten study timer after', 'min'],
  overrunGraceMin: ['Grace before a late return counts as an overrun', 'min'],
  streakMinStudyHours: ['Study needed for a streak day', 'h'],
};

export function SettingsScreen(props: { c: Controller; onBack: () => void; embedded?: boolean }) {
  const { c } = props;
  const s = c.save;
  const [draft, setDraft] = useState<Rules>({ ...s.rules });
  const [msg, setMsg] = useState('');
  const editable = s.timer.phase === 'IDLE' || s.timer.phase === 'BREAK_AVAILABLE';
  const changed = JSON.stringify(draft) !== JSON.stringify(s.rules);
  const looser = isLooser(s.rules, draft);
  const pending = s.pendingRules;

  return (
    <div class="screen scroll">
      <div class="page col">
        {!props.embedded && <Back onClick={props.onBack} />}
        <h2>Settings</h2>

        <div class="card col">
          <h3>Display and sound</h3>
          <Slider spec={{ kind: 'slider', id: 'scale', label: 'Text size', min: 0.85, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }} value={s.prefs.textScale} onChange={(v) => c.store.update((sv) => { sv.prefs.textScale = Math.round(v * 100) / 100; })} />
          <Slider spec={{ kind: 'slider', id: 'sfx', label: 'Game sound volume (not the alarm)', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }} value={s.prefs.sfxVolume} onChange={(v) => { audio.setSfxVolume(v); c.store.update((sv) => { sv.prefs.sfxVolume = Math.round(v * 100) / 100; }); }} />
          <div class="row">
            <button class={'chip' + (s.prefs.ambience ? ' on' : '')} onClick={() => c.store.update((sv) => { sv.prefs.ambience = !sv.prefs.ambience; })}>Lab ambience during breaks: {s.prefs.ambience ? 'on' : 'off'}</button>
          </div>
          <p class="dim" style={{ fontSize: '0.85em', margin: 0 }}>The quiet ambience also helps the alarm fire on time if the screen turns off: browsers keep pages that are playing sound awake.</p>
          {editable && <button class="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { audio.unlock(); audio.alarmNow(); }}>Test the alarm sound</button>}
        </div>

        <div class="card col">
          <h3>Study rules</h3>
          {!editable && <p class="warnc">Rules can only be changed when you’re not studying, on a break, or locked.</p>}
          <p class="dim" style={{ fontSize: '0.9em' }}>Stricter changes apply now. Changes that loosen the rules wait 24 hours, so you can’t loosen them on impulse.</p>
          {(Object.keys(RULE_LIMITS) as (keyof typeof RULE_LIMITS)[]).map((k) => {
            const [min, max, step] = RULE_LIMITS[k];
            const [label, unit] = LABELS[k];
            return <Slider spec={{ kind: 'slider', id: k, label, min, max, step, fmt: (v) => `${v} ${unit}` }} value={draft[k]} disabled={!editable} onChange={(v) => setDraft({ ...draft, [k]: Math.round(Math.min(max, Math.max(min, v)) / step) * step })} />;
          })}
          {changed && (
            <div class="row">
              <button class="btn primary" disabled={!editable} onClick={() => {
                const r = c.store.setRules(draft);
                setMsg(r === 'applied' ? 'Saved. The new rules apply now.' : 'Scheduled. Looser rules take effect in 24 hours.');
                if (r === 'scheduled') setDraft({ ...c.save.rules });
              }}>{looser ? 'Schedule changes (24 h)' : 'Apply changes'}</button>
              <button class="btn ghost" onClick={() => setDraft({ ...s.rules })}>Reset</button>
            </div>
          )}
          {msg && <p class="ok">{msg}</p>}
          {pending && <p class="warnc">Pending change takes effect {new Date(pending.effectiveAt).toLocaleString()}.</p>}
        </div>

        <div class="card col">
          <h3>About this copy</h3>
          <p class="dim" style={{ fontSize: '0.85em', margin: 0 }}>
            Running from {platform.fileProtocol ? 'a local file' : location.protocol === 'https:' ? 'HTTPS' : location.protocol} ·
            wake lock {platform.wakeLock ? 'available' : 'not available'} · vibration {platform.vibrate ? 'available' : 'not available'} ·
            notifications {platform.notifications ? 'available' : 'not available'} · storage {c.storagePersistent ? 'persistent' : 'NOT persistent'} ·
            build {__BUILD_TIME__.slice(0, 10)}
          </p>
          {__TEST_BUILD__ && editable && (
            <div class="row">
              <span class="warnc">Test build:</span>
              <button class="btn small" onClick={() => c.store.update((sv) => { sv.timer.bankMin = 2; sv.timer.phase = 'BREAK_AVAILABLE'; })}>Grant a 2-minute break</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
