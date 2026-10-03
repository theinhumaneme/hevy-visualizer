/* ================================================================
   DATA — parse, clean, derive. Visuals only ever read deriveMetrics() output.
   Runs in the browser and in Node (tests), so no DOM in here.
   ================================================================ */

const RULES = {
  realSessionMinSets: 4,     // 1–3 set logs are fragments (a few push-ups logged on their own); sets count, sessions don't
  minValidMinutes: 15,       // durations outside 15–240 min are flagged (the CSV can't say why); excluded from duration + density only
  maxValidMinutes: 240,
  breakDays: 14,             // a gap this long splits the log into blocks ("comebacks")
  e1rmMaxReps: 10,           // Epley above 10 reps is a guess: shown dimmed
  plateauWeeks: 6, plateauPct: 0.02, plateauMinSessions: 4, progressWindowWeeks: 12,
  recentWeeks: 8,            // window for "sets per muscle per week"
  rhythmWeeks: 26,           // window for the day × time clock
  setBand: [10, 20],         // soft weekly-sets guide per muscle group
  maxPlausible: { lb: 1000, kg: 450 },
};

/* ---------- exercise → muscles, pattern, load semantics: see exerciseRegistry.js (the single source) ---------- */
import { MUSCLES, UPPER, LOWER, PUSH_PATTERNS, PULL_PATTERNS, classify, corrected, credits } from "./exerciseRegistry.js";
import * as BW from "./bodyWeight.js";

/* ---------- dates ---------- */
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{1,2}) (\w{3})\w* (\d{4}),? (\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i)       // 28 Sep 2026, 18:30
       || null, d, mo, y, h, mi, ap;
  if (m) [, d, mo, y, h, mi, ap] = m;
  else if ((m = s.match(/^(\w{3})\w* (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i))) [, mo, d, y, h, mi, ap] = m;  // Oct 1, 2026, 8:28 PM
  else { const t = new Date(s); return isNaN(t) ? null : t; }
  const month = MON[mo.slice(0, 3).toLowerCase()];
  if (month == null) return null;
  h = +h; if (ap) { ap = ap.toUpperCase(); if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; }
  return new Date(+y, month, +d, h, +mi);
}
const DAY = 864e5;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekStart = d => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };  // Monday
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const num = v => { if (v === "" || v == null) return null; const n = +v; return isFinite(n) ? n : null; };
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const sum = (a, f = x => x) => a.reduce((t, x) => t + f(x), 0);
const round = (x, p = 0) => { const k = 10 ** p; return Math.round(x * k) / k; };

/* ---------- headers ----------
   Hevy's column names have shifted between app versions and locales. Normalise before anything reads them. */
const HEADER_ALIASES = {
  workout: "title", workout_name: "title", name: "title",
  start: "start_time", start_date: "start_time", started_at: "start_time",
  end: "end_time", end_date: "end_time", ended_at: "end_time",
  exercise: "exercise_title", exercise_name: "exercise_title",
  set_order: "set_index", set_number: "set_index", set: "set_index",
  weight_lb: "weight_lbs", weight_pounds: "weight_lbs", "weight_(lbs)": "weight_lbs", "weight_(lb)": "weight_lbs",
  "weight_(kg)": "weight_kg", weight_kilograms: "weight_kg",
  distance_mi: "distance_miles", "distance_(miles)": "distance_miles", "distance_(km)": "distance_km",
  duration: "duration_seconds", "duration_(seconds)": "duration_seconds", seconds: "duration_seconds",
  notes: "exercise_notes", workout_notes: "description",
};
function normalizeHeader(h) {
  const k = String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return HEADER_ALIASES[k] || k;
}

/* ---------- parse ---------- */
function parseRows(rows, opts = {}) {
  if (!rows.length) throw new Error("That file is empty.");
  const cols = Object.keys(rows[0]);
  const need = ["title", "start_time", "exercise_title"];
  const miss = need.filter(c => !cols.includes(c));
  if (miss.length) throw new Error("That doesn't look like a Hevy workout export (missing " + miss.join(", ") + ").");
  const unit = cols.includes("weight_kg") ? "kg" : "lb";   // display units are always "lb" or "kg"
  const wcol = unit === "kg" ? "weight_kg" : "weight_lbs";
  const dcol = cols.includes("distance_km") ? "distance_km" : "distance_miles";
  // every dropped or altered row is recorded with its CSV line number and the reason
  const issues = { badDates: 0, implausible: [], noEnd: 0, duplicates: 0, warmups: 0, excluded: [], parseErrors: opts.parseErrors || [] };
  const seen = new Set(), sets = [];
  rows.forEach((r, i) => {
    const line = i + 2;   // header is line 1
    if (!r.start_time || !r.exercise_title) { issues.excluded.push({ line, reason: "Missing start time or exercise", detail: r.exercise_title || r.title || "" }); return; }
    const start = parseDate(r.start_time);
    if (!start) { issues.badDates++; issues.excluded.push({ line, reason: "Unreadable date", detail: r.start_time }); return; }
    const end = parseDate(r.end_time);
    if (!end) issues.noEnd++;
    const key = [r.start_time, r.title, r.exercise_title, r.set_index, r[wcol], r.reps, r.duration_seconds].join("|");
    if (seen.has(key)) { issues.duplicates++; issues.excluded.push({ line, reason: "Duplicate of an earlier row", detail: `${r.exercise_title} · ${r.start_time}` }); return; }
    seen.add(key);
    let w = num(r[wcol]);
    const reps = num(r.reps);
    if (w != null && w > RULES.maxPlausible[unit]) {
      issues.implausible.push(`${r.exercise_title} ${w} ${unit} on ${dayKey(start)}`);
      issues.excluded.push({ line, reason: "Weight ignored (implausible)", detail: `${r.exercise_title} · ${w} ${unit}`, kept: true });
      w = null;
    }
    const type = (r.set_type || "normal").toLowerCase();
    if (type === "warmup") issues.warmups++;
    sets.push({
      sid: r.start_time + "|" + r.title, title: r.title || "Workout", start, end, ex: r.exercise_title.trim(),
      idx: num(r.set_index) || 0, type, w, reps, dist: num(r[dcol]), dur: num(r.duration_seconds), rpe: num(r.rpe),
      desc: r.description || "", note: r.exercise_notes || "", line, order: i,
      superset: r.superset_id === "" || r.superset_id == null ? null : num(r.superset_id),
    });
  });
  if (!sets.length) throw new Error("No sets found in that file.");
  // Q01: populated count per column, as imported
  const columns = Object.fromEntries(cols.map(c => [c, rows.reduce((n, r) => n + (r[c] !== "" && r[c] != null ? 1 : 0), 0)]));
  return { sets, unit, issues, distUnit: dcol === "distance_km" ? "km" : "mi", columns, rowCount: rows.length, wcol, dcol };
}

function parseMeasurements(rows) {
  const cols = rows.length ? Object.keys(rows[0]).filter(c => c !== "date") : [];
  const wcol = cols.includes("weight_kg") ? "weight_kg" : cols.includes("weight_lbs") ? "weight_lbs" : null;
  const others = cols.filter(c => c !== wcol);
  const out = [];
  for (const r of rows) {
    const d = parseDate(r.date); if (!d) continue;
    const v = wcol ? num(r[wcol]) : null;
    const e = { date: d, lbs: v != null && v > 0 ? (wcol === "weight_kg" ? v / 0.45359237 : v) : null, extra: {} };
    for (const c of others) { const x = num(r[c]); if (x != null) e.extra[c] = x; }
    if (e.lbs != null || Object.keys(e.extra).length) out.push(e);
  }
  out.sort((a, b) => a.date - b.date);
  const has = c => out.some(e => e.extra[c] != null);
  out.cols = [...(out.some(e => e.lbs != null) ? ["weight"] : []), ...others.filter(has)];
  out.empty = [...(wcol && !out.some(e => e.lbs != null) ? [wcol] : []), ...others.filter(c => !has(c))];
  return out;
}

// Display unit: weights are converted once, at full precision, before anything is derived (rounding is presentation-only).
const LB = 0.45359237;
function inUnit(parsed, unit) {
  if (!unit || unit === parsed.unit) return { ...parsed, sets: parsed.sets.map(s => ({ ...s })) };
  const k = unit === "kg" ? LB : 1 / LB;
  return { ...parsed, unit, sets: parsed.sets.map(s => ({ ...s, w: s.w == null ? null : s.w * k })) };
}

/* ---------- prepare: everything that depends on the whole history, computed once per file ----------
   Records are judged against all earlier sessions, even when the view is limited to a date range. */
function prepare(parsed, corrections = {}) {
  const { unit, issues } = parsed;
  const exclude = new Set(corrections.exclude || []), overrides = corrections.muscles || {};
  const all = parsed.sets.filter(s => !exclude.has(s.sid));
  const cls = {}, unmapped = new Map();
  for (const s of all) {
    if (!cls[s.ex]) cls[s.ex] = overrides[s.ex] ? corrected(s.ex, overrides[s.ex]) : classify(s.ex);
    const c = cls[s.ex];
    s.cardio = c.cardio;
    s.assisted = c.load === "assisted";
    s.warmup = s.type === "warmup";
    s.working = !s.warmup && !s.cardio;
    s.loaded = s.working && !s.assisted && s.w > 0 && s.reps > 0;
    // a blank weight on an externally loaded (or ambiguous) exercise is UNKNOWN load, not bodyweight
    s.bodyweight = s.working && !s.assisted && !(s.w > 0) && s.reps > 0 && c.load === "bodyweight";
    s.unknownLoad = s.working && !s.assisted && !(s.w > 0) && s.reps > 0 && !s.bodyweight;
    s.timed = s.working && !(s.reps > 0) && s.dur > 0;
    s.loadClass = s.cardio ? "cardio" : s.warmup ? "warmup" : s.assisted ? "assisted" : s.loaded ? "loaded" : s.bodyweight ? "bodyweight"
      : s.unknownLoad ? "unknown" : s.timed ? "hold" : "other";
    s.tonnage = s.loaded ? s.w * s.reps : 0;
    s.e1rm = s.loaded ? (s.reps <= 1 ? s.w : s.w * (1 + s.reps / 30)) : null;
    s.e1rmLowConf = s.loaded && s.reps > RULES.e1rmMaxReps;
    if (s.working && !c.mapped) unmapped.set(s.ex, (unmapped.get(s.ex) || 0) + 1);
  }

  const bySid = new Map();
  for (const s of all) { if (!bySid.has(s.sid)) bySid.set(s.sid, []); bySid.get(s.sid).push(s); }
  const sessions = [...bySid.values()].map(ss => {
    const f = ss[0], w = ss.filter(s => s.working);
    const minutes = f.end ? (f.end - f.start) / 6e4 : null;
    const validDur = minutes != null && minutes >= RULES.minValidMinutes && minutes <= RULES.maxValidMinutes;
    const tonnage = sum(w, s => s.tonnage);
    return {
      sid: f.sid, title: f.title, desc: f.desc || "", start: f.start, end: f.end, day: dayKey(f.start), sets: ss, workSets: w.length,
      tonnage, reps: sum(w, s => s.reps || 0), exercises: new Set(w.map(s => s.ex)).size,
      cardioMin: sum(ss.filter(s => s.cardio), s => (s.dur || 0) / 60), minutes, validDur,
      real: w.length >= RULES.realSessionMinSets, density: validDur && tonnage ? tonnage / minutes : null,
      flags: [...(w.length < RULES.realSessionMinSets ? ["fragment"] : []), ...(minutes != null && !validDur ? ["duration"] : [])],
    };
  }).sort((a, b) => a.start - b.start);

  // per-exercise, per-session summaries + PRs (chronological, whole history)
  const exs = new Map();
  for (const s of sessions) {
    for (const [ex, ss] of groupBy(s.sets.filter(st => st.working), st => st.ex)) {
      if (!exs.has(ex)) exs.set(ex, { ex, muscles: cls[ex].muscles, direct: cls[ex].direct, secondary: cls[ex].secondary, pattern: cls[ex].pattern,
        family: cls[ex].family, equipment: cls[ex].equipment, load: cls[ex].load, assisted: ss[0].assisted, kind: null, hist: [] });
      const E = exs.get(ex), h = summarize(ss);
      h.date = s.start; h.sid = s.sid;
      E.hist.push(h);
    }
  }
  // Typed histories: each session keeps its own kind; the exercise's performance kind is the most common
  // measurable one. Sessions of another kind (e.g. blank-load "unknown" sessions) never join its series.
  const RANK = { loaded: 3, assisted: 2, bodyweight: 1 };
  for (const E of exs.values()) {
    const n = {}; for (const h of E.hist) n[h.kind] = (n[h.kind] || 0) + 1;
    const measurable = Object.keys(n).filter(k => RANK[k]);
    E.kinds = n; E.mixed = Object.keys(n).length > 1;
    E.kind = measurable.length ? measurable.sort((a, b) => n[b] - n[a] || RANK[b] - RANK[a])[0] : (n.timed ? "timed" : "unknown");
  }
  const prs = [];
  for (const E of exs.values()) {
    let bestW = null, bestE = null, bestV = null, seenOfKind = 0;
    const repsAt = new Map();
    E.hist.forEach(h => {
      if (h.kind !== E.kind) return;
      const k = seenOfKind++;   // the first session OF THIS KIND is the baseline
      const found = [];
      if (E.kind === "loaded") {
        if (bestW != null && h.top > bestW) found.push({ type: "weight", v: h.top, prev: bestW, reps: h.topReps });
        // estimated-1RM records only count when the estimate comes from a set of ≤10 reps
        if (bestE != null && !h.e1rmLow && h.e1rm > bestE * 1.0001 && !found.length) found.push({ type: "e1rm", v: h.e1rm, prev: bestE });
        for (const st of h.sets) if (st.loaded) {
          const p = repsAt.get(st.w);
          if (p != null && st.reps > p && !found.some(f => f.type === "reps" && f.w === st.w)) found.push({ type: "reps", v: st.reps, prev: p, w: st.w });
        }
        if (bestV != null && h.vol > bestV * 1.0001 && !found.length) found.push({ type: "volume", v: h.vol, prev: bestV });
        bestW = Math.max(bestW ?? -Infinity, h.top); if (!h.e1rmLow) bestE = Math.max(bestE ?? -Infinity, h.e1rm); bestV = Math.max(bestV ?? -Infinity, h.vol);
        for (const st of h.sets) if (st.loaded) repsAt.set(st.w, Math.max(repsAt.get(st.w) || 0, st.reps));
      } else if (E.kind === "assisted") {
        if (bestW != null && h.top < bestW) found.push({ type: "assist", v: h.top, prev: bestW, reps: h.topReps });
        bestW = Math.min(bestW ?? Infinity, h.top);
      } else if (E.kind === "bodyweight") {
        if (bestW != null && h.top > bestW) found.push({ type: "bwreps", v: h.top, prev: bestW });
        bestW = Math.max(bestW ?? -Infinity, h.top);
      }
      const firstTime = k === 0;   // the first time you do a lift is a baseline, not a record
      if (!firstTime) for (const f of found) {
        const gain = f.type === "assist" ? (f.prev - f.v) / Math.max(f.prev, 1) : (f.v - f.prev) / Math.max(f.prev, 1);
        prs.push({ ex: E.ex, date: h.date, sid: h.sid, ...f, gain });
      }
      h.pr = !firstTime && found.length > 0;
    });
  }
  prs.sort((a, b) => a.date - b.date);

  const real = sessions.filter(s => s.real), work = all.filter(s => s.working);
  const audit = {
    rows: all.length, warmups: issues.warmups, badDates: issues.badDates, noEnd: issues.noEnd, duplicates: issues.duplicates,
    implausible: issues.implausible, fragments: sessions.length - real.length,
    shortDur: sessions.filter(s => s.minutes != null && !s.validDur).length,   // flagged durations, not proof of late logging
    rpe: all.filter(s => s.rpe != null).length, unmapped: [...unmapped].sort((a, b) => b[1] - a[1]),
    assisted: [...new Set(work.filter(s => s.assisted).map(s => s.ex))],
    cardio: [...new Set(all.filter(s => s.cardio).map(s => s.ex))],
    lowConfShare: work.filter(s => s.loaded).length ? work.filter(s => s.e1rmLowConf).length / work.filter(s => s.loaded).length : 0,
    setTypes: [...new Set(all.map(s => s.type))],
    sessions: sessions.length, exercises: exs.size, excludedRows: issues.excluded || [], parseErrors: issues.parseErrors || [],
    columns: parsed.columns || {}, rowCount: parsed.rowCount ?? parsed.sets.length, wcol: parsed.wcol, dcol: parsed.dcol,
    parsedSets: parsed.sets.length, includedSets: all.length,
    excludedSessions: exclude.size, corrected: Object.keys(overrides).length,
    flagged: sessions.filter(s => s.flags.length).map(s => ({ sid: s.sid, title: s.title, start: s.start, workSets: s.workSets, minutes: s.minutes, flags: s.flags })),
    allSessions: parsed.sets.length ? [...new Map(parsed.sets.map(s => [s.sid, s])).values()].map(s => ({ sid: s.sid, title: s.title, start: s.start })) : [],
    exerciseMap: Object.entries(cls).map(([ex, c]) => ({ ex, muscles: c.muscles, direct: c.direct, secondary: c.secondary, pattern: c.pattern,
      load: c.load, equipment: c.equipment, source: c.source, cardio: c.cardio, mapped: c.mapped, corrected: !!c.corrected })),
    mixedKinds: [...exs.values()].filter(E => E.mixed).map(E => ({ ex: E.ex, kinds: E.kinds, kind: E.kind })),
    unknownLoadSets: all.filter(s => s.unknownLoad).length,
    first: sessions[0].start, last: sessions[sessions.length - 1].start,
  };
  return { unit, distUnit: parsed.distUnit, cls, sessions, exs, prs, audit, sets: all };
}

function groupBy(arr, key) { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

// One exercise within one session: its top set (or least assistance / most reps / longest hold).
function summarize(ss) {
  const loaded = ss.filter(x => x.loaded), assisted = ss.filter(x => x.assisted && x.reps > 0);
  const h = { sets: ss };
  if (loaded.length) {
    const top = loaded.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.reps > a.reps) ? b : a));
    // prefer a reliable estimate (≤10 reps); fall back to the best low-confidence one, flagged
    const reliable = loaded.filter(x => !x.e1rmLowConf), pool = reliable.length ? reliable : loaded;
    const be = pool.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    return Object.assign(h, { kind: "loaded", top: top.w, topReps: top.reps, e1rm: be.e1rm, e1rmLow: !reliable.length, e1rmSet: be, vol: sum(loaded, x => x.tonnage), reps: sum(loaded, x => x.reps) });
  }
  if (assisted.length) {
    const best = assisted.reduce((a, b) => (b.w < a.w || (b.w === a.w && b.reps > a.reps) ? b : a));
    return Object.assign(h, { kind: "assisted", top: best.w || 0, topReps: best.reps, vol: 0, reps: sum(assisted, x => x.reps) });
  }
  const bw = ss.filter(x => x.bodyweight);
  if (bw.length) return Object.assign(h, { kind: "bodyweight", top: Math.max(...bw.map(x => x.reps)), vol: 0, reps: sum(bw, x => x.reps) });
  const unk = ss.filter(x => x.unknownLoad);
  if (unk.length) return Object.assign(h, { kind: "unknown", top: Math.max(...unk.map(x => x.reps)), vol: 0, reps: sum(unk, x => x.reps) });
  return Object.assign(h, { kind: "timed", top: Math.max(0, ...ss.map(x => x.dur || 0)), vol: 0, reps: 0, secs: sum(ss, x => x.dur || 0) });
}

/* ---------- derive: every metric for one date range ----------
   opts.from / opts.to are inclusive calendar days (either may be omitted). */
function deriveMetrics(base, opts = {}) {
  if (!base.sessions) base = prepare(base);              // also accepts parseRows() output
  const { unit, cls } = base;
  const today = opts.now || new Date();
  const from = opts.from ? startOfDay(opts.from) : null;
  const to = opts.to ? new Date(+startOfDay(opts.to) + DAY - 1) : null;
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const sessions = base.sessions.filter(s => inR(s.start));
  const range = { from, to, label: opts.label || null };
  if (!sessions.length) return { empty: true, unit, range, audit: base.audit, totals: { unit, sessions: 0, logged: 0, sets: 0, tonnage: 0, reps: 0, prs: 0, days: 0, minutes: 0 } };

  const real = sessions.filter(s => s.real);
  const work = sessions.flatMap(s => s.sets.filter(st => st.working));
  const first = sessions[0].start, last = sessions[sessions.length - 1].start;
  const rangeStart = from || startOfDay(first);
  const rangeEnd = to && to < today ? to : today;          // "now" inside this view
  const now = rangeEnd;
  const isCurrent = rangeEnd >= new Date(+startOfDay(today) - DAY);

  // days (heatmap)
  const days = new Map();
  for (const s of sessions) {
    const d = days.get(s.day) || { day: s.day, date: startOfDay(s.start), sets: 0, tonnage: 0, sessions: 0, titles: [] };
    d.sets += s.workSets; d.tonnage += s.tonnage; if (s.real) d.sessions++; d.titles.push(s.title);
    days.set(s.day, d);
  }

  // blocks / breaks
  const blocks = [];
  let cur = null, prev = null;
  for (const s of sessions) {
    if (!prev || daysBetween(prev.start, s.start) >= RULES.breakDays) { cur = { start: s.start, end: s.start, sessions: 0, sets: 0, gapBefore: prev ? daysBetween(prev.start, s.start) : 0 }; blocks.push(cur); }
    cur.end = s.start; cur.sessions += s.real ? 1 : 0; cur.sets += s.workSets; prev = s;
  }

  // weeks
  const w0 = weekStart(rangeStart), wNow = weekStart(rangeEnd);
  const weeks = [];
  for (let t = new Date(w0); t <= wNow; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7)) weeks.push({ start: new Date(t), key: dayKey(t), sessions: 0, sets: 0, tonnage: 0, muscles: {} });
  const weekIdx = new Map(weeks.map((w, i) => [w.key, i]));
  const wk = d => weeks[weekIdx.get(dayKey(weekStart(d)))];
  for (const s of sessions) { const w = wk(s.start); if (!w) continue; w.sets += s.workSets; w.tonnage += s.tonnage; if (s.real) w.sessions++; }
  for (const s of work) {
    const w = wk(s.start); if (!w) continue;
    for (const [m, c] of credits(cls[s.ex])) w.muscles[m] = (w.muscles[m] || 0) + c;
  }
  const active = weeks.filter(w => w.sessions > 0);
  // weekly target: the athlete's own choice when given, otherwise inferred (median sessions in active weeks)
  const inferredTarget = Math.max(1, Math.floor(median(active.map(w => w.sessions))));
  const target = opts.target || inferredTarget;
  const hit = weeks.map(w => w.sessions >= target);
  let longest = { len: 0, end: -1 }, run = 0;
  hit.forEach((h, i) => { run = h ? run + 1 : 0; if (run > longest.len) longest = { len: run, end: i }; });
  // streak at the end of the view: a week still in progress can't break it yet
  let i = weeks.length - 1; if (!hit[i] && isCurrent) i--;
  let current = 0; while (i >= 0 && hit[i]) { current++; i--; }
  const streak = {
    target, inferredTarget, targetChosen: !!opts.target, longest: longest.len, longestFrom: longest.len ? weeks[longest.end - longest.len + 1].start : null,
    longestTo: longest.len ? weeks[longest.end].start : null, current, isCurrent,
    currentFrom: current ? weeks[i + 1].start : null,
  };
  const consistency = { weeksHit: hit.filter(Boolean).length, weeks: weeks.length, share: hit.filter(Boolean).length / Math.max(1, weeks.length) };

  // exercises: whole-history PR flags, limited to this range
  const exList = [...base.exs.values()].map(E => {
    const hist = E.hist.filter(h => inR(h.date));
    if (!hist.length) return null;
    const h = hist.filter(x => x.kind === E.kind);
    const f = h[0], l = h[h.length - 1];
    const best = !h.length ? 0 : E.kind === "assisted" ? Math.min(...h.map(x => x.top)) : Math.max(...h.map(x => x.top));
    return { ...E, hist, sets: sum(hist, x => x.sets.length), sessions: h.length, firstTop: f ? f.top : 0, lastTop: l ? l.top : 0, best, firstDate: f && f.date, lastDate: l && l.date };
  }).filter(Boolean).sort((a, b) => b.sessions - a.sessions || b.sets - a.sets);
  const lifts = exList.filter(E => (E.kind === "loaded" || E.kind === "assisted") && E.sessions >= 4).slice(0, 6);
  const prs = base.prs.filter(p => inR(p.date));

  // progress: load, reps at a matched load, or a reliable e1RM — any one counts. "Steady" only when none moved.
  const progress = exList.filter(E => E.kind === "loaded").map(E => progressOf(E, now)).filter(Boolean);
  const steady = progress.filter(p => p.status === "steady").sort((a, b) => b.weeks - a.weeks);

  // muscles (recent window of the view), balance
  const recentFrom = new Date(Math.max(+rangeStart, Math.min(+now, +last + 7 * DAY) - RULES.recentWeeks * 7 * DAY));
  let recentWeeks = weeks.filter(w => w.start >= weekStart(recentFrom) && w.start <= weekStart(last));
  if (!recentWeeks.length) recentWeeks = weeks.slice(-1);
  const nRecent = Math.max(1, recentWeeks.length);
  const muscleWeekly = {};
  for (const m of Object.keys(MUSCLES)) muscleWeekly[m] = sum(recentWeeks, w => w.muscles[m] || 0) / nRecent;
  const primSets = { push: 0, pull: 0, upper: 0, lower: 0, core: 0 }, primRecent = { push: 0, pull: 0, upper: 0, lower: 0, core: 0 };
  // push/pull = movement pattern (one registry); upper/lower/core = the set's first direct muscle
  for (const s of work) {
    const c = cls[s.ex], m = c.direct[0];
    const tgt = s.start >= recentWeeks[0].start ? [primSets, primRecent] : [primSets];
    for (const t of tgt) {
      if (PUSH_PATTERNS.has(c.pattern)) t.push++; if (PULL_PATTERNS.has(c.pattern)) t.pull++;
      if (m && UPPER.has(m)) t.upper++; if (m && LOWER.has(m)) t.lower++; if (m === "core") t.core++;
    }
  }
  const muscleTotals = {};
  for (const s of work) for (const [m, c] of credits(cls[s.ex])) muscleTotals[m] = (muscleTotals[m] || 0) + c;

  // rep ranges by month (or by week for short views)
  const RR = [["1–5", 1, 5], ["6–12", 6, 12], ["13–20", 13, 20], ["20+", 21, 1e9]];
  const byWeek = (rangeEnd - rangeStart) / DAY < 120;
  const buckets = new Map();
  for (const s of work) if (s.reps > 0) {
    const d0 = byWeek ? weekStart(s.start) : new Date(s.start.getFullYear(), s.start.getMonth(), 1), k = dayKey(d0);
    if (!buckets.has(k)) buckets.set(k, { key: k, date: d0, counts: [0, 0, 0, 0], total: 0 });
    const B = buckets.get(k), j = RR.findIndex(r => s.reps >= r[1] && s.reps <= r[2]);
    B.counts[j]++; B.total++;
  }
  const repMonths = [...buckets.values()].sort((a, b) => a.date - b.date);
  const repTotals = RR.map((r, j) => sum(repMonths, m => m.counts[j]));
  const repMode = (() => { const c = {}; work.forEach(s => { if (s.reps > 0) c[s.reps] = (c[s.reps] || 0) + 1; }); const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? { reps: +e[0], share: e[1] / sum(Object.values(c)) } : null; })();

  // rhythm (latest 26 weeks of the view): weekday × hour
  const rhythmFrom = new Date(+last - RULES.rhythmWeeks * 7 * DAY);
  const rhythmSessions = real.filter(s => s.start >= rhythmFrom);
  const dow = Array.from({ length: 7 }, () => ({ n: 0, sets: 0, hours: [] }));
  for (const s of rhythmSessions) { const d = (s.start.getDay() + 6) % 7; dow[d].n++; dow[d].sets += s.workSets; dow[d].hours.push(s.start.getHours() + s.start.getMinutes() / 60); }
  const tod = [["Morning", 5, 12], ["Afternoon", 12, 17], ["Evening", 17, 21], ["Night", 21, 29]];
  const todCounts = tod.map(([name, a, b]) => ({ name, n: rhythmSessions.filter(s => { let h = s.start.getHours(); if (h < 5) h += 24; return h >= a && h < b; }).length }));

  // efficiency
  const timedSessions = real.filter(s => s.validDur);
  const density = timedSessions.filter(s => s.tonnage > 0);
  const lin = (() => {
    const pts = density.map(s => [s.minutes, s.tonnage]);
    if (pts.length < 3) return null;
    const mx = sum(pts, p => p[0]) / pts.length, my = sum(pts, p => p[1]) / pts.length;
    const sxx = sum(pts, p => (p[0] - mx) ** 2), sxy = sum(pts, p => (p[0] - mx) * (p[1] - my));
    const syy = sum(pts, p => (p[1] - my) ** 2);
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0 };
  })();

  const totals = {
    tonnage: sum(work, s => s.tonnage), sets: work.length, reps: sum(work, s => s.reps || 0), sessions: real.length, logged: sessions.length,
    days: days.size, exercises: new Set(work.map(s => s.ex)).size, prs: prs.length,
    minutes: sum(timedSessions, s => s.minutes), cardioMin: sum(sessions, s => s.cardioMin),
    first, last, unit, spanDays: daysBetween(first, last) + 1,
  };

  // body weight follows the display unit; joins to workouts use the eligible-match policy in bodyWeight.js
  const kBW = unit === "kg" ? LB : 1;
  const bwObs = BW.observations(opts.measurements || [], kBW);
  const bw = bwObs.map(o => ({ date: o.date, w: o.w, n: o.n }));
  const bwMatch = d => BW.match(bwObs, d);
  const bwOn = bwObs.length ? d => bwMatch(d).value : null;   // null when no eligible weigh-in

  const M = { bw: bw.filter(b => inR(b.date)), bwAll: bw, bwObs, bwOn, bwMatch, RULES, MUSCLES, range, rangeStart, rangeEnd, isCurrent, totals, sessions, real,
    days: [...days.values()], blocks, weeks, streak, consistency, exs: exList, lifts, prs, steady,
    progress, muscleWeekly, muscleTotals, recentWeeks: nRecent,
    // exact dates behind the "recent weeks" windows, so every view can name its period
    recentRange: { from: recentWeeks[0].start, to: new Date(Math.min(+rangeEnd, +recentWeeks.at(-1).start + 7 * DAY - 1)) },
    rhythmRange: { from: new Date(Math.max(+rangeStart, +last - RULES.rhythmWeeks * 7 * DAY)), to: last },
    measureCols: (opts.measurements && opts.measurements.cols) || [], primSets, primRecent, RR, repMonths, repByWeek: byWeek, repTotals, repMode, dow, todCounts,
    rhythmSessions: rhythmSessions.length, timedSessions, density, lin, audit: base.audit, now };
  M.insights = buildInsights(M);
  return M;
}

/* ---------- progress for one loaded lift over a fixed window ending at `now` ---------- */
function progressOf(E, now) {
  const from = new Date(+now - RULES.progressWindowWeeks * 7 * DAY);
  const h = E.hist.filter(x => x.kind === "loaded" && x.date >= from && x.date <= now);
  if (h.length < RULES.plateauMinSessions) return null;
  const weeks = (h[h.length - 1].date - h[0].date) / DAY / 7;
  if (weeks < RULES.plateauWeeks) return null;
  const half = Math.ceil(h.length / 2), early = h.slice(0, half), late = h.slice(half);
  const maxOf = (arr, f) => Math.max(...arr.map(f));
  const loadPct = (maxOf(late, x => x.top) - maxOf(early, x => x.top)) / maxOf(early, x => x.top);
  // reps at a matched load: a weight used in both halves, more reps later
  const repsAt = arr => { const m = new Map(); for (const x of arr) for (const st of x.sets) if (st.loaded) m.set(st.w, Math.max(m.get(st.w) || 0, st.reps)); return m; };
  const ea = repsAt(early), la = repsAt(late);
  let repGain = null;
  for (const [w, r] of la) if (ea.has(w) && r > ea.get(w) && (!repGain || r - ea.get(w) > repGain.to - repGain.from)) repGain = { w, from: ea.get(w), to: r };
  const rel = arr => arr.filter(x => !x.e1rmLow).map(x => x.e1rm);
  const re = rel(early), rl = rel(late);
  const e1rmPct = re.length && rl.length ? (Math.max(...rl) - Math.max(...re)) / Math.max(...re) : null;
  const moved = loadPct >= RULES.plateauPct || !!repGain || (e1rmPct != null && e1rmPct >= RULES.plateauPct);
  return { ex: E.ex, status: moved ? "progressing" : "steady", weeks: Math.round(weeks), sessions: h.length, from: h[0].date, to: h[h.length - 1].date,
    top: maxOf(h, x => x.top), loadPct, repGain, e1rmPct, reliableSessions: re.length + rl.length };
}

/* ---------- insights: claim → number → so what. Ranked by how surprising + useful. ---------- */
function buildInsights(M) {
  const U = M.totals.unit, out = [];
  const fmt = (x, p = 0) => x.toLocaleString("en-US", { maximumFractionDigits: p, minimumFractionDigits: 0 });
  const fmtD = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // assisted lifts: less help over time (and, with weigh-ins, how much of yourself you now lift)
  for (const E of M.lifts.filter(e => e.kind === "assisted")) {
    const h = E.hist.filter(x => x.kind === "assisted");
    const best = h.reduce((a, b) => (b.top <= a.top ? b : a));   // latest session at the lowest assistance
    const drop = h[0].top - best.top, name = E.ex.replace(/\s*\(Assisted\)/, "");
    if (drop <= 0) continue;
    const since = h[0].date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    // only sessions with an eligible weigh-in (same day, ≤7 days, or a ≤14-day bracket) can be compared
    const firstOk = M.bwMatch && /pull|chin/i.test(name) ? h.find(x => M.bwMatch(x.date).eligible) : null;
    const bestOk = firstOk ? [...h].reverse().find(x => x.top === best.top && M.bwMatch(x.date).eligible) : null;
    const a = firstOk && bestOk && bestOk !== firstOk ? M.bwOn(firstOk.date) - firstOk.top : 0, b = a ? M.bwOn(bestOk.date) - bestOk.top : 0;
    if (a > 0 && b > a) { out.push({ score: 9.6, key: "self", head: `You now pull about ${fmt(b)} ${U} of yourself on ${name.toLowerCase()}s.`, num: `${fmt(a)} → ${fmt(b)} ${U}`,
      sub: `body weight minus assistance, ${firstOk.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })} → ${bestOk.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`, why: "Estimated as body weight minus machine assistance, using weigh-ins within 7 days — a proxy, since machine mechanics differ.", viz: { type: "spark", ex: E.ex } }); continue; }
    out.push({ score: 9 + Math.min(drop / h[0].top, 1), key: "assist", head: `${name}s: from ${fmt(h[0].top)} ${U} of help to ${fmt(best.top)}.`,
      num: `−${fmt(drop)} ${U}`, sub: `machine assistance since ${since}`, why: "Less assistance at the logged reps. Read alongside the reps for each session.", viz: { type: "spark", ex: E.ex } });
  }
  // rep progress at same weight
  const repWins = [];
  for (const E of M.exs) if (E.kind === "loaded") {
    const atW = new Map();
    for (const h of E.hist) for (const s of h.sets) if (s.loaded) { const a = atW.get(s.w) || []; a.push({ r: s.reps, d: h.date }); atW.set(s.w, a); }
    for (const [w, a] of atW) if (a.length >= 4) { const g = Math.max(...a.map(x => x.r)) - a[0].r; if (g >= 3) repWins.push({ ex: E.ex, w, g, from: a[0].r, to: Math.max(...a.map(x => x.r)), since: a[0].d }); }
  }
  repWins.sort((a, b) => b.g - a.g);
  if (repWins[0]) { const r = repWins[0]; out.push({ score: 8 + r.g / 5, key: "reps", head: `${r.ex.replace(/\s*\(.*\)/, "")}: +${r.g} reps at the same ${fmt(r.w, 1)} ${U}.`, num: `+${r.g} reps`, sub: `${r.from} → ${r.to} since ${fmtD(r.since)}`, why: "More reps at the same logged load — progress without adding weight.", viz: { type: "reps", from: r.from, to: r.to } }); }

  // best day
  const d = M.dow.map((x, i) => ({ i, n: x.n, sets: x.sets })).filter(x => x.n);
  if (d.length >= 2) {
    const avg = sum(d, x => x.sets / x.n) / d.length, best = d.reduce((a, b) => (b.sets / b.n > a.sets / a.n ? b : a));
    const pct = (best.sets / best.n / avg - 1);
    if (pct > 0.08) out.push({ score: 6 + pct * 4, key: "day", head: `${DOW[best.i]}s are your biggest sessions.`, num: `+${fmt(pct * 100)}%`, sub: `sets vs. your average session day`, why: "Average working sets per session on that weekday, recent 26 weeks.", viz: { type: "dow", i: best.i } });
  }
  // streak
  if (M.streak.current >= 3) out.push({ score: 8.5 + M.streak.current / 10, key: "streak", head: M.isCurrent ? `You haven't missed a target week since ${fmtD(M.streak.currentFrom)}.` : `You finished this period on a ${M.streak.current}-week streak.`, num: `${M.streak.current} weeks`, sub: `at ${M.streak.target}+ sessions/week`, why: "Consecutive weeks at or above your weekly target.", viz: { type: "streak" } });
  else if (M.streak.longest >= 3) out.push({ score: 7, key: "streak", head: `Your longest run: ${M.streak.longest} straight weeks at ${M.streak.target}+ sessions.`, num: `${M.streak.longest} weeks`, sub: `${fmtD(M.streak.longestFrom)} – ${fmtD(new Date(+M.streak.longestTo + 6 * DAY))}`, why: "Your longest run of weeks at or above the weekly target.", viz: { type: "streak" } });
  // comebacks
  const comebacks = M.blocks.length - 1;
  if (comebacks >= 1) out.push({ score: 7.5, key: "comeback", head: `Your log has ${comebacks} gap${comebacks === 1 ? "" : "s"} of ${M.RULES.breakDays} days or more.`, num: `${comebacks}×`, sub: `sessions resumed after each gap`, why: "Gaps in this export only — training logged elsewhere isn't visible here.", viz: { type: "blocks" } });
  // balance: rear vs front delts, push:pull
  const mw = M.muscleWeekly;
  if (mw.frontDelt > 0.5 && mw.rearDelt / mw.frontDelt < 0.5) out.push({ score: 7, key: "delts", head: `Rear delts get ${fmt(mw.rearDelt / mw.frontDelt * 100)}% of the sets your front delts do.`, num: `${fmt(mw.rearDelt, 1)} vs ${fmt(mw.frontDelt, 1)}`, sub: "sets/week, last " + M.recentWeeks + " weeks", why: "Logged working sets with direct credit, last few weeks.", viz: { type: "ratio" } });
  const pp = M.primRecent;
  if (pp.push + pp.pull > 20) {
    const r = pp.pull / Math.max(pp.push, 1);
    out.push({ score: Math.abs(Math.log(r)) > 0.25 ? 6.8 : 5, key: "pushpull", head: r >= 1 ? `You log ${fmt(r, 2)}× as many pulling sets as pushing.` : `You log ${fmt(1 / r, 2)}× as many pushing sets as pulling.`, num: `${fmt(pp.pull)} : ${fmt(pp.push)}`, sub: `pull : push sets, last ${M.recentWeeks} weeks`, why: "By movement pattern: rows, pulldowns and pull-ups vs presses, dips and flies.", viz: { type: "ratio2" } });
  }
  // under-served muscle
  const low = Object.entries(mw).filter(([m]) => m !== "forearms" && m !== "traps").sort((a, b) => a[1] - b[1])[0];
  if (low && low[1] < 4) out.push({ score: 6.2, key: "low", head: `${M.MUSCLES[low[0]]} have the fewest logged weekly sets right now.`, num: `${fmt(low[1], 1)} sets/wk`, sub: `last ${M.recentWeeks} weeks`, why: "Logged working sets per week; secondary credit counts ½.", viz: { type: "muscle", m: low[0] } });
  // rep habit
  if (M.repMode && M.repMode.share > 0.45) out.push({ score: 6.5, key: "habit", head: `${fmt(M.repMode.share * 100)}% of your sets are exactly ${M.repMode.reps} reps.`, num: `${M.repMode.reps} reps`, sub: "your default", why: "Share of working sets logged at exactly this rep count.", viz: { type: "repmode" } });
  // density
  if (M.lin && M.density.length >= 8) {
    const half = Math.floor(M.density.length / 2);
    const a = median(M.density.slice(0, half).map(s => s.density)), b = median(M.density.slice(half).map(s => s.density));
    if (b > a * 1.1) out.push({ score: 6.4, key: "density", head: `Logged training volume per minute increased.`, num: `+${fmt((b / a - 1) * 100)}%`, sub: `${U}/min, recent half vs. earlier`, why: "External-load volume per logged minute, sessions with a valid duration only.", viz: { type: "density" } });
  }
  // steady lifts
  if (M.steady.length) { const s = M.steady[0]; out.push({ score: 5.5, key: "steady", head: `${s.ex.replace(/\s*\(.*\)/, "")} has held steady for ${s.weeks} weeks.`, num: `${s.weeks} wks`, sub: `${s.sessions} sessions: no rise in weight, reps at the same weight, or reliable estimated one-rep max`, why: "No change in top weight, reps at the same weight, or a reliable estimated one-rep max across the window.", viz: { type: "spark", ex: s.ex } }); }

  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

export { inUnit, normalizeHeader, progressOf, RULES, MUSCLES, PUSH_PATTERNS, PULL_PATTERNS, UPPER, LOWER, credits, parseDate, parseRows, parseMeasurements, prepare, summarize, deriveMetrics, classify, dayKey, weekStart, startOfDay, daysBetween, DAY, median, sum, round };
