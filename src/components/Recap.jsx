import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { deriveMetrics } from "../lib/derive.js";
import { resolveRange, previousRange } from "../lib/ranges.js";
import { gsap, T, EASE, C, seq } from "../lib/motion.js";
import { fmt, fmtD, fmtDur, short } from "../lib/format.js";
import { bindTip } from "../lib/tip.js";
import RangePicker from "./RangePicker.jsx";
import { periodChange } from "../lib/bodyWeight.js";
import Hint from "./Hint.jsx";

const DOW = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const PR_WORD = { weight: "Heaviest set", e1rm: "Best estimated one-rep max", reps: "More reps at the same weight", volume: "Best session volume", assist: "Least machine assistance", bwreps: "Most reps in a set" };
const dl = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function heading(range, res) {
  if (range.id === "all") return "All time";
  if (range.id === "3m") return "Last 3 months";
  return res.title.charAt(0).toUpperCase() + res.title.slice(1);
}
function prevLabel(range, prev) {
  if (!prev) return "";
  if (range.id === "year") return "vs " + prev.from.getFullYear();
  if (range.id === "lastMonth") return "vs " + prev.from.toLocaleDateString("en-US", { month: "short" });
  if (range.id === "month") return `vs ${prev.from.toLocaleDateString("en-US", { month: "short" })} 1–${prev.to.getDate()}`;
  return "vs the period before";
}
// Change vs the previous period: up is lime, anything else stays neutral (no red for a lighter month).
function Delta({ now, before, pct, dur }) {
  if (before == null) return null;
  const d = now - before;
  if (!before && !now) return <span className="delta">—</span>;
  const txt = `${d >= 0 ? "+" : "−"}${pct && before ? fmt(Math.abs(d / before) * 100) + "%" : dur ? fmtDur(Math.abs(d)) : fmt(Math.abs(d))}`;
  return <span className={"delta" + (d > 0 ? " up" : "")}>{d === 0 ? "same" : txt}</span>;
}

export default function Recap({ base, measurements, target, range, onRange, bounds, reduced, synthetic }) {
  const res = useMemo(() => resolveRange(range), [range]);
  const prev = useMemo(() => previousRange(res), [res]);
  const M = useMemo(() => deriveMetrics(base, { from: res.from, to: res.to, measurements: measurements || [], target }), [base, measurements, res, target]);
  const P = useMemo(() => prev && deriveMetrics(base, { from: prev.from, to: prev.to, target }), [base, prev, target]);
  const root = useRef(null), weeksRef = useRef(null);
  const title = heading(range, res), vs = prevLabel(range, prev);
  const U = M.unit || M.totals.unit;

  const t = M.totals, pt = P && !P.empty ? P.totals : (P ? P.totals : null);
  const tiles = M.empty ? [] : [
    ["qualifying sessions", t.sessions, pt && pt.sessions, "qualifying", ""],
    ["logged workouts", t.logged, pt && pt.logged, "logged", ""],
    ["days with logged training", t.days, pt && pt.days, null, ""],
    ["working sets", t.sets, pt && pt.sets, "working", ""],
    [`weight lifted (${U})`, Math.round(t.tonnage), pt && Math.round(pt.tonnage), "weightLifted", "pct"],
    ["time logged", Math.round(t.minutes), pt && Math.round(pt.minutes), null, "dur"],
    ["new personal records", t.prs, pt && pt.prs, "record", ""],
  ];

  const hi = useMemo(() => {
    if (M.empty) return null;
    const top = [...M.exs].sort((a, b) => b.sets - a.sets)[0];
    const muscle = Object.entries(M.muscleTotals).sort((a, b) => b[1] - a[1])[0];
    const big = [...M.prs].filter(p => p.type === "weight" || p.type === "assist").sort((a, b) => b.gain - a.gain)[0] || [...M.prs].sort((a, b) => b.gain - a.gain)[0];
    const day = M.dow.map((d, i) => ({ i, n: d.n })).sort((a, b) => b.n - a.n)[0];
    const tod = [...M.todCounts].sort((a, b) => b.n - a.n)[0];
    // B10: observed endpoint windows (first/last 14 days of the period), for this and the previous period
    const pFrom = M.range.from || M.rangeStart, pTo = M.rangeEnd;
    const bw = M.bwObs?.length ? { now: periodChange(M.bwObs, pFrom, pTo), prev: prev ? periodChange(M.bwObs, prev.from, prev.to) : null } : null;
    return { top, muscle, big, day, tod, bw };
  }, [M, prev]);

  // count-ups land on the exact value
  useLayoutEffect(() => {
    if (M.empty) return;
    const ctx = gsap.context(() => {
      const nums = gsap.utils.toArray(".tile b[data-v]");
      if (reduced) { gsap.from(".recap-body", { opacity: 0, duration: T.base }); return; }
      gsap.from(".recap-head .mask>span", { yPercent: 110, duration: T.slow, ease: EASE.out, stagger: T.loose * 0.6 });
      gsap.from(".tile", { opacity: 0, y: 18, duration: T.base, ease: EASE.out, stagger: T.stagger, delay: 0.15 });
      nums.forEach((b, i) => {
        const v = +b.dataset.v, kind = b.dataset.k, o = { v: 0 };
        gsap.to(o, { v, duration: T.hero, ease: EASE.out, delay: 0.2 + i * T.stagger,
          onUpdate: () => { b.textContent = kind === "dur" ? fmtDur(o.v) : fmt(Math.round(o.v)); },
          onComplete: () => { b.textContent = kind === "dur" ? fmtDur(v) : fmt(v); } });
      });
      gsap.from(".hl", { opacity: 0, y: 16, duration: T.base, ease: EASE.out, stagger: T.loose, delay: 0.5 });
      gsap.from(".wk-bar", { scaleY: 0, transformOrigin: "50% 100%", duration: T.slow, ease: EASE.draw, stagger: T.tight * 2, delay: 0.4 });
    }, root);
    return () => ctx.revert();
  }, [M, reduced]);

  useEffect(() => {
    if (!weeksRef.current) return;
    weeksRef.current.querySelectorAll(".wk-bar").forEach(b => bindTip(b, b.dataset.tip));
  }, [M]);



  const maxSets = M.empty ? 1 : Math.max(1, ...M.weeks.map(w => w.sets));
  return (
    <main className="recap" ref={root}>
      <div className="wrap">
        <div className="recap-head">
          <p className="eyebrow"><i>●</i>Recap</p>
          <h1 className="view-title"><span className="mask"><span>{title}</span></span></h1>
          <p className="purpose">See your training totals and highlights for this period, with changes from the previous period.</p>
          <RangePicker value={range} onChange={onRange} min={bounds.min} max={bounds.max} />
          <p className="scope-line">{prev
            ? <>Changes compare <b>{res.from ? dl(res.from) : "the start"} – {dl(M.empty ? res.to || new Date() : M.rangeEnd)}</b> with <b>{dl(prev.from)} – {dl(prev.to)}</b>. Counts show the difference; weight lifted shows a percentage.</>
            : "All time has no previous period to compare with."} Recap has its own period picker; the top-bar range applies to the other views.</p>
        </div>

        {M.empty ? (
          <div className="empty-card"><h2>No workouts in {res.title}.</h2><p className="lede">Your log runs from {bounds.min.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Pick another period, or see everything.</p>
            <button className="btn" type="button" onClick={() => onRange({ id: "all" })}>Show all time</button></div>
        ) : (
          <div className="recap-body">
            <div className="tiles">
              {tiles.map(([label, v, before, hint, kind]) => (
                <div className="tile card" key={label}>
                  <b className="num" data-v={v} data-k={kind}>{kind === "dur" ? fmtDur(v) : fmt(v)}</b>
                  <span className="caption">{label}{hint && <Hint k={hint} />}</span>
                  {P && !P.empty && <span className="vs"><Delta now={v} before={before ?? 0} pct={kind === "pct"} dur={kind === "dur"} /> <span>{vs}</span></span>}
                </div>
              ))}
            </div>
            {P && P.empty && <p className="note">No workouts logged in the previous period ({dl(prev.from)} – {dl(prev.to)}), so there's nothing to compare against.</p>}

            <div className="card weeks-card">
              <p className="caption">Working sets per week {M.weeks.length > 1 ? `· ${M.weeks.length} weeks` : ""}</p>
              <p className="note" style={{ marginTop: 4 }}>Weeks start on Monday, so the first and last weeks can be partial. Hover, tap or focus a bar for its numbers.</p>
              <div className="wk" ref={weeksRef} role="img" aria-label={`Working sets per week: ${M.weeks.map(w => w.sets).join(", ")}`}>
                {M.weeks.map(w => (
                  <span key={w.key} className="wk-bar" data-tip={`<b>Week of ${fmtD(w.start, { month: "short", day: "numeric" })}</b><span>${w.sets} sets · ${w.sessions} sessions</span>`}
                    style={{ height: `${Math.max(w.sets ? 3 : 1, (w.sets / maxSets) * 100)}%`, background: w.sets ? seq(w.sets / 2) : C["bg-3"] }} />
                ))}
              </div>
            </div>

            <div className="highlights">
              {hi.top && <div className="hl card"><span className="caption">Most-trained exercise</span><h3>{short(hi.top.ex)}</h3><p>{fmt(hi.top.sets)} sets across {fmt(hi.top.hist.length)} sessions</p></div>}
              {hi.big && <div className="hl card accent"><span className="caption">Record highlight</span><h3>{short(hi.big.ex)}</h3>
                <p>{PR_WORD[hi.big.type]}: {fmt(hi.big.prev, 1)} → <b>{fmt(hi.big.v, 1)}</b> {hi.big.type === "reps" || hi.big.type === "bwreps" ? "reps" : `${U}${hi.big.type === "assist" ? " help" : ""}`} · {fmtD(hi.big.date, { month: "short", day: "numeric" })}</p>
                <p className="note">The largest percentage gain among this period's weight or assistance records.</p></div>}
              {hi.muscle && <div className="hl card"><span className="caption">Most-worked muscle group<Hint k="credit" /></span><h3>{M.MUSCLES[hi.muscle[0]]}</h3><p>{fmt(hi.muscle[1], 1)} credited sets (secondary sets count ½)</p></div>}
              {hi.day && hi.day.n > 0 && <div className="hl card"><span className="caption">Most common training time</span><h3>{DOW[hi.day.i]}, {hi.tod.name.toLowerCase()}</h3><p>{hi.day.n} sessions on {DOW[hi.day.i]} · {hi.tod.n} in the {hi.tod.name.toLowerCase()}</p></div>}
              <div className="hl card"><span className="caption">Consistency<Hint k="target" /></span><h3>{M.consistency.weeksHit} of {M.consistency.weeks} weeks on target</h3><p>Target: {M.streak.target}+ qualifying sessions a week ({M.streak.targetChosen ? "your choice" : "inferred — change it in Overview"}) · longest run {M.streak.longest} week{M.streak.longest === 1 ? "" : "s"}</p></div>
              {hi.bw && <div className="hl card"><span className="caption">Body weight, for context</span>
                {hi.bw.now.ok ? <><h3>{hi.bw.now.change >= 0 ? "+" : "−"}{fmt(Math.abs(hi.bw.now.change), 1)} {U}</h3>
                  <p>{fmt(hi.bw.now.start, 1)} → {fmt(hi.bw.now.end, 1)} {U}: average of {hi.bw.now.headN} recorded weigh-ins in the first 14 days vs {hi.bw.now.tailN} in the last 14.
                    {hi.bw.prev ? (hi.bw.prev.ok ? ` Previous period: ${hi.bw.prev.change >= 0 ? "+" : "−"}${fmt(Math.abs(hi.bw.prev.change), 1)} ${U}.` : " Previous period: not enough weigh-ins to compare.") : ""} Scale weight can't tell fat from muscle.</p></>
                  : <><h3>Not enough weigh-ins to compare</h3><p>A change needs at least 2 recorded weigh-ins in both the first and last 14 days of the period; this period has {hi.bw.now.headN} and {hi.bw.now.tailN}.</p></>}</div>}
            </div>

            {M.prs.length > 0 && (
              <div className="card prlist">
                <div className="caption">New records during this period · {M.prs.length}{M.prs.length > 6 ? " (latest 6 shown)" : ""}<Hint k="record" /></div>
                <ul>{[...M.prs].reverse().slice(0, 6).map((p, i) => (
                  <li key={i}><span>{fmtD(p.date, { month: "short", day: "numeric" })}</span><b>{short(p.ex)}</b><em>{PR_WORD[p.type]} · {fmt(p.prev, 1)} → {fmt(p.v, 1)}{p.type === "reps" ? ` reps at ${fmt(p.w, 1)} ${U}` : p.type === "bwreps" ? " reps" : ` ${U}${p.type === "assist" ? " help" : ""}`}</em></li>
                ))}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
