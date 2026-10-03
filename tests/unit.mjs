// Calculation tests with hand-computed expectations — independent of the app's own derive layer.
// tests/fixtures/known.csv is small enough to check every number by hand (worked out in the comments).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import * as H from "../src/lib/derive.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const rows = text => Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: H.normalizeHeader }).data;
let failures = 0; const out = [];
function test(name, fn) { try { fn(); out.push(`  ok   ${name}`); } catch (e) { failures++; out.push(`  FAIL ${name}\n       ${e.message}`); } }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const near = (a, b, msg, eps = 1e-6) => { if (Math.abs(a - b) > eps) throw new Error(`${msg}: expected ${b}, got ${a}`); };

const known = H.parseRows(rows(readFileSync(root + "tests/fixtures/known.csv", "utf8")));
const M = H.deriveMetrics(H.prepare(known), { now: new Date(2026, 0, 31) });

test("known fixture: totals by hand", () => {
  // Push 5 Jan: warm-up excluded; bench 100×8, 100×8, 100×6 + push-ups 15, 12      → 5 working sets
  // Pull 7 Jan: assisted pull-up 50×8 ×2 + curl 20×12                               → 3 working sets (partial log)
  // Push 12 Jan: bench 100×10, 105×8, 105×8 + push-up 18 (+ an exact duplicate, dropped)
  //              + curl with an impossible 5000 lb weight → weight ignored, 10 reps kept → 5 working sets
  eq(M.totals.logged, 3, "logged workouts");
  eq(M.totals.sessions, 2, "qualifying sessions (4+ working sets)");
  eq(M.totals.sets, 13, "working sets");
  eq(M.totals.reps, 49 + 28 + 54, "working reps");
  // tonnage: 100·8·2 + 100·6 = 2200; curl 20·12 = 240; 100·10 + 105·8·2 = 2680. Assisted weight is help, not load.
  near(M.totals.tonnage, 5120, "tonnage");
  eq(M.totals.days, 3, "training days");
  near(M.totals.minutes, 120, "logged minutes (two valid 60-min sessions; the 10-min one is flagged)");
});

test("known fixture: records judged chronologically", () => {
  // bench 12 Jan: heaviest 105 > 100 (weight PR) and 10 reps at 100 > 8 (rep PR); push-up 18 > 15 (most reps)
  const types = M.prs.map(p => `${p.ex}:${p.type}`).sort();
  eq(types.join(","), ["Bench Press (Barbell):reps", "Bench Press (Barbell):weight", "Push Up:bwreps"].join(","), "PRs");
  const rep = M.prs.find(p => p.type === "reps");
  eq(rep.w, 100, "rep PR weight"); eq(rep.prev, 8, "rep PR before"); eq(rep.v, 10, "rep PR after");
});

test("known fixture: audit explains every dropped or altered row", () => {
  const reasons = M.audit.excludedRows.map(r => `${r.line}:${r.reason}`);
  eq(reasons.length, 3, "excluded/altered rows");
  eq(reasons.includes("15:Duplicate of an earlier row"), true, "duplicate on line 15");
  eq(reasons.includes("16:Weight ignored (implausible)"), true, "implausible weight on line 16");
  eq(reasons.includes("17:Unreadable date"), true, "bad date on line 17");
  const f = M.audit.flagged.find(x => x.title === "Pull");
  eq(f.flags.join(","), "fragment,duration", "Pull session flags");
  near(M.audit.lowConfShare, 1 / 7, "share of loaded sets above 10 reps (the 12-rep curl)");
});

test("e1RM prefers reliable sets and flags the rest", () => {
  const bench = M.exs.find(e => e.ex === "Bench Press (Barbell)");
  near(bench.hist.at(-1).e1rm, 100 * (1 + 10 / 30), "best reliable e1RM on 12 Jan (100×10)");
  eq(bench.hist.at(-1).e1rmLow, false, "bench estimate is reliable");
  const curl = M.exs.find(e => e.ex === "Bicep Curl (Dumbbell)");
  eq(curl.hist[0].e1rmLow, true, "12-rep curl estimate is low-confidence");
});

test("corrections: excluding a session and re-mapping an exercise", () => {
  const sid = known.sets.find(s => s.title === "Pull").sid;
  const C = H.deriveMetrics(H.prepare(known, { exclude: [sid], muscles: { "Push Up": ["triceps"] } }), { now: new Date(2026, 0, 31) });
  eq(C.totals.logged, 2, "excluded session is gone");
  near(C.totals.tonnage, 5120 - 240, "its curl no longer counts");
  eq(C.exs.find(e => e.ex === "Push Up").muscles.join(), "triceps", "override applied");
});

test("units: kg conversion keeps full precision; body weight follows", () => {
  const K = H.deriveMetrics(H.prepare(H.inUnit(known, "kg")), { now: new Date(2026, 0, 31), measurements: [{ date: new Date(2026, 0, 6), lbs: 200 }] });
  near(K.totals.tonnage, 5120 * 0.45359237, "tonnage in kg", 1e-9);
  near(K.bw[0].w, 200 * 0.45359237, "body weight in kg", 1e-9);
});

test("header aliases normalise older/localised exports", () => {
  eq(H.normalizeHeader("Exercise Title"), "exercise_title", "spaces/case");
  eq(H.normalizeHeader("Weight (kg)"), "weight_kg", "parenthesised unit");
  eq(H.normalizeHeader("﻿title"), "title", "BOM");
  eq(H.normalizeHeader("exercise_name"), "exercise_title", "alias");
});

// progress detector: build sessions directly
function lift(sets) {   // sets: [[dayOffset, [[w, reps], ...]], ...]
  const lines = ["title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps"];
  for (const [d, ss] of sets) {
    const t = new Date(2026, 0, 1 + d), stamp = `${t.getDate()} ${["Jan", "Feb", "Mar", "Apr"][t.getMonth()]} 2026`;
    ss.forEach(([w, r], i) => lines.push(`Lift,"${stamp}, 18:00","${stamp}, 19:00",Leg Extension (Machine),${i},normal,${w},${r}`));
  }
  const P = H.parseRows(rows(lines.join("\n")));
  const D = H.deriveMetrics(H.prepare(P), { now: new Date(2026, 2, 31) });
  return D.progress.find(p => p.ex === "Leg Extension (Machine)");
}
test("progress: more reps at an unchanged load counts as progress", () => {
  const p = lift([[0, [[100, 12], [100, 12]]], [14, [[100, 12], [100, 13]]], [28, [[100, 14], [100, 14]]], [49, [[100, 15], [100, 15]]], [63, [[100, 15], [100, 16]]]]);
  eq(p.status, "progressing", "status"); eq(p.repGain.w, 100, "matched load");
});
test("progress: identical sessions are steady", () => {
  const p = lift([[0, [[100, 12]]], [14, [[100, 12]]], [28, [[100, 12]]], [49, [[100, 12]]], [63, [[100, 12]]]]);
  eq(p.status, "steady", "status");
});
test("progress: needs enough sessions and weeks", () => {
  const p = lift([[60, [[100, 12]]], [63, [[100, 12]]], [66, [[100, 12]]], [69, [[100, 12]]]]);
  eq(p, undefined, "under 6 weeks of data is not judged");
});

/* ---------- docs/metrics-opportunities.md §8 cases: tests/fixtures/edge.csv, worked by hand ----------
   A (5 Jan): Shoulder Press with BLANK load ×2 (unknown, not bodyweight); assisted pull-up at 0 assistance (superset 0);
              rear-delt fly 40×12 (superset 0); push-up 10.            → 5 working sets
   B (8 Jan): Shoulder Press 30×12 (set 0), 30×10 (set 1, listed first); fly 40×15; push-ups 12, 12
   C (15 Jan): Shoulder Press 35×12, 30×13; fly 45×12; push-ups 14, 10
   D (15 Mar, after a 59-day gap): fly 45×13; push-ups 8, 8; Shoulder Press 35×12 */
const R2 = await import("../src/lib/progression.js"), W2 = await import("../src/lib/workload.js"), B2 = await import("../src/lib/bodyWeight.js"), X = await import("../src/lib/exerciseRegistry.js");
const edge = H.parseRows(rows(readFileSync(root + "tests/fixtures/edge.csv", "utf8")));
const EB = H.prepare(edge);
const EM = H.deriveMetrics(EB, { now: new Date(2026, 2, 31) });

test("§8 blank load on a machine is unknown, not bodyweight; series stay typed", () => {
  const sp = EB.exs.get("Shoulder Press (Machine Plates)");
  eq(sp.kind, "loaded", "performance kind"); eq(sp.kinds.unknown, 1, "one unknown-load session"); eq(sp.mixed, true, "mixed history flagged");
  eq(EB.sets.filter(s => s.ex.startsWith("Shoulder") && s.unknownLoad).length, 2, "two unknown-load sets");
  eq(EB.sets.some(s => s.ex.startsWith("Shoulder") && s.bodyweight), false, "never bodyweight");
  // the 8 Jan session is the first LOADED one: a baseline, not a record; 15 Jan 35 > 30 is a record
  eq(EM.prs.filter(p => p.ex.startsWith("Shoulder") && p.type === "weight").length, 1, "one weight record");
});
test("§8 assisted counterweight is excluded from volume; zero assistance and superset 0 survive", () => {
  eq(EB.sets.find(s => s.ex === "Pull Up (Assisted)").w, 0, "zero assistance kept");
  eq(EB.sets.filter(s => s.superset === 0).length, 2, "superset ID 0 kept on two sets");
  // volume by hand: A 40·12=480; B 30·12+30·10+40·15=1260; C 35·12+30·13+45·12=1350; D 45·13+35·12=1005
  near(EM.totals.tonnage, 480 + 1260 + 1350 + 1005, "external-load volume");
});
test("§8 set index 0 sorts first even when listed second", () => {
  const sets = R2.typedSets(EB.exs.get("Shoulder Press (Machine Plates)"));
  eq(sets.filter(s => s.sid.includes("8 Jan")).map(s => s.reps).join(","), "12,10", "8 Jan order by set index");
});
test("§8 frontier, rep threshold, fixed load and matched set count (by hand)", () => {
  const fly = EB.exs.get("Rear Delt Reverse Fly (Machine)");
  const F = R2.frontier(fly);
  // sets: 40×12, 40×15, 45×12, 45×13 → boundary 40×15 and 45×13 (45×12 is dominated by 45×13; 40×12 by 40×15)
  eq(F.frontier.map(p => `${p.w}x${p.reps}`).join(" "), "45x13 40x15", "boundary");
  const L = R2.loadAtReps(fly, 12);
  eq(L.map(p => p.w).join(","), "40,40,45,45", "best load at ≥12 reps per session");
  eq(L.map(p => p.record).join(","), "false,false,true,false", "records");
  const sp = EB.exs.get("Shoulder Press (Machine Plates)");
  const at30 = R2.loadsUsed(sp).find(l => l.w === 30);
  eq(at30.sessions.map(s => s.best).join(","), "12,13", "best reps at 30 lb");
  const m = R2.matchedSets(sp, 30, 1);
  eq(m.map(x => x.total).join(","), "12,13", "first set at 30 lb");
});
test("§8 first/recent windows are disjoint; sparse data is unavailable", () => {
  const t = R2.matchedTrend([1, 2, 3, 4, 5, 6].map(i => ({ date: new Date(2026, 0, i * 5), v: i })));
  eq(t.ok, true, "enough points"); eq(t.k, 2, "window size"); eq(t.first, 1.5, "first window median"); eq(t.recent, 5.5, "recent window median");
  eq(R2.matchedTrend([{ date: new Date(2026, 0, 1), v: 1 }, { date: new Date(2026, 0, 9), v: 2 }]).ok, false, "two points: unavailable");
  // a 14+ day gap starts a new block: only the latest block is used
  const g = R2.matchedTrend([1, 2, 3, 4].map(i => ({ date: new Date(2026, 0, i), v: 9 })).concat([5, 6, 7, 8].map(i => ({ date: new Date(2026, 2, i * 7), v: i }))));
  eq(g.n, 4, "latest block only");
});
test("§8 body weight never joins across a long gap; same in lb and kg", () => {
  const obs = B2.observations([{ date: new Date(2026, 0, 1), lbs: 200 }, { date: new Date(2026, 0, 10), lbs: 202 }, { date: new Date(2026, 3, 1), lbs: 210 }]);
  eq(B2.match(obs, new Date(2026, 0, 1)).method, "same-day", "same day");
  eq(B2.match(obs, new Date(2026, 0, 5)).method, "nearest", "within 7 days");
  eq(B2.match(obs, new Date(2026, 1, 15)).eligible, false, "inside the 81-day gap: no value");
  eq(B2.match(obs, new Date(2026, 5, 1)).eligible, false, "never carried past the last weigh-in");
  const k = B2.observations([{ date: new Date(2026, 0, 1), lbs: 200 }], 0.45359237);
  near(B2.match(k, new Date(2026, 0, 3)).value, 200 * 0.45359237, "kg join", 1e-9);
  eq(B2.slope(obs.slice(0, 2)).ok, false, "2 weigh-ins: no rate");
  eq(B2.trailingMean(obs, 14)[1].w, null, "smoother needs 3 weigh-in days in its window");
});
test("§8 calendar weeks reconcile to included rows; zero weeks stay zero; records respect both bounds", () => {
  const sets = EM.weeks.reduce((a, w) => a + w.sets, 0);
  eq(sets, EB.sets.filter(s => s.working).length, "weekly sets sum to working rows");
  eq(EM.weeks.filter(w => w.sets === 0).length > 0, true, "empty weeks are present as zeros");
  const Jan = H.deriveMetrics(EB, { from: new Date(2026, 0, 1), to: new Date(2026, 0, 10) });
  eq(Jan.prs.every(p => p.date <= new Date(2026, 0, 11)), true, "no record after the upper bound");
  eq(Jan.prs.map(p => `${p.ex}:${p.type}`).sort().join(","), "Push Up:bwreps,Rear Delt Reverse Fly (Machine):reps", "records judged against earlier history, inside the range");
});
test("§8 muscle credits are consistent and never called unique sets", () => {
  const dose = W2.muscleDose(EM, EB);
  const rear = dose.find(d => d.m === "rearDelt"), traps = dose.find(d => d.m === "traps");
  eq(rear.directTotal, 4, "rear delt direct sets"); eq(traps.secondaryTotal, 4, "traps secondary sets");
  // credited total (Σ direct + ½ secondary) can exceed working sets: one set credits several muscles
  const credited = dose.reduce((a, d) => a + d.directTotal + d.secondaryTotal * 0.5, 0);
  eq(credited > EB.sets.filter(s => s.working && !X.classify(s.ex).cardio).length, true, "credits exceed unique sets");
  eq(X.classify("Rear Delt Reverse Fly (Machine)").pattern, "Horizontal pull", "one registry: pattern");
});
test("§8 closest earlier workout by exercise overlap", () => {
  const c = R2.closestEarlier(EB.sessions, EB.sessions.at(-1).sid);
  // D = {fly, push-up, shoulder press}; B and C share all 3 → most recent (C) wins; A shares 3 of 5
  eq(c.sid.includes("15 Jan"), true, "C"); eq(c.sim, 1, "full overlap");
});

console.log(out.join("\n"));
console.log(failures ? `\n${failures} unit test(s) failed` : `\nall ${out.length} unit tests passed`);
process.exit(failures ? 1 : 0);
