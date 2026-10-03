import { useMemo, useState } from "react";
import { C } from "../lib/motion.js";
import { fmt, fmtD } from "../lib/format.js";
import * as BW from "../lib/bodyWeight.js";
import { weightMatchCoverage } from "../lib/dataQuality.js";
import XYChart from "./XYChart.jsx";
import { Method } from "./Hint.jsx";

const dd = d => fmtD(d, { month: "short", day: "numeric", year: "numeric" });

/* Observed body weight (B01–B03, J01). Raw weigh-ins first; any smoothing is an explicitly named average of
   ACTUAL weigh-ins, and no line crosses a gap without observations. */
export default function BodyWeightPanel({ M, unit, reduced }) {
  const [smooth, setSmooth] = useState("14");
  const [view, setView] = useState("daily");
  const obs = M.bwObs || [];
  const U = unit;
  const inR = o => (!M.range.from || o.date >= M.range.from) && (!M.range.to || o.date <= M.range.to);
  const rObs = useMemo(() => obs.filter(inR), [obs, M]);
  const cov = useMemo(() => BW.coverage(obs, { from: M.range.from, to: M.range.to }), [obs, M]);
  const st = useMemo(() => BW.stretches(rObs), [rObs]);
  const latest = st.at(-1) || [];
  const sl = BW.slope(latest);
  const J = useMemo(() => M.empty ? null : weightMatchCoverage(M, obs), [M, obs]);
  if (M.empty) return null;
  if (!obs.length) return (
    <section className="block panel-x" id="an-weight"><h2>Body weight</h2>
      {(M.measureCols || []).length
        ? <p className="note">Your measurements export has no body-weight entries (columns with data: {M.measureCols.join(", ")}). Add weigh-ins in Hevy, then export again.</p>
        : <><p className="note">No measurements export is loaded. Measurements are optional and add body-weight context. In Hevy: Profile → Settings → Export &amp; import data → Export measurements.</p>
          <div className="btn-row"><button className="btn ghost" type="button" data-choose-files>Add measurements</button></div></>}
    </section>);
  const sm = smooth === "none" ? null : BW.trailingMean(rObs, +smooth);
  const wk = BW.weekly(rObs);
  const gapsBands = cov.gaps.map((g, i) => ({ type: "band", key: `gap${i}`, from: g.from, to: g.to, color: C["surface-raised"] }));

  return (
    <section className="block panel-x" id="an-weight" aria-label="Body weight">
      <div className="block-head"><h2>Body weight</h2><span className="caption">{cov.days} days with recorded weigh-ins · {U}</span></div>
      <div className="mini-stats">
        <div><b>{cov.days}</b><span>days with recorded weigh-ins ({cov.weeks} weeks)</span></div>
        <div><b>{cov.medianInterval ?? "–"} d</b><span>typical days between weigh-ins · longest {cov.maxInterval ?? "–"} d</span></div>
        <div><b>{cov.last28}</b><span>weigh-ins in the last 28 days</span></div>
        <div><b>{sl.ok ? `${sl.perWeek >= 0 ? "+" : "−"}${fmt(Math.abs(sl.perWeek), 2)}` : "–"}</b><span>{sl.ok ? `${U} per week, ${dd(sl.from)} → ${dd(sl.to)} (${sl.n} weigh-ins with no 14-day gap)` : `Rate unavailable: ${sl.reason.toLowerCase()} without a 14-day gap.`}</span></div>
      </div>
      <div className="panel">
        <div className="block-head">
          <div className="seg" role="group" aria-label="View">{[["daily", "Each weigh-in"], ["weekly", "Weekly average"]].map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
          {view === "daily" && <div className="seg" role="group" aria-label="Smoothing">{[["none", "Recorded weigh-ins"], ["7", "7-day average"], ["14", "14-day average"]].map(([k, l]) => <button key={k} type="button" aria-pressed={smooth === k} onClick={() => setSmooth(k)}>{l}</button>)}</div>}
        </div>
        {view === "daily" ? (
          <XYChart reduced={reduced} height={260} y={{ label: `${U} · axis doesn't start at 0` }} ariaLabel={`${rObs.length} weigh-ins${sm ? ` with a trailing ${smooth}-day mean of actual weigh-ins` : ""}. Shaded areas are gaps of more than 14 days.`}
            layers={[...gapsBands,
              { type: "dots", key: "raw", color: C.baseline, points: rObs.map(o => ({ x: o.date, y: o.w, key: +o.date, r: 2.8, tip: `<b>${dd(o.date)}</b><span>${fmt(o.w, 1)} ${U} recorded${o.n > 1 ? ` (average of ${o.n} that day)` : ""}</span>` })) },
              ...(sm ? [{ type: "line", key: "sm", color: C["series-2"], width: 2.25, gapDays: 14, points: sm.map(p => ({ x: p.date, y: p.w })) }] : []),
            ]} />
        ) : (
          <XYChart reduced={reduced} height={260} y={{ label: `${U}, weekly average · axis doesn't start at 0` }} ariaLabel={`Weekly mean of observed weigh-ins for ${wk.length} weeks; weeks without weigh-ins are blank.`}
            layers={[...gapsBands,
              { type: "dots", key: "wk", color: C["series-2"], points: wk.map(w => ({ x: w.week, y: w.mean, key: +w.week, r: 2 + Math.min(4, w.n),
                tip: `<b>Week of ${dd(w.week)}</b><span>average ${fmt(w.mean, 1)} ${U} from ${w.n} weigh-in${w.n === 1 ? "" : "s"} · range ${fmt(w.min, 1)}–${fmt(w.max, 1)}</span>` })) },
            ]} />
        )}
        <p className="how-to-read">{view === "daily" ? <>Grey dots are recorded weigh-ins{smooth !== "none" ? <>; the blue line is the average of recorded weigh-ins in the previous {smooth} days (shown only with 3+ weigh-in days, never across a gap)</> : null}.</> : <>Each dot is one week's average of recorded weigh-ins; bigger dots average more weigh-ins.</>} Shaded stretches are more than 14 days without a weigh-in. The axis is zoomed in, so small changes look larger.</p>
        {cov.gaps.length > 0 && <p className="note">Gaps: {cov.gaps.map(g => `${dd(g.from)} → ${dd(g.to)} (${g.days} d)`).join(" · ")}</p>}
      </div>
      {J && J.total > 0 && <p className="note"><b>{J.within7} of {J.total}</b> sessions in this range have a weigh-in close enough to use for relative-strength figures; the rest are left out.</p>}
      <Method title="Details: rate and matching">
        {sl.ok && <p>The weekly rate is a straight-line fit through the {sl.n} recorded weigh-ins in the latest stretch, give or take {fmt(sl.sePerWeek, 2)} {U}/week (standard error). It describes the past stretch; it isn't a forecast.</p>}
        {J && J.total > 0 && <p>Matching weigh-ins to workouts: {J.counts["same-day"]} same day, {J.counts.nearest} within 7 days, {J.counts.interpolated} estimated between weigh-ins no more than 14 days apart, {J.counts.none} with no usable weigh-in.</p>}
        <p>Scale weight alone can't separate fat, muscle and water.</p>
      </Method>
    </section>
  );
}
