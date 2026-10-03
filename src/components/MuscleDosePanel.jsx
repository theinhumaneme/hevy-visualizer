import { useMemo, useState } from "react";
import { C, seq } from "../lib/motion.js";
import { fmt, fmtD, short } from "../lib/format.js";
import { muscleDose, patternCoverage } from "../lib/workload.js";
import { bindTip } from "../lib/tip.js";
import XYChart from "./XYChart.jsx";
import Hint, { Method } from "./Hint.jsx";

const wk = d => fmtD(d, { month: "short", day: "numeric" });

/* How often, how much per exposure, how variable (V01–V06, A05). Direct and secondary sets stay separate;
   "credited" (direct + ½ secondary) is labelled as a counting convention, never as unique sets. */
export default function MuscleDosePanel({ base, M, reduced }) {
  const rows = useMemo(() => M.empty ? [] : muscleDose(M, base), [M, base]);
  const pc = useMemo(() => M.empty ? null : patternCoverage(M, base), [M, base]);
  const [sel, setSel] = useState(null);
  if (M.empty) return null;
  const active = rows.filter(r => r.directTotal + r.secondaryTotal > 0).sort((a, b) => b.directTotal - a.directTotal);
  const R = active.find(r => r.m === sel) || active[0];
  const weeks = M.weeks.map(w => w.start), nW = weeks.length;
  const cell = (v, max) => v ? seq(Math.min(18, v / Math.max(1, max) * 18)) : "transparent";
  const maxDays = Math.max(1, ...active.flatMap(r => r.daysPerWeek));

  return (
    <section className="block panel-x" id="an-muscles" aria-label="Weekly sets and training frequency">
      <div className="block-head"><h2>Weekly sets and training frequency<Hint k="credit" /></h2><span className="caption">{nW} weeks · logged working sets</span></div>
      <p className="interact">Select a muscle to see its exercises and weekly trend.</p>
      <div className="tw panel">
        <table className="dose">
          <thead><tr><th>Muscle</th><th className="n">Direct sets</th><th className="n">Secondary</th><th className="n">Typical credited sets per training week</th>
            <th className="n">Training days</th><th className="n">Direct sets per training day</th><th className="n">Days between training days</th><th className="n">Last full week vs usual</th></tr></thead>
          <tbody>{active.map(r => (
            <tr key={r.m} className={r.m === R.m ? "sel" : ""} onClick={() => setSel(r.m)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(r.m); } }} aria-selected={r.m === R.m}>
              <td><b>{r.label}</b></td><td className="n">{r.directTotal}</td><td className="n">{r.secondaryTotal}</td>
              <td className="n">{fmt(r.weekly.median, 1)} <span className="muted">({fmt(r.weekly.q1, 1)}–{fmt(r.weekly.q3, 1)})</span></td>
              <td className="n">{r.trainingDays}</td><td className="n">{r.setsPerExposure ?? "–"}</td>
              <td className="n">{r.spacing.median != null ? `${fmt(r.spacing.median, 1)} d` : "–"}{r.spacing.consecutiveDays ? <span className="muted"> · {r.spacing.consecutiveDays}× back-to-back</span> : null}</td>
              <td className="n">{r.recent ? <span className={r.recent.change > 0 ? "up" : ""}>{r.recent.change >= 0 ? "+" : "−"}{fmt(Math.abs(r.recent.change), 1)} <span className="muted">vs {fmt(r.recent.baseline, 1)}</span></span> : <span className="muted">–</span>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="note">The typical value is the median; the range in brackets is the middle half of weeks (25th–75th percentile). Credited sets count direct sets fully and secondary sets at half, so totals across muscles are larger than your unique sets.</p>
      <Method>
        <p>Direct sets train an exercise's main muscle; secondary sets involve an assisting one. Weekly figures use the weeks inside training blocks: an empty week within a block counts as zero, long gaps don't.</p>
        <p>Training days are distinct dates with direct sets for that muscle. “Days between training days” is calendar spacing, not measured recovery. “Last full week vs usual” compares the most recent complete week with the median of up to 8 earlier weeks in the same block (3+ needed).</p>
      </Method>

      {R && (
        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="panel">
            <h3>{R.label}: sets per week</h3>
            <XYChart reduced={reduced} height={200} y={{ label: "sets", zero: true }} ariaLabel={`${R.label}: direct and secondary sets per week.`}
              layers={[
                { type: "band", key: "band", from: weeks[0], to: weeks.at(-1), color: "transparent" },
                { type: "bars", key: "dir", color: C["series-1"], points: weeks.map((w, i) => ({ x: w, y: R.direct[i] + R.secondary[i] * 0.5, key: +w,
                  tip: `<b>Week of ${wk(w)}</b><span>${R.direct[i]} direct · ${R.secondary[i]} secondary · ${R.daysPerWeek[i]} training day${R.daysPerWeek[i] === 1 ? "" : "s"}</span>` })) },
                { type: "bars", key: "sec", color: C["series-3"], opacity: .9, points: weeks.map((w, i) => ({ x: w, y: R.secondary[i] * 0.5, key: +w })) },
                { type: "rule", key: "med", y: R.weekly.median, color: C["text-muted"], dash: "4 4" },
              ]} />
            <ul className="legend"><li><span className="sw" style={{ background: C["series-1"] }} />direct sets</li><li><span className="sw" style={{ background: C["series-3"] }} />secondary (½ credit)</li><li><span className="sw dashed" style={{ color: C["text-muted"] }} />weekly median</li></ul>
          </div>
          <div className="panel">
            <h3>{R.label}: which exercises count</h3>
            <ul className="contrib">{R.exercises.slice(0, 8).map(e => <li key={e.ex}><span>{short(e.ex)}</span><b>{e.direct}</b><em>{e.secondary ? `+${e.secondary} secondary` : "direct"}</em></li>)}</ul>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Training days per week, by muscle</h3>
        <div className="heat-grid" role="img" aria-label="Distinct training days per week for each muscle">
          {active.map(r => (
            <div className="hg-row" key={r.m}><span>{r.label}</span>
              <div className="hg-cells" style={{ gridTemplateColumns: `repeat(${nW}, 1fr)` }}>{r.daysPerWeek.map((v, i) =>
                <i key={i} ref={n => { if (n && !n.__tip) { n.__tip = 1; bindTip(n, `<b>${r.label} · week of ${wk(weeks[i])}</b><span>${v} training day${v === 1 ? "" : "s"} · ${r.direct[i]} direct sets</span>`, { focus: false }); } }}
                  style={{ background: cell(v, maxDays) }} />)}</div></div>))}
        </div>
      </div>

      {pc && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Movement patterns by week</h3>
          <p className="note" style={{ marginTop: 0 }}>Push/press (bench, shoulder press, dips), pull/row (rows, pulldowns, pull-ups), squat and lunge, hip hinge (back extension, deadlift), core, and isolation patterns. Darker cells = more working sets.</p>
          <div className="heat-grid" role="img" aria-label="Working sets per week by movement pattern">
            {pc.rows.map(r => (
              <div className="hg-row" key={r.pattern}><span title={r.exercises.join(", ")}>{r.pattern}{!r.total && <em> · no logged sets</em>}</span>
                <div className="hg-cells" style={{ gridTemplateColumns: `repeat(${nW}, 1fr)` }}>{r.weeks.map((v, i) =>
                  <i key={i} ref={n => { if (n && !n.__tip && v) { n.__tip = 1; bindTip(n, `<b>${r.pattern} · week of ${wk(weeks[i])}</b><span>${v} sets · ${r.exercises.map(short).join(", ")}</span>`, { focus: false }); } }}
                    style={{ background: v ? seq(v) : "transparent" }} />)}</div></div>))}
          </div>
          <p className="note">"No logged sets" only describes this export — training logged elsewhere isn't visible.</p>
        </div>
      )}
    </section>
  );
}
