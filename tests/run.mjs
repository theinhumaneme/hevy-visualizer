// End-to-end checks against the production build (`npm test` builds first, then serves dist/ with vite preview).
// Fonts are blocked on purpose so the suite runs offline and proves the fallbacks work.
import { chromium } from "playwright";
import { preview } from "vite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import * as H from "../src/lib/derive.js";
import { resolveRange } from "../src/lib/ranges.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(root + p, "utf8");
const FULL = root + "data/workouts.csv", FULL_CSV = read("data/workouts.csv");
const MEAS = root + "data/measurements.csv";   // real Hevy measurements export: mixed CRLF/LF line endings, only weight filled in
const SMALL = root + "tests/fixtures/small_lbs.csv", SMALL_CSV = read("tests/fixtures/small_lbs.csv");
const BAD = root + "tests/fixtures/not_hevy.csv";
const KNOWN = root + "tests/fixtures/known.csv";   // hand-computed: see tests/unit.mjs
const SHOTS = root + "tests/screenshots/";
mkdirSync(SHOTS, { recursive: true });

// expected numbers come from the same derive layer the app uses
const rows = csv => Papa.parse(csv.replace(/\r\n?/g, "\n"), { header: true, skipEmptyLines: true, transformHeader: H.normalizeHeader }).data;
const base = csv => H.prepare(H.parseRows(rows(csv)));
const metrics = (csv, range) => { const r = range ? resolveRange(range) : {}; return H.deriveMetrics(base(csv), { from: r.from, to: r.to }); };
const n = x => x.toLocaleString("en-US");

const server = await preview({ root, preview: { port: 0, strictPort: false }, logLevel: "silent" });
const BASE = server.resolvedUrls.local[0].replace(/\/$/, "");

let browser, failures = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(`  ok   ${name}`); }
  catch (e) { failures++; results.push(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

async function open({ reducedMotion = "reduce", viewport = { width: 1280, height: 900 }, files, hasTouch = false } = {}) {
  const context = await browser.newContext({ reducedMotion, viewport, hasTouch, locale: "en-US" });
  await context.route("**/*", route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (r.method() !== "GET") requests.push(r.method() + " " + r.url()); });
  await page.goto(BASE + "/");
  if (files) { await page.setInputFiles(".dropzone input[type=file]", files); await page.waitForSelector("#odo"); await dismissWelcome(page); }
  return { page, context, errors, requests };
}
const odo = page => page.getAttribute("#odo", "aria-label");
// the getting-started note appears once per import; tests dismiss it like a user would
async function dismissWelcome(page) { const b = await page.$('.welcome button:has-text("Dismiss")'); if (b) await b.click(); }
const tab = async (page, id) => { await page.evaluate(id => { location.hash = id; }, id); await page.waitForSelector(`a[href="#${id}"][aria-current="page"]`, { state: "attached" }); };
const over = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

browser = await chromium.launch();

await test("landing: a non-Hevy file is rejected and nothing is sent anywhere", async () => {
  const { page, context, errors, requests } = await open();
  await page.setInputFiles(".dropzone input[type=file]", BAD);
  await page.waitForSelector(".banner.err");
  assert((await page.textContent(".banner")).includes("isn't a Hevy workouts or measurements export"), "explains the problem");
  assert(await page.isVisible(".dropzone"), "still on the landing page");
  eq(requests.length, 0, "network writes");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("story: workouts + measurements, exact total, body-weight scene, nothing uploaded", async () => {
  const { page, context, errors, requests } = await open({ files: [FULL, MEAS] });
  const M = metrics(FULL_CSV);
  eq(await odo(page), `${n(Math.round(M.totals.tonnage))} lb lifted`, "odometer");
  assert(await page.isVisible("#s-scale"), "body-weight scene shown");
  for (const id of ["s-commit", "s-rhythm", "s-body", "s-lifts", "s-prs", "s-reps", "s-eff", "s-insights"])
    assert((await page.$$(`#${id} svg, #${id} canvas`)).length > 0, id + " drew a chart");
  eq(requests.length, 0, "network writes");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("muscle map: linked selection, keyboard controls and zero-volume muscles", async () => {
  const { page, context, errors } = await open({ files: [FULL] });
  const M = metrics(FULL_CSV);
  await page.locator('#s-body').scrollIntoViewIfNeeded();
  await page.locator('.mbar[data-m="calves"]').click();
  eq(await page.textContent('.body-readout strong'), 'Calves', 'row updates persistent readout');
  eq(await page.locator('.muscle[data-m="calves"][aria-pressed="true"]').count(), 2, 'front and back selected together');
  const chest = page.locator('.muscle[data-m="chest"]');
  await chest.focus();
  await chest.press('Enter');
  eq(await page.textContent('.body-readout strong'), 'Chest', 'keyboard selects body region');
  eq(await page.textContent('.body-readout-value b'), M.muscleWeekly.chest.toLocaleString('en-US', { maximumFractionDigits: 1 }), 'readout uses credited weekly volume');
  await page.locator('.mbar[data-m="back"]').hover();
  eq(await page.textContent('.body-readout strong'), 'Chest', 'hover keeps selected readout');
  const forearms = page.locator('.muscle[data-m="forearms"]').first();
  await forearms.focus();
  await forearms.press('Space');
  assert((await page.textContent('.body-readout')).includes('No sets logged'), 'zero volume explained');
  eq(await page.locator('.mbar[data-m="forearms"] .bar').evaluate(n => n.style.width), '0%', 'zero has no visible bar');
  eq(await page.locator('.mbar[aria-pressed="true"]').count(), 1, 'only one ranking selected');
  eq(errors.length, 0, 'page errors: ' + errors.join(' | '));
  await context.close();
});

await test("muscle map: touch selection persists at mobile width", async () => {
  const { page, context } = await open({ files: [FULL], hasTouch: true, viewport: { width: 390, height: 844 } });
  await page.locator('.mbar[data-m="hamstrings"]').tap();
  eq(await page.textContent('.body-readout strong'), 'Hamstrings', 'tap selects a muscle');
  await page.locator('.body-readout').scrollIntoViewIfNeeded();
  eq(await page.getAttribute('.muscle[data-m="hamstrings"]', 'aria-pressed'), 'true', 'selection persists after scrolling');
  const figures = await page.locator('.figures figure').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top));
  eq(figures[0], figures[1], 'front and back remain side by side');
  eq(await over(page), 0, 'no mobile overflow');
  await context.close();
});

await test("story: preset and custom date ranges recompute everything", async () => {
  const { page, context, errors } = await open({ files: [FULL] });
  await page.click('[aria-label^="Date range"]');
  await page.click('.popover button:has-text("Last 3 months")');
  const M3 = metrics(FULL_CSV, { id: "3m" });
  await page.waitForFunction(w => document.getElementById("odo")?.getAttribute("aria-label") === w, `${n(Math.round(M3.totals.tonnage))} lb lifted`);
  await page.click('[aria-label^="Date range"]');
  await page.click('.popover button:has-text("Custom")');
  await page.fill('.popover input[type=date] >> nth=0', "2025-05-01");
  await page.fill('.popover input[type=date] >> nth=1', "2025-06-30");
  const MC = metrics(FULL_CSV, { id: "custom", from: "2025-05-01", to: "2025-06-30" });
  await page.waitForFunction(w => document.getElementById("odo")?.getAttribute("aria-label") === w, `${n(Math.round(MC.totals.tonnage))} lb lifted`);
  assert((await page.textContent("#s-open .eyebrow")).includes("May 1, 2025"), "eyebrow names the range");
  await page.fill('.popover input[type=date] >> nth=0', "2025-10-01");
  await page.fill('.popover input[type=date] >> nth=1', "2025-10-31");
  await page.waitForSelector(".empty-view");
  assert((await page.textContent(".empty-view")).includes("No workouts"), "empty range is explained");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("recap: every period renders; numbers match; empty periods are explained", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "recap");
  for (const [label, id] of [["All time", "all"], ["Last year", "year"], ["Last 3 months", "3m"], ["Last month", "lastMonth"], ["This month", "month"]]) {
    await page.click(`.recap-head button:has-text("${label}")`);
    const M = metrics(FULL_CSV, { id });
    if (M.empty) { await page.waitForSelector(".empty-card"); continue; }
    await page.waitForFunction(v => document.querySelector(".tile b")?.textContent === v, n(M.totals.sessions), { timeout: 4000 })
      .catch(async () => { throw new Error(`${label}: sessions tile "${await page.textContent(".tile b")}", want ${M.totals.sessions}`); });
  }
  await page.click('.recap-head button:has-text("Custom")');
  await page.fill(".recap-head input[type=date] >> nth=0", "2025-08-01");
  await page.fill(".recap-head input[type=date] >> nth=1", "2025-08-31");
  await page.waitForSelector(".empty-card");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("compare: latest session vs an earlier one, exercise by exercise", async () => {
  const { page, context, errors } = await open({ files: [FULL] });
  await tab(page, "compare");
  const B = base(FULL_CSV).sessions.filter(s => s.real).at(-1);
  assert((await page.$eval(".pick select >> nth=1", s => s.selectedOptions[0].textContent)).includes(B.title), "B defaults to the latest session");
  const exA = await page.$$eval(".cmp-row:not(.head)", r => r.length);
  const want = new Set(B.sets.filter(s => s.working).map(s => s.ex)).size;
  assert(exA >= want, `at least ${want} exercise rows, got ${exA}`);
  const before = await page.$eval(".pick select >> nth=0", s => s.value);
  await page.click(".swap");
  eq(await page.$eval(".pick select >> nth=1", s => s.value), before, "swap moves A to B");
  // exercises mode: overlay trends of different lifts
  await page.click('.compare .seg button:has-text("Exercises")');
  await page.waitForSelector(".xchart svg path");
  const n0 = await page.$$eval(".xchip", c => c.length);
  assert(n0 >= 2, "starts with 2+ exercises picked");
  await page.selectOption('select[aria-label="Add an exercise"]', { index: 1 });
  eq(await page.$$eval(".xchip", c => c.length), n0 + 1, "added an exercise");
  eq(await page.$$eval(".xchart svg path", p => p.length) >= n0 + 1, true, "one line per exercise");
  await page.click('.xpick .seg button:has-text("Sets per week")');
  await page.waitForSelector(".xchart svg path");
  await page.click('.xchip button >> nth=0');
  eq(await page.$$eval(".xchip", c => c.length), n0, "removed an exercise");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("dashboard tabs: overview, exercises, records, history, analysis, units and range", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "overview");
  await page.waitForFunction(() => document.getElementById("heroTitle")?.textContent.includes("workouts"));
  const total = new Set(rows(FULL_CSV).map(r => r.start_time + "|" + r.title)).size;
  eq(await page.textContent("#heroTitle"), `${total} logged workouts`, "overview hero");
  await page.click('.seg.unit button:has-text("kg")');
  await page.waitForFunction(() => document.getElementById("stats").textContent.includes("weight lifted (kg)"));
  await page.click('.seg.unit button:has-text("lb")');
  await page.click('#weekSeg button[data-v="volume"]');
  await tab(page, "exercises");
  await page.waitForSelector("#exSelect option", { state: "attached" });
  await page.selectOption("#exSelect", "Leg Extension (Machine)");
  await page.waitForFunction(() => document.getElementById("exChartTitle").textContent.includes("Strength"));
  await tab(page, "records");
  await page.waitForSelector("#recW tbody tr");
  await page.click('#recW th[data-sort="sets"]');
  await page.waitForSelector('#recW th[data-sort="sets"][aria-sort="descending"]');
  await tab(page, "history");
  await page.fill("#histSearch", "leg press");
  await page.waitForFunction(() => !document.getElementById("histTitle").textContent.startsWith("72 "));
  await page.click('[aria-label^="Date range"]'); await page.click('.popover button:has-text("Last month")');
  const ML = metrics(FULL_CSV, { id: "lastMonth" });
  await page.fill("#histSearch", "");
  await page.waitForFunction(w => document.getElementById("histTitle").textContent === w, `${ML.totals.logged} logged workout${ML.totals.logged === 1 ? "" : "s"}`);
  await tab(page, "analysis");
  await page.waitForFunction(() => document.querySelectorAll("#anRoot canvas").length >= 3);
  assert((await page.textContent("#anRoot")).includes("Data check"), "analysis sections");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("small export: warm-ups excluded, assisted lifts are help, motion on lands exact digits", async () => {
  const { page, context, errors } = await open({ reducedMotion: "no-preference", files: [SMALL] });
  const want = Math.round(metrics(SMALL_CSV).totals.tonnage);
  eq(await odo(page), `${n(want)} lb lifted`, "odometer label");
  await page.waitForTimeout(3600);
  const shown = await page.evaluate(() => [...document.querySelectorAll("#odo .col")].map(c => {
    const r = c.getBoundingClientRect(); return [...c.querySelectorAll(".strip span")].find(s => Math.abs(s.getBoundingClientRect().top - r.top) < 2)?.textContent; }).join(""));
  eq(shown, String(want), "odometer digits after the roll");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("sample data, then a real file replaces it", async () => {
  const { page, context, errors } = await open();
  await page.click('button:has-text("Try it with sample data")');
  await page.waitForSelector("#odo"); await dismissWelcome(page);
  assert((await page.textContent(".banner")).includes("example workouts"), "sample data is labelled");
  await page.click('[aria-label="Files and settings"]');
  await page.setInputFiles(".popover input[type=file]", SMALL);
  await page.waitForFunction(w => document.getElementById("odo")?.getAttribute("aria-label") === w, `${n(Math.round(metrics(SMALL_CSV).totals.tonnage))} lb lifted`);
  assert(!(await page.isVisible(".banner")), "banner gone");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

/* ---------- Pass 1: correctness, independent numbers, accessibility ---------- */
await test("hand-computed fixture: every view shows the same independent numbers", async () => {
  const { page, context, errors } = await open({ files: [KNOWN] });
  eq(await odo(page), "5,120 lb lifted", "story total (computed by hand)");
  const openStats = await page.textContent("#s-open .open-stats");
  for (const want of ["2qualifying sessions", "3logged workouts", "13working sets", "131reps", "3personal records"]) assert(openStats.replace(/\s+/g, "").includes(want.replace(/\s+/g, "")), "story stat " + want + " in " + openStats);
  await tab(page, "overview");
  await page.waitForFunction(() => document.getElementById("heroTitle")?.textContent === "3 logged workouts");
  assert((await page.textContent("#heroSub")).includes("2 qualifying sessions"), "overview names qualifying sessions");
  const st = (await page.textContent("#stats")).replace(/\s+/g, "");
  assert(st.includes("13workingsets") && st.includes("131reps") && st.includes("5.1kweightlifted(lb)") && st.includes("2htimelogged"), "overview stats: " + st);
  await tab(page, "records");
  await page.waitForSelector("#prEvents tbody tr");
  eq(await page.$$eval("#prEvents tbody tr", r => r.length), 3, "records table matches the 3 hand-counted records");
  await tab(page, "recap");
  await page.click('.recap-head button:has-text("All time")');
  await page.waitForFunction(() => document.querySelector(".tile b")?.textContent === "2");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("compare: replacing the export never crashes; choices follow the date range", async () => {
  const { page, context, errors } = await open({ files: [FULL] });
  await tab(page, "compare");
  await page.waitForSelector(".pick select");
  await page.click('[aria-label="Files and settings"]');
  await page.setInputFiles(".popover input[type=file]", SMALL);   // every stored session ID is now gone
  const S = base(SMALL_CSV).sessions, latest = S.filter(x => x.real).at(-1) || S.at(-1);   // latest qualifying session
  await page.waitForFunction(t => document.querySelectorAll(".pick select")[1]?.selectedOptions[0]?.textContent.includes(t), latest.title, { timeout: 5000 })
    .catch(() => { throw new Error("B re-selected from the new file"); });
  eq(await page.$$eval(".pick select >> nth=1 >> option", o => o.length), S.length, "only the new file's sessions are offered");
  await page.click('[aria-label="Files and settings"]');
  await page.setInputFiles(".popover input[type=file]", FULL);
  await page.click('[aria-label^="Date range"]'); await page.click('.popover button:has-text("Last month")');
  const r = resolveRange({ id: "lastMonth" });
  const dates = await page.$$eval(".pick select >> nth=1 >> option", o => o.map(x => x.value));
  const inRange = new Set(base(FULL_CSV).sessions.filter(s => s.start >= r.from && s.start < new Date(+r.to + 864e5)).map(s => s.sid));
  assert(dates.length > 0 && dates.every(d => inRange.has(d)), "every B choice is inside last month");
  await page.click('.compare .seg button:has-text("Exercises")');
  await page.click('.xpick .seg button:has-text("Estimated one-rep max")');
  await page.waitForSelector(".note.conf");
  assert((await page.textContent(".note.conf")).includes("low-confidence"), "low-confidence estimates are labelled");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("units: kilograms reach body weight in Story and Recap", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await page.click('.seg.unit button:has-text("kg")');
  await page.waitForFunction(() => document.getElementById("odo")?.getAttribute("aria-label").endsWith("kg lifted"));
  const lede = await page.textContent("#s-scale .lede");
  assert(/kg/.test(lede) && !/\blbs\b/.test(lede), "scale scene in kg: " + lede);
  await tab(page, "recap");
  await page.click('.recap-head button:has-text("All time")');
  await page.waitForSelector(".hl h3:has-text('kg')");
  await page.click('.seg.unit button:has-text("lb")');
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("analysis: full history by default, the date range on request", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await page.click('[aria-label^="Date range"]'); await page.click('.popover button:has-text("Last 3 months")');
  await tab(page, "analysis");
  await page.waitForFunction(() => document.querySelectorAll("#anRoot canvas").length >= 3);
  assert((await page.textContent(".dash .eyebrow")).toLowerCase().includes("full history"), "labelled full history");
  const full = await page.textContent("#anRoot .stats");
  await page.click('.seg.scope button:has-text("Selected range")');
  await page.waitForFunction(f => document.querySelector("#anRoot .stats")?.textContent !== f, full);
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("data review: rows explained, sessions excluded, mappings corrected, focus returns", async () => {
  const { page, context, errors } = await open({ files: [KNOWN] });
  await page.click('[aria-label="Files and settings"]');
  await page.click('.popover button:has-text("Review imported data")');
  await page.waitForSelector('.drawer[role="dialog"]');
  await page.click('.drawer .seg button:has-text("Import issues")');
  assert(await page.evaluate(() => document.querySelector(".drawer").contains(document.activeElement)), "focus moved into the drawer");
  const t = await page.textContent(".dr-table");
  assert(t.includes("Duplicate of an earlier row") && t.includes("Unreadable date") && t.includes("Weight ignored"), "row reasons listed");
  await page.click('.drawer .seg button:has-text("Workouts")');
  await page.click('.dr-list li:has-text("Pull") input[type=checkbox]');
  await page.click('.drawer .seg button:has-text("Muscle assignments")');
  await page.selectOption('select[aria-label="Primary muscle for Push Up"]', "triceps");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".drawer", { state: "detached" });
  eq(await odo(page), "4,880 lb lifted", "excluding the Pull session drops its 240 lb curl");
  assert(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Files and settings"), "focus returned to the opener");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("keyboard: chart marks are focusable and Escape dismisses their detail", async () => {
  const { page, context, errors } = await open({ files: [FULL] });
  await page.evaluate(() => document.querySelector("#heat .cell").focus());
  await page.waitForSelector("#tip:not([hidden])");
  assert((await page.textContent("#tip")).includes("working sets"), "cell detail shown on focus");
  await page.keyboard.press("Escape");
  assert(await page.isHidden("#tip"), "Escape hides it");
  assert(await page.$eval("#heat .cell", c => !!c.getAttribute("aria-label")), "marks have accessible names");
  await tab(page, "overview");
  await page.waitForFunction(() => document.querySelector("#weekChart")?.getAttribute("aria-label"));
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("reduced motion follows the operating system live, and Landing respects it", async () => {
  const { page, context, errors } = await open({ reducedMotion: "no-preference" });
  assert(!(await page.evaluate(() => document.documentElement.classList.contains("reduced"))), "starts with motion");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.documentElement.classList.contains("reduced"));
  // Landing re-runs as a crossfade only: no element is translated
  const moved = await page.evaluate(() => [...document.querySelectorAll(".land .mask>span,.land .reveal")].some(e => /translate|matrix\([^)]*,[^,]*,[^,]*,[^,]*,[^,]*,\s*[1-9]/.test(e.style.transform)));
  assert(!moved, "no spatial movement on Landing");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

/* ---------- metrics-opportunities first wave ---------- */
await test("overview: coverage and consistency panels; the weekly target is shared with Story", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "overview");
  await page.click(".coverage summary");
  const cov = await page.textContent(".coverage");
  for (const want of ["1,053", "1,038", "Qualifying sessions", "765/813", "48 sets on loaded or ambiguous exercises", "65 / 72", "Hack Squat (Machine)"]) assert(cov.includes(want), "coverage mentions " + want);
  const sec = await page.textContent('section[aria-label="Consistency and workload"]');
  for (const want of ["0.73", "per week inside training blocks", "Month by month", "Leg Press Horizontal", "25.6%"]) assert(sec.includes(want), "consistency mentions " + want);
  await page.selectOption('select[aria-label="Weekly session target"]', "3");
  await tab(page, "story");
  await page.waitForFunction(() => document.querySelector("#s-commit .how-to-read")?.textContent.includes("3+ qualifying sessions"));
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("exercises: comparable progression for loaded and assisted lifts", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "exercises");
  await page.waitForSelector("#exSelect option", { state: "attached" });
  await page.selectOption("#exSelect", "Leg Extension (Machine)");
  await page.waitForFunction(() => document.querySelector(".panel-x .caption")?.textContent.includes("Leg Extension"));
  const t = await page.textContent(".panel-x");
  assert(t.includes("Best weight-and-rep combinations") && t.includes("Heaviest weight for sets of at least 12 reps") && t.includes("Reps at the same weight"), "three views");
  assert(t.includes("130 lb × 15"), "boundary event from the data");
  await page.selectOption("#exSelect", "Pull Up (Assisted)");
  await page.waitForFunction(() => document.querySelector(".panel-x")?.textContent.includes("share of body weight lifted"));
  assert((await page.textContent(".panel-x")).includes("of 44 sessions have a weigh-in"), "assisted coverage stated");
  await page.selectOption("#exSelect", "Hack Squat (Machine)");
  await page.waitForFunction(() => document.getElementById("exNote")?.textContent.includes("no load logged"));
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("analysis: muscle dose, patterns and observed body weight", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "analysis");
  await page.waitForSelector("#an-muscles table.dose tbody tr");
  const rows = await page.$$eval("#an-muscles table.dose tbody tr", r => r.map(x => x.textContent));
  assert(rows[0].startsWith("Quads269"), "quads lead with 269 direct sets: " + rows[0]);
  await page.click("#an-muscles table.dose tbody tr:has-text('Rear delts')");
  await page.waitForSelector("#an-muscles h3:has-text('Rear delts: sets per week')");
  const w = await page.textContent("#an-weight");
  assert(w.includes("58") && w.includes("longest 231 d") && w.includes("65 of 72"), "weight coverage: " + w.slice(0, 200));
  await page.click('#an-weight .seg button:has-text("Weekly average")');
  await page.waitForSelector("#an-weight svg circle");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await test("compare: closest earlier workout by exercise overlap; recap weight needs real weigh-ins", async () => {
  const { page, context, errors } = await open({ files: [FULL, MEAS] });
  await tab(page, "compare");
  await page.waitForSelector(".continuity");
  assert((await page.textContent(".compare")).includes("most similar exercise list: 9 of 12 exercises"), "closest-match explanation");
  await tab(page, "recap");
  await page.click('.recap-head button:has-text("Last 3 months")');
  await page.waitForSelector(".hl:has-text('Body weight, for context')");
  assert((await page.textContent(".hl:has-text('Body weight, for context')")).includes("weigh-ins in the first 14 days"), "endpoint windows explained");
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

for (const width of [375, 390]) await test(`mobile ${width}px: no sideways scroll on any tab; screenshots`, async () => {
  const { page, context, errors } = await open({ viewport: { width, height: 844 } });
  if (width === 390) await page.screenshot({ path: SHOTS + "mobile-landing.png" });
  await page.setInputFiles(".dropzone input[type=file]", [FULL, MEAS]);
  await page.waitForSelector("#odo"); await dismissWelcome(page);
  for (const id of ["s-open", "s-commit", "s-body", "s-lifts", "s-audit"]) {
    await page.evaluate(id => document.getElementById(id).scrollIntoView(), id);
    await page.waitForTimeout(300);
    eq(await over(page), 0, id + " overflow");
  }
  await page.evaluate(() => scrollTo(0, 0));
  if (width === 390) await page.screenshot({ path: SHOTS + "mobile-story.png" });
  for (const t of ["recap", "overview", "exercises", "records", "history", "analysis", "compare"]) {
    await tab(page, t); await page.waitForTimeout(700);
    eq(await over(page), 0, t + " overflow");
    if (width === 390) await page.screenshot({ path: SHOTS + `mobile-${t}.png` });
  }
  eq(errors.length, 0, "page errors: " + errors.join(" | "));
  await context.close();
});

await browser.close();
await server.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} failed` : `\nall ${results.length} passed`);
process.exit(failures ? 1 : 0);
