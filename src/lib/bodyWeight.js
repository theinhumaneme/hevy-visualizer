/* ================================================================
   BODY WEIGHT — observations, coverage, smoothing, slopes and eligible joins to workouts.
   Policy (docs/metrics-opportunities.md §4; thresholds are product choices, exposed in BW_RULES):
     1. same-day weigh-ins win (several on one day are averaged, originals kept)
     2. otherwise the nearest weigh-in within 7 days
     3. otherwise interpolation only between bracketing weigh-ins ≤14 days apart
     4. otherwise no value — with a reason. Never bridge a long gap or carry an endpoint forward.
   Values are in the unit passed in (`k` converts from canonical lbs at presentation time).
   ================================================================ */
const DAY = 864e5;
export const BW_RULES = { nearestDays: 7, bracketDays: 14, smoothMinDays: 3, slopeMinDates: 3, slopeMinSpanDays: 14, gapDays: 14 };
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const daysApart = (a, b) => Math.round((sod(b) - sod(a)) / DAY);

// One observation per calendar day (mean of that day's weigh-ins), in display units.
export function observations(entries, k = 1) {
  const by = new Map();
  for (const e of entries || []) {
    if (!(e.lbs > 0)) continue;
    const d = sod(e.date), id = key(d);
    if (!by.has(id)) by.set(id, { date: d, values: [] });
    by.get(id).values.push(e.lbs * k);
  }
  return [...by.values()].map(o => ({ date: o.date, w: o.values.reduce((a, b) => a + b, 0) / o.values.length, n: o.values.length, raw: o.values }))
    .sort((a, b) => a.date - b.date);
}

/* match(obs, date) → { value, method: "same-day"|"nearest"|"interpolated"|null, sourceDates, distanceDays, eligible, reason } */
export function match(obs, date, rules = BW_RULES) {
  if (!obs.length) return { value: null, method: null, sourceDates: [], distanceDays: null, eligible: false, reason: "No weigh-ins imported" };
  const d = sod(date);
  let lo = -1, hi = obs.length;   // last obs ≤ d, first obs ≥ d
  for (let i = 0; i < obs.length; i++) { if (obs[i].date <= d) lo = i; if (obs[i].date >= d) { hi = i; break; } }
  if (lo >= 0 && +obs[lo].date === +d) return { value: obs[lo].w, method: "same-day", sourceDates: [obs[lo].date], distanceDays: 0, eligible: true };
  const before = lo >= 0 ? obs[lo] : null, after = hi < obs.length ? obs[hi] : null;
  const db = before ? daysApart(before.date, d) : Infinity, da = after ? daysApart(d, after.date) : Infinity;
  const near = db <= da ? before : after, nd = Math.min(db, da);
  if (near && nd <= rules.nearestDays) return { value: near.w, method: "nearest", sourceDates: [near.date], distanceDays: nd, eligible: true };
  if (before && after && daysApart(before.date, after.date) <= rules.bracketDays) {
    const t = (d - before.date) / (after.date - before.date);
    return { value: before.w + (after.w - before.w) * t, method: "interpolated", sourceDates: [before.date, after.date], distanceDays: nd, eligible: true };
  }
  return { value: null, method: null, sourceDates: [before?.date, after?.date].filter(Boolean), distanceDays: isFinite(nd) ? nd : null, eligible: false,
    reason: isFinite(nd) ? `Nearest weigh-in is ${nd} days away` : "Outside the weigh-in period" };
}

// B01: cadence and coverage
export function coverage(obs, { from, to, today = new Date() } = {}) {
  const inR = obs.filter(o => (!from || o.date >= sod(from)) && (!to || o.date <= sod(to)));
  const gaps = [];
  for (let i = 1; i < inR.length; i++) { const g = daysApart(inR[i - 1].date, inR[i].date); if (g > BW_RULES.gapDays) gaps.push({ from: inR[i - 1].date, to: inR[i].date, days: g }); }
  const intervals = inR.slice(1).map((o, i) => daysApart(inR[i].date, o.date)).sort((a, b) => a - b);
  const weekKeys = new Set(inR.map(o => { const w = sod(o.date); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return +w; }));
  const last28 = obs.filter(o => o.date > new Date(+sod(today) - 28 * DAY) && o.date <= today).length;
  return { days: inR.length, weeks: weekKeys.size, first: inR[0]?.date, last: inR.at(-1)?.date, lastOverall: obs.at(-1)?.date,
    medianInterval: intervals.length ? intervals[Math.floor((intervals.length - 1) / 2)] : null, maxInterval: intervals.at(-1) ?? null, gaps, last28,
    daysSinceLast: obs.length ? daysApart(obs.at(-1).date, today) : null };
}

// B02: trailing mean of ACTUAL weigh-ins in a calendar window (not interpolation). Null when the window is too thin.
export function trailingMean(obs, windowDays, minDays = BW_RULES.smoothMinDays) {
  return obs.map((o, i) => {
    const start = +o.date - (windowDays - 1) * DAY, win = [];
    for (let j = i; j >= 0 && +obs[j].date >= start; j--) win.push(obs[j]);
    return { date: o.date, w: win.length >= minDays ? win.reduce((a, b) => a + b.w, 0) / win.length : null, n: win.length };
  });
}

// B03: weekly summary of observed weigh-ins; unobserved weeks are absent, not zero
export function weekly(obs) {
  const by = new Map();
  for (const o of obs) { const w = sod(o.date); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); if (!by.has(+w)) by.set(+w, { week: w, values: [] }); by.get(+w).values.push(o.w); }
  return [...by.values()].map(b => { const v = [...b.values].sort((x, y) => x - y);
    return { week: b.week, n: v.length, mean: v.reduce((a, c) => a + c, 0) / v.length, median: v[(v.length - 1) >> 1], min: v[0], max: v.at(-1) }; })
    .sort((a, b) => a.week - b.week);
}

// Rate from a least-squares fit over elapsed days; gated by distinct dates and span.
export function slope(obs) {
  if (obs.length < BW_RULES.slopeMinDates) return { ok: false, reason: `Needs ${BW_RULES.slopeMinDates}+ weigh-in days` };
  const span = daysApart(obs[0].date, obs.at(-1).date);
  if (span < BW_RULES.slopeMinSpanDays) return { ok: false, reason: `Needs ${BW_RULES.slopeMinSpanDays}+ days of weigh-ins` };
  const xs = obs.map(o => (o.date - obs[0].date) / DAY), ys = obs.map(o => o.w);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  const resid = ys.map((y, i) => y - (my + b * (xs[i] - mx))), se = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / Math.max(1, xs.length - 2) / sxx);
  return { ok: true, perWeek: 7 * b, pctPerWeek: 100 * 7 * b / my, sePerWeek: 7 * se, n: obs.length, spanDays: span, from: obs[0].date, to: obs.at(-1).date };
}

// Covered stretches: runs of weigh-ins with no internal gap longer than BW_RULES.gapDays
export function stretches(obs) {
  const out = []; let cur = [];
  for (const o of obs) { if (cur.length && daysApart(cur.at(-1).date, o.date) > BW_RULES.gapDays) { out.push(cur); cur = []; } cur.push(o); }
  if (cur.length) out.push(cur);
  return out;
}

// B10: compare a period's start and end using observed weigh-ins in the first/last 14 days of the period.
export function periodChange(obs, from, to, edgeDays = 14) {
  const a = sod(from), b = sod(to);
  const head = obs.filter(o => o.date >= a && o.date < new Date(+a + edgeDays * DAY));
  const tail = obs.filter(o => o.date > new Date(+b - edgeDays * DAY) && o.date <= b);
  if (head.length < 2 || tail.length < 2 || head.at(-1).date >= tail[0].date)
    return { ok: false, reason: `Needs 2+ weigh-ins in both the first and last ${edgeDays} days`, headN: head.length, tailN: tail.length };
  const m = arr => arr.reduce((s, o) => s + o.w, 0) / arr.length;
  return { ok: true, start: m(head), end: m(tail), change: m(tail) - m(head), headN: head.length, tailN: tail.length, headFrom: head[0].date, tailTo: tail.at(-1).date };
}
