import { useMemo, useState } from "react";
import { C, d3 } from "../lib/motion.js";
import { fmt, fmtD, short } from "../lib/format.js";
import * as P from "../lib/progression.js";
import XYChart from "./XYChart.jsx";
import Hint from "./Hint.jsx";

const dd = d => fmtD(d, { month: "short", day: "numeric", year: "2-digit" });

/* Comparable progression for one exercise (S01–S04, S06, S13, J02). Everything compares like with like:
   the same exact exercise, its own measurement kind, actual load and reps. Estimated 1RM is not used here. */
export default function ProgressionExplorer({ base, M, exercise, reduced }) {
  const E = exercise && base.exs.get(exercise);
  const U = base.unit;
  const from = M.empty ? null : M.rangeStart, to = M.empty ? null : M.rangeEnd;
  const inR = d => (!from || d >= from) && (!to || d <= new Date(+to + 864e5));
  const [targetSel, setTarget] = useState(null);
  const [loadSel, setLoad] = useState(null);
  const [nSel, setN] = useState(null);
  const [relative, setRelative] = useState(false);

  const data = useMemo(() => {
    if (!E || !["loaded", "assisted", "bodyweight"].includes(E.kind)) return null;
    const fr = P.frontier(E, inR), rt = P.repTargets(E, inR, 3), loads = P.loadsUsed(E, inR);
    return { fr, rt, loads };
  }, [E, M]);
  if (!E) return null;
  if (!data) return (
    <section className="block panel-x"><h2>Progress at comparable weights and reps</h2>
      <p className="note">{E.kind === "unknown" ? "No load was logged for this exercise, so there's nothing comparable to track beyond the reps shown above." : "Timed or cardio work: see the chart above."}</p></section>
  );
  const asst = E.kind === "assisted", bw = E.kind === "bodyweight", better = asst ? -1 : 1;
  const target = targetSel && data.rt.targets.includes(targetSel) ? targetSel : data.rt.mode;
  const lar = target != null && !bw ? P.loadAtReps(E, target, inR, M.bwMatch) : [];
  const trend = P.matchedTrend(lar.map(p => ({ date: p.date, v: p.w })), { better });
  const relOk = !asst && !bw && lar.some(p => p.rel != null);
  const useRel = relative && relOk;
  const load = loadSel != null && data.loads.some(l => l.w === loadSel) ? loadSel : data.loads[0]?.w;
  const L = data.loads.find(l => l.w === load);
  const maxN = L ? Math.max(...L.sessions.map(s => s.sets)) : 0;
  const nOptions = L ? d3.range(1, maxN + 1).filter(n => L.sessions.filter(s => s.sets >= n).length >= 2) : [];
  const N = nSel && nOptions.includes(nSel) ? nSel : nOptions.at(-1);
  const matched = L && N ? P.matchedSets(E, load, N, inR) : [];
  const eff = asst ? P.assistedEffective(E, inR, M.bwMatch) : null;
  const lw = v => bw ? "bodyweight" : `${fmt(v, 1)} ${U}${asst ? " help" : ""}`;
  const t0 = data.fr.sets[0]?.date, t1 = data.fr.sets.at(-1)?.date;
  const age = d => (t1 && t0 && t1 > t0) ? (d - t0) / (t1 - t0) : 1;
  const col = d3.interpolateRgb(C.baseline, C["series-2"]);

  return (
    <section className="block panel-x" aria-label={`Progress at comparable weights and reps for ${E.ex}`}>
      <div className="block-head"><h2>Progress at comparable weights and reps</h2><span className="caption">{short(E.ex)} · {data.fr.n} working sets in range</span></div>
      <p className="note" style={{ marginTop: 0 }}>These charts compare like with like — the same exercise, actual weight and reps — and count working sets only (no warm-ups). Hover, tap or focus a point for details.</p>
      {E.mixed && <p className="note">This history mixes measurement kinds ({Object.entries(E.kinds).map(([k, n]) => `${n} ${k}`).join(", ")}); only {E.kind} sessions are compared.</p>}

      {!bw && (
        <div className="grid2">
          <div className="panel">
            <h3>Best weight-and-rep combinations</h3>
            <XYChart reduced={reduced} height={240} x={{ type: "linear", label: "reps →" }}
              y={{ label: asst ? `assistance, ${U} (lower = stronger)` : U, invert: asst }}
              ariaLabel={`Every ${E.ex} set as load versus reps; ${data.fr.frontier.length} sets are on the best-performance boundary.`}
              layers={[
                { type: "dots", key: "all", points: data.fr.sets.map((s, i) => ({ x: s.reps, y: s.w, key: `${s.sid}:${i}`, r: 3, color: col(age(s.date)), opacity: .55,
                  tip: `<b>${dd(s.date)}</b><span>${lw(s.w)} × ${s.reps}</span>` })) },
                { type: "step", key: "front", color: C.accent, points: data.fr.frontier.map(p => ({ x: p.reps, y: p.w })) },
                { type: "dots", key: "fp", color: C.accent, points: data.fr.frontier.map(p => ({ x: p.reps, y: p.w, key: `f${p.reps}:${p.w}`, r: 5,
                  tip: `<b>Best at ${p.reps} reps: ${lw(p.w)}</b><span>First reached ${dd(p.date)}</span>` })) },
              ]} />
            <p className="note">Every dot is a set (older grey, newer blue). Green points are your best combinations: no other set has {asst ? "less assistance" : "more weight"} and at least as many reps.</p>
            {data.fr.events.length > 0 && <ul className="events">{data.fr.events.slice(-4).reverse().map((e, i) => <li key={i}><b>{dd(e.date)}</b> {lw(e.w)} × {e.reps}{e.displaced.length ? ` — beat ${e.displaced.map(q => `${fmt(q.w, 1)}×${q.reps}`).join(", ")}` : " — a new trade-off"}</li>)}</ul>}
          </div>
          <div className="panel">
            <h3>{asst ? "Least assistance" : "Heaviest weight"} for sets of at least {target} reps{asst ? <Hint k="assistance" /> : null}</h3>
            {data.rt.targets.length > 1 && <div className="seg wrap" role="group" aria-label="Rep threshold">
              {data.rt.targets.map(t => <button key={t} type="button" aria-pressed={t === target} aria-label={`At least ${t} reps`} onClick={() => setTarget(t)}>{t}+</button>)}</div>}
            {relOk && <label className="toggle"><input type="checkbox" checked={relative} onChange={e => setRelative(e.target.checked)} /> Show as a multiple of body weight (sessions with a weigh-in within 7 days)</label>}
            {lar.length ? <XYChart reduced={reduced} height={200} y={{ label: useRel ? "× body weight" : asst ? `${U} help (lower = stronger)` : U, invert: asst, format: useRel ? (v => fmt(v, 2)) : undefined }}
              ariaLabel={`Best load per session among sets of ${target} or more reps, ${lar.length} sessions.`}
              layers={[
                { type: "line", key: "lar", gapDays: 45, color: C["series-1"], points: lar.map(p => ({ x: p.date, y: useRel ? p.rel : p.w })) },
                { type: "dots", key: "lard", points: lar.map(p => ({ x: p.date, y: useRel ? p.rel : p.w, key: p.sid, r: p.record ? 5 : 3, color: p.record ? C.record : C["series-1"],
                  hollow: useRel && p.rel == null,
                  tip: `<b>${dd(p.date)}${p.record ? " · record" : ""}</b><span>${lw(p.w)} × ${p.reps} reps${p.bw ? `<br>body weight ${fmt(p.bw, 1)} ${U} (${p.bwMethod})` : ""}</span>` })) },
              ]} /> : <p className="note">No sessions with a set of at least {target} reps in this range.</p>}
            <p className="trend">{trend.ok
              ? <>Latest block, {trend.n} sessions: <b className={trend.change > 0 ? "up" : ""}>{trend.change >= 0 ? "+" : "−"}{fmt(Math.abs(trend.change), 1)} {U}</b> from the first {trend.k} to the last {trend.k} ({dd(trend.from)} → {dd(trend.to)}){asst ? " less help" : ""}.</>
              : <span className="muted">{trend.reason}.</span>}</p>
          </div>
        </div>
      )}

      {data.loads.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>{bw ? "Reps per session (bodyweight)" : `Reps at the same ${asst ? "assistance" : "weight"}`}</h3>
          {!bw && <div className="seg wrap" role="group" aria-label="Load">{data.loads.slice(0, 10).map(l =>
            <button key={l.w} type="button" aria-pressed={l.w === load} onClick={() => { setLoad(l.w); setN(null); }}>{lw(l.w)} · {l.sessions.length}</button>)}</div>}
          {L && <XYChart reduced={reduced} height={180} y={{ label: "reps", zero: true }} ariaLabel={`Best and total reps per session at ${lw(load)}.`}
            layers={[
              { type: "bars", key: "tot", color: C["series-2-soft"], opacity: 1, points: L.sessions.map(s => ({ x: s.date, y: s.total, key: s.sid, tip: `<b>${dd(s.date)}</b><span>${s.sets} sets: ${s.reps.join(", ")} reps (total ${s.total})</span>` })), barWidth: 8 },
              { type: "line", key: "best", gapDays: 45, color: C.accent, points: L.sessions.map(s => ({ x: s.date, y: s.best })) },
              { type: "dots", key: "bestd", color: C.accent, points: L.sessions.map(s => ({ x: s.date, y: s.best, key: s.sid, tip: `<b>${dd(s.date)}</b><span>best set ${s.best} reps at ${lw(load)}</span>` })) },
            ]} />}
          {L && <p className="note">Bars: total reps at {lw(load)} that session. Line: best single set. More reps at the same {asst ? "assistance" : "load"} is progress without {asst ? "less help" : "more weight"}.</p>}
          {nOptions.length > 0 && (<>
            <div className="matched-head"><h3>Total reps across your first {N} set{N === 1 ? "" : "s"} at {lw(load)}</h3>
              <div className="seg" role="group" aria-label="Set count">{nOptions.map(n => <button key={n} type="button" aria-pressed={n === N} onClick={() => setN(n)}>{n}</button>)}</div></div>
            {matched.length >= 2 && <p className="big-callout small">{matched[0].total} → <em>{matched.at(-1).total} reps</em> <span className="muted">({dd(matched[0].date)} → {dd(matched.at(-1).date)}, {matched.length} sessions)</span></p>}
            <div className="strips">{matched.slice(-8).map(s => <div key={s.sid} className="strip-row"><span>{dd(s.date)}</span>{s.reps.map((r, i) => <i key={i} style={{ width: `${r / Math.max(...matched.flatMap(x => x.reps)) * 100 / N}%` }}>{r}</i>)}<b>{s.total}</b></div>)}</div>
          </>)}
        </div>
      )}

      {eff && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Estimated share of body weight lifted (body weight − assistance)<Hint k="relative" /></h3>
          {eff.points.length ? <>
            <XYChart reduced={reduced} height={200} y={{ label: "share of body weight lifted", format: v => fmt(v * 100) + "%" }}
              ariaLabel={`Body weight minus assistance as a share of body weight, ${eff.coverage} of ${eff.total} sessions with an eligible weigh-in.`}
              layers={[
                { type: "line", key: "f", gapDays: 45, color: C["series-3"], points: eff.points.map(p => ({ x: p.date, y: p.frac })) },
                { type: "dots", key: "fd", color: C["series-3"], points: eff.points.map(p => ({ x: p.date, y: p.frac, key: p.sid,
                  tip: `<b>${dd(p.date)}</b><span>${fmt(p.bw, 1)} − ${fmt(p.assist, 1)} = ${fmt(p.eff, 1)} ${U} (${fmt(p.frac * 100)}%) × ${p.reps} reps<br>weigh-in: ${p.method}${p.distanceDays ? `, ${p.distanceDays} days away` : ""}</span>` })) },
              ]} />
            <p className="note">{eff.coverage} of {eff.total} sessions have a weigh-in the same day, within 7 days, or inside a ≤14-day bracket; the rest are left out. A proxy: machine mechanics and body support aren't measured.</p>
          </> : <p className="note">No sessions with an eligible weigh-in (same day, within 7 days, or a ≤14-day bracket).</p>}
        </div>
      )}
    </section>
  );
}
