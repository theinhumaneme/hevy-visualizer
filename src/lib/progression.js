/* ================================================================
   COMPARABLE PROGRESSION (docs/metrics-opportunities.md, S01–S04, S06, S13, J02)
   Works on one exercise's typed history: only sessions of the exercise's own kind, so pounds are never
   mixed with reps. "Better" is direction-aware: more load for loaded lifts, less assistance for assisted ones.
   ================================================================ */
const DAY = 864e5;
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Sets usable for performance: same kind as the exercise, in range, ordered by date then set index then export order.
export function typedSets(E, inR = () => true) {
  const out = [];
  for (const h of E.hist) {
    if (h.kind !== E.kind || !inR(h.date)) continue;
    const ss = h.sets.filter(s => E.kind === "loaded" ? s.loaded : E.kind === "assisted" ? s.assisted && s.reps > 0 : s.bodyweight)
      .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0) || (a.order ?? 0) - (b.order ?? 0));
    for (const s of ss) out.push({ date: h.date, sid: h.sid, w: E.kind === "bodyweight" ? 0 : s.w ?? 0, reps: s.reps, idx: s.idx, set: s });
  }
  return out;
}
const lowerBetter = E => E.kind === "assisted";
const loadBetter = (E, a, b) => lowerBetter(E) ? a < b : a > b;          // is load a better than b?
const loadAtLeast = (E, a, b) => lowerBetter(E) ? a <= b : a >= b;

/* S01: load–rep frontier. A set is on the frontier when no other set has at-least-as-good load AND
   at-least-as-many reps (one strictly better). Events record each dated improvement of the frontier. */
export function frontier(E, inR) {
  const sets = typedSets(E, inR);
  let F = [];
  const events = [];
  const dominates = (q, p) => loadAtLeast(E, q.w, p.w) && q.reps >= p.reps && (q.w !== p.w || q.reps !== p.reps);
  for (const p of sets) {
    if (F.some(q => dominates(q, p) || (q.w === p.w && q.reps === p.reps))) continue;
    const displaced = F.filter(q => dominates(p, q));
    const first = F.length === 0;
    F = F.filter(q => !dominates(p, q)).concat([p]);
    if (!first) events.push({ date: p.date, w: p.w, reps: p.reps, displaced });
  }
  F.sort((a, b) => a.reps - b.reps);
  return { sets, frontier: F, events, n: sets.length };
}

// candidate rep thresholds: rep counts that at least `min` sessions reached
export function repTargets(E, inR, min = 3) {
  const sets = typedSets(E, inR), bySession = new Map();
  for (const s of sets) bySession.set(s.sid, Math.max(bySession.get(s.sid) || 0, s.reps));
  const counts = new Map();
  for (const r of new Set(sets.map(s => s.reps))) counts.set(r, [...bySession.values()].filter(x => x >= r).length);
  const ok = [...counts].filter(([, n]) => n >= min).map(([r]) => r).sort((a, b) => a - b);
  const mode = (() => { const c = new Map(); sets.forEach(s => c.set(s.reps, (c.get(s.reps) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  return { targets: ok, mode: ok.includes(mode) ? mode : ok.at(-1) ?? null };
}

/* S02 (+J02): best load per session among sets with reps ≥ target; actual reps kept for every point.
   With a body-weight matcher, relative = load ÷ body weight from an ELIGIBLE weigh-in only. */
export function loadAtReps(E, target, inR, bwMatch) {
  const by = new Map();
  for (const s of typedSets(E, inR)) {
    if (s.reps < target) continue;
    const cur = by.get(s.sid);
    if (!cur || loadBetter(E, s.w, cur.w) || (s.w === cur.w && s.reps > cur.reps)) by.set(s.sid, { date: s.date, sid: s.sid, w: s.w, reps: s.reps });
  }
  let best = null;
  return [...by.values()].sort((a, b) => a.date - b.date).map(p => {
    const record = best == null ? false : loadBetter(E, p.w, best);
    if (best == null || loadBetter(E, p.w, best)) best = p.w;
    const m = bwMatch ? bwMatch(p.date) : null;
    return { ...p, record, bw: m && m.eligible ? m.value : null, bwMethod: m?.method || null, rel: m && m.eligible && E.kind === "loaded" ? p.w / m.value : null };
  });
}

// S03: loads used in 2+ sessions, with best reps / total reps / set count per session at that exact load
export function loadsUsed(E, inR) {
  const by = new Map();
  for (const s of typedSets(E, inR)) {
    const k = Math.round(s.w * 1e6) / 1e6;   // exact logged load (only conversion noise removed)
    if (!by.has(k)) by.set(k, new Map());
    const m = by.get(k);
    if (!m.has(s.sid)) m.set(s.sid, { date: s.date, sid: s.sid, best: 0, total: 0, sets: 0, reps: [] });
    const r = m.get(s.sid); r.best = Math.max(r.best, s.reps); r.total += s.reps; r.sets++; r.reps.push(s.reps);
  }
  return [...by].map(([w, m]) => ({ w, sessions: [...m.values()].sort((a, b) => a.date - b.date) }))
    .filter(x => x.sessions.length >= 2).sort((a, b) => b.sessions.length - a.sessions.length || b.w - a.w);
}

// S04: total reps across the first N sets at one load, for sessions with at least N such sets (ordered by set index)
export function matchedSets(E, load, n, inR) {
  const L = loadsUsed(E, inR).find(x => Math.abs(x.w - load) < 1e-6);
  if (!L) return [];
  return L.sessions.filter(s => s.sets >= n).map(s => ({ date: s.date, sid: s.sid, reps: s.reps.slice(0, n), total: s.reps.slice(0, n).reduce((a, b) => a + b, 0) }));
}

/* S06: trend of comparable points within the most recent block (gaps ≥14 days start a new block).
   Disjoint first/recent windows (a third each) and a least-squares rate; unavailable with a reason when thin. */
export function matchedTrend(points, { better = 1, gapDays = 14, minPoints = 4, minSpanDays = 21 } = {}) {
  if (!points.length) return { ok: false, reason: "There are no sessions at this rep target yet" };
  let start = 0;
  for (let i = 1; i < points.length; i++) if ((points[i].date - points[i - 1].date) / DAY >= gapDays) start = i;
  const P = points.slice(start);
  if (P.length < minPoints) return { ok: false, reason: `Log ${minPoints - P.length} more session${minPoints - P.length === 1 ? "" : "s"} at this rep target to see a trend (it needs ${minPoints} in your latest training block; there ${P.length === 1 ? "is" : "are"} ${P.length})`, n: P.length };
  const span = (P.at(-1).date - P[0].date) / DAY;
  if (span < minSpanDays) return { ok: false, reason: `A trend needs sessions spread over at least ${minSpanDays} days in your latest training block`, n: P.length };
  const k = Math.max(1, Math.floor(P.length / 3));
  const first = med(P.slice(0, k).map(p => p.v)), recent = med(P.slice(-k).map(p => p.v));
  const xs = P.map(p => (p.date - P[0].date) / DAY), ys = P.map(p => p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  return { ok: true, n: P.length, k, first, recent, change: (recent - first) * better, pct: first ? (recent - first) / first * 100 * better : null,
    perMonth: slope * 30 * better, from: P[0].date, to: P.at(-1).date };
}

/* S13: assisted effective-load proxy = body weight − assistance; fraction = proxy ÷ body weight.
   Only sets with an eligible weigh-in; assistance and reps always come from the same set. */
export function assistedEffective(E, inR, bwMatch) {
  if (E.kind !== "assisted" || !bwMatch) return { points: [], coverage: 0, total: 0 };
  const sets = typedSets(E, inR), out = [];
  for (const s of sets) {
    const m = bwMatch(s.date);
    if (!m.eligible) continue;
    out.push({ date: s.date, sid: s.sid, assist: s.w, reps: s.reps, bw: m.value, eff: m.value - s.w, frac: (m.value - s.w) / m.value, method: m.method, distanceDays: m.distanceDays });
  }
  const bySession = new Map();
  for (const p of out) { const c = bySession.get(p.sid); if (!c || p.frac > c.frac || (p.frac === c.frac && p.reps > c.reps)) bySession.set(p.sid, p); }
  const sessions = new Set(sets.map(s => s.sid)).size;
  return { points: [...bySession.values()].sort((a, b) => a.date - b.date), coverage: bySession.size, total: sessions };
}

// R01: Jaccard similarity of two sessions' exercise sets
export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const sessionExercises = s => [...new Set(s.sets.filter(t => t.working).map(t => t.ex))];
// closest EARLIER qualifying session by exercise overlap (ties: same title, then most recent)
export function closestEarlier(sessions, sid) {
  const i = sessions.findIndex(s => s.sid === sid); if (i <= 0) return null;
  const me = sessions[i], ex = sessionExercises(me);
  let best = null;
  for (let j = i - 1; j >= 0; j--) {
    const s = sessions[j]; if (!s.real) continue;
    const sim = jaccard(ex, sessionExercises(s));
    if (!best || sim > best.sim + 1e-9 || (Math.abs(sim - best.sim) < 1e-9 && s.title === me.title && best.s.title !== me.title)) best = { s, sim };
  }
  return best && best.sim > 0 ? { sid: best.s.sid, sim: best.sim, shared: ex.filter(x => sessionExercises(best.s).includes(x)).length, of: new Set([...ex, ...sessionExercises(best.s)]).size } : null;
}
