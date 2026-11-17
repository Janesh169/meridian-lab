/**
 * Touch-first controls. Every target is at least 48 px, with no hover states and
 * no keyboard needed. Sliders have −/+ buttons for precise steps, and holding a
 * button repeats.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { ControlSpec } from '../puzzles/framework';
import { audio } from '../audio/engine';

export function Slider(props: { spec: Extract<ControlSpec, { kind: 'slider' }>; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  const { spec, value, disabled, onChange } = props;
  const track = useRef<HTMLDivElement>(null);
  const frac = (value - spec.min) / (spec.max - spec.min);
  const fromX = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(spec.min + f * (spec.max - spec.min));
  };
  const onDown = (e: PointerEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    fromX(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (disabled || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    fromX(e.clientX);
  };
  const shown = spec.fmt ? spec.fmt(value) : `${value}${spec.unit ?? ''}`;
  return (
    <div class="ctl" data-control={spec.id}>
      <label><span>{spec.label}</span><b>{shown}</b></label>
      <div class="sl">
        <Stepper label="−" disabled={disabled} onStep={() => onChange(value - spec.step)} />
        <div class="track" ref={track} onPointerDown={onDown} onPointerMove={onMove} role="slider" aria-valuenow={value} aria-valuemin={spec.min} aria-valuemax={spec.max} aria-label={spec.label}>
          <div class="rail" />
          <div class="fill" style={{ width: `${frac * 100}%` }} />
          <div class="knob" style={{ left: `${frac * 100}%` }} />
        </div>
        <Stepper label="+" disabled={disabled} onStep={() => onChange(value + spec.step)} />
      </div>
    </div>
  );
}

/** A button that repeats while held (after a short delay). */
function Stepper(props: { label: string; disabled?: boolean; onStep: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(props.onStep);
  cb.current = props.onStep;
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  const start = (e: PointerEvent) => {
    if (props.disabled) return;
    e.preventDefault();
    audio.tap();
    cb.current();
    let delay = 380;
    const rep = () => { cb.current(); delay = Math.max(50, delay * 0.8); timer.current = setTimeout(rep, delay); };
    timer.current = setTimeout(rep, delay);
  };
  return (
    <button class="step" disabled={props.disabled} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} aria-label={props.label === '+' ? 'increase' : 'decrease'}>
      {props.label}
    </button>
  );
}

export function Choice(props: { spec: Extract<ControlSpec, { kind: 'choice' }>; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  const { spec, value, disabled, onChange } = props;
  return (
    <div class="ctl" data-control={spec.id}>
      <label><span>{spec.label}</span></label>
      <div class="chips">
        {spec.options.map((o) => (
          <button class={'chip' + (o.value === value ? ' on' : '')} disabled={disabled} onClick={() => { audio.tap(); onChange(o.value); }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
