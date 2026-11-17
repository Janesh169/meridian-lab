import { useEffect, useState } from 'preact/hooks';
import { CODEX } from '../../content/codex';
import { Back } from '../common';
import type { Controller } from '../lifecycle';

/** Lab Notes: optional one-screen summaries of each concept you've met. */
export function CodexScreen(props: { c: Controller; onBack: () => void; embedded?: boolean }) {
  const { c } = props;
  const [open, setOpen] = useState<string | null>(null);
  const unlocked = CODEX.filter((e) => c.save.progress.codex.includes(e.id));
  const unread = c.save.progress.codexUnread;
  useEffect(() => {
    if (open && unread.includes(open)) c.store.update((s) => { s.progress.codexUnread = s.progress.codexUnread.filter((x) => x !== open); });
  }, [open]);
  const topics = [...new Set(unlocked.map((e) => e.topic))];
  return (
    <div class="screen scroll">
      <div class="page col">
        {!props.embedded && <Back onClick={props.onBack} />}
        <h2>Lab Notes</h2>
        <p class="dim">Dr. Rao’s notes, one per concept. Optional. Read them or don’t; the lab won’t test you.</p>
        {unlocked.length === 0 && <p class="dim">No notes yet. Solve experiments to recover them.</p>}
        {topics.map((t) => (
          <div class="col" style={{ gap: 8 }}>
            <h3 class="dim">{t}</h3>
            {unlocked.filter((e) => e.topic === t).map((e) => (
              <button class="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <div class="row" style={{ justifyContent: 'space-between' }}>
                  <b>{e.title}</b>
                  {unread.includes(e.id) && <span class="pill" style={{ color: 'var(--amber)' }}>new</span>}
                </div>
                {open === e.id ? (
                  <div>
                    <p>{e.body}</p>
                    {e.formula && <p class="mono" style={{ color: 'var(--cyan)', fontSize: '1.1em' }}>{e.formula}</p>}
                    {e.jee && <p class="dim" style={{ fontSize: '0.9em' }}>JEE: {e.jee}</p>}
                  </div>
                ) : (
                  <p class="dim" style={{ margin: '4px 0 0', fontSize: '0.9em' }}>{e.body.slice(0, 80)}…</p>
                )}
              </button>
            ))}
          </div>
        ))}
        <p class="dim" style={{ fontSize: '0.85em' }}>{unlocked.length} of {CODEX.length} notes recovered</p>
      </div>
    </div>
  );
}
