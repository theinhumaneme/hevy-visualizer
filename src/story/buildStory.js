import { gsap, ScrollTrigger, d3, T, EASE, C, BREAK_LINE_DAYS, seq } from "../lib/motion.js";
import * as H from "../lib/derive.js";
import { fmt, fmtD, fmtM, fmtMs, esc, short, equip, el, $, $$, spaced } from "../lib/format.js";
import { bindTip, hideTip } from "../lib/tip.js";
import { hintHTML } from "../lib/glossary.js";

/* Imperative scene builders. React renders the empty <section>s; buildStory() fills and choreographs them.
   One story is live at a time, so per-build state lives in S. */
const S = { M: null, reduced: false, played: new Set(), source: "", synthetic: false, onReplay: null, title: "" };
const wordsMask = text => text.split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : `<span class="mask"><span>${esc(w)}</span></span>`).join("");
const unitLbl = () => S.M.totals.unit;
const span = r => `${fmtD(r.from, { month: "short", day: "numeric", year: "numeric" })} – ${fmtD(r.to, { month: "short", day: "numeric", year: "numeric" })}`;
const targetNote = st => st.targetChosen ? "your chosen target" : "inferred from your typical active week — change it in Overview";

function hiddenTable(caption, head, rows) {
  return `<div class="sr"><table><caption>${esc(caption)}</caption><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function head(n, eyebrow, title, lede) {
  return `<p class="eyebrow"><i>${String(n).padStart(2, "0")}</i>${esc(eyebrow)}</p><h2 class="h2">${wordsMask(title)}</h2>${lede ? `<div class="lede">${lede}</div>` : ""}`;
}
// Context → data → annotation: every scene opens with the same masked headline beat.
function headIn(tl, sec, at = 0) {
  tl.from($$(".eyebrow", sec), { opacity: 0, y: 8, duration: T.fast, ease: EASE.out }, at)
    .from($$(".h2 .mask>span", sec), { yPercent: 110, duration: T.slow, ease: EASE.out, stagger: T.loose * 0.6 }, at + 0.05)
    .from($$(".lede", sec), { opacity: 0, y: 12, duration: T.base, ease: EASE.out }, at + 0.25);
  return tl;
}

/* ================================================================
   ORCHESTRATION helpers
   ================================================================ */
const live = [];
// Plays a scene's entrance once when it scrolls in. In reduced mode the scene simply crossfades in, fully drawn.
function onEnter(sec, tl, start = "top 62%") {
  tl.pause();
  if (S.played.has(sec.id)) { tl.progress(1); return; }
  if (S.reduced) {
    tl.progress(1);
    const wrap = $(".wrap", sec);
    gsap.set(wrap, { opacity: 0 });
    live.push(ScrollTrigger.create({ trigger: sec, start, once: true, onEnter: () => { S.played.add(sec.id); gsap.to(wrap, { opacity: 1, duration: T.base, ease: "none" }); } }));
    return;
  }
  live.push(ScrollTrigger.create({ trigger: sec, start, once: true, onEnter: () => { S.played.add(sec.id); tl.play(); } }));
}
// Path draw-on helper: returns the length so callers can sync a leading dot.
function prepDraw(path) { const L = path.getTotalLength(); path.style.strokeDasharray = `${L} ${L}`; path.style.strokeDashoffset = L; return L; }

/* ================================================================
   SCENES — one function each. Each builds its DOM and wires its own timeline.
   ================================================================ */

/* 1 — Cold open: one giant number, counted exactly. */
function sceneOpen(M) {
  const sec = $("#s-open"), t = M.totals, U = t.unit;
  const total = Math.round(t.tonnage), str = fmt(total);
  const range = `${S.title ? S.title + " · " : ""}${fmtD(t.first)} — ${fmtD(t.last)}`;
  sec.innerHTML = `<div class="wrap">
    <p class="eyebrow"><i>01</i>${esc(range)}</p>
    <h1 class="sr" id="openTitle">Training story: ${str} ${U} lifted</h1>
    <div class="odo" id="odo" aria-label="${str} ${U} lifted" role="img">${[...str].map(ch => /\d/.test(ch)
      ? `<span class="col" aria-hidden="true" data-d="${ch}"><span class="strip">${Array.from({ length: 30 }, (_, i) => `<span>${i % 10}</span>`).join("")}</span></span>`
      : `<span class="sep" aria-hidden="true">${ch}</span>`).join("")}</div>
    <div class="odo-unit">${esc(U)} · weight lifted${hintHTML("weightLifted")}</div>
    <div class="open-stats">
      <div><b class="num">${fmt(t.sessions)}</b><span class="caption">qualifying sessions${hintHTML("qualifying")}</span></div>
      <div><b class="num">${fmt(t.logged)}</b><span class="caption">logged workouts${hintHTML("logged")}</span></div>
      <div><b class="num">${fmt(t.sets)}</b><span class="caption">working sets${hintHTML("working")}</span></div>
      <div><b class="num">${fmt(t.reps)}</b><span class="caption">reps</span></div>
      <div><b class="num">${fmt(t.prs)}</b><span class="caption">personal records${hintHTML("record")}</span></div>
    </div>
    <p class="purpose">Explore the highlights of your logged training, from consistency to exercise progress.</p>
  </div>
  <div class="cue" aria-hidden="true"><span class="caption">Scroll to explore your training</span><i></i></div>`;
  $("#hudNum").textContent = str; $("#hudUnit").textContent = `${U} · weight lifted`;

  const cols = $$(".odo .col", sec), strips = cols.map(c => $(".strip", c));
  const tl = gsap.timeline();
  if (S.reduced) {
    strips.forEach((s, i) => gsap.set(s, { yPercent: -((20 + +cols[i].dataset.d) / 30) * 100 }));
    gsap.from(sec, { opacity: 0, duration: T.base });
    return;
  }
  tl.from($(".eyebrow", sec), { opacity: 0, y: 8, duration: T.base, ease: EASE.out }, 0.2)
    // Digits roll through two full cycles and land on the exact value. Blur only while moving.
    .fromTo(strips, { yPercent: 0, filter: "blur(6px)" }, {
      yPercent: i => -((20 + +cols[i].dataset.d) / 30) * 100, filter: "blur(0px)",
      duration: T.epic, ease: EASE.out, stagger: 0.07, clearProps: "filter",
    }, 0.35)
    .from($(".odo", sec), { scale: 0.96, transformOrigin: "0% 100%", duration: T.epic, ease: EASE.out }, 0.35)
    .from($(".odo-unit", sec), { opacity: 0, y: 10, duration: T.base, ease: EASE.out }, 0.35 + T.epic * 0.55)
    // hold so the total registers before the supporting numbers arrive
    .from($$(".open-stats > div", sec), { opacity: 0, y: 16, duration: T.base, ease: EASE.out, stagger: T.stagger }, `>+${T.hold}`)
    .from($(".cue", sec), { opacity: 0, duration: T.base }, ">");
  live.push(tl);
}
// Shared element: the hero total shrinks and docks into the HUD once you leave the cold open (FLIP).
function dockHud() {
  const hud = $("#hud"), odo = $("#odo");
  const dockIn = () => {
    if (S.reduced) { gsap.to(hud, { opacity: 1, duration: T.base }); return; }
    const a = odo.getBoundingClientRect(), b = $("#hudNum").getBoundingClientRect();
    const s = a.height / Math.max(b.height, 1);
    gsap.fromTo(hud, { x: a.left - b.left, y: a.top - b.top, scale: s, opacity: 0 },
      { x: 0, y: 0, scale: 1, opacity: 1, duration: T.slow, ease: EASE.out, overwrite: true });
  };
  const dockOut = () => gsap.to(hud, { opacity: 0, duration: T.slow * T.exit, ease: EASE.exit, overwrite: true });
  live.push(ScrollTrigger.create({ trigger: "#s-open", start: "bottom 35%", onEnter: dockIn, onLeaveBack: dockOut }));
}

/* 2 — The commitment: every session lights a fuse across the calendar. */
function sceneCommit(M) {
  const sec = $("#s-commit"), st = M.streak;
  const longestGap = M.blocks.reduce((a, b) => (b.gapBefore > a.gapBefore ? b : a), M.blocks[0]);
  const comebacks = M.blocks.length - 1;
  sec.innerHTML = `<div class="wrap">${head(2, "Consistency", "The Commitment",
    `You logged training on <b>${fmt(M.totals.days)} days</b>. ${comebacks ? `Your log has <b>${comebacks} gap${comebacks === 1 ? "" : "s"}</b> of ${M.RULES.breakDays} days or more; the longest was <b>${fmt(longestGap.gapBefore)} days</b>. Gaps describe this export only — training logged elsewhere isn't visible.` : `No gaps of ${M.RULES.breakDays} days or more in this period.`}`)}
    <div class="fuse-count">
      <div><b class="num" id="fuseDays">0</b><span class="caption">days with logged training</span></div>
      <div><b class="num">${st.current ? fmt(st.current) + " wk" : "–"}</b><span class="caption">${st.isCurrent ? "current streak" : "streak at period end"}${hintHTML("streak")}</span></div>
      <div><b class="num">${fmt(st.longest)} wk</b><span class="caption">longest streak</span></div>
      <div><b class="num">${fmt(M.blocks.length)}</b><span class="caption">training blocks${hintHTML("block")}</span></div>
    </div>
    <div class="heat-wrap" id="heat"></div>
    <div class="heat-legend caption"><span>Working sets per day</span>
      ${[[1, "1–3"], [6, "4–9"], [12, "10–17"], [18, "18+"]].map(([v, l]) => `<i style="background:${seq(v)}"></i><span>${l}</span>`).join("")}
      <i style="background:transparent;border:1.5px solid ${C.accent}"></i><span>current streak</span>
      <span style="color:${C["accent-2"]}">▲ first session after a gap of ${M.RULES.breakDays}+ days</span>
    </div>
    <p class="how-to-read">Each square is a calendar day (Monday at the top); color shows working sets; dark squares have no working sets logged. Streaks count weeks with ${st.target}+ qualifying sessions — ${targetNote(st)}.</p>
    <p class="interact">Hover, tap or focus a day for its workouts.</p>
    ${hiddenTable("Sessions per week", ["Week of", "Sessions", "Working sets"], M.weeks.filter(w => w.sets).map(w => [fmtD(w.start), w.sessions, w.sets]))}
  </div>`;

  const host = $("#heat", sec), W = host.clientWidth;
  const n = M.weeks.length, labelW = 26;
  let step = Math.min(16, Math.floor((W - labelW) / n));
  let perRow = n;
  if (step < 9) { step = 12; perRow = Math.floor((W - labelW) / step); }
  const rows = Math.ceil(n / perRow), cell = step - 3, rowH = 7 * step + 22;
  const svg = el("svg", { viewBox: `0 0 ${W} ${rows * rowH}`, width: W, height: rows * rowH, role: "img",
    "aria-label": `Calendar heatmap: ${M.totals.days} training days between ${fmtD(M.totals.first)} and ${fmtD(M.totals.last)}. Current streak ${st.current} weeks.` });
  host.appendChild(svg);
  const dayMap = new Map(M.days.map(d => [d.day, d]));
  const today = H.startOfDay(M.now);
  const pos = (wi, d) => ({ x: labelW + (wi % perRow) * step, y: Math.floor(wi / perRow) * rowH + 16 + d * step });
  const gEmpty = el("g", {}, svg), gOn = el("g", { style: `filter:drop-shadow(0 0 3px rgba(198,255,61,.35))` }, svg), gAnno = el("g", {}, svg);
  for (let r = 0; r < rows; r++) ["M", "W", "F"].forEach((t, k) => { const tx = el("text", { x: 0, y: r * rowH + 16 + (k * 2) * step + cell - 1 }, gAnno); tx.textContent = t; });
  const on = [];
  let lastMonth = -1, lastEnd = -1e9;   // x where the previous label ends, so "Jul ’26" and "Aug" never touch
  M.weeks.forEach((w, wi) => {
    const m = w.start.getMonth();
    if (m !== lastMonth || wi % perRow === 0) {
      const p = pos(wi, 0);
      lastMonth = m;
      if (wi % perRow === 0 || p.x >= lastEnd) {
        const tx = el("text", { x: p.x, y: p.y - 5 }, gAnno);
        tx.textContent = (m === 0 || wi === 0 || wi % perRow === 0) ? fmtMs(w.start) : w.start.toLocaleDateString("en-US", { month: "short" });
        lastEnd = p.x + (tx.getComputedTextLength() || tx.textContent.length * 6.5) + 8;
      }
    }
    for (let d = 0; d < 7; d++) {
      const date = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + d);
      if (date > today) continue;
      const day = dayMap.get(H.dayKey(date)), p = pos(wi, d);
      if (!day) { el("rect", { x: p.x, y: p.y, width: cell, height: cell, rx: 2, fill: C["seq-0"], opacity: date < M.rangeStart ? 0.35 : 1 }, gEmpty); continue; }
      const r = el("rect", { x: p.x, y: p.y, width: cell, height: cell, rx: 2, fill: seq(day.sets), class: "cell" }, gOn);
      r.__date = date; on.push(r);
      bindTip(r, `<b>${esc(fmtD(date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</b><span>${day.sets} working sets · ${esc([...new Set(day.titles)].join(", "))}</span>`);
    }
  });
  on.sort((a, b) => a.__date - b.__date);

  // comeback markers under the first week of each new block
  const blockMarks = M.blocks.slice(1).map(b => {
    const wi = M.weeks.findIndex(w => H.dayKey(w.start) === H.dayKey(H.weekStart(b.start)));
    const p = pos(wi, 6), g = el("g", {}, gAnno);
    el("path", { d: `M${p.x + cell / 2} ${p.y + cell + 3} l4 6 h-8z`, fill: C["accent-2"] }, g);
    bindTip(g, `<b>Back after ${b.gapBefore} days</b><span>${esc(fmtD(b.start))}</span>`);
    return g;
  });
  // current streak outline, one rect per row segment
  const streakPaths = [];
  if (st.current) {
    const i1 = M.weeks.findIndex(w => H.dayKey(w.start) === H.dayKey(st.currentFrom));
    const i2 = i1 + st.current - 1;
    for (let a = i1; a <= i2;) {
      const b = Math.min(i2, (Math.floor(a / perRow) + 1) * perRow - 1);
      const p1 = pos(a, 0), p2 = pos(b, 6);
      const x = p1.x - 2.5, y = p1.y - 2.5, w = p2.x + cell - p1.x + 5, h = p2.y + cell - p1.y + 5;
      streakPaths.push(el("path", { d: `M${x} ${y}h${w}v${h}h${-w}z`, fill: "none", stroke: C.accent, "stroke-width": 1.5, "stroke-linejoin": "round" }, gAnno));
      a = b + 1;
    }
  }

  const counter = { v: 0 }, out = $("#fuseDays", sec);
  const tl = gsap.timeline();
  headIn(tl, sec, 0);
  tl.addLabel("fuse", 0.4)
    .fromTo(on, { opacity: 0.06, scale: 0.3, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: T.fast, ease: EASE.out, stagger: { each: T.tight * 2 } }, "fuse")
    .to(counter, { v: on.length, duration: on.length * T.tight * 2, ease: "none", onUpdate: () => out.textContent = fmt(Math.round(counter.v)) }, "fuse")
    .from(blockMarks, { opacity: 0, y: 6, duration: T.fast, stagger: T.stagger }, ">-0.1");
  streakPaths.forEach(p => { const L = prepDraw(p); tl.to(p, { strokeDashoffset: 0, duration: T.slow, ease: EASE.draw }, ">-0.05"); p.__L = L; });
  tl.eventCallback("onComplete", () => out.textContent = fmt(on.length));

  if (S.reduced || S.played.has(sec.id)) { tl.progress(1); out.textContent = fmt(on.length); if (S.reduced) onEnter(sec, tl); return; }
  if (sec.offsetHeight > innerHeight) { onEnter(sec, tl, "top 70%"); return; }
  // Pinned + scrubbed: your scroll is the fuse.
  tl.pause();
  live.push(ScrollTrigger.create({
    trigger: sec, start: "top top", end: () => "+=" + Math.round(innerHeight * 1.1), pin: true, scrub: 0.6, animation: tl,
    onLeave: () => S.played.add(sec.id),
  }));
}

/* 3 — The rhythm: a 24-hour clock, one ring per weekday. */
function sceneRhythm(M) {
  const sec = $("#s-rhythm");
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const sessions = M.real.filter(s => s.start >= new Date(+M.totals.last - M.RULES.rhythmWeeks * 7 * H.DAY));
  if (sessions.length < 3) { sec.hidden = true; return; }
  const hourBins = Array(24).fill(0);
  sessions.forEach(s => hourBins[s.start.getHours()]++);
  // peak 3-hour window
  let peak = { h: 0, n: -1 };
  for (let h = 0; h < 24; h++) { const n = hourBins[h] + hourBins[(h + 1) % 24] + hourBins[(h + 2) % 24]; if (n > peak.n) peak = { h, n }; }
  const hh = h => { const x = ((h % 24) + 24) % 24; return `${x % 12 || 12} ${x < 12 ? "AM" : "PM"}`; };
  const best = M.dow.map((d, i) => ({ i, ...d })).filter(d => d.n).sort((a, b) => b.sets / b.n - a.sets / a.n)[0];
  const most = M.dow.map((d, i) => ({ i, ...d })).sort((a, b) => b.n - a.n)[0];
  const maxN = Math.max(1, ...M.dow.map(d => d.n));
  sec.innerHTML = `<div class="wrap">${head(3, "Weekly pattern", "The Rhythm",
    `<b>${sessions.length} qualifying sessions</b> from ${span(M.rhythmRange)} — the latest ${M.RULES.rhythmWeeks} weeks of this range.`)}
    <div class="rhythm">
      <div id="clock"></div>
      <div>
        <p class="big-callout">${peak.n > 0 ? `<em>${hh(peak.h)}–${hh(peak.h + 3)}</em> is your most common start time: ${peak.n} of ${sessions.length} sessions began then.` : "Add more sessions in this range to see a common start time."}</p>
        <div class="dow-bars" role="img" aria-label="Sessions by weekday: ${M.dow.map((d, i) => DOW[i] + " " + d.n).join(", ")}">
          ${M.dow.map((d, i) => `<div class="${most && i === most.i ? "top" : ""}"><span>${DOW[i]}</span><s><u style="transform:scaleX(${d.n / maxN})"></u></s><span class="num" style="text-align:right">${d.n}</span></div>`).join("")}
        </div>
        ${best ? `<p class="note">Biggest sessions land on <b style="color:var(--text-hi)">${["Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays","Sundays"][best.i]}</b> — ${fmt(best.sets / best.n, 1)} working sets on average.</p>` : ""}
      </div>
    </div>
    <p class="how-to-read">Each dot is a session start, placed by clock time; rings are weekdays (Monday innermost, Sunday outermost); petals count sessions by start hour. Times are as exported.</p>
    ${hiddenTable("Sessions by start hour", ["Hour", "Sessions"], hourBins.map((n, h) => [hh(h), n]).filter(r => r[1]))}
  </div>`;

  const cw = $("#clock", sec).clientWidth, size = Math.min(520, cw < 600 ? cw - 56 : cw), c = size / 2;   // phones: room for the 6 AM / 6 PM labels
  const r0 = size * 0.12, ring = size * 0.03, rOut = r0 + 7 * ring + 8;
  const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: "img", style: "overflow:visible;display:block;margin:0 auto",
    "aria-label": `Clock of session start times. Peak window ${hh(peak.h)} to ${hh(peak.h + 3)}.` });
  $("#clock", sec).appendChild(svg);
  const g = el("g", { transform: `translate(${c},${c})` }, svg);
  const ang = h => (h / 24) * Math.PI * 2 - Math.PI / 2;
  for (let d = 0; d < 7; d++) el("circle", { r: r0 + d * ring + ring / 2, fill: "none", stroke: C.line }, g);
  [0, 6, 12, 18].forEach(h => {
    const a = ang(h), R = rOut + size * 0.09 + 22;
    el("line", { x1: Math.cos(a) * (r0 - 6), y1: Math.sin(a) * (r0 - 6), x2: Math.cos(a) * (rOut + 4), y2: Math.sin(a) * (rOut + 4), stroke: C.line }, g);
    const t = el("text", { x: Math.cos(a) * R, y: Math.sin(a) * R + 3, "text-anchor": "middle" }, g); t.textContent = ["Midnight", "6 AM", "Noon", "6 PM"][h / 6];
  });
  DOW.forEach((d, i) => { if (i % 2 === 0 || i === 6) { const t = el("text", { x: 4, y: -(r0 + i * ring + ring / 2) + 3, style: "font-size:8px" }, g); t.textContent = d; } });
  const maxH = Math.max(1, ...hourBins), petalMax = size * 0.09;
  const arc = d3.arc().cornerRadius(2).padAngle(0.025);
  const petals = hourBins.map((n, h) => {
    const p = el("path", { fill: h >= peak.h && h < peak.h + 3 || (peak.h + 3 > 24 && h < (peak.h + 3) % 24) ? C.accent : C.baseline, opacity: n ? 0.9 : 0 }, g);
    p.__o = { r: rOut + 6 }; p.__t = rOut + 6 + (n / maxH) * petalMax; p.__h = h;
    const draw = () => p.setAttribute("d", arc({ innerRadius: rOut + 6, outerRadius: p.__o.r, startAngle: (h / 24) * Math.PI * 2, endAngle: ((h + 1) / 24) * Math.PI * 2 }));
    p.__draw = draw; draw();
    if (n) bindTip(p, `<b>${hh(h)}</b><span>${n} session${n > 1 ? "s" : ""} started</span>`);
    return p;
  });
  const dots = sessions.map(s => {
    const d = (s.start.getDay() + 6) % 7, h = s.start.getHours() + s.start.getMinutes() / 60, a = ang(h), R = r0 + d * ring + ring / 2;
    const dot = el("circle", { cx: Math.cos(a) * R, cy: Math.sin(a) * R, r: Math.max(2.5, ring * 0.32), fill: C.accent, class: "dot" }, g);
    bindTip(dot, `<b>${esc(fmtD(s.start, { weekday: "short", month: "short", day: "numeric" }))} · ${s.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</b><span>${esc(s.title)} · ${s.workSets} sets</span>`);
    return dot;
  });

  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from(g.querySelectorAll("circle:not(.dot), line"), { opacity: 0, duration: T.base, stagger: T.tight * 3 }, 0.2)
    // petals grow outward from the clock face; the data length lands exactly (no overshoot)
    .to(petals.map(p => p.__o), { r: i => petals[i].__t, duration: T.slow, ease: EASE.out, stagger: { each: T.stagger * 0.5, from: "start" },
      onUpdate() { petals.forEach(p => p.__draw()); } }, 0.45)
    .from(dots, { scale: 0, transformOrigin: "50% 50%", duration: T.base, ease: EASE.spring, stagger: { each: T.tight * 3, from: "random" } }, 0.6)
    .from($$(".big-callout, .dow-bars > div, .rhythm .note", sec), { opacity: 0, y: 10, duration: T.base, ease: EASE.out, stagger: T.stagger }, 0.7)
    .from($$(".dow-bars u", sec), { scaleX: 0, duration: T.slow, ease: EASE.draw, stagger: T.stagger }, 0.8);
  onEnter(sec, tl);
}

/* 4 — Where it goes: a muscle map, each muscle colored by its weekly credited sets.
   Shapes are drawn for the figure's left half (x < 100) and mirrored; viewBox 20 0 160 400. */
const BODY = {
  // one outline per half: head, neck, arm and leg, so gaps between muscles read as body, not page
  silhouette: [
    "M100 12 C91 12 85 20 85 31 C85 41 90 48 93 50 L93 56 C84 62 70 63 62 67 C54 71 52 82 53 96 C50 112 48 128 49 144 " +
    "C46 162 44 186 44 204 C42 210 42 220 46 226 C50 230 54 226 54 218 L54 206 C56 190 60 172 62 156 C64 146 66 132 68 116 L73 110 " +
    "C75 132 76 154 75 176 C73 186 72 196 73 206 C72 240 76 270 79 292 C76 316 76 344 81 370 C80 378 79 386 82 390 L96 390 " +
    "C97 384 96 378 95 372 C98 344 99 318 96 298 C98 270 99 240 100 214 Z",
  ],
  front: {
    traps: ["M92 54 C88 59 82 62 74 65 C80 66 86 67 92 67 C93 63 93 58 92 54 Z"],
    sideDelt: ["M67 66 C59 67 55 74 54 84 C54 92 56 98 59 103 L63 100 C62 90 62 78 67 66 Z"],
    frontDelt: ["M68 66 C64 78 63 90 64 101 L69 104 C74 96 78 84 79 74 C77 69 73 66 68 66 Z"],
    chest: ["M99 70 L99 104 C92 109 82 108 77 101 C76 92 77 81 81 73 C87 68 94 68 99 70 Z"],
    biceps: ["M59 106 C64 106 67 114 66 125 C65 134 62 141 57 143 C53 139 51 130 52 119 C53 111 55 106 59 106 Z"],
    forearms: ["M53 148 C59 148 62 156 61 168 C59 182 55 194 53 203 L46 203 C45 190 45 174 47 160 C48 152 50 148 53 148 Z"],
    core: ["M99 110 L99 178 C95 180 92 178 90 174 L89 113 C92 110 96 109 99 110 Z",
      "M87 112 C82 116 79 124 78 136 C78 152 80 166 86 178 L88 175 L88 113 Z"],
    quads: ["M77 198 C72 214 72 246 77 280 C81 289 91 291 95 284 C99 262 99 232 98 212 C92 204 85 199 77 198 Z"],
    calves: ["M86 304 C80 308 77 320 78 336 C79 348 81 358 84 364 L87 362 C86 344 86 322 88 306 Z",
      "M91 306 C96 312 98 326 97 340 C96 350 94 358 92 364 L90 362 C90 344 90 324 91 306 Z"],
  },
  back: {
    back: ["M72 68 C67 75 66 87 70 98 C77 104 86 104 93 100 C91 88 85 76 72 68 Z",
      "M75 104 C74 120 76 137 80 150 C84 162 91 171 99 177 L99 124 C97 116 95 108 93 103 C86 106 80 106 75 104 Z"],
    traps: ["M100 46 C97 53 90 60 72 66 C80 70 86 76 90 86 C93 96 96 108 100 122 Z"],
    rearDelt: ["M68 67 C60 68 55 75 54 85 C54 93 57 99 61 103 C65 93 69 82 73 72 C72 69 70 67 68 67 Z"],
    triceps: ["M60 102 C65 103 67 112 66 124 C65 134 62 141 57 143 C53 139 51 128 52 116 C53 107 56 102 60 102 Z"],
    forearms: ["M53 148 C59 148 62 156 61 168 C59 182 55 194 53 203 L46 203 C45 190 45 174 47 160 C48 152 50 148 53 148 Z"],
    glutes: ["M99 180 C90 178 80 182 76 193 C74 205 80 215 90 217 C95 217 98 214 99 211 Z"],
    hamstrings: ["M77 218 C73 236 74 260 79 283 C83 290 91 290 95 284 C98 263 99 240 98 220 C91 222 84 222 77 218 Z"],
    calves: ["M88 300 C81 302 77 314 78 330 C79 343 83 351 88 352 Z",
      "M89 300 C96 302 99 314 98 328 C97 341 93 349 89 352 Z"],
  },
  // anatomy cues drawn over the fills (non-interactive): ab segments, quad split, spine
  details: {
    front: ["M90 128 L99 128", "M90 145 L99 145", "M90 161 L99 161", "M87 214 C84 236 84 258 87 280"],
    back: ["M100 124 L100 176"],
  },
};
function drawFigure(view, M, host) {
  const svg = el("svg", { viewBox: "32 0 136 400", role: "group", "aria-label": `${view} view: select a muscle to inspect weekly sets` });
  const mirror = "translate(200,0) scale(-1,1)";
  const sil = el("g", { class: "silhouette" }, svg);
  BODY.silhouette.forEach(d => { el("path", { d }, sil); el("path", { d, transform: mirror }, sil); });
  const groups = [];
  for (const [m, shapes] of Object.entries(BODY[view])) {
    const v = M.muscleWeekly[m] || 0;
    const g = el("g", { class: "muscle", "data-m": m, role: "button", tabindex: "0", "aria-pressed": "false" }, svg);
    const base = el("g", { class: "base" }, g), fill = el("g", { class: "fill", fill: v > 0 ? seq(v) : "transparent" }, g);
    for (const d of shapes) for (const tgt of [base, fill]) { el("path", { d }, tgt); el("path", { d, transform: mirror }, tgt); }
    groups.push({ m, g, fill, v });
  }
  const det = el("g", { class: "details", "aria-hidden": "true" }, svg);
  BODY.details[view].forEach(d => { el("path", { d }, det); if (!d.startsWith("M100")) el("path", { d, transform: mirror }, det); });
  host.appendChild(svg);
  return { svg, groups };
}
function sceneBody(M) {
  const sec = $("#s-body"), mw = M.muscleWeekly, N = M.MUSCLES;
  const order = Object.keys(N).sort((a, b) => mw[b] - mw[a]);
  const top = order[0], pp = M.primRecent;
  const maxV = Math.max(10, Math.ceil(Math.max(...order.map(m => mw[m])) / 5) * 5);
  sec.innerHTML = `<div class="wrap">${head(4, "Balance", "Where It Goes",
    `Credited working sets per muscle, per week, from ${span(M.recentRange)} (the latest ${M.recentWeeks} weeks of this range). <b>${esc(N[top])}</b> has the most, with ${fmt(mw[top], 1)} a week.${hintHTML("credit")}`)}
    <div class="body-grid">
      <div class="body-map">
        <div class="body-map-head"><span class="caption">Muscle map</span><span>Front + back</span></div>
        <div class="figures" id="figs"><figure id="figFront"><figcaption class="caption">Front</figcaption></figure><figure id="figBack"><figcaption class="caption">Back</figcaption></figure></div>
        <div class="body-readout" role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="body-scale"><div class="body-scale-title"><span>Weekly credited sets</span><span>More →</span></div>
          <div class="body-scale-ramp" style="background:linear-gradient(to right,${seq(0)} 0%,${seq(4)} ${4 / 18 * 100}%,${seq(10)} ${10 / 18 * 100}%,${seq(18)} 100%)"></div>
          <div class="body-scale-ticks"><span style="left:0">0+</span><span style="left:${4 / 18 * 100}%">4</span><span style="left:${10 / 18 * 100}%">10</span><span style="left:100%">18+</span></div>
          <div class="body-scale-zero"><i></i>No logged sets</div>
        </div>
        <p class="body-map-help">Select a muscle or a row to explore.</p>
      </div>
      <div class="body-ranking">
        <div class="body-ranking-head"><h3>Weekly volume</h3><span>credited sets / week</span></div>
        <div class="body-bar-axis" aria-hidden="true"><span>0</span><span>${fmt(maxV / 2, 1)}</span><span>${fmt(maxV)}</span></div>
        <div class="mbars" id="mbars" role="group" aria-label="Weekly sets by muscle">
          ${order.map(m => `<button type="button" class="mbar" data-m="${m}" aria-pressed="false" aria-label="${esc(N[m])}: ${fmt(mw[m], 1)} credited sets per week"><span>${esc(N[m])}</span><span class="track" aria-hidden="true"><span class="bar" style="width:${mw[m] / maxV * 100}%;background:${mw[m] > 0 ? seq(mw[m]) : C["bg-3"]}"></span></span><span class="mbar-value num">${fmt(mw[m], 1)}</span></button>`).join("")}
        </div>
        <div class="balance">
          ${balRow("Pull", pp.pull, "Push", pp.push)}
          ${balRow("Upper", pp.upper, "Lower", pp.lower)}
          <p class="note" style="margin:0">Push and pull count sets by movement (presses, dips and flies vs rows, pulldowns and pull-ups); upper and lower count each set's main muscle. The split is a description, not a target.</p>
        </div>
      </div>
    </div>
    <p class="how-to-read">Brighter green means more weekly sets. Direct sets count 1; secondary sets count ½. The map shows logged training volume, not muscle size or recovery. Colors cap at 18; values show the full amount.</p>
    ${hiddenTable("Working sets per week by muscle", ["Muscle", "Sets per week"], order.map(m => [N[m], fmt(mw[m], 1)]))}
  </div>`;
  function balRow(a, x, b, y) {
    const t = Math.max(1, x + y);
    return `<div class="bal-row" role="img" aria-label="${a} ${x} sets versus ${b} ${y} sets"><div class="bal-labels"><span><b>${a}</b> ${fmt(x)} sets · ${fmt(x / t * 100)}%</span><span>${fmt(y / t * 100)}% · ${fmt(y)} sets <b>${b}</b></span></div>
      <div class="bal-track"><i class="l" style="width:${x / t * 100}%"></i><i class="r" style="width:${y / t * 100}%"></i><em></em></div></div>`;
  }
  const F = drawFigure("front", M, $("#figFront", sec)), B = drawFigure("back", M, $("#figBack", sec));
  $$("figure", sec).forEach(f => f.appendChild($("figcaption", f)));
  const all = [...F.groups, ...B.groups];
  let selected = top;
  const marks = $$(".muscle, .mbar", sec);
  const highlight = m => marks.forEach(x => x.classList.toggle("is-highlighted", x.dataset.m === m));
  const select = m => {
    selected = m;
    marks.forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === m)));
    highlight(m);
    const v = mw[m] || 0;
    const rank = order.filter(key => mw[key] > v).length + 1;
    $(".body-readout", sec).innerHTML = `<div><span class="caption">Selected muscle</span><strong>${esc(N[m])}</strong><span>${v > 0 ? `#${rank} of ${order.length} by weekly volume` : "No sets logged in this period"}</span></div><div class="body-readout-value"><b class="num">${fmt(v, 1)}</b><span>credited sets / week</span></div>`;
  };
  all.forEach(({ m, g, v }) => {
    g.setAttribute("aria-label", `${N[m]}: ${fmt(v, 1)} credited sets per week`);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(m); } });
  });
  marks.forEach(mark => {
    mark.addEventListener("click", () => select(mark.dataset.m));
    for (const [on, off] of [["pointerenter", "pointerleave"], ["focus", "blur"]]) {
      mark.addEventListener(on, () => highlight(mark.dataset.m));
      mark.addEventListener(off, () => highlight(selected));
    }
  });
  select(top);

  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from($$("figure", sec), { opacity: 0, y: 20, duration: T.slow, ease: EASE.out, stagger: T.loose }, 0.2);
  // muscles light up busiest first, so the eye lands on where the work went
  [...all].sort((a, b) => b.v - a.v).forEach((x, i) => tl.from(x.fill, { opacity: 0, duration: T.slow, ease: EASE.out }, 0.5 + Math.min(i, 10) * T.stagger));
  tl.from($$(".mbar", sec), { opacity: 0, x: -10, duration: T.base, ease: EASE.out, stagger: T.stagger }, 0.6)
    .from($$(".mbar .bar", sec), { scaleX: 0, duration: T.slow, ease: EASE.draw, stagger: T.stagger }, 0.7)
    .from($$(".bal-track i.l", sec), { scaleX: 0, duration: T.slow, ease: EASE.draw, stagger: T.loose }, 1.2)
    .from($$(".bal-track i.r", sec), { scaleX: 0, duration: T.slow, ease: EASE.draw, stagger: T.loose }, 1.2)
    .from($$(".bal-labels, .balance .note", sec), { opacity: 0, duration: T.base, stagger: T.stagger }, 1.3);
  onEnter(sec, tl);
}

/* 5 — The lifts: top sets drawn on, PRs pop. */
function liftSeries(E) {
  const h = E.hist.filter(x => x.kind === E.kind);
  return h.map(x => ({ date: x.date, v: x.top, reps: x.topReps, pr: x.pr, sets: x.sets.filter(s => E.kind === "loaded" ? s.loaded : s.reps > 0) }));
}
function linePath(pts, x, y) {
  let d = "", prev = null;
  for (const p of pts) {
    d += (!prev || (p.date - prev.date) / H.DAY > BREAK_LINE_DAYS ? "M" : "L") + x(p.date).toFixed(1) + " " + y(p.v).toFixed(1);
    prev = p;
  }
  return d;
}
function sceneLifts(M) {
  const sec = $("#s-lifts"), U = unitLbl();
  const lifts = M.lifts;
  if (!lifts.length) { sec.hidden = true; return; }
  const lowConf = M.audit.lowConfShare;
  sec.innerHTML = `<div class="wrap">${head(5, "Progression", "The Lifts",
    `Your ${lifts.length} most-trained exercises. The line is your <b>top set</b>${hintHTML("topSet")} each session; grey dots are every working set; amber dots are personal records. ${lowConf > 0.5 ? `Most of your sets are 11+ reps, where estimated one-rep maxes are unreliable, so these charts show the weight you actually lifted.` : ""} For assisted exercises the chart is flipped: <b>higher means less machine help</b>.`)}
    <div class="lifts" id="liftGrid">${lifts.map((E, i) => {
      const asst = E.kind === "assisted", d = E.lastTop - E.firstTop;
      const deltaTxt = asst ? (d < 0 ? `−${fmt(-d, 1)} ${U} help since ${fmtM(E.firstDate)}` : d > 0 ? `+${fmt(d, 1)} ${U} help vs ${fmtM(E.firstDate)}` : `same as ${fmtM(E.firstDate)}`)
        : (d > 0 ? `+${fmt(d, 1)} ${U} since ${fmtM(E.firstDate)}` : d < 0 ? `${fmt(d, 1)} ${U} vs ${fmtM(E.firstDate)}` : `same as ${fmtM(E.firstDate)}`);
      const good = asst ? d < 0 : d > 0;
      return `<article class="lift card" data-i="${i}">
        <h3><span>${esc(short(E.ex))}</span><small>${esc(asst ? "assisted" : equip(E.ex) || "loaded")}</small></h3>
        <div class="val"><b class="num">${fmt(E.lastTop, 1)}</b><span class="mono" style="color:var(--text-mid)">${U}${asst ? " help" : ""} · latest</span></div>
        <div class="val"><span class="${good ? "" : "dim"}">${esc(deltaTxt)}</span></div>
        <div class="chart"></div>
        <div class="axis-note"></div>
      </article>`; }).join("")}</div>
    ${hiddenTable("Top working set per session", ["Lift", "Date", "Top set (" + U + ")", "Reps"], lifts.flatMap(E => liftSeries(E).map(p => [E.ex, fmtD(p.date), fmt(p.v, 1), p.reps || ""])))}
  </div>`;

  const tl = gsap.timeline();
  headIn(tl, sec);
  const cards = $$(".lift", sec);
  tl.from(cards, { opacity: 0, y: 24, duration: T.base, ease: EASE.out, stagger: T.loose }, 0.25);
  cards.forEach((card, i) => {
    const E = lifts[i], pts = liftSeries(E), asst = E.kind === "assisted";
    const host = $(".chart", card), W = host.clientWidth, Hh = 132, m = { t: 10, r: 10, b: 18, l: 30 };
    const all = pts.flatMap(p => p.sets.map(s => s.w || 0)).concat(pts.map(p => p.v));
    const lo = d3.min(all), hi = d3.max(all), pad = Math.max(2, (hi - lo) * 0.12);
    const x = d3.scaleTime().domain(d3.extent(pts, p => p.date)).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([Math.max(0, lo - pad), hi + pad]).range(asst ? [m.t, Hh - m.b] : [Hh - m.b, m.t]);
    const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, height: Hh, role: "img",
      "aria-label": `${E.ex}: top set from ${fmt(E.firstTop, 1)} to ${fmt(E.lastTop, 1)} ${U} over ${pts.length} sessions.` }, host);
    y.ticks(3).forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: C.line }, svg); const tx = el("text", { x: m.l - 6, y: y(t) + 3, "text-anchor": "end" }, svg); tx.textContent = fmt(t); });
    [pts[0].date, pts[pts.length - 1].date].forEach((d, k) => { const tx = el("text", { x: x(d), y: Hh - 4, "text-anchor": k ? "end" : "start" }, svg); tx.textContent = fmtMs(d); });
    const dots = [];
    pts.forEach(p => p.sets.forEach(s => dots.push(el("circle", { cx: x(p.date), cy: y(s.w || 0), r: 2.2, fill: C.baseline, opacity: 0.5 }, svg))));
    const path = el("path", { d: linePath(pts, x, y), fill: "none", stroke: C.accent, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    const prs = pts.filter(p => p.pr).map(p => {
      const g = el("g", {}, svg);
      const ring = el("circle", { cx: x(p.date), cy: y(p.v), r: 3.5, fill: "none", stroke: C.record, "stroke-width": 1.5, opacity: 0 }, g);
      const dot = el("circle", { cx: x(p.date), cy: y(p.v), r: 4, fill: C.record, stroke: C["bg-1"], "stroke-width": 1.5 }, g);
      bindTip(dot, `<b>PR · ${esc(fmtD(p.date))}</b><span>${fmt(p.v, 1)} ${U}${asst ? " assistance" : ""} × ${p.reps}</span>`);
      return { ring, dot, t: (p.date - pts[0].date) / Math.max(1, pts[pts.length - 1].date - pts[0].date) };
    });
    const lead = el("circle", { r: 4, fill: C["text-hi"], opacity: 0 }, svg);
    $(".axis-note", card).textContent = `${asst ? "Machine assistance, flipped (higher = less help)" : "Top set"} · axis shows ${fmt(y.domain()[0])}–${fmt(y.domain()[1])} ${U}, not from zero`;
    const L = prepDraw(path), at = 0.4 + i * T.loose;
    const prog = { p: 0 };
    tl.from(dots, { opacity: 0, duration: T.base, stagger: T.tight * 0.5 }, at)
      .set(lead, { opacity: 1 }, at + 0.15)
      // the leading dot rides the tip of the line while it draws
      .to(prog, { p: 1, duration: T.hero, ease: EASE.draw, onUpdate() {
        path.style.strokeDashoffset = L * (1 - prog.p);
        const pt = path.getPointAtLength(L * prog.p); lead.setAttribute("cx", pt.x); lead.setAttribute("cy", pt.y);
      } }, at + 0.15)
      .to(lead, { opacity: 0, duration: T.fast }, ">");
    prs.forEach(pr => {
      const when = at + 0.15 + T.hero * Math.min(1, pr.t * 0.75 + 0.05);
      tl.from(pr.dot, { scale: 0, transformOrigin: "50% 50%", duration: T.base, ease: EASE.bouncy }, when)
        .fromTo(pr.ring, { attr: { r: 3.5 }, opacity: 0.9 }, { attr: { r: 14 }, opacity: 0, duration: T.slow, ease: EASE.out }, when);
    });
    bindTip(svg, () => `<b>${esc(E.ex)}</b><span>${pts.length} sessions · best ${fmt(E.best, 1)} ${U}${asst ? " assistance" : ""}</span>`);
  });
  onEnter(sec, tl, "top 55%");
}

/* 6 — New ground: the PR wall. */
const PR_SHORT = { weight: "Heaviest", e1rm: "Est. 1RM", reps: "Rep PR", volume: "Volume", assist: "Less help", bwreps: "Most reps" };
const PR_LABEL = { weight: "Heaviest set", e1rm: "Best est. 1RM", reps: "Rep PR", volume: "Best session volume", assist: "Least assistance", bwreps: "Most reps" };
function notablePRs(M) {
  const imp = E => E.kind === "assisted" ? (E.firstTop - E.best) / Math.max(E.firstTop, 1) : (E.best - E.firstTop) / Math.max(E.firstTop, 1);
  const hero = [...M.lifts].sort((a, b) => imp(b) - imp(a))[0];
  const rank = { weight: 0, assist: 0, reps: 1, bwreps: 1, e1rm: 2, volume: 3 };
  const byEx = new Map();
  for (const p of M.prs) {
    if (hero && p.ex === hero.ex) continue;
    const cur = byEx.get(p.ex);
    if (!cur || rank[p.type] < rank[cur.type] || (rank[p.type] === rank[cur.type] && p.date >= cur.date)) byEx.set(p.ex, p);
  }
  const rest = [...byEx.values()].sort((a, b) => b.date - a.date).slice(0, innerWidth < 560 ? 4 : 7);
  return { hero: hero && imp(hero) > 0 ? hero : null, rest };
}
function prValue(p, U) {
  if (p.type === "reps") return `<s>${p.prev}</s>${p.v} reps<u>@ ${fmt(p.w, 1)} ${U}</u>`;
  if (p.type === "bwreps") return `<s>${p.prev}</s>${p.v} reps`;
  if (p.type === "volume") return `<s>${fmt(p.prev)}</s>${fmt(p.v)}<u>${U}</u>`;
  if (p.type === "assist") return `<s>${fmt(p.prev, 1)}</s>${fmt(p.v, 1)}<u>${U} help</u>`;
  return `<s>${fmt(p.prev, 1)}</s>${fmt(p.v, 1)}<u>${U}${p.type === "e1rm" ? " est." : ""}</u>`;
}
function scenePRs(M) {
  if (!M.prs.length) { $("#s-prs").hidden = true; return; }
  const sec = $("#s-prs"), U = unitLbl(), { hero, rest } = notablePRs(M);
  const span = [M.totals.first, M.totals.last];
  sec.innerHTML = `<div class="wrap">${head(6, "Celebration", "New Ground",
    `<b>${fmt(M.prs.length)} personal records</b>${hintHTML("record")} in this period — heavier sets, more reps at the same weight, less assistance. Each is a new best against earlier entries in your imported history; one workout can set several. Each tick below is one.`)}
    <div class="pr-strip" id="prStrip"></div>
    <div class="pr-cards">
      ${hero ? (() => { const asst = hero.kind === "assisted";
        return `<article class="pr card hero"><canvas aria-hidden="true"></canvas><div><div class="t"><span>Largest top-set change</span><time>${esc(fmtM(hero.firstDate))} → ${esc(fmtM(hero.lastDate))}</time></div>
        <h4>${esc(short(hero.ex))}</h4></div>
        <div><div class="v num"><s>${fmt(hero.firstTop, 1)}</s>${fmt(hero.best, 1)}<u>${U}${asst ? " assistance" : " top set"}</u></div>
        <p>${asst ? `<b style="color:var(--text-hi)">${fmt(hero.firstTop - hero.best, 1)} ${U} less machine help</b> at your best than in your first session in this range.` : `Your best top set is <b style="color:var(--text-hi)">${fmt((hero.best / hero.firstTop - 1) * 100)}%</b> above your first session in this range (${hero.sessions} sessions). Among your most-trained exercises, this is the largest change.`}</p></div></article>`; })() : ""}
      ${rest.map(p => `<article class="pr card"><div class="t"><span>${esc(PR_LABEL[p.type])}</span><time>${esc(fmtD(p.date, { month: "short", day: "numeric" }))}</time></div>
        <h4>${esc(short(p.ex))}</h4><div class="v num">${prValue(p, U)}</div></article>`).join("")}
    </div>
    ${hiddenTable("All personal records", ["Date", "Exercise", "Type", "Before", "After"], M.prs.map(p => [fmtD(p.date), p.ex, PR_LABEL[p.type], fmt(p.prev, 1), fmt(p.v, 1)]))}
  </div>`;

  // timeline strip: every PR as a tick, rows by type
  const host = $("#prStrip", sec), W = host.clientWidth, types = ["weight", "assist", "reps", "bwreps", "e1rm", "volume"].filter(t => M.prs.some(p => p.type === t));
  const Hh = types.length * 14 + 22, x = d3.scaleTime().domain(span).range([72, W - 6]);
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": `Timeline of ${M.prs.length} personal records.` }, host);
  types.forEach((t, k) => { const tx = el("text", { x: 0, y: k * 14 + 10 }, svg); tx.textContent = PR_SHORT[t]; el("line", { x1: 72, x2: W - 6, y1: k * 14 + 7, y2: k * 14 + 7, stroke: C.line }, svg); });
  spaced(x.ticks(6), x, 56, W - 28).forEach(d => { const tx = el("text", { x: x(d), y: Hh - 2, "text-anchor": x(d) > W - 28 ? "end" : "middle" }, svg); tx.textContent = fmtMs(d); });   // keep the last label inside the edge
  const ticks = M.prs.map(p => { const k = types.indexOf(p.type), r = el("rect", { x: x(p.date) - 1, y: k * 14 + 1, width: 2.5, height: 12, rx: 1, fill: C.record, opacity: p.type === "weight" || p.type === "assist" ? 1 : 0.6 }, svg);
    bindTip(r, `<b>${esc(p.ex)}</b><span>${esc(PR_LABEL[p.type])} · ${esc(fmtD(p.date))}</span>`); return r; });

  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from(ticks, { scaleY: 0, transformOrigin: "50% 100%", duration: T.fast, ease: EASE.out, stagger: T.tight }, 0.3);
  const heroCard = $(".pr.hero", sec), cards = $$(".pr:not(.hero)", sec);
  if (heroCard) {
    tl.from(heroCard, { rotationX: -70, opacity: 0, transformPerspective: 900, duration: T.slow, ease: EASE.out }, ">-0.2")
      .from($(".v", heroCard), { scale: 0.85, transformOrigin: "0% 100%", duration: T.slow, ease: EASE.bouncy }, "<0.15")
      .add(() => burst($("canvas", heroCard)), "<0.1")
      .to({}, { duration: T.hold });   // the biggest PR gets the room to itself
  }
  tl.from(cards, { rotationX: -80, opacity: 0, y: 20, transformPerspective: 900, duration: T.base, ease: EASE.out, stagger: T.loose }, ">");
  onEnter(sec, tl, "top 55%");
}
// Ring-burst shimmer for the hero PR: pooled canvas particles, ≤120, one shot.
function burst(canvas) {
  if (S.reduced || !canvas) return;
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const N = 110, P = [];
  const ox = r.width * 0.3, oy = r.height * 0.7;
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4.5;
    P.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, s: 1 + Math.random() * 2, c: Math.random() < 0.7 ? C.record : C["text-hi"] }); }
  let raf;
  const tick = () => {
    ctx.clearRect(0, 0, r.width, r.height);
    let alive = 0;
    for (const p of P) {
      if (p.life <= 0) continue;
      alive++; p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.985; p.life -= 0.012;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    if (alive) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, r.width, r.height);
  };
  cancelAnimationFrame(raf); tick();
}

/* 7 — Your style: rep-range mix, month by month. */
function sceneReps(M) {
  const sec = $("#s-reps"), RR = M.RR.map(r => r[0]), months = M.repMonths;
  if (months.length < 2) { sec.hidden = true; return; }
  const total = H.sum(M.repTotals), share = M.repTotals.map(v => v / Math.max(1, total));
  const domI = share.indexOf(Math.max(...share));
  const COLORS = [C["series-3"], C["series-1"], C["series-2"], C["series-4"]];   // ordinal rep bands; amber stays reserved for records
  sec.innerHTML = `<div class="wrap">${head(7, "Identity", "Your Style",
    `<b>${fmt(share[domI] * 100)}%</b> of your sets live in the ${RR[domI]} rep range${M.repMode && M.repMode.share > 0.3 ? ` — and ${fmt(M.repMode.share * 100)}% are exactly <b>${M.repMode.reps} reps</b>` : ""}. ${["Mostly heavy, low-rep sets.", "Mostly moderate-rep sets.", "Mostly higher-rep sets.", "Mostly very high-rep sets."][domI]}`)}
    <div class="seg" role="group" aria-label="Scale"><button type="button" aria-pressed="true" data-mode="share">Share of sets</button><button type="button" aria-pressed="false" data-mode="sets">Set count</button></div>
    <div id="stream"></div>
    <p class="how-to-read">Each band is the share of working sets in one rep range, ${M.repByWeek ? "week" : "month"} by ${M.repByWeek ? "week" : "month"}. Switch to set count to see totals.</p>
    ${hiddenTable("Sets by rep range per month", ["Month", ...RR], months.map(m => [fmtM(m.date), ...m.counts]))}
  </div>`;
  const host = $("#stream", sec), W = host.clientWidth, Hh = Math.min(320, Math.max(220, W * 0.36)), m = { t: 10, r: innerWidth < 600 ? 50 : 70, b: 22, l: 44 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img",
    "aria-label": `Rep ranges by month. ${RR.map((r, i) => r + ": " + fmt(share[i] * 100) + "%").join(", ")}.` }, host);
  const data = months.map(mo => Object.fromEntries([["date", mo.date], ...RR.map((r, i) => [r, mo.counts[i]])]));
  const x = d3.scalePoint().domain(months.map(mo => mo.key)).range([m.l, W - m.r]).padding(0.1);
  const stackShare = d3.stack().keys(RR).offset(d3.stackOffsetExpand)(data);
  const stackSets = d3.stack().keys(RR)(data);
  const yShare = d3.scaleLinear().domain([0, 1]).range([Hh - m.b, m.t]);
  const ySets = d3.scaleLinear().domain([0, d3.max(months, mo => mo.total)]).nice().range([Hh - m.b, m.t]);
  const area = (yS) => d3.area().x((d, i) => x(months[i].key)).y0(d => yS(d[0])).y1(d => yS(d[1])).curve(d3.curveMonotoneX);
  const clipId = "streamClip";
  const cr = el("rect", { x: 0, y: 0, width: 0, height: Hh }, el("clipPath", { id: clipId }, el("defs", {}, svg)));
  const gAxis = el("g", {}, svg);
  const g = el("g", { "clip-path": `url(#${clipId})` }, svg);
  const paths = stackShare.map((s, i) => { const p = el("path", { d: area(yShare)(s), fill: COLORS[i], opacity: 0.88 }, g);
    bindTip(p, () => `<b>${RR[i]} reps</b><span>${fmt(M.repTotals[i])} sets · ${fmt(share[i] * 100)}% overall</span>`); return p; });
  const labels = stackShare.map((s, i) => { const t = el("text", { class: "lbl", x: W - m.r + 6, "dominant-baseline": "middle", style: `fill:${COLORS[i]}` }, svg); t.textContent = RR[i]; return t; });
  const step = Math.max(1, Math.ceil(months.length / (W / 70)));
  months.forEach((mo, i) => { if (i % step === 0 || i === months.length - 1) { const t = el("text", { x: x(mo.key), y: Hh - 4, "text-anchor": "middle" }, svg); t.textContent = M.repByWeek ? fmtD(mo.date, { month: "short", day: "numeric" }) : fmtMs(mo.date); } });
  const drawAxis = (yS, isShare) => {
    gAxis.innerHTML = "";
    yS.ticks(4).forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: yS(t), y2: yS(t), stroke: C.line }, gAxis); const tx = el("text", { x: m.l - 6, y: yS(t) + 3, "text-anchor": "end" }, gAxis); tx.textContent = isShare ? fmt(t * 100) + "%" : fmt(t); });
  };
  const placeLabels = (st, yS) => {
    // direct labels at the last month, nudged apart so they never overlap
    const last = months.length - 1, ys = st.map(s => yS((s[last][0] + s[last][1]) / 2));
    const order = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < order.length; k++) if (order[k][0] - order[k - 1][0] < 13) order[k][0] = order[k - 1][0] + 13;
    order.forEach(([y, i]) => labels[i].setAttribute("y", y));
  };
  drawAxis(yShare, true); placeLabels(stackShare, yShare);
  const setMode = mode => {
    $$(".seg button", sec).forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode));
    const isShare = mode === "share", st = isShare ? stackShare : stackSets, yS = isShare ? yShare : ySets;
    drawAxis(yS, isShare); placeLabels(st, yS);
    // streams morph between encodings (same point count, so d3 interpolates the path cleanly)
    paths.forEach((p, i) => d3.select(p).transition().duration(S.reduced ? 0 : T.slow * 1000).ease(t => gsap.parseEase(EASE.morph)(t)).attr("d", area(yS)(st[i])));
  };
  $$(".seg button", sec).forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from($(".seg", sec), { opacity: 0, y: 8, duration: T.base, ease: EASE.out }, 0.3)
    .to(cr, { attr: { width: W }, duration: T.hero * 1.4, ease: EASE.draw }, 0.4)
    .from(labels, { opacity: 0, x: -6, duration: T.base, ease: EASE.out, stagger: T.stagger }, ">-0.3");
  if (S.reduced || S.played.has(sec.id)) cr.setAttribute("width", W);
  onEnter(sec, tl);
}

/* 8 — Time well spent: duration vs. work. */
function sceneEff(M) {
  const sec = $("#s-eff"), U = unitLbl(), pts = M.density;
  if (pts.length < 5) { sec.hidden = true; return; }
  sec.hidden = false;
  const half = Math.floor(pts.length / 2);
  const early = H.median(pts.slice(0, half).map(s => s.density)), late = H.median(pts.slice(half).map(s => s.density));
  const r = M.lin ? M.lin.r : 0;
  const densest = pts.reduce((a, b) => (b.density > a.density ? b : a));
  const story = Math.abs(r) < 0.25 ? "Longer sessions don't mean more logged volume — your volume barely tracks session length."
    : r > 0 ? "More time, more work: your volume rises with session length." : "Your shortest sessions carry the most work.";
  sec.innerHTML = `<div class="wrap">${head(8, "Session length", "Session length and training volume", esc(story) + ` Volume per minute${hintHTML("perMinute")} measures logged volume and recorded time, not workout quality.`)}
    <div class="eff-stats">
      <div><b class="num">${fmt(H.median(pts.map(s => s.minutes)))} min</b><span class="caption">median session</span></div>
      <div><b class="num">${fmt(H.median(pts.map(s => s.density)))}</b><span class="caption">${U} per minute (median)</span></div>
      <div><b class="num" style="color:${late >= early ? C.accent : C["text-hi"]}">${late >= early ? "+" : ""}${fmt((late / early - 1) * 100)}%</b><span class="caption">volume per minute, recent half vs earlier half</span></div>
    </div>
    <div id="scatter"></div>
    <p class="how-to-read">Each dot is a session: across is its logged length, up is its weight lifted. Grey dots are older, green ones more recent; the line is the overall trend.</p>
    <p class="note">${fmt(pts.length)} sessions with a usable logged duration. ${fmt(M.audit.shortDur)} sessions with a flagged duration (under ${M.RULES.minValidMinutes} or over ${M.RULES.maxValidMinutes} min) are left out here but still count everywhere else.</p>
  </div>`;
  const host = $("#scatter", sec), W = host.clientWidth, Hh = Math.min(360, Math.max(240, W * 0.42)), m = { t: 30, r: 14, b: 32, l: 56 };
  const x = d3.scaleLinear().domain([0, d3.max(pts, s => s.minutes)]).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(pts, s => s.tonnage)]).nice().range([Hh - m.b, m.t]);
  const t0 = +pts[0].start, t1 = +pts[pts.length - 1].start;
  const col = d3.scaleLinear().domain([t0, t1]).range([C["text-lo"], C.accent]);
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img",
    "aria-label": `Scatter of ${pts.length} sessions: duration versus ${U} lifted. Correlation ${fmt(r, 2)}.` }, host);
  y.ticks(4).forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: C.line }, svg); const tx = el("text", { x: m.l - 6, y: y(t) + 3, "text-anchor": "end" }, svg); tx.textContent = fmt(t); });
  x.ticks(6).forEach(t => { const tx = el("text", { x: x(t), y: Hh - 16, "text-anchor": "middle" }, svg); tx.textContent = t; });
  const xl = el("text", { x: W - m.r, y: Hh - 1, "text-anchor": "end" }, svg); xl.textContent = "minutes →";
  const yl = el("text", { x: m.l - 6, y: m.t - 16, "text-anchor": "end" }, svg); yl.textContent = U;   // above the top tick, not on it
  const dots = pts.map(s => { const c = el("circle", { cx: x(s.minutes), cy: y(s.tonnage), r: 4.5, fill: col(+s.start), opacity: 0.9 }, svg);
    bindTip(c, `<b>${esc(fmtD(s.start))} · ${esc(s.title)}</b><span>${fmt(s.minutes)} min · ${fmt(s.tonnage)} ${U} · ${fmt(s.density)} ${U}/min</span>`); return c; });
  let trend = null;
  if (M.lin) {
    const [a, b] = x.domain(), clampY = v => Math.max(0, v);
    trend = el("path", { d: `M${x(a)} ${y(clampY(M.lin.a + M.lin.b * a))}L${x(b)} ${y(clampY(M.lin.a + M.lin.b * b))}`, stroke: C["text-hi"], "stroke-width": 1.5, "stroke-dasharray": "0", fill: "none", opacity: 0.7 }, svg);
  }
  const ann = el("g", {}, svg), ax = x(densest.minutes), ay = y(densest.tonnage);
  el("circle", { cx: ax, cy: ay, r: 9, fill: "none", stroke: C.accent }, ann);
  const at = el("text", { class: "lbl", x: ax + (ax > W * 0.6 ? -14 : 14), y: ay + 4, "text-anchor": ax > W * 0.6 ? "end" : "start" }, ann);   // beside the ring, clear of the legend
  at.textContent = `Densest: ${fmt(densest.density)} ${U}/min`;
  const lg = el("g", { transform: `translate(${m.l + 8},${m.t - 20})` }, svg);   // in the top margin, beside the unit
  el("circle", { cx: 4, cy: 0, r: 4, fill: C["text-lo"] }, lg); el("text", { x: 12, y: 3 }, lg).textContent = "older";
  el("circle", { cx: 58, cy: 0, r: 4, fill: C.accent }, lg); el("text", { x: 66, y: 3 }, lg).textContent = "recent";

  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from($$(".eff-stats > div", sec), { opacity: 0, y: 12, duration: T.base, ease: EASE.out, stagger: T.stagger }, 0.3)
    // points fall in under gravity and land exactly on their values
    .from(dots, { attr: { cy: m.t - 20 }, opacity: 0, duration: T.slow, ease: EASE.fall, stagger: T.tight * 2 }, 0.5);
  if (trend) { const L = prepDraw(trend); tl.to(trend, { strokeDashoffset: 0, duration: T.slow, ease: EASE.draw }, ">"); }
  tl.from(ann, { opacity: 0, duration: T.base }, ">");
  onEnter(sec, tl);
}

/* 8b — For context: the scale, only when weigh-ins are loaded. */
function sceneScale(M) {
  const sec = $("#s-scale");
  const bw_all = M.bw;
  const bw = M.bw.filter(b => b.date >= new Date(+M.totals.first - 30 * H.DAY));
  if (bw.length < 3) { sec.hidden = true; sec.innerHTML = ""; return; }
  sec.hidden = false;
  const a = bw[0], b = bw[bw.length - 1], U = M.totals.unit;
  sec.innerHTML = `<div class="wrap">${head(9, "Context", "The Scale, Alongside",
    `${bw.length} recorded weigh-ins, from <b>${fmt(a.w, 1)} ${U}</b> (${esc(fmtM(a.date))}) to <b>${fmt(b.w, 1)} ${U}</b> (${esc(fmtM(b.date))}), shown against your weekly working sets. Scale weight can't tell muscle from water or fat. ${(M.measureCols || []).some(c => /waist|abdomen|fat/.test(c)) ? "Your measurements include waist or body-fat entries; they aren't charted here yet." : "Your measurements file has no waist or body-fat entries."}`)}
    <div id="scaleChart"></div>
    ${hiddenTable("Weigh-ins", ["Date", U], bw.map(x => [fmtD(x.date), fmt(x.w, 1)]))}
  </div>`;
  const host = $("#scaleChart", sec), W = host.clientWidth, Hh = Math.min(340, Math.max(240, W * 0.4)), m = { t: 22, r: 14, b: 26, l: 46 }, barH = Hh * 0.28;
  const x = d3.scaleTime().domain([d3.min([M.totals.first, a.date]), d3.max([M.now, b.date])]).range([m.l, W - m.r]);
  const lo = d3.min(bw, d => d.w), hi = d3.max(bw, d => d.w), pad = (hi - lo) * 0.15 + 1;
  const y = d3.scaleLinear().domain([lo - pad, hi + pad]).nice().range([Hh - m.b - barH - 14, m.t]);
  const yb = d3.scaleLinear().domain([0, d3.max(M.weeks, w => w.sets) || 1]).range([0, barH]);
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": `Bodyweight from ${fmt(a.w, 1)} to ${fmt(b.w, 1)} ${U}, with weekly working sets as bars.` }, host);
  y.ticks(4).forEach(t => { el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: C.line }, svg); const tx = el("text", { x: m.l - 6, y: y(t) + 3, "text-anchor": "end" }, svg); tx.textContent = fmt(t); });
  const bw_ = Math.max(1.5, (x(new Date(+M.totals.first + 7 * H.DAY)) - x(M.totals.first)) - 1);
  const bars = M.weeks.filter(w => w.sets).map(w => el("rect", { x: x(w.start), y: Hh - m.b - yb(w.sets), width: bw_, height: yb(w.sets), fill: C["series-1"], opacity: 0.4 }, svg));
  const bl = el("text", { x: m.l, y: Hh - m.b - barH - 2 }, svg); bl.textContent = "weekly working sets (from 0)";
  spaced(x.ticks(6), x, 56, W - 28).forEach(d => { const tx = el("text", { x: x(d), y: Hh - 6, "text-anchor": x(d) > W - 28 ? "end" : "middle" }, svg); tx.textContent = fmtMs(d); });
  const line = d3.line().x(d => x(d.date)).y(d => y(d.w)).curve(d3.curveMonotoneX);
  // solid where weigh-ins are close together; a faint dashed bridge across long gaps with no data
  el("path", { d: d3.line().x(d => x(d.date)).y(d => y(d.w))(bw), fill: "none", stroke: C["text-lo"], "stroke-width": 1, "stroke-dasharray": "3 4" }, svg);
  const segs = []; bw.forEach((d, i) => { if (!i || (d.date - bw[i - 1].date) / H.DAY > BREAK_LINE_DAYS) segs.push([]); segs[segs.length - 1].push(d); });
  const p = el("path", { d: segs.map(sg => sg.length > 1 ? line(sg) : "").join(""), fill: "none", stroke: C["text-hi"], "stroke-width": 1.8 }, svg);
  const dots = bw.map(d => { const c = el("circle", { cx: x(d.date), cy: y(d.w), r: 2.6, fill: C["text-hi"] }, svg); bindTip(c, `<b>${fmt(d.w, 1)} ${U}</b><span>${esc(fmtD(d.date))}</span>`); return c; });
  const yl = el("text", { x: m.l, y: m.t - 2 }, svg); yl.textContent = `bodyweight, ${U} (axis not from 0) · dashed = no weigh-ins`;
  const tl = gsap.timeline();
  headIn(tl, sec);
  tl.from(bars, { scaleY: 0, transformOrigin: "50% 100%", duration: T.base, ease: EASE.out, stagger: T.tight }, 0.3);
  const L = prepDraw(p);
  tl.to(p, { strokeDashoffset: 0, duration: T.hero, ease: EASE.draw }, 0.5).from(dots, { opacity: 0, duration: T.fast, stagger: T.tight }, 0.6);
  onEnter(sec, tl);
}

/* 9 — What it means: insight cards. */
function miniViz(ins, M) {
  const W = 160, Hh = 64, v = ins.viz || {};
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, "aria-hidden": "true" });
  const bar = (x, y, w, h, c) => el("rect", { x, y, width: Math.max(0, w), height: Math.max(0, h), rx: 2, fill: c }, svg);
  if (v.type === "spark") {
    const E = M.exs.find(e => e.ex === v.ex); if (!E) return svg;
    const pts = liftSeries(E), asst = E.kind === "assisted";
    const x = d3.scaleTime().domain(d3.extent(pts, p => p.date)).range([4, W - 4]);
    const y = d3.scaleLinear().domain(d3.extent(pts, p => p.v)).range(asst ? [6, Hh - 6] : [Hh - 6, 6]);
    el("path", { d: linePath(pts, x, y), fill: "none", stroke: C.accent, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    const l = pts[pts.length - 1]; el("circle", { cx: x(l.date), cy: y(l.v), r: 3.5, fill: C.accent }, svg);
  } else if (v.type === "dow") {
    const mx = Math.max(...M.dow.map(d => d.n ? d.sets / d.n : 0));
    M.dow.forEach((d, i) => { const h = d.n ? (d.sets / d.n) / mx * (Hh - 14) : 0; bar(i * 22 + 4, Hh - 12 - h, 16, h, i === v.i ? C.accent : C["bg-3"]);
      el("text", { x: i * 22 + 12, y: Hh - 1, "text-anchor": "middle", style: "font-size:8px" }, svg).textContent = "MTWTFSS"[i]; });
  } else if (v.type === "streak" || v.type === "blocks") {
    const ws = M.weeks.slice(-20);
    ws.forEach((w, i) => bar(i * 8 + 1, 20, 6, 24, w.sessions >= M.streak.target ? C.accent : w.sessions ? C["seq-1"] : C["bg-3"]));
    el("text", { x: 1, y: 58, style: "font-size:8px" }, svg).textContent = "last 20 weeks";
  } else if (v.type === "ratio" || v.type === "ratio2" || v.type === "density" || v.type === "reps" || v.type === "muscle") {
    let a, b, la, lb;
    if (v.type === "ratio") { a = M.muscleWeekly.rearDelt; b = M.muscleWeekly.frontDelt; la = "rear"; lb = "front"; }
    else if (v.type === "ratio2") { a = M.primRecent.pull; b = M.primRecent.push; la = "pull"; lb = "push"; }
    else if (v.type === "reps") { a = v.from; b = v.to; la = "then"; lb = "best"; }
    else if (v.type === "muscle") { a = M.muscleWeekly[v.m]; b = M.RULES.setBand[0]; la = "now"; lb = "band"; }
    else { const p = M.density, h = Math.floor(p.length / 2); a = H.median(p.slice(0, h).map(s => s.density)); b = H.median(p.slice(h).map(s => s.density)); la = "earlier"; lb = "recent"; }
    const mx = Math.max(a, b, 1);
    bar(44, 8, (a / mx) * (W - 50), 18, v.type === "reps" || v.type === "density" ? C["text-lo"] : C["accent-2"]);
    bar(44, 36, (b / mx) * (W - 50), 18, v.type === "muscle" ? C["bg-3"] : C.accent);
    el("text", { x: 0, y: 21 }, svg).textContent = la; el("text", { x: 0, y: 49 }, svg).textContent = lb;
  } else if (v.type === "repmode") {
    const c = {}; M.sessions.forEach(s => s.sets.forEach(st => { if (st.working && st.reps > 0) c[st.reps] = (c[st.reps] || 0) + 1; }));
    const ks = Object.keys(c).map(Number).filter(k => k <= 30).sort((a, b) => a - b), mx = Math.max(...ks.map(k => c[k]));
    ks.forEach(k => { const h = c[k] / mx * (Hh - 14); bar(4 + (k - 1) * 5.2, Hh - 12 - h, 4, h, k === M.repMode.reps ? C.accent : C["bg-3"]); });
    el("text", { x: 4, y: Hh - 1, style: "font-size:8px" }, svg).textContent = "1"; el("text", { x: W - 4, y: Hh - 1, "text-anchor": "end", style: "font-size:8px" }, svg).textContent = "30 reps";
  }
  return svg;
}
function sceneInsights(M) {
  const sec = $("#s-insights"), ins = M.insights;
  if (!ins.length) { sec.hidden = true; return; }
  sec.innerHTML = `<div class="wrap">${head(10, "Training highlights", "What It Means", `Highlights from your logged training. Each one names the numbers behind it.`)}
    <div class="insights">${ins.map((x, i) => `<article class="ins card">
      <span class="i">${String(i + 1).padStart(2, "0")}</span>
      <div><h3>${wordsMask(x.head)}</h3><div class="k"><b class="num">${esc(x.num)}</b><span>${esc(x.sub)}</span></div><p>${esc(x.why)}</p></div>
      <div class="viz"></div></article>`).join("")}</div>
  </div>`;
  $$(".ins", sec).forEach((card, i) => $(".viz", card).appendChild(miniViz(ins[i], M)));
  const tl = gsap.timeline();
  headIn(tl, sec);
  $$(".ins", sec).forEach((card, i) => {
    const at = 0.3 + i * T.loose * 2.2;
    tl.from(card, { opacity: 0, y: 24, duration: T.base, ease: EASE.out }, at)
      .from($$("h3 .mask>span", card), { yPercent: 110, duration: T.base, ease: EASE.out, stagger: T.stagger * 0.6 }, at + 0.05)
      // kinetic weight: the key number gains weight as it lands
      .fromTo($(".k b", card), { fontWeight: 300, opacity: 0 }, { fontWeight: 700, opacity: 1, duration: T.slow, ease: EASE.out }, at + 0.2)
      .from($(".viz", card), { opacity: 0, duration: T.base }, at + 0.3);
  });
  if (S.reduced || S.played.has(sec.id)) $$(".k b", sec).forEach(b => b.style.fontWeight = 700);
  onEnter(sec, tl, "top 60%");
}

/* The data: audit and method, so nothing is silently dropped. */
function sceneAudit(M) {
  const sec = $("#s-audit"), a = M.audit, t = M.totals, U = t.unit;
  sec.innerHTML = `<div class="wrap">${head(11, "How metrics are calculated", "The Data", `${esc(S.source)}`)}
    <ul class="audit">
      <li><b>${fmt(a.rows)} rows</b> (one per set), ${fmt(t.logged)} logged workouts, ${fmt(t.exercises)} exercises, ${esc(fmtD(t.first))} – ${esc(fmtD(t.last))}. Units: <b>${U}</b>.</li>
      <li><b>Warm-ups:</b> ${a.warmups ? `${fmt(a.warmups)} warm-up sets excluded from every working metric.` : `none marked (set types: ${esc(a.setTypes.join(", "))}), so every set counts as working.`}</li>
      <li><b>Qualifying sessions:</b> workouts with ${M.RULES.realSessionMinSets}+ working sets. ${fmt(a.fragments)} shorter workouts are still logged workouts and their working sets count in every total; they just don't count toward session frequency.</li>
      <li><b>Duration:</b> ${fmt(a.shortDur)} sessions under ${M.RULES.minValidMinutes} min or over ${M.RULES.maxValidMinutes} min are flagged: the export can't say whether they were entered later or the timer ran on. They're left out of time and density only.</li>
      <li><b>Assisted moves</b> (${esc(a.assisted.join(", ") || "none")}): the logged weight is help, so lower is stronger. They're not included in weight lifted.</li>
      <li><b>Cardio</b> (${esc(a.cardio.join(", ") || "none")}) isn't counted as working sets. Runs logged in other apps aren't in this export.</li>
      <li><b>Estimated one-rep max</b> uses Epley, weight × (1 + reps ÷ 30), and is treated as reliable only from sets of ≤${M.RULES.e1rmMaxReps} reps (11+ reps = low confidence); ${fmt(a.lowConfShare * 100)}% of your loaded sets are above that, so lift charts lead with actual top sets, estimated-1RM records only count reliable sets, and low-confidence estimates are marked.</li>
      <li><b>Progress</b> over the last ${M.RULES.progressWindowWeeks} weeks counts more load, more reps at a load you've used before, or a higher reliable e1RM. A lift is "steady" only when none of those moved across ${M.RULES.plateauMinSessions}+ sessions and ${M.RULES.plateauWeeks}+ weeks.</li>
      <li><b>RPE:</b> ${fmt(a.rpe)} values — ${a.rpe < 20 ? "too sparse to use" : "shown where present"}. ${a.duplicates ? `<b>${fmt(a.duplicates)} duplicate rows</b> removed.` : "No duplicate rows."} ${a.implausible.length ? `<b>${a.implausible.length} implausible weights</b> ignored: ${esc(a.implausible.slice(0, 3).join("; "))}.` : "No implausible weights."}</li>
      <li><b>Muscles:</b> each set credits its direct muscles 1 and secondary muscles ½, so credits across muscles add up to more than unique sets. ${a.unmapped.length ? `Not mapped (counted as Other): ${esc(a.unmapped.map(u => u[0]).join(", "))}.` : "Every exercise was mapped."}</li>
      <li><b>Streaks:</b> a week counts when it has ${M.streak.target}+ qualifying sessions — ${targetNote(M.streak)}. Weeks start Monday; the week in progress can't break a streak. A gap of ${M.RULES.breakDays}+ days starts a new training block.</li>
      <li><b>Records</b> are judged against all earlier entries in the imported history, then shown for the selected period; one workout can set several kinds.</li>
    </ul>
    <p class="btn-row"><button class="btn ghost" type="button" data-open-review>Review &amp; correct the data</button><button class="btn ghost" id="replay" type="button">Replay from the top</button></p>
    <details><summary>Exercise list</summary><div class="tw"><table><thead><tr><th>Exercise</th><th>Type</th><th class="n">Sessions</th><th class="n">Sets</th><th>Muscles</th></tr></thead><tbody>
      ${M.exs.map(E => `<tr><td>${esc(E.ex)}</td><td>${esc(E.kind || "")}</td><td class="n">${E.sessions}</td><td class="n">${E.sets}</td><td>${esc(E.muscles.map(m => M.MUSCLES[m]).join(", ") || "Other")}</td></tr>`).join("")}
    </tbody></table></div></details>
  </div>`;
  $("#replay", sec).addEventListener("click", () => { S.played.clear(); scrollTo({ top: 0, behavior: S.reduced ? "auto" : "smooth" }); if (S.onReplay) setTimeout(S.onReplay, S.reduced ? 0 : 900); });
}

/* ================================================================
   ORCHESTRATION
   ================================================================ */
const SCENES = [sceneOpen, sceneCommit, sceneRhythm, sceneBody, sceneLifts, scenePRs, sceneReps, sceneEff, sceneScale, sceneInsights, sceneAudit];
export function buildStory(M, opts) {
  Object.assign(S, { M, reduced: !!opts.reduced, played: opts.played, source: opts.source || "", synthetic: !!opts.synthetic, onReplay: opts.onReplay, title: opts.title || "" });
  hideTip();
  const ctx = gsap.context(() => {
    $$("#story .scene").forEach(sec => { sec.hidden = false; });
    for (const f of SCENES) {
      try { f(M); }
      catch (err) { console.error(f.name, err); }
    }
    dockHud();
    buildRail();
    // top progress bar is scrubbed by the whole page
    live.push(gsap.to("#progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: S.reduced ? true : 0.3 } }));
  });
  ScrollTrigger.refresh();
  return () => {
    live.splice(0).forEach(x => x && x.kill && x.kill());
    ctx.revert();
    gsap.set("#hud", { opacity: 0 });
    hideTip();
  };
}
function buildRail() {
  const rail = $("#rail");
  const secs = $$("#story .scene").filter(s => !s.hidden);
  rail.innerHTML = secs.map(s => `<button type="button" data-to="${s.id}" aria-label="Go to ${esc(s.dataset.title)}"><span>${esc(s.dataset.title)}</span><i></i></button>`).join("");
  $$("button", rail).forEach(b => b.addEventListener("click", () => {
    const t = document.getElementById(b.dataset.to);
    const st = ScrollTrigger.getAll().find(x => x.trigger === t && x.pin);
    scrollTo({ top: st ? st.start : t.getBoundingClientRect().top + scrollY, behavior: S.reduced ? "auto" : "smooth" });
    t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true });
  }));
  secs.forEach(s => live.push(ScrollTrigger.create({ trigger: s, start: "top 50%", end: "bottom 50%",
    onToggle: self => { if (self.isActive) $$("button", rail).forEach(b => b.classList.toggle("on", b.dataset.to === s.id)); } })));
}
