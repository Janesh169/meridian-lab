import { breakOnTime, dailyStats, dayKey, streak } from '../../core/stats';
import { Back, fmtMin } from '../common';
import type { Controller } from '../lifecycle';

export function StatsScreen(props: { c: Controller; onBack: () => void; embedded?: boolean }) {
  const { c } = props;
  const s = c.save;
  const now = c.nowMs();
  const days = dailyStats(s, s.rules);
  const st = streak(days, now);
  const today = days.get(dayKey(now));
  // Last 14 days for the chart
  const chart: { key: string; label: string; min: number; ok: boolean }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const ds = days.get(k);
    chart.push({ key: k, label: `${d.getDate()}/${d.getMonth() + 1}`, min: ds?.studyMin ?? 0, ok: !!ds?.ok });
  }
  const maxMin = Math.max(60, ...chart.map((x) => x.min));
  const log = [...s.sessions].reverse().slice(0, 60);
  const breaks = s.sessions.filter((r) => r.kind === 'break' && !r.endedEarly);
  const onTime = breaks.filter((r) => r.overrun === false).length;
  const fmtT = (t: number) => {
    const d = new Date(t);
    return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return (
    <div class="screen scroll" data-testid="stats-screen">
      <div class="page col">
        {!props.embedded && <Back onClick={props.onBack} />}
        <h2>Stats</h2>
        <div class="hubgrid">
          <div class="card"><div class="dim">Studied today</div><h2 data-testid="today-total">{fmtMin(today?.studyMin ?? 0)}</h2></div>
          <div class="card"><div class="dim">Streak (≥ {s.rules.streakMinStudyHours} h, no overruns)</div><h2>{st.current} day{st.current === 1 ? '' : 's'}</h2><div class="dim">best {st.best}</div></div>
          <div class="card"><div class="dim">Breaks ended on time</div><h2>{breaks.length ? `${onTime} / ${breaks.length}` : '–'}</h2></div>
          <div class="card"><div class="dim">Reactor energy (total study)</div><h2>{fmtMin(s.energyEarned)}</h2></div>
        </div>
        <div class="card">
          <div class="dim">Study per day (last 14 days) · green = streak day</div>
          <div class="bars">
            {chart.map((d) => (
              <div title={`${d.key}: ${fmtMin(d.min)}`}>
                <span>{d.min >= 1 ? Math.round(d.min / 6) / 10 + 'h' : ''}</span>
                <div class={'b' + (d.ok ? ' ok' : '')} style={{ height: `${(d.min / maxMin) * 100}%` }} />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        {s.tamperLog.length > 0 && <p class="bad">Clock tampering detected {s.tamperLog.length} time{s.tamperLog.length > 1 ? 's' : ''} (last: {fmtT(s.tamperLog[s.tamperLog.length - 1].at)}).</p>}
        <div class="card scroll" style={{ padding: 8 }}>
          <table class="log">
            <thead><tr><th>When</th><th>Type</th><th>Minutes</th><th>Result</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan={4} class="dim">Nothing logged yet.</td></tr>}
              {log.map((r) => {
                if (r.kind === 'study') {
                  return (
                    <tr>
                      <td>{fmtT(r.start)}</td>
                      <td>Study{r.release ? ' (lock block)' : ''}</td>
                      <td class="mono">{r.minutes.toFixed(0)}</td>
                      <td class={r.voided ? 'bad' : 'dim'}>{r.voided ? 'voided (clock moved back)' : r.earnedMin ? `+${r.earnedMin} min break` : r.autoCapped ? 'auto-stopped' : 'no break earned'}</td>
                    </tr>
                  );
                }
                const res = breakOnTime(r);
                return (
                  <tr>
                    <td>{fmtT(r.start)}</td>
                    <td>Break</td>
                    <td class="mono">{r.minutes.toFixed(0)}</td>
                    <td class={res === 'overrun' ? 'bad' : res === 'on time' || res === 'ended early' ? 'ok' : 'warnc'}>
                      {res}{res === 'overrun' && r.lateMin ? ` (+${r.lateMin.toFixed(0)} min)` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
