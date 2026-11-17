import { useEffect, useReducer, useState } from 'preact/hooks';
import type { Controller } from './lifecycle';
import type { Speaker } from '../story/types';

/** Re-render whenever the controller changes. */
export function useController(c: Controller): void {
  const [, force] = useReducer((x: number, _a: unknown) => x + 1, 0);
  useEffect(() => c.subscribe(() => force(null)), [c]);
}

/** Re-render every `ms` (for clocks). Returns Date.now(). */
export function useNow(c: Controller, ms = 250): number {
  const [now, setNow] = useState(c.nowMs());
  useEffect(() => {
    const id = setInterval(() => setNow(c.nowMs()), ms);
    return () => clearInterval(id);
  }, [c, ms]);
  return now;
}

export function fmtClock(ms: number, showHours = false): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 || showHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtMin(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

const COLORS: Record<Speaker, string> = { moss: '#3ee6ff', rao: '#ffb648', you: '#9d7bff', tomas: '#ff4fd8', narration: '#8aa0b6' };
const NAMES: Record<Speaker, string> = { moss: 'MOSS', rao: 'Dr. Rao', you: 'You', tomas: 'Tomas', narration: '' };
export const speakerColor = (w: Speaker) => COLORS[w];
export const speakerName = (w: Speaker) => NAMES[w];

/** Inline SVG portraits: original, simple and on-theme. */
export function Portrait(props: { who: Speaker | 'log'; size?: number }) {
  const s = props.size ?? 84;
  const who = props.who;
  if (who === 'moss') {
    return (
      <svg class="portrait" width={s} height={s} viewBox="0 0 84 84" aria-label="MOSS" style={{ background: '#0a1d26', border: '1px solid #1f4d5e' }}>
        <circle cx="42" cy="42" r="26" fill="none" stroke="#3ee6ff" stroke-width="2" opacity="0.5" />
        <circle cx="42" cy="42" r="16" fill="#0c3340" stroke="#3ee6ff" stroke-width="3" />
        <circle cx="42" cy="42" r="6" fill="#bff6ff" />
        <path d="M14 70 q10 -14 20 -6 q6 -12 14 -2" stroke="#4dff9a" stroke-width="3" fill="none" opacity="0.8" />
      </svg>
    );
  }
  if (who === 'rao' || who === 'log') {
    return (
      <svg class="portrait" width={s} height={s} viewBox="0 0 84 84" aria-label="Dr. Rao's log" style={{ background: '#22180a', border: '1px solid #5a4a20' }}>
        <rect x="16" y="24" width="52" height="36" rx="5" fill="#3a2a10" stroke="#ffb648" stroke-width="2" />
        <circle cx="31" cy="42" r="7" fill="none" stroke="#ffb648" stroke-width="2" />
        <circle cx="53" cy="42" r="7" fill="none" stroke="#ffb648" stroke-width="2" />
        <path d="M31 49 L53 49" stroke="#ffb648" stroke-width="2" />
      </svg>
    );
  }
  if (who === 'you') {
    return (
      <svg class="portrait" width={s} height={s} viewBox="0 0 84 84" aria-label="You" style={{ background: '#160f2a', border: '1px solid #3d2f6e' }}>
        <circle cx="42" cy="34" r="12" fill="#9d7bff" opacity="0.8" />
        <path d="M20 70 q22 -26 44 0" fill="#9d7bff" opacity="0.6" />
      </svg>
    );
  }
  if (who === 'tomas') {
    return (
      <svg class="portrait" width={s} height={s} viewBox="0 0 84 84" aria-label="Tomas" style={{ background: '#2a0f26', border: '1px solid #6e2f63' }}>
        <path d="M20 42 q22 -30 44 0 q-22 30 -44 0z" fill="none" stroke="#ff4fd8" stroke-width="3" />
      </svg>
    );
  }
  return <div class="portrait" style={{ width: s, height: s, background: '#0f1824', border: '1px solid #22344a' }} />;
}

export function Stars(props: { n: number; of?: number }) {
  const of = props.of ?? 3;
  return <span class="stars" aria-label={`${props.n} of ${of} stars`}>{'★'.repeat(props.n)}<span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, of - props.n))}</span></span>;
}

export function Back(props: { onClick: () => void; label?: string }) {
  return <button class="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={props.onClick} aria-label="Back">← {props.label ?? 'Back'}</button>;
}
