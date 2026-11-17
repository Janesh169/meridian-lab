import { useEffect } from 'preact/hooks';
import { Portrait, useController } from './common';
import type { Controller } from './lifecycle';
import { BreakShell } from './screens/Break';
import { HomeScreen } from './screens/Home';
import { LockScreen } from './screens/Lock';
import { StudyScreen } from './screens/Study';

/**
 * Top level: the timer phase decides what exists. While STUDYING or LOCKED, the
 * game screens are not rendered at all (not just hidden).
 */
export function App(props: { c: Controller }) {
  const { c } = props;
  useController(c);
  const phase = c.phase;
  const scale = c.save.prefs.textScale;
  useEffect(() => {
    document.documentElement.style.setProperty('--scale', String(scale));
  }, [scale]);
  return (
    <>
      {phase === 'LOCKED' ? <LockScreen c={c} /> : phase === 'STUDYING' ? <StudyScreen c={c} /> : phase === 'ON_BREAK' ? <BreakShell c={c} /> : <HomeScreen c={c} />}
      <div class="toasts" aria-live="polite">
        {c.toasts.map((t) => (
          <div class={'toast ' + t.kind} data-testid={`toast-${t.kind}`}>
            {t.who === 'moss' && <Portrait who="moss" size={44} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
