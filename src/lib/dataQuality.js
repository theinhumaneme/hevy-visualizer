/* ================================================================
   DATA QUALITY, COVERAGE AND RECONCILIATION (docs/metrics-opportunities.md Q01–Q04, Q06, Q07, J01)
   Every number here describes the import, so every other chart can say what it rests on.
   ================================================================ */
import { DAY, startOfDay } from "./derive.js";
import { match } from "./bodyWeight.js";

/* Q01: field completeness with eligibility-aware denominators. A blank load on a machine is missing;
   a blank load on a push-up is expected. */
export function completeness(base) {
  const a = base.audit, rows = a.rowCount, sets = base.sets, cls = base.cls;
  const col = c => a.columns?.[c] ?? 0;
  const loadEligible = sets.filter(s => !s.cardio && (cls[s.ex].load === "external" || cls[s.ex].load === "assisted" || cls[s.ex].load === "unknown"));
  const repEligible = sets.filter(s => !s.cardio && cls[s.ex].load !== "hold");
  const timeEligible = sets.filter(s => s.cardio || cls[s.ex].load === "hold");
  const f = (label, n, d, enables, note) => ({ label, n, d, share: d ? n / d : null, enables, note });
  return [
    f("Load", loadEligible.filter(s => s.w > 0).length, loadEligible.length, "Volume, load progression, records", `${sets.filter(s => s.unknownLoad).length} sets on loaded or ambiguous exercises have no weight (load unknown)`),
    f("Reps", repEligible.filter(s => s.reps > 0).length, repEligible.length, "Rep totals, rep records, rep ranges"),
    f("Duration (seconds)", timeEligible.filter(s => s.dur > 0).length, timeEligible.length, "Holds and cardio time", "only expected on cardio and timed holds"),
    f("Distance", sets.filter(s => s.dist > 0).length, sets.filter(s => s.cardio).length, "Pace and speed for cardio"),
    f("RPE", col("rpe"), rows, "Effort and hard-set counts", col("rpe") < 20 ? "too sparse to use" : null),
    f("Set type (warm-up/failure marked)", sets.filter(s => s.type !== "normal").length, rows, "Separating warm-ups", sets.every(s => s.type === "normal") ? "every set is 'normal' — warm-ups can't be told apart" : null),
    f("Superset ID", sets.filter(s => s.superset != null).length, rows, "Superset tags (0 is a valid ID)"),
    f("Exercise notes", col("exercise_notes"), rows, "Context in history"),
    f("Workout description", col("description"), rows, "Context in history"),
    f("End time", sets.filter(s => s.end).length, rows, "Session length and density"),
  ];
}

/* Q02: how raw rows become working sets, and logs become qualifying sessions — one explanation for every view */
export function reconciliation(base) {
  const a = base.audit, sets = base.sets;
  const dropped = a.excludedRows.filter(r => !r.kept).length;
  return {
    rows: [
      ["Rows in the file", a.rowCount],
      ["Dropped (duplicates, unreadable dates, missing fields)", -dropped],
      ["Excluded by you (whole sessions)", -(a.parsedSets - a.includedSets)],
      ["Sets included", a.includedSets],
      ["Cardio", -sets.filter(s => s.cardio).length],
      ["Marked warm-up", -sets.filter(s => s.warmup).length],
      ["Working sets", sets.filter(s => s.working).length],
    ],
    sessions: [
      ["Logged workouts", base.sessions.length],
      ["Short workouts (under 4 working sets — still counted in totals)", -base.sessions.filter(s => !s.real).length],
      ["Qualifying sessions", base.sessions.filter(s => s.real).length],
    ],
  };
}

/* Q03: duration quality, reason by reason; minutes logged vs minutes used in time-based analytics */
export function durationQuality(base, R) {
  const c = { missing: 0, negative: 0, zero: 0, under: 0, eligible: 0, over: 0 };
  let total = 0, used = 0;
  for (const s of base.sessions) {
    if (s.minutes == null) { c.missing++; continue; }
    if (s.minutes < 0) c.negative++;
    else if (s.minutes === 0) c.zero++;
    else if (s.minutes < R.minValidMinutes) c.under++;
    else if (s.minutes > R.maxValidMinutes) c.over++;
    else c.eligible++;
    if (s.minutes > 0) total += s.minutes;
    if (s.validDur) used += s.minutes;
  }
  return { counts: c, totalMinutes: total, usedMinutes: used, rule: `${R.minValidMinutes}–${R.maxValidMinutes} min` };
}

/* Q04: exercises whose history mixes measurement kinds, and blank loads where a load was expected */
export function loadStatus(base) {
  return [...base.exs.values()].filter(E => E.mixed || E.kind === "unknown").map(E => ({
    ex: E.ex, kind: E.kind, kinds: E.kinds, load: E.load,
    note: E.kind === "unknown" ? "No load logged in any session: reps only, load unknown" : `Series use ${E.kind} sessions only`,
  }));
}

/* Q06: e1RM eligibility per exercise (loaded sets of ≤10 reps) */
export function e1rmCoverage(M) {
  return M.exs.filter(E => E.kind === "loaded").map(E => {
    const sets = E.hist.flatMap(h => h.sets.filter(s => s.loaded));
    const eligible = sets.filter(s => !s.e1rmLowConf).length;
    const sessionsNone = E.hist.filter(h => h.kind === "loaded" && h.e1rmLow).length;
    return { ex: E.ex, sets: sets.length, eligible, share: sets.length ? eligible / sets.length : 0, sessions: E.hist.filter(h => h.kind === "loaded").length, sessionsNone };
  }).sort((a, b) => b.sets - a.sets);
}

/* Q07: freshness and observed span vs the selected range */
export function freshness(base, M, bwObs, today = new Date()) {
  const lastW = base.audit.last, lastB = bwObs.at(-1)?.date || null;
  const d = x => Math.round((startOfDay(today) - startOfDay(x)) / DAY);
  return { firstWorkout: base.audit.first, lastWorkout: lastW, daysSinceWorkout: d(lastW), lastWeighIn: lastB, daysSinceWeighIn: lastB ? d(lastB) : null,
    rangeStart: M.rangeStart, rangeEnd: M.rangeEnd,
    unobservedStart: M.empty ? null : Math.max(0, Math.round((startOfDay(M.totals.first) - startOfDay(M.rangeStart)) / DAY)),
    unobservedEnd: M.empty ? null : Math.max(0, Math.round((startOfDay(M.rangeEnd) - startOfDay(M.totals.last)) / DAY)) };
}

/* J01: how each session in range can be joined to body weight */
export function weightMatchCoverage(M, bwObs) {
  const c = { "same-day": 0, nearest: 0, interpolated: 0, none: 0 }, rows = [];
  for (const s of M.sessions || []) { const m = match(bwObs, s.start); c[m.method || "none"]++; rows.push({ sid: s.sid, date: s.start, title: s.title, ...m }); }
  const within7 = rows.filter(r => r.eligible && r.distanceDays <= 7).length;
  return { counts: c, total: rows.length, within7, rows };
}
