/* ================================================================
   CONSISTENCY, WORKLOAD AND MUSCLE DOSE (docs/metrics-opportunities.md A01–A06, V01–V06, V08, V10, V11)
   All counts are LOGGED training in the selected range. "Working set" = non-warm-up, non-cardio set; it does
   not establish effort. Calendar summaries include zero weeks; performance series never invent zeros.
   ================================================================ */
import { credits, MUSCLES, PATTERNS } from "./exerciseRegistry.js";
import { weekStart, dayKey, startOfDay, DAY } from "./derive.js";

const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const sum = a => a.reduce((x, y) => x + y, 0);
const nextDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);   // calendar step, DST-safe

// Monday-start weeks between two dates (inclusive), stepping by calendar days
export function weeksBetween(a, b) {
  const out = [];
  for (let w = weekStart(a); w <= b; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) out.push(w);
  return out;
}

/* A01: calendar-month summary. An incomplete month is compared with the same elapsed days of the month before. */
export function monthly(M, base) {
  const by = new Map();
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  for (let d = new Date(M.rangeStart.getFullYear(), M.rangeStart.getMonth(), 1); d <= M.rangeEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
    by.set(key(d), { key: key(d), date: d, logs: 0, sessions: 0, sets: 0, reps: 0, tonnage: 0 });
  for (const s of M.sessions) { const r = by.get(key(s.start)); if (!r) continue; r.logs++; if (s.real) r.sessions++; r.sets += s.workSets; r.reps += s.reps; r.tonnage += s.tonnage; }
  const rows = [...by.values()];
  const last = rows.at(-1), end = M.rangeEnd;
  if (last && end.getMonth() === last.date.getMonth() && end.getDate() < new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()) {
    last.partial = end.getDate();
    // same elapsed days of the previous month, from the whole history (not limited to the range)
    const pf = new Date(last.date.getFullYear(), last.date.getMonth() - 1, 1), pt = new Date(pf.getFullYear(), pf.getMonth(), Math.min(end.getDate(), new Date(pf.getFullYear(), pf.getMonth() + 1, 0).getDate()) + 1);
    const prev = base.sessions.filter(s => s.start >= pf && s.start < pt);
    last.prevSamePart = { days: end.getDate(), logs: prev.length, sessions: prev.filter(s => s.real).length, sets: sum(prev.map(s => s.workSets)), tonnage: sum(prev.map(s => s.tonnage)) };
  }
  return rows;
}

/* A02: three frequency denominators, each labelled. Partial weeks at the range edges count as weeks. */
export function frequency(M) {
  const weeks = M.weeks.length;
  const blockWeeks = new Set();
  for (const b of M.blocks) for (const w of weeksBetween(b.start, b.end)) blockWeeks.add(+w);
  const activeWeeks = M.weeks.filter(w => w.sessions > 0).length;
  const n = M.totals.sessions;
  return { sessions: n, calendar: { weeks, perWeek: n / Math.max(1, weeks) }, block: { weeks: blockWeeks.size, perWeek: n / Math.max(1, blockWeeks.size) },
    active: { weeks: activeWeeks, perWeek: n / Math.max(1, activeWeeks) } };
}

/* A03: adherence to a chosen weekly target; the week in progress is shown but not judged. */
export function adherence(M, target) {
  const today = startOfDay(new Date()), cur = +weekStart(today);
  const done = M.weeks.filter(w => +w.start !== cur || !M.isCurrent);
  const met = done.filter(w => w.sessions >= target).length;
  const inProgress = M.isCurrent ? M.weeks.find(w => +w.start === cur) : null;
  return { target, met, weeks: done.length, share: done.length ? met / done.length : 0, inProgress: inProgress ? inProgress.sessions : null };
}

/* A04: spacing between consecutive qualifying sessions (days), plus same-day extra logs. Spacing, not recovery. */
export function spacing(M) {
  const real = M.real, gaps = [];
  for (let i = 1; i < real.length; i++) gaps.push({ days: (real[i].start - real[i - 1].start) / DAY, from: real[i - 1].start, to: real[i].start });
  const d = gaps.map(g => g.days);
  const sameDay = M.sessions.length - new Set(M.sessions.map(s => s.day)).size;
  return { n: gaps.length, median: med(d), q1: q(d, 0.25), q3: q(d, 0.75), max: gaps.reduce((a, g) => (g.days > (a?.days ?? -1) ? g : a), null), gaps, sameDayExtraLogs: sameDay,
    hist: [[0, 1, "same day"], [1, 2, "1 day"], [2, 3, "2 days"], [3, 5, "3–4 days"], [5, 8, "5–7 days"], [8, 15, "8–14 days"], [15, 1e9, "15+ days"]]
      .map(([a, b, label]) => ({ label, n: d.filter(x => x >= a && x < b).length })) };
}

/* A06: trailing 7- and 28-day sums of qualifying sessions and working sets, one point per calendar day (zeros included). */
export function rolling(M) {
  const byDay = new Map();
  for (const s of M.sessions) { const k = s.day; const r = byDay.get(k) || { sessions: 0, sets: 0 }; if (s.real) r.sessions++; r.sets += s.workSets; byDay.set(k, r); }
  const days = [];
  for (let d = startOfDay(M.rangeStart); d <= M.rangeEnd; d = nextDay(d)) days.push({ date: d, ...(byDay.get(dayKey(d)) || { sessions: 0, sets: 0 }) });
  const win = (i, n, f) => { let t = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++) t += days[j][f]; return t; };
  return days.map((d, i) => ({ date: d.date, s7: win(i, 7, "sessions"), s28: win(i, 28, "sessions"), set7: win(i, 7, "sets"), set28: win(i, 28, "sets") }));
}

/* V08: sets and reps by load class, so the tonnage card's scope is explicit */
export function loadClasses(M) {
  const out = {};
  for (const s of M.sessions) for (const t of s.sets) { if (t.warmup) continue; const c = out[t.loadClass] || (out[t.loadClass] = { sets: 0, reps: 0 }); c.sets++; c.reps += t.reps || 0; }
  return out;
}

/* V10: external-load volume concentration by exercise */
export function concentration(M) {
  const by = new Map();
  for (const s of M.sessions) for (const t of s.sets) if (t.loaded) by.set(t.ex, (by.get(t.ex) || 0) + t.tonnage);
  const total = sum([...by.values()]), rows = [...by].map(([ex, v]) => ({ ex, v, share: total ? v / total : 0 })).sort((a, b) => b.v - a.v);
  const top = n => sum(rows.slice(0, n).map(r => r.share));
  return { total, rows, top1: top(1), top3: top(3), top5: top(5) };
}

/* V11: workload per session (quantiles), qualifying sessions or all logs */
export function perSession(M, qualifyingOnly = true) {
  const S = qualifyingOnly ? M.real : M.sessions;
  const stat = f => { const v = S.map(f); return { min: Math.min(...v), q1: q(v, .25), median: med(v), q3: q(v, .75), max: Math.max(...v) }; };
  return S.length ? { n: S.length, sets: stat(s => s.workSets), reps: stat(s => s.reps), exercises: stat(s => s.exercises) } : null;
}

/* V01–V05 + A05: muscle dose and frequency.
   direct / secondary sets kept apart (credited = direct + ½ secondary); training days and sessions per week;
   sets per exposure; weekly variability (calendar weeks, zeros included); last completed week vs the median of
   up to 8 preceding weeks in the same block; spacing between direct exposures. */
export function muscleDose(M, base) {
  const weeks = M.weeks.map(w => +w.start), widx = new Map(weeks.map((w, i) => [w, i]));
  const blockOf = d => M.blocks.findIndex(b => d >= startOfDay(b.start) && d <= new Date(+startOfDay(b.end) + DAY));
  const out = {};
  for (const m of Object.keys(MUSCLES)) out[m] = { m, direct: Array(weeks.length).fill(0), secondary: Array(weeks.length).fill(0), days: weeks.map(() => new Set()), sessions: weeks.map(() => new Set()), exposures: [], byEx: new Map() };
  for (const s of M.sessions) {
    const wi = widx.get(+weekStart(s.start)); if (wi == null) continue;
    const perM = new Map();
    for (const t of s.sets) {
      if (!t.working) continue;
      for (const [m, c] of credits(base.cls[t.ex])) {
        const o = out[m]; if (!o) continue;
        if (c === 1) { o.direct[wi]++; o.days[wi].add(s.day); o.sessions[wi].add(s.sid); perM.set(m, (perM.get(m) || 0) + 1); }
        else o.secondary[wi]++;
        const e = o.byEx.get(t.ex) || { ex: t.ex, direct: 0, secondary: 0 }; c === 1 ? e.direct++ : e.secondary++; o.byEx.set(t.ex, e);
      }
    }
    for (const [m, n] of perM) out[m].exposures.push({ date: s.start, day: s.day, sets: n });
  }
  const today = startOfDay(new Date()), curW = +weekStart(today);
  // weekly variability over weeks inside training blocks (zeros within a block count; long breaks don't)
  const inBlock = weeks.map(w => M.blocks.some(b => w >= +weekStart(b.start) && w <= +weekStart(b.end)));
  return Object.values(out).map(o => {
    const credited = o.direct.map((d, i) => d + 0.5 * o.secondary[i]);
    const cb = credited.filter((_, i) => inBlock[i]);
    const directTotal = sum(o.direct), secondaryTotal = sum(o.secondary);
    // distinct days per exposure (two logs on one day = one training day)
    const byDay = new Map(); for (const e of o.exposures) byDay.set(e.day, (byDay.get(e.day) || 0) + e.sets);
    const dayList = [...byDay].map(([day, sets]) => ({ day, sets, date: new Date(day + "T00:00:00") })).sort((a, b) => a.date - b.date);
    const gaps = dayList.slice(1).map((d, i) => Math.round((d.date - dayList[i].date) / DAY));
    // recent change: last COMPLETED week vs median of up to 8 preceding weeks in the same block
    let li = weeks.length - 1; if (M.isCurrent && weeks[li] === curW) li--;
    let recent = null;
    if (li >= 1) {
      const blk = blockOf(new Date(weeks[li]));
      const prev = []; for (let j = li - 1; j >= 0 && prev.length < 8; j--) if (blockOf(new Date(weeks[j])) === blk || blk < 0) prev.push(credited[j]);
      if (prev.length >= 3) recent = { week: new Date(weeks[li]), value: credited[li], baseline: med(prev), n: prev.length, change: credited[li] - med(prev) };
    }
    return {
      m: o.m, label: MUSCLES[o.m], direct: o.direct, secondary: o.secondary, credited, directTotal, secondaryTotal,
      daysPerWeek: o.days.map(s => s.size), sessionsPerWeek: o.sessions.map(s => s.size),
      trainingDays: dayList.length, setsPerExposure: med(dayList.map(d => d.sets)), exposureSets: dayList.map(d => d.sets),
      weekly: { median: med(cb), q1: q(cb, .25), q3: q(cb, .75), sd: cb.length ? Math.sqrt(sum(cb.map(v => (v - sum(cb) / cb.length) ** 2)) / cb.length) : null, weeks: cb.length },
      spacing: { median: med(gaps), consecutiveDays: gaps.filter(g => g === 1).length, n: gaps.length },
      recent, exercises: [...o.byEx.values()].sort((a, b) => b.direct - a.direct || b.secondary - a.secondary),
    };
  });
}

/* V06: movement-pattern coverage by week (working sets), with every pattern listed even when empty */
export function patternCoverage(M, base) {
  const weeks = M.weeks.map(w => +w.start), widx = new Map(weeks.map((w, i) => [w, i]));
  const grid = Object.fromEntries(PATTERNS.map(p => [p, Array(weeks.length).fill(0)]));
  const exs = Object.fromEntries(PATTERNS.map(p => [p, new Set()]));
  for (const s of M.sessions) {
    const wi = widx.get(+weekStart(s.start)); if (wi == null) continue;
    for (const t of s.sets) { if (!t.working) continue; const p = base.cls[t.ex].pattern; if (grid[p]) { grid[p][wi]++; exs[p].add(t.ex); } }
  }
  return { weeks: M.weeks.map(w => w.start), rows: PATTERNS.map(p => ({ pattern: p, weeks: grid[p], total: sum(grid[p]), exercises: [...exs[p]] })) };
}
