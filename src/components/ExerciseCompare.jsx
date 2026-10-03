import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { weekStart, dayKey, DAY } from "../lib/derive.js";
import { gsap, d3, T, EASE, C } from "../lib/motion.js";
import { fmt, fmtD, fmtMs, short, equip, el, spaced } from "../lib/format.js";
import { bindTip } from "../lib/tip.js";
import { Method } from "./Hint.jsx";

const COLORS = [C["series-1"], C["series-2"], C["series-3"], C["series-4"]];
// each lift also gets its own line pattern, so the overlay reads without relying on color
const DASHES = ["", "7 4", "2 3", "9 3 2 3"];
const MAX = 4;
// What each metric reads from one session of one exercise. `better` says which direction is progress.
const METRICS = {
  top: { label: "Top set", unit: U => U, get: h => h.kind === "loaded" || h.kind === "assisted" ? h.top : h.kind === "bodyweight" ? h.top : null, unitFor: (k, U) => k === "bodyweight" ? "reps" : k === "assisted" ? `${U} help` : U },
  e1rm: { label: "Estimated one-rep max", get: h => h.kind === "loaded" ? h.e1rm : null, unitFor: (k, U) => U },
  volume: { label: "Session volume (weight × reps; reps for bodyweight)", get: h => h.kind === "loaded" ? h.vol : h.reps || null, unitFor: (k, U) => k === "loaded" ? U : "reps" },
  reps: { label: "Reps per session", get: h => h.reps || null, unitFor: () => "reps" },
  weekly: { label: "Sets per week", weekly: true, get: h => h.sets.length, unitFor: () => "sets" },
};
const lowerIsBetter = (metric, kind) => kind === "assisted" && metric === "top";

function seriesFor(E, metric, inR) {
  const M = METRICS[metric];
  const hist = E.hist.filter(h => inR(h.date));
  if (M.weekly) {
    const by = new Map();
    for (const h of hist) { const k = dayKey(weekStart(h.date)); by.set(k, (by.get(k) || { date: weekStart(h.date), v: 0 })); by.get(k).v += h.sets.length; }
    return [...by.values()].sort((a, b) => a.date - b.date);
  }
  // carry estimate confidence: an e1RM from a set of 11+ reps is drawn hollow and labelled
  return hist.map(h => ({ date: h.date, v: M.get(h), low: metric === "e1rm" && !!h.e1rmLow, reps: metric === "e1rm" && h.e1rmSet ? h.e1rmSet.reps : null }))
    .filter(p => p.v != null && isFinite(p.v));
}
// least-squares slope in value per 30 days
function slopePerMonth(pts) {
  if (pts.length < 3) return null;
  const xs = pts.map(p => +p.date / DAY), ys = pts.map(p => p.v), mx = d3.mean(xs), my = d3.mean(ys);
  const sxx = d3.sum(xs, x => (x - mx) ** 2);
  return sxx ? d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my)) / sxx * 30 : null;
}

export default function ExerciseCompare({ base, res, reduced }) {
  const U = base.unit;
  const from = res.from, to = res.to ? new Date(+res.to + DAY - 1) : null;
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const all = useMemo(() => [...base.exs.values()].map(E => ({ E, n: E.hist.filter(h => inR(h.date)).length }))
    .filter(x => x.n > 0 && x.E.kind !== "timed").sort((a, b) => b.n - a.n), [base, res]);
  const [picked, setPicked] = useState(() => all.filter(x => x.n >= 3 && x.E.kind !== "bodyweight").slice(0, 3).map(x => x.E.ex));
  const [metric, setMetric] = useState("top");
  const [norm, setNorm] = useState(true);
  const host = useRef(null);
  const chosen = picked.filter(ex => all.some(x => x.E.ex === ex));

  const series = chosen.map((ex, i) => {
    const E = base.exs.get(ex), pts = seriesFor(E, metric, inR);
    const lower = lowerIsBetter(metric, E.kind), first = pts[0]?.v;
    // normalised: % change since the first session in view, signed so that "up" is always progress
    const pct = v => first ? (lower ? (first - v) / first : (v - first) / first) * 100 : 0;
    const out = pts.map(p => ({ ...p, y: norm ? pct(p.v) : p.v }));
    const last = pts.at(-1)?.v, best = pts.length ? (lower ? d3.min(pts, p => p.v) : d3.max(pts, p => p.v)) : null;
    const slope = slopePerMonth(pts);
    return { ex, E, color: COLORS[i], dash: DASHES[i], pts: out, lowShare: pts.length ? pts.filter(p => p.low).length / pts.length : 0, first, last, best, lower, change: first ? pct(last) : null,
      slopePct: slope != null && first ? (lower ? -slope : slope) / first * 100 : null, unit: METRICS[metric].unitFor(E.kind, U),
      lastDate: pts.at(-1)?.date };
  });
  const usable = series.filter(s => s.pts.length);
  const mixedUnits = !norm && new Set(usable.map(s => s.unit)).size > 1;

  useLayoutEffect(() => {
    const box = host.current; if (!box) return;
    box.innerHTML = "";
    if (!usable.length) return;
    const W = box.clientWidth, Hh = Math.min(380, Math.max(260, W * 0.42)), m = { t: 16, r: innerWidth < 600 ? 16 : 120, b: 28, l: 52 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img",
      "aria-label": `${METRICS[metric].label} over time for ${usable.map(s => short(s.ex)).join(", ")}${norm ? ", as % change since the first session" : ""}.` }, box);
    const x = d3.scaleTime().domain(d3.extent(usable.flatMap(s => s.pts.map(p => p.date)))).range([m.l, W - m.r]);
    const ys = usable.flatMap(s => s.pts.map(p => p.y));
    let lo = d3.min(ys), hi = d3.max(ys);
    if (norm) { lo = Math.min(0, lo); hi = Math.max(0, hi); } else if (metric === "weekly" || metric === "volume" || metric === "reps") lo = 0;
    const y = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice().range([Hh - m.b, m.t]);
    y.ticks(5).forEach(t => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: norm && t === 0 ? C["grid-strong"] : C.line }, svg);
      el("text", { x: m.l - 8, y: y(t) + 3, "text-anchor": "end" }, svg).textContent = norm ? `${t > 0 ? "+" : ""}${fmt(t)}%` : fmt(t);
    });
    spaced(x.ticks(6), x).forEach(d => { el("text", { x: x(d), y: Hh - 8, "text-anchor": "middle" }, svg).textContent = fmtMs(d); });
    const line = d3.line().x(p => x(p.date)).y(p => y(p.y)).curve(d3.curveMonotoneX);
    const paths = [], dots = [], labels = [];
    usable.forEach(s => {
      const p = el("path", { d: line(s.pts), fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-dasharray": s.dash, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      paths.push(p);
      s.pts.forEach(pt => {
        const c = el("circle", { cx: x(pt.date), cy: y(pt.y), r: 3, fill: pt.low ? C["bg-1"] : s.color, stroke: s.color, "stroke-width": pt.low ? 1.5 : 0 }, svg);
        bindTip(c, `<b>${short(s.ex)} · ${fmtD(pt.date)}</b><span>${fmt(pt.v, 1)} ${s.unit}${norm ? ` · ${pt.y >= 0 ? "+" : ""}${fmt(pt.y)}%` : ""}${pt.low ? `<br>Estimated from a ${pt.reps}-rep set — low confidence` : ""}</span>`);
        dots.push(c);
      });
      const lp = s.pts.at(-1);
      if (m.r > 40) { const t = el("text", { class: "lbl", x: x(lp.date) + 8, y: y(lp.y), "dominant-baseline": "middle", style: `fill:${s.color}` }, svg); t.textContent = short(s.ex).slice(0, 16); labels.push(t); }
    });
    // keep end labels apart
    labels.sort((a, b) => +a.getAttribute("y") - +b.getAttribute("y")).forEach((t, i, arr) => {
      if (i && +t.getAttribute("y") - +arr[i - 1].getAttribute("y") < 14) t.setAttribute("y", +arr[i - 1].getAttribute("y") + 14);
    });
    if (reduced) return;
    const tl = gsap.timeline();
    // draw on, then hand back each lift's own dash pattern
    paths.forEach((p, i) => { const L = p.getTotalLength(); p.style.strokeDasharray = `${L} ${L}`;
      tl.fromTo(p, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: T.hero, ease: EASE.draw, onComplete: () => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; } }, i * T.loose); });
    tl.from(dots, { opacity: 0, duration: T.fast, stagger: T.tight }, 0.2).from(labels, { opacity: 0, x: -6, duration: T.base, ease: EASE.out, stagger: T.stagger }, ">-0.3");
    return () => tl.kill();
  }, [JSON.stringify(chosen), metric, norm, res, reduced, U]);

  const add = ex => { if (ex && !picked.includes(ex)) setPicked([...chosen, ex].slice(-MAX)); };
  const leader = usable.filter(s => s.slopePct != null).sort((a, b) => b.slopePct - a.slopePct)[0];

  return (
    <div className="xcmp">
      <div className="card pickers xpick">
        <div className="chips">
          {chosen.map((ex, i) => (
            <span key={ex} className="xchip" style={{ "--c": COLORS[i] }}>
              <i className={i ? "dash" + i : ""} />{short(ex)}<small>{equip(ex)}</small>
              <button type="button" aria-label={`Remove ${ex}`} onClick={() => setPicked(chosen.filter(x => x !== ex))}>×</button>
            </span>
          ))}
          {chosen.length < MAX && (
            <select value="" aria-label="Add an exercise" onChange={e => add(e.target.value)}>
              <option value="">+ Add exercise ({chosen.length}/{MAX})</option>
              {all.filter(x => !chosen.includes(x.E.ex)).map(x => <option key={x.E.ex} value={x.E.ex}>{x.E.ex} · {x.n} sessions</option>)}
            </select>
          )}
        </div>
        <div className="pick-actions">
          <div className="seg wrap" role="group" aria-label="Metric">
            {Object.entries(METRICS).map(([k, v]) => <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}>{v.label}</button>)}
          </div>
          <label className="toggle"><input type="checkbox" checked={norm} onChange={e => setNorm(e.target.checked)} /> Compare percentage changes from each exercise's starting value</label>
        </div>
      </div>

      {!chosen.length ? <p className="lede">Add two or more exercises to compare their trends.</p> : !usable.length ? (
        <p className="lede">None of these exercises have “{METRICS[metric].label}” data in this range. Try another metric or range.</p>
      ) : (
        <>
          {leader && usable.length > 1 && (leader.slopePct >= 0
            ? <p className="big-callout cmp-call">Largest upward trend in {METRICS[metric].label.split(" (")[0].toLowerCase()}: <em style={{ color: leader.color }}>{short(leader.ex)}</em>, +{fmt(leader.slopePct, 1)}% per 30 days.</p>
            : <p className="big-callout cmp-call">Every selected exercise trends down here; the smallest decline is <em style={{ color: leader.color }}>{short(leader.ex)}</em>, {fmt(leader.slopePct, 1)}% per 30 days.</p>)}
          <div className="card xchart">
            {metric === "e1rm" && usable.some(s => s.lowShare > 0) && <p className="note conf">Hollow points are estimates from sets of 11+ reps, where the formula is unreliable. {usable.map(s => `${short(s.ex)}: ${fmt(s.lowShare * 100)}% low-confidence`).join(" · ")}. Top set is the more trustworthy view for this log.</p>}
            <p className="caption">{METRICS[metric].label}{norm ? " · % change from each exercise's first session in this range (higher = progress; less assistance counts as higher)" : mixedUnits ? " · mixed units — switch on % change to compare" : ` · ${usable[0].unit}`}</p>
            <div ref={host} />
          </div>
          <div className="card cmp-table" role="table" aria-label="Exercise trends">
            <div className="cmp-row xrow head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">{METRICS[metric].weekly ? "Weeks" : "Sessions"}</span><span role="columnheader">First → latest</span><span role="columnheader">Best</span><span role="columnheader">Change</span><span role="columnheader">Trend / month</span></div>
            {series.map(s => (
              <div className="cmp-row xrow" role="row" key={s.ex}>
                <span role="cell" className="ex"><b style={{ color: s.color }}>{short(s.ex)}</b><small>{s.E.kind === "assisted" ? "assisted · lower is stronger" : equip(s.ex) || s.E.kind}</small></span>
                <span role="cell">{s.pts.length}{s.lastDate ? <small className="muted"> · last {fmtD(s.lastDate, { month: "short", day: "numeric" })}</small> : null}</span>
                <span role="cell">{s.pts.length ? `${fmt(s.first, 1)} → ${fmt(s.last, 1)} ${s.unit}` : "—"}</span>
                <span role="cell">{s.best != null ? `${fmt(s.best, 1)} ${s.unit}` : "—"}</span>
                <span role="cell" className={"chg" + (s.change > 0 ? " up" : "")}>{s.change == null ? "—" : `${s.change >= 0 ? "+" : ""}${fmt(s.change)}%`}</span>
                <span role="cell" className={"chg" + (s.slopePct > 0 ? " up" : "")}>{s.slopePct == null ? `needs ${METRICS[metric].weekly ? "3+ weeks" : "3+ sessions"} with data` : `${s.slopePct >= 0 ? "+" : ""}${fmt(s.slopePct, 1)}%`}</span>
              </div>
            ))}
          </div>
          <p className="how-to-read">Each line is one exercise, with its own color and dash pattern; dots are sessions{metric === "weekly" ? " (weeks for sets per week)" : ""}. Hover, tap or focus a dot for its numbers.</p>
          <Method>
            <p>Change compares the latest value with the first value in this range, as a percentage of the first. It's signed so that higher means progress: more weight, reps or volume, or less machine assistance.</p>
            <p>Trend per 30 days is a straight-line fit through every {metric === "weekly" ? "week" : "session"} in the range, expressed as a percentage of the first value.</p>
          </Method>
        </>
      )}
    </div>
  );
}
