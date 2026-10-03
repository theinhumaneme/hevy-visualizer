import { useMemo } from "react";
import { fmt, fmtD } from "../lib/format.js";
import * as Q from "../lib/dataQuality.js";

const dd = d => d ? fmtD(d, { month: "short", day: "numeric", year: "numeric" }) : "–";
const pct = x => x == null ? "–" : `${fmt(x * 100)}%`;

/* What every number rests on (Q01–Q04, Q06, Q07, J01). Compact by default; the details open on demand. */
export default function CoveragePanel({ base, M, open = false }) {
  const fresh = useMemo(() => Q.freshness(base, M, M.bwObs || []), [base, M]);
  const comp = useMemo(() => Q.completeness(base), [base]);
  const rec = useMemo(() => Q.reconciliation(base), [base]);
  const dur = useMemo(() => Q.durationQuality(base, M.RULES || { minValidMinutes: 15, maxValidMinutes: 240 }), [base, M]);
  const ls = useMemo(() => Q.loadStatus(base), [base]);
  const e1 = useMemo(() => M.empty ? [] : Q.e1rmCoverage(M), [M]);
  const J = useMemo(() => M.empty ? null : Q.weightMatchCoverage(M, M.bwObs || []), [M]);
  const e1All = e1.reduce((a, r) => ({ s: a.s + r.sets, e: a.e + r.eligible }), { s: 0, e: 0 });
  return (
    <details className="coverage panel" open={open}>
      <summary>
        <span className="caption">Data completeness</span>
        <span className="cov-line">Last workout <b>{dd(fresh.lastWorkout)}</b> ({fresh.daysSinceWorkout} d ago)
          {fresh.lastWeighIn ? <> · last weigh-in <b>{dd(fresh.lastWeighIn)}</b></> : " · no weigh-ins"}
          {" · "}<b>{fmt(rec.rows.at(-1)[1])}</b> working sets from {fmt(rec.rows[0][1])} rows
          {" · "}<b>{fmt(rec.sessions.at(-1)[1])}</b> qualifying of {fmt(rec.sessions[0][1])} logged
          {e1All.s ? <> · an estimated one-rep max (e1RM) is reliable for <b>{pct(e1All.e / e1All.s)}</b> of loaded sets</> : null}</span>
      </summary>
      <div className="cov-grid">
        <div>
          <h3>How the totals are built</h3>
          <table className="recon"><tbody>
            {rec.rows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="n">{v < 0 ? `−${fmt(-v)}` : fmt(v)}</td></tr>)}
            <tr className="sep"><td colSpan={2} /></tr>
            {rec.sessions.map(([l, v]) => <tr key={l}><td>{l}</td><td className="n">{v < 0 ? `−${fmt(-v)}` : fmt(v)}</td></tr>)}
          </tbody></table>
          <p className="note">"Working" means not a warm-up and not cardio; it doesn't measure effort. A qualifying session has 4+ working sets; shorter workouts still count their sets.</p>
        </div>
        <div>
          <h3>Field completeness</h3>
          <table className="recon"><tbody>
            {comp.map(c => <tr key={c.label} title={c.enables}><td>{c.label}{c.note ? <small> · {c.note}</small> : null}</td><td className="n">{fmt(c.n)}/{fmt(c.d)}</td><td className="n muted">{pct(c.share)}</td></tr>)}
          </tbody></table>
          <p className="note">Denominators only count rows where the field applies — a blank weight on a push-up is expected, on a machine it's missing.</p>
        </div>
        <div>
          <h3>Session durations</h3>
          <table className="recon"><tbody>
            {[["Usable (" + dur.rule + ")", dur.counts.eligible], ["Under 15 min", dur.counts.under], ["Zero length", dur.counts.zero], ["Over 240 min", dur.counts.over], ["No end time", dur.counts.missing], ["Negative", dur.counts.negative]]
              .filter(([, v], i) => i === 0 || v).map(([l, v]) => <tr key={l}><td>{l}</td><td className="n">{v}</td></tr>)}
            <tr><td>Minutes logged / used in time charts</td><td className="n">{fmt(dur.totalMinutes)} / {fmt(dur.usedMinutes)}</td></tr>
          </tbody></table>
          <p className="note">Flagged durations still count for sets and volume. The export can't say why a time is short or long.</p>
        </div>
        <div>
          <h3>Range and weigh-in coverage</h3>
          <table className="recon"><tbody>
            <tr><td>Log spans</td><td className="n">{dd(fresh.firstWorkout)} – {dd(fresh.lastWorkout)}</td></tr>
            {fresh.unobservedStart ? <tr><td>Range start with no workouts</td><td className="n">{fresh.unobservedStart} d</td></tr> : null}
            {fresh.unobservedEnd ? <tr><td>Range end with no workouts</td><td className="n">{fresh.unobservedEnd} d</td></tr> : null}
            {J && <tr><td>Sessions with a usable weigh-in</td><td className="n">{J.within7} / {J.total}</td></tr>}
            {J && <tr><td className="muted">same day · ≤7 d · bracket · none</td><td className="n muted">{J.counts["same-day"]} · {J.counts.nearest} · {J.counts.interpolated} · {J.counts.none}</td></tr>}
          </tbody></table>
        </div>
        {ls.length > 0 && <div>
          <h3>Unknown or changing load</h3>
          <ul className="cov-list">{ls.map(r => <li key={r.ex}><b>{r.ex}</b> — {Object.entries(r.kinds).map(([k, n]) => `${n} ${k}`).join(", ")}. {r.note}.</li>)}</ul>
        </div>}
        {e1.length > 0 && <div>
          <h3>Estimated one-rep max (e1RM): sets of 10 reps or fewer</h3>
          <table className="recon"><tbody>{e1.slice(0, 8).map(r => <tr key={r.ex}><td>{r.ex}</td><td className="n">{r.eligible}/{r.sets}</td><td className="n muted">{r.sessionsNone} of {r.sessions} sessions without one</td></tr>)}</tbody></table>
          <p className="note">Epley, weight × (1 + reps ÷ 30). When eligibility is low, actual load and reps are the better guide.</p>
        </div>}
      </div>
    </details>
  );
}
