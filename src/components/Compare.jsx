import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { summarize } from "../lib/derive.js";
import { gsap, T, EASE } from "../lib/motion.js";
import { fmt, fmtD, fmtDur, short, equip } from "../lib/format.js";
import ExerciseCompare from "./ExerciseCompare.jsx";
import { closestEarlier } from "../lib/progression.js";
import Hint, { Method } from "./Hint.jsx";

const when = s => `${fmtD(s.start, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${s.title}`;

// "3×12 @ 40, 1×10 @ 45": consecutive identical sets collapse into one group.
function notation(sets, U) {
  const g = [];
  for (const s of sets) {
    const key = `${s.w ?? ""}|${s.reps ?? ""}|${s.dur ?? ""}`, last = g[g.length - 1];
    if (last && last.key === key) last.n++; else g.push({ key, n: 1, s });
  }
  return g.map(({ n, s }) => {
    const body = s.reps > 0 ? `${n}×${s.reps}` : s.dur ? `${n}×${s.dur}s` : `${n} set${n > 1 ? "s" : ""}`;
    return s.w > 0 ? `${body} at ${fmt(s.w, 1)} ${U}${s.assisted ? " help" : ""}` : body;
  }).join(", ");
}
function exRows(session) {
  const by = new Map();
  for (const st of session.sets) if (st.working) { if (!by.has(st.ex)) by.set(st.ex, []); by.get(st.ex).push(st); }
  return new Map([...by].map(([ex, ss]) => [ex, summarize(ss)]));
}
// What "better" means depends on the kind of exercise: more load, less assistance, more reps, longer holds.
// best reps per exact load in one exercise-session
const repsByLoad = (h, pick) => { const m = new Map(); for (const t of h.sets) if (pick(t)) m.set(t.w, Math.max(m.get(t.w) || 0, t.reps)); return m; };
function change(a, b, U) {
  if (!a || !b) return null;
  const k = b.kind;
  // matched performance first: reps at the heaviest load (least assistance) BOTH workouts used
  if ((k === "loaded" || k === "assisted") && a.kind === k) {
    const pick = k === "loaded" ? t => t.loaded : t => t.assisted && t.reps > 0;
    const ra = repsByLoad(a, pick), rb = repsByLoad(b, pick);
    const shared = [...rb.keys()].filter(w => ra.has(w)).sort((x, y) => k === "loaded" ? y - x : x - y);
    if (shared.length) {
      const w = shared[0], d = rb.get(w) - ra.get(w);
      if (d) return { good: d > 0, text: `${d > 0 ? "+" : "−"}${Math.abs(d)} reps at ${fmt(w, 1)} ${U}${k === "assisted" ? " help" : ""}`, matched: true };
    }
  }
  if (k === "loaded" && a.kind === "loaded") {
    const dw = b.top - a.top, dv = b.vol - a.vol;
    // no shared load: report the top sets as they are; only count it as progress when reps didn't drop
    if (dw) return { good: dw > 0 && b.topReps >= a.topReps, text: `top set ${fmt(a.top, 1)}×${a.topReps} → ${fmt(b.top, 1)}×${b.topReps}`, unmatched: true };
    if (b.topReps !== a.topReps) return { good: b.topReps > a.topReps, text: `${b.topReps > a.topReps ? "+" : "−"}${Math.abs(b.topReps - a.topReps)} reps on top set` };
    return { good: dv > 0, text: dv ? `${dv > 0 ? "+" : "−"}${fmt(Math.abs(dv))} ${U} volume` : "same" };
  }
  if (k === "assisted" && a.kind === "assisted") {
    const d = b.top - a.top;
    if (d) return { good: d < 0, text: `${d < 0 ? "−" : "+"}${fmt(Math.abs(d), 1)} ${U} help` };
    return { good: b.reps > a.reps, text: b.reps !== a.reps ? `${b.reps > a.reps ? "+" : "−"}${Math.abs(b.reps - a.reps)} reps` : "same" };
  }
  if (k === "timed") { const d = b.secs - a.secs; return { good: d > 0, text: d ? `${d > 0 ? "+" : "−"}${Math.abs(d)} s` : "same" }; }
  const d = b.reps - a.reps;
  return { good: d > 0, text: d ? `${d > 0 ? "+" : "−"}${Math.abs(d)} reps` : "same" };
}
const amount = (x, U) => !x ? 0 : x.kind === "loaded" ? x.vol : x.kind === "timed" ? x.secs : x.reps;
const amountUnit = (x, U) => !x ? "" : x.kind === "loaded" ? U : x.kind === "timed" ? "s" : "reps";

export default function Compare({ base, res, reduced }) {
  const [mode, setMode] = useState("workouts");
  return (
    <main className="compare">
      <div className="wrap">
        <p className="eyebrow"><i>●</i>Compare</p>
        <h1 className="view-title">{mode === "workouts" ? "Compare workouts" : "Compare exercises"}</h1>
        <p className="purpose">{mode === "workouts"
          ? "Choose two workouts to compare their exercises, sets and recorded performance. We start with your latest qualifying session and an earlier workout with the most similar exercise list."
          : "Compare trends for up to four exercises using the selected metric and date range."}</p>
        <p className="scope-line">Only workouts inside the top-bar date range are listed. Exercises compares trends over time; to explore one exercise in depth, use the Exercises tab.</p>
        <div className="seg" role="tablist" aria-label="Compare">
          <button type="button" role="tab" aria-selected={mode === "workouts"} aria-pressed={mode === "workouts"} onClick={() => setMode("workouts")}>Workouts</button>
          <button type="button" role="tab" aria-selected={mode === "exercises"} aria-pressed={mode === "exercises"} onClick={() => setMode("exercises")}>Exercises</button>
        </div>
        {mode === "workouts" ? <WorkoutCompare base={base} res={res} reduced={reduced} /> : <ExerciseCompare base={base} res={res} reduced={reduced} />}
      </div>
    </main>
  );
}

function WorkoutCompare({ base, res, reduced }) {
  const U = base.unit;
  // only sessions inside the selected date range can be compared
  const from = res.from, to = res.to ? new Date(+res.to + 864e5 - 1) : null;
  const sessions = useMemo(() => base.sessions.filter(s => (!from || s.start >= from) && (!to || s.start <= to)), [base, res]);
  if (!sessions.length) return <p className="lede">No workouts in {res.title}. Pick a wider date range to compare sessions.</p>;
  return <WorkoutPair base={base} sessions={sessions} reduced={reduced} />;
}

function WorkoutPair({ base, sessions, reduced }) {
  const U = base.unit;
  const bySid = useMemo(() => new Map(sessions.map(s => [s.sid, s])), [sessions]);
  const prFlags = useMemo(() => { const m = new Set(); for (const E of base.exs.values()) for (const h of E.hist) if (h.pr) m.add(h.sid + "|" + E.ex); return m; }, [base]);
  const previousSame = sid => { const i = sessions.findIndex(s => s.sid === sid); if (i < 0) return sid; const t = sessions[i].title; for (let j = i - 1; j >= 0; j--) if (sessions[j].title === t && sessions[j].real) return sessions[j].sid; return i > 0 ? sessions[i - 1].sid : sid; };
  const lastReal = [...sessions].reverse().find(s => s.real) || sessions[sessions.length - 1];
  const [pick_, setPick] = useState({ a: null, b: null });
  const [onlyTitle, setOnlyTitle] = useState(false);
  const root = useRef(null);

  // Reconcile selections with the current data and range before rendering: a replaced export or a narrower
  // range can make a stored session ID disappear, so fall back to valid defaults instead of reading undefined.
  const b = pick_.b && bySid.has(pick_.b) ? pick_.b : lastReal?.sid;
  // default A: the closest EARLIER workout by exercise overlap (titles aren't reliable routine names)
  const closest = useMemo(() => b ? closestEarlier(sessions, b) : null, [sessions, b]);
  const a = pick_.a && bySid.has(pick_.a) ? pick_.a : closest?.sid || (b && previousSame(b));
  const setA = v => setPick(p => ({ ...p, a: v, b }));
  const setB = v => setPick(p => ({ ...p, b: v, a }));
  const A = bySid.get(a), B = bySid.get(b);
  const ra = useMemo(() => exRows(A), [A]), rb = useMemo(() => exRows(B), [B]);
  const names = [...rb.keys(), ...[...ra.keys()].filter(k => !rb.has(k))];
  const maxAmt = new Map();
  for (const n of names) maxAmt.set(n, Math.max(amount(ra.get(n)), amount(rb.get(n)), 1));
  const options = [...sessions].reverse().filter(s => !onlyTitle || s.title === B.title);
  const totals = [
    ["Duration", A.validDur ? A.minutes : null, B.validDur ? B.minutes : null, "dur"],
    ["Working sets", A.workSets, B.workSets],
    [`${U} lifted`, Math.round(A.tonnage), Math.round(B.tonnage)],
    ["Reps", A.reps, B.reps],
    ["Exercises", A.exercises, B.exercises],
    [`${U} / minute`, A.density && Math.round(A.density), B.density && Math.round(B.density)],
  ];
  const same = names.filter(n => ra.has(n) && rb.has(n)), better = same.filter(n => change(ra.get(n), rb.get(n), U)?.good).length;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (reduced) return;
      gsap.from(".cmp-tile", { opacity: 0, y: 12, duration: T.base, ease: EASE.out, stagger: T.stagger });
      gsap.from(".cmp-row", { opacity: 0, x: -8, duration: T.base, ease: EASE.out, stagger: T.stagger * 0.6, delay: 0.15 });
      gsap.from(".pair i", { scaleX: 0, transformOrigin: "0% 50%", duration: T.slow, ease: EASE.draw, stagger: T.tight * 3, delay: 0.25 });
    }, root);
    return () => ctx.revert();
  }, [a, b, reduced]);

  const pick = (label, value, set) => (
    <label className="pick">
      <span className="caption">{label}</span>
      <select value={value} onChange={e => set(e.target.value)}>
        {options.some(s => s.sid === value) ? null : <option value={value}>{when(bySid.get(value))}</option>}
        {options.map(s => <option key={s.sid} value={s.sid}>{when(s)}{s.real ? "" : " (short workout)"}</option>)}
      </select>
    </label>
  );

  return (
    <div className="wcmp" ref={root}>

        <div className="pickers card">
          {pick(<><span className="ab-key a" aria-hidden="true" />Workout A — baseline</>, a, setA)}
          <button className="chip swap" type="button" onClick={() => setPick({ a: b, b: a })} aria-label="Swap workouts A and B">⇄</button>
          {pick(<><span className="ab-key b" aria-hidden="true" />Workout B — comparison</>, b, setB)}
          <div className="pick-actions">
            {closest && <button className="chip" type="button" onClick={() => setA(closest.sid)} aria-pressed={a === closest.sid}>Use the closest earlier match ({Math.round(closest.sim * 100)}% exercise overlap)</button>}
            <button className="chip" type="button" onClick={() => setA(previousSame(b))}>Use the previous “{B.title}”</button>
            <button className="chip" type="button" onClick={() => { const i = sessions.findIndex(s => s.sid === b); setA(sessions[Math.max(0, i - 1)].sid); }}>Use the workout before B</button>
            <label className="toggle"><input type="checkbox" checked={onlyTitle} onChange={e => setOnlyTitle(e.target.checked)} /> Only list “{B.title}” workouts</label>
          </div>
        </div>

        <div className="cmp-tiles">
          {totals.map(([label, x, y, kind]) => {
            const d = x != null && y != null ? y - x : null;
            const show = v => v == null ? "–" : kind === "dur" ? fmtDur(v) : fmt(v);
            return (
              <div className="cmp-tile card" key={label}>
                <span className="caption">{label}</span>
                <div className="ab" aria-label={`A ${show(x)}, B ${show(y)}`}><span>{show(x)}</span><b>{show(y)}</b></div>
                <span className={"delta" + (d > 0 ? " up" : "")}>{d == null ? "duration not usable" : d === 0 ? "same" : `${d > 0 ? "+" : "−"}${kind === "dur" ? fmtDur(Math.abs(d)) : fmt(Math.abs(d))} (B − A)`}</span>
              </div>
            );
          })}
        </div>
        {closest && a === closest.sid && <p className="note">Workout A is the earlier workout with the most similar exercise list: {closest.shared} of {closest.of} exercises in common (exact names). Choose any other workout above.</p>}
        {!closest && <p className="note">No earlier workout in this range shares an exercise with B, so A starts as the workout before B.</p>}
        <div className="continuity" aria-label="Exercise continuity between A and B">
          <span><b>{same.length}</b> kept</span>
          <span><b>{names.filter(n => rb.has(n) && !ra.has(n)).length}</b> new in B{names.filter(n => rb.has(n) && !ra.has(n)).length ? `: ${names.filter(n => rb.has(n) && !ra.has(n)).map(short).join(", ")}` : ""}</span>
          <span><b>{names.filter(n => ra.has(n) && !rb.has(n)).length}</b> not in B{names.filter(n => ra.has(n) && !rb.has(n)).length ? `: ${names.filter(n => ra.has(n) && !rb.has(n)).map(short).join(", ")}` : ""}</span>
        </div>
        {same.length > 0 && <p className="big-callout cmp-call"><em>{better} of {same.length}</em> shared exercises improved in B compared with A.</p>}

        <div className="cmp-table card" role="table" aria-label="Exercise by exercise">
          <div className="cmp-row head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">A</span><span role="columnheader">B</span><span role="columnheader">Change</span></div>
          {names.map(n => {
            const x = ra.get(n), y = rb.get(n), c = change(x, y, U), mx = maxAmt.get(n);
            const setsA = A.sets.filter(s => s.working && s.ex === n), setsB = B.sets.filter(s => s.working && s.ex === n);
            return (
              <div className="cmp-row" role="row" key={n}>
                <span role="cell" className="ex"><b>{short(n)}</b><small>{equip(n)}</small>
                  {prFlags.has(b + "|" + n) && <em className="tag">Record in B</em>}</span>
                <span role="cell" className="side">{x ? <>{notation(setsA, U)}<span className="pair"><i className="a" style={{ width: `${amount(x) / mx * 100}%` }} /></span></> : <span className="muted">not done</span>}</span>
                <span role="cell" className="side">{y ? <>{notation(setsB, U)}<span className="pair"><i className="b" style={{ width: `${amount(y) / mx * 100}%` }} /></span></> : <span className="muted">not done</span>}</span>
                <span role="cell" className={"chg" + (c?.good ? " up" : "")}>{c ? c.text : x ? "not in B" : "new in B"}
                  {(x || y) && <small>{fmt(amount(x))} → {fmt(amount(y))} {amountUnit(y || x, U)}</small>}</span>
              </div>
            );
          })}
        </div>
        <p className="how-to-read">“3×12 at 40 {U}” means 3 sets of 12 reps at a logged weight of 40 {U}; “help” marks machine assistance, where lower means you lifted more of yourself. Striped bars are A, solid bars B.</p>
        <Method>
          <p>Each bar is that exercise's work in one workout: weight × reps for loaded sets, reps for bodyweight and assisted exercises, seconds for holds. A longer bar means more logged work, not necessarily a stronger performance.</p>
          <p>“Change” is B minus A. It compares the best reps at the heaviest weight (or least assistance) both workouts used; without a shared weight it shows both top sets as logged. Warm-ups and cardio are left out.</p>
        </Method>
    </div>
  );
}
