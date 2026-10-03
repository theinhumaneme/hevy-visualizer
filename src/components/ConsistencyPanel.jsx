import { useMemo } from "react";
import { C } from "../lib/motion.js";
import { fmt, fmtD, short } from "../lib/format.js";
import * as W from "../lib/workload.js";
import XYChart from "./XYChart.jsx";
import Hint, { Method } from "./Hint.jsx";

const dd = d => fmtD(d, { month: "short", day: "numeric", year: "numeric" });
const CLASS = [["loaded", "External load", C["series-1"]], ["assisted", "Assisted", C["series-3"]], ["bodyweight", "Bodyweight", C["series-2"]],
  ["unknown", "Load not logged", C.warm], ["hold", "Timed holds", C["series-4"]], ["cardio", "Cardio", C.baseline]];

/* Consistency and workload (A01–A04, A06, V08, V10, V11). Calendar summaries include empty weeks and days. */
export default function ConsistencyPanel({ base, M, target, onTarget, reduced }) {
  const d = useMemo(() => M.empty ? null : {
    months: W.monthly(M, base), freq: W.frequency(M), adh: W.adherence(M, target), sp: W.spacing(M), roll: W.rolling(M),
    cls: W.loadClasses(M), conc: W.concentration(M), per: W.perSession(M, true),
  }, [M, base, target]);
  if (!d) return null;
  const U = M.totals.unit;
  const clsTotal = Object.values(d.cls).reduce((a, c) => a + c.sets, 0);
  const maxM = Math.max(1, ...d.months.map(m => m.sets));

  return (
    <section className="block panel-x" aria-label="Consistency and workload">
      <div className="block-head"><h2>Consistency and workload</h2><span className="caption">{dd(M.rangeStart)} – {dd(M.rangeEnd)}</span></div>

      <p className="note" style={{ marginTop: 0 }}>Three ways to count sessions per week, because long gaps change the answer: every calendar week in the range, only weeks inside training blocks, or only weeks with at least one session. Your target is {target}+ qualifying sessions a week — choose a different number below; it's saved on this device and used by every streak.</p>
      <div className="mini-stats">
        <div><b>{fmt(d.freq.calendar.perWeek, 2)}</b><span>sessions per calendar week ({d.freq.calendar.weeks} weeks, gaps included)</span></div>
        <div><b>{fmt(d.freq.block.perWeek, 2)}</b><span>per week inside training blocks<Hint k="block" />  ({d.freq.block.weeks} weeks)</span></div>
        <div><b>{fmt(d.freq.active.perWeek, 2)}</b><span>per week that had any session ({d.freq.active.weeks} weeks)</span></div>
        <div>
          <b>{d.adh.met}/{d.adh.weeks}</b>
          <span>weeks on target<Hint k="target" /> — target{" "}
            <select aria-label="Weekly session target" value={target} onChange={e => onTarget(+e.target.value)}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}+</option>)}</select>{" "}qualifying sessions a week
            {d.adh.inProgress != null ? ` · this week so far: ${d.adh.inProgress}` : ""}</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Rolling activity</h3>
          <XYChart reduced={reduced} height={200} y={{ label: "qualifying sessions", zero: true }} ariaLabel="Qualifying sessions in the trailing 7 and 28 days, every calendar day."
            layers={[
              { type: "line", key: "r28", color: C["series-2"], dash: "6 4", points: d.roll.map(p => ({ x: p.date, y: p.s28 / 4 })) },
              { type: "line", key: "r7", color: C["series-1"], width: 1.75, points: d.roll.map(p => ({ x: p.date, y: p.s7 })) },
              { type: "rule", key: "t", y: target, color: C["text-subtle"], dash: "2 4" },
            ]} />
          <ul className="legend"><li><span className="sw line" style={{ background: C["series-1"] }} />last 7 days</li><li><span className="sw dashed" style={{ color: C["series-2"] }} />last 28 days ÷ 4</li><li><span className="sw dashed" style={{ color: C["text-subtle"] }} />your weekly target</li></ul>
          <p className="note">Empty days count as zero.</p>
        </div>
        <div className="panel">
          <h3>Days between sessions</h3>
          <XYChart reduced={reduced} height={200} x={{ type: "linear", domain: [-0.5, d.sp.hist.length - 0.5], format: i => d.sp.hist[Math.round(i)]?.label || "" }} y={{ label: "gaps", zero: true }}
            ariaLabel={`Spacing between ${d.sp.n + 1} qualifying sessions: median ${fmt(d.sp.median, 1)} days.`}
            layers={[{ type: "bars", key: "h", color: C["series-2"], barWidth: 26, points: d.sp.hist.map((h, i) => ({ x: i, y: h.n, key: h.label, tip: `<b>${h.label}</b><span>${h.n} gaps</span>` })) }]} />
          <p className="note">Median {fmt(d.sp.median, 1)} days (middle half {fmt(d.sp.q1, 1)}–{fmt(d.sp.q3, 1)}); longest {d.sp.max ? `${fmt(d.sp.max.days, 0)} days (${dd(d.sp.max.from)} → ${dd(d.sp.max.to)})` : "–"}. {d.sp.sameDayExtraLogs ? `${d.sp.sameDayExtraLogs} extra logs fell on a day that already had one.` : ""} Spacing, not measured recovery.</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Month by month</h3>
        <div className="tw"><table className="months">
          <thead><tr><th>Month</th><th className="n">Logged</th><th className="n">Qualifying</th><th className="n">Working sets</th><th className="n">Reps</th><th className="n">Weight lifted ({U})</th><th /></tr></thead>
          <tbody>{d.months.map(m => (
            <tr key={m.key}><td>{m.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}{m.partial ? <small className="muted"> · first {m.partial} days</small> : null}</td>
              <td className="n">{m.logs}</td><td className="n">{m.sessions}</td><td className="n">{fmt(m.sets)}</td><td className="n">{fmt(m.reps)}</td><td className="n">{fmt(m.tonnage)}</td>
              <td className="bar-cell"><i style={{ width: `${m.sets / maxM * 100}%` }} /></td></tr>))}</tbody>
        </table></div>
        {d.months.at(-1)?.prevSamePart && <p className="note">This month so far vs the same {d.months.at(-1).prevSamePart.days} days of last month: {d.months.at(-1).sessions} vs {d.months.at(-1).prevSamePart.sessions} qualifying sessions, {fmt(d.months.at(-1).sets)} vs {fmt(d.months.at(-1).prevSamePart.sets)} working sets.</p>}
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>What the sets are</h3>
          <div className="stack" role="img" aria-label={CLASS.filter(([k]) => d.cls[k]).map(([k, l]) => `${l} ${d.cls[k].sets} sets`).join(", ")}>
            {CLASS.filter(([k]) => d.cls[k]).map(([k, l, c]) => <i key={k} style={{ width: `${d.cls[k].sets / clsTotal * 100}%`, background: c }} title={`${l}: ${d.cls[k].sets} sets`} />)}</div>
          <ul className="legend">{CLASS.filter(([k]) => d.cls[k]).map(([k, l, c]) => <li key={k}><span className="sw" style={{ background: c }} />{l} <b>{fmt(d.cls[k].sets)}</b> sets · {fmt(d.cls[k].reps)} reps</li>)}</ul>
          <p className="note">“Weight lifted” counts external load only (weight × reps). Machine assistance, bodyweight sets and sets with no logged weight aren't included.</p>
        </div>
        <div className="panel">
          <h3>Where the volume comes from</h3>
          <ul className="contrib">{d.conc.rows.slice(0, 7).map(r => <li key={r.ex}><span>{short(r.ex)}</span><b>{fmt(r.share * 100, 1)}%</b><em>{fmt(r.v)} {U}</em></li>)}</ul>
          <p className="note">Top exercise {fmt(d.conc.top1 * 100)}%, top 3 {fmt(d.conc.top3 * 100)}%, top 5 {fmt(d.conc.top5 * 100)}% of external-load volume — a change in total volume can come from exercise choice rather than progress.</p>
        </div>
      </div>

      {d.per && <div className="panel" style={{ marginTop: 16 }}>
        <h3>A typical session ({d.per.n} qualifying)</h3>
        <div className="tw"><table className="recon"><thead><tr><th /><th className="n">min</th><th className="n" title="lower quarter">25%</th><th className="n">median</th><th className="n" title="upper quarter">75%</th><th className="n">max</th></tr></thead><tbody>
          {[["Working sets", d.per.sets], ["Reps", d.per.reps], ["Exercises", d.per.exercises]].map(([l, s]) => <tr key={l}><td>{l}</td>{["min", "q1", "median", "q3", "max"].map(k => <td key={k} className="n">{fmt(s[k], k === "q1" || k === "q3" ? 1 : 0)}</td>)}</tr>)}
        </tbody></table></div>
      </div>}
    </section>
  );
}
