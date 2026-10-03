/* The classic dashboard tabs — Overview, Exercises, Records, History, Analysis — ported from the original
   single-page app. React renders an empty root; mount() fills it and keeps the old behaviour (Chart.js,
   sortable tables, search, lb/kg). It reads the same normalized model as Story/Recap/Compare (prepare() +
   deriveMetrics()), so every count, set definition and record matches across views. */
import Chart from "chart.js/auto";
import { TLAnalysis } from "./analysis.js";
import { credits } from "../lib/exerciseRegistry.js";
import { COLOR } from "../lib/tokens.js";
import { hintHTML } from "../lib/glossary.js";

const LB_TO_KG = 0.45359237;
const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const GROUPS = [
  {k:"Legs", v:"--cat-1"}, {k:"Back", v:"--cat-2"}, {k:"Chest", v:"--cat-3"}, {k:"Shoulders", v:"--cat-5"},
  {k:"Arms", v:"--cat-4"}, {k:"Core", v:"--cat-6"}, {k:"Cardio", v:"--cat-8"}, {k:"Other", v:"--cat-7"}
];
const state = {range:"all", unit:"lb", tab:"overview", weekMetric:"sessions", exercise:null, data:null, meas:null, meta:{}, sort:{recW:{k:"e1rm",d:-1}}};
const charts = {}, pending = {};
let reduced = false;
let hooks = { openTab: () => {} };
const $ = id => document.getElementById(id);
// colors resolve through the shared tokens (lib/tokens.js); a few legacy names are kept as aliases
const ALIAS = { "--ink":"text-strong", "--muted":"text-muted", "--line":"grid", "--bg":"surface-page", "--soft":"surface-inset", "--surface":"surface-card" };
const cv = n => COLOR[(ALIAS[n] || n).replace(/^--/, "")] ?? getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtN = (n, d=0) => (n==null||isNaN(n)) ? "–" : n.toLocaleString(undefined,{maximumFractionDigits:d, minimumFractionDigits:0});
// weights arrive already in the display unit (prepare(inUnit(...))), so W is the identity
const W = x => x;
const fmtW = (lb, d=1) => lb==null ? "–" : fmtN(W(lb), d);
const fmtDate = d => d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
const fmtShort = d => d.toLocaleDateString(undefined,{day:"numeric",month:"short"});
const fmtDur = m => { if(!m) return "0m"; const h=Math.floor(m/60), mm=Math.round(m%60); return h ? `${h}h ${mm}m` : `${mm}m`; };
const groupColor = g => cv((GROUPS.find(x=>x.k===g)||GROUPS[7]).v);

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
function weekStart(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay()+6)%7; x.setDate(x.getDate()-wd); return x; }

/* ---------- adapter: shared model -> the dashboard's shape ---------- */
// fine muscles -> the dashboard's colour groups (by an exercise's primary muscle)
const GROUP_OF = { chest:"Chest", back:"Back", traps:"Back", frontDelt:"Shoulders", sideDelt:"Shoulders", rearDelt:"Shoulders",
  biceps:"Arms", triceps:"Arms", forearms:"Arms", quads:"Legs", hamstrings:"Legs", glutes:"Legs", calves:"Legs", core:"Core" };
// fine muscles -> Analysis' coarser credit table (primary 1, secondary ½, merged by max)
const COARSE = { chest:"Chest", back:"Back", traps:"Back", frontDelt:"Shoulders", sideDelt:"Shoulders", rearDelt:"Shoulders",
  biceps:"Biceps", triceps:"Triceps", quads:"Quads", hamstrings:"Hamstrings", glutes:"Glutes", calves:"Calves", core:"Core" };
function fromBase(base, measurements){
  const exMeta = new Map(), mi = base.distUnit === "km" ? 0.621371 : 1;
  for(const [ex, c] of Object.entries(base.cls)){
    const E = base.exs.get(ex);
    // one registry: credits, colour group and movement pattern all come from exerciseRegistry.js
    const credit = {}; for(const [m, cr] of credits(c)){ const k = COARSE[m]; if(k) credit[k] = Math.max(credit[k] || 0, cr); }
    const kind = !E ? (c.cardio ? "timed" : "unknown") : E.kind === "loaded" ? "weighted" : E.kind;
    exMeta.set(ex, {name:ex, muscle: c.cardio ? "Cardio" : GROUP_OF[c.direct[0]] || "Other", assisted: c.load === "assisted", kind, sets:0,
      mixed: !!(E && E.mixed), kinds: E ? E.kinds : {}, _credit:credit, _pattern:c.pattern, _c:true});
  }
  const sessions = base.sessions.map(s => {
    const L = {key:s.sid, title:s.title, desc:s.desc||"", start:s.start, end:s.end||s.start, minutes:s.minutes ?? 0,
      real:s.real, validDur:s.validDur, flags:s.flags, workSets:s.workSets, sets:[], exOrder:[]};
    for(const t of s.sets){
      L.sets.push({ex:t.ex, type:t.type, idx:t.idx, w:t.w, reps:t.reps, mi:t.dist==null ? null : t.dist*mi, sec:t.dur, rpe:t.rpe, note:t.note||"", s:L,
        working:t.working, loaded:t.loaded, e1rm:t.e1rm, low:t.e1rmLowConf});
      if(!L.exOrder.includes(t.ex)) L.exOrder.push(t.ex);
      exMeta.get(t.ex).sets++;
    }
    return L;
  });
  let meas = null;
  if(measurements && measurements.length){
    const k = base.unit === "kg" ? LB_TO_KG : 1;
    const rows = measurements.map(e => ({date:e.date, w:e.lbs!=null ? e.lbs*k : null, ...e.extra}));
    meas = {rows, last:rows[rows.length-1].date, cols:measurements.cols || ["weight"], empty:measurements.empty || []};
  }
  return {data:{sessions, exMeta, first:sessions[0].start, last:sessions[sessions.length-1].start}, meas};
}
// same definitions as derive.js: volume = loaded working sets; e1RM prefers sets of ≤10 reps
const isVol = set => set.loaded;
const e1rm = (w,r) => r<=1 ? w : w*(1+r/30);
function bestE1(sets){ const l = sets.filter(t=>t.loaded); if(!l.length) return null; const rel = l.filter(t=>!t.low), pool = rel.length ? rel : l;
  return {v:Math.max(...pool.map(t=>t.e1rm)), low:!rel.length}; }

function filtered(){
  const D = state.data, {from, to} = state;
  if(!from && !to) return D.sessions;
  const a = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null, b = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate()+1) : null;
  return D.sessions.filter(s => (!a || s.start >= a) && (!b || s.start < b));
}

/* ---------- chart helpers ---------- */
function baseOpts(extra={}){
  const muted = cv("--muted"), line = cv("--line");
  return Object.assign({
    responsive:true, maintainAspectRatio:false, animation:{duration:300},
    interaction:{mode:"index", intersect:false},
    plugins:{legend:{display:false, labels:{color:muted, boxWidth:12, boxHeight:12, useBorderRadius:true, borderRadius:3, padding:16, font:{family:"Inter", size:12.5}}},
      tooltip:{backgroundColor:cv("--surface-raised"), titleColor:cv("--text-strong"), bodyColor:cv("--text-muted"), borderColor:cv("--border-strong"), borderWidth:1,
        padding:10, cornerRadius:8, titleFont:{family:"Inter",weight:"600",size:13}, bodyFont:{family:"Inter",size:12.5}}},
    scales:{
      x:{grid:{display:false}, ticks:{color:muted, font:{family:"Inter", size:12}, maxRotation:0, autoSkipPadding:14}, border:{color:cv("--border")}},
      y:{grid:{color:line}, ticks:{color:muted, font:{family:"Inter", size:12}, padding:6, precision:0}, border:{display:false}, beginAtZero:true}
    }
  }, extra);
}
function animFor(){
  if(reduced) return false;
  return {duration:850, easing:"easeOutQuart",
    delay(ctx){ if(ctx.type!=="data" || !ctx.chart._intro) return 0; return Math.min(ctx.dataIndex*16, 650) + ctx.datasetIndex*110; },
    onComplete(a){ if(a && a.chart) a.chart._intro = false; }};
}
const io = new IntersectionObserver(entries=>{
  for(const en of entries){
    if(!en.isIntersecting) continue;
    const el = en.target; io.unobserve(el);
    if(el.tagName==="CANVAS"){ el.dataset.seen = "1"; const p = pending[el.id]; if(p){ delete pending[el.id]; create(el.id, p.cfg, p.key); } }
    else el.classList.add("in");
  }
}, {threshold:.12});
function create(id, cfg, key){ cfg.options.animation = animFor(); const c = new Chart($(id), cfg); c._intro = !reduced; c._key = key; charts[id] = c; describe(id, cfg); }
// Canvas charts get a text summary: the panel title plus the plotted values (first series, up to 14 points).
function describe(id, cfg){
  const el = $(id); if(!el) return;
  const panel = el.closest(".panel"), title = (panel && panel.querySelector("h3")?.textContent) || el.closest("section")?.querySelector("h2")?.textContent || "Chart";
  const ds = (cfg.data.datasets || [])[0], labels = cfg.data.labels || [];
  let pts = "";
  if(ds && labels.length) pts = labels.slice(-14).map((l,i)=>{ const v = ds.data[labels.length - Math.min(14,labels.length) + i]; return `${l}: ${v==null?"–":typeof v==="object"?fmtN(v.y,1):fmtN(v,1)}`; }).join("; ");
  el.setAttribute("role","img");
  el.setAttribute("aria-label", `${title}.${ds && ds.label ? " "+ds.label+"." : ""}${pts ? " "+pts+(labels.length>14?" (latest 14 shown)":"") : ""}`);
  el.setAttribute("tabindex","0");
}
// Same key: morph the live chart to the new data. New key or first view: build it and play the intro when it scrolls into view.
function draw(id, cfg, key="k"){
  const ex = charts[id];
  if(ex && ex._key===key){ ex._intro = false; cfg.options.animation = animFor(); ex.data = cfg.data; ex.options = cfg.options; ex.update(); return; }
  if(ex){ ex.destroy(); delete charts[id]; }
  const el = $(id);
  if(reduced || el.dataset.seen==="1") create(id, cfg, key);
  else { pending[id] = {cfg, key}; io.observe(el); }
}
function countUp(els){
  if(reduced) return;
  els.forEach(el=>{
    const t = el.textContent, m = t.match(/\d[\d,]*(\.\d+)?/g);
    if(!m || m.length!==1) return;
    const raw = m[0], target = parseFloat(raw.replace(/,/g,"")); if(!(target>0)) return;
    const dec = (raw.split(".")[1]||"").length, comma = raw.includes(","), i = t.indexOf(raw), pre = t.slice(0,i), post = t.slice(i+raw.length);
    const fmt = v => comma ? v.toLocaleString(undefined,{minimumFractionDigits:dec, maximumFractionDigits:dec}) : v.toFixed(dec);
    const tok = (el._tok||0)+1; el._tok = tok; const t0 = performance.now(), dur = 1000;
    const step = now => { if(el._tok!==tok) return; const p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,4); el.textContent = pre+fmt(target*e)+post; if(p<1) requestAnimationFrame(step); };
    el.textContent = pre+fmt(0)+post; requestAnimationFrame(step);
  });
}
function staggerRows(id){ if(reduced) return; $(id).querySelectorAll("tbody tr").forEach((r,i)=>{ r.classList.add("row-in"); r.style.animationDelay = Math.min(i,14)*30+"ms"; }); }
/* ---------- overview ---------- */
function renderOverview(S){
  const D = state.data;
  const days = new Map();
  for(const s of S){ const k = dayKey(s.start); days.set(k, (days.get(k)||0) + s.workSets); }
  const T = state.M.empty ? {logged:0, sessions:0, sets:0, reps:0, tonnage:0, minutes:0} : state.M.totals;
  const timed = S.filter(s=>s.validDur).length;
  const from = S.length ? S[0].start : D.first, to = state.to && state.to < D.last ? state.to : D.last;
  const months = Math.max(1, Math.round((to-from)/(30.44*864e5)));
  $("heroTitle").textContent = `${fmtN(T.logged)} logged workout${T.logged===1?"":"s"}`;
  $("heroSub").textContent = S.length
    ? `${fmtDate(from)} to ${fmtDate(to)}. ${fmtN(T.sessions)} qualifying sessions (${state.M.RULES.realSessionMinSets}+ working sets) on ${fmtN(days.size)} training days across ${months} month${months===1?"":"s"}, about ${fmtN(T.sessions/Math.max(1,(to-from)/(7*864e5)),1)} sessions a week.`
    : "No workouts in this range. Pick a longer range above.";

  // streaks: weeks at the athlete's target, the same rule Story and Recap use
  const st = state.M.streak || {longest:0, current:0, target:1};
  const stat = (v,l)=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  $("stats").innerHTML = stat(fmtN(T.minutes/60,0)+"h", "time logged")
    + stat(fmtN(T.sets), "working sets"+hintHTML("working")) + stat(fmtN(T.reps), "reps")
    + stat(fmtN(W(T.tonnage)/1000,1)+"k", `weight lifted (${state.unit})`+hintHTML("weightLifted"))
    + stat(fmtDur(timed ? T.minutes/timed : 0), "average session length")
    + stat(`${st.longest} wk`, `longest streak · target ${st.target}+/wk${st.current>1?` · current ${st.current}`:""}`+hintHTML("streak"));

  countUp([$("heroTitle"), ...$("stats").querySelectorAll("b")]);
  renderHeat(days, from, to);

  // weekly
  const weeks = []; const wmap = new Map();
  if(S.length) for(let d = weekStart(from); d <= to; d.setDate(d.getDate()+7)){ const o={d:new Date(d), sessions:0, sets:0, volume:0, minutes:0, mg:{}}; weeks.push(o); wmap.set(+d,o); }
  for(const s of S){
    const o = wmap.get(+weekStart(s.start)); if(!o) continue;
    if(s.real) o.sessions++; if(s.validDur) o.minutes += s.minutes;
    for(const t of s.sets){ if(!t.working) continue; o.sets++; if(isVol(t)) o.volume += t.w*t.reps; const g = D.exMeta.get(t.ex).muscle; o.mg[g]=(o.mg[g]||0)+1; }
  }
  const labels = weeks.map(o=>fmtShort(o.d));
  const metric = state.weekMetric;
  const vals = weeks.map(o => metric==="volume" ? Math.round(W(o.volume)) : metric==="minutes" ? Math.round(o.minutes) : o[metric]);
  const unitLbl = {sessions:"workouts", sets:"sets", volume:state.unit, minutes:"min"}[metric];
  const wkColor = cv({sessions:"--series-2", sets:"--series-1", volume:"--series-1", minutes:"--series-4"}[metric]);
  draw("weekChart", {type:"bar", data:{labels, datasets:[{data:vals, backgroundColor:wkColor, borderRadius:3, maxBarThickness:28}]},
    options:baseOpts({plugins:{...baseOpts().plugins, tooltip:{...baseOpts().plugins.tooltip, callbacks:{title:i=>"Week of "+fmtDate(weeks[i[0].dataIndex].d), label:i=>` ${fmtN(i.raw)} ${unitLbl}`}}}})});

  // muscle split
  const mg = {}; let tot = 0;
  for(const s of S) for(const t of s.sets){ if(!t.working) continue; const g = D.exMeta.get(t.ex).muscle; mg[g]=(mg[g]||0)+1; tot++; }
  const order = Object.entries(mg).sort((a,b)=>b[1]-a[1]);
  const maxV = order.length ? order[0][1] : 1;
  $("plates").innerHTML = order.map(([g,v],i)=>`<div class="plate" title="${g}: ${v} sets" style="height:${Math.round(60+130*Math.sqrt(v/maxV))}px;width:${Math.round(18+20*v/maxV)}px;background:${groupColor(g)};animation-delay:${280+i*120}ms"></div>`).join("") + `<div class="collar" style="animation-delay:${320+order.length*120}ms"></div>`;
  $("plateKey").innerHTML = order.map(([g,v],i)=>`<div style="animation-delay:${400+i*70}ms"><i style="background:${groupColor(g)}"></i><b>${g}</b><span>${Math.round(100*v/tot)}% · ${fmtN(v)} sets</span></div>`).join("");
  const present = GROUPS.filter(g=>mg[g.k]);
  draw("muscleWeekChart", {type:"bar", data:{labels, datasets:present.map(g=>({label:g.k, data:weeks.map(o=>o.mg[g.k]||0), backgroundColor:cv(g.v), maxBarThickness:28}))},
    options:baseOpts({plugins:{...baseOpts().plugins, legend:{...baseOpts().plugins.legend, display:true, position:"bottom"}}, scales:{x:{...baseOpts().scales.x, stacked:true}, y:{...baseOpts().scales.y, stacked:true}}})});

  // when
  const dow = [0,0,0,0,0,0,0], hours = new Array(24).fill(0);
  for(const s of S){ if(!s.real) continue; dow[(s.start.getDay()+6)%7]++; hours[s.start.getHours()]++; }
  draw("dowChart", {type:"bar", data:{labels:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], datasets:[{data:dow, backgroundColor:cv("--series-2"), borderRadius:3}]}, options:baseOpts()});
  const hl = hours.map((_,h)=> h===0?"12a": h<12? h+"a" : h===12?"12p" : (h-12)+"p");
  draw("hourChart", {type:"bar", data:{labels:hl, datasets:[{data:hours, backgroundColor:cv("--series-2"), borderRadius:3}]}, options:baseOpts()});
  const db = ["<30m","30–45m","45–60m","60–75m","75–90m","90–120m","2h+"], dc = new Array(7).fill(0);
  for(const s of S){ if(!s.validDur) continue; const m=s.minutes; dc[m<30?0:m<45?1:m<60?2:m<75?3:m<90?4:m<120?5:6]++; }
  draw("durChart", {type:"bar", data:{labels:db, datasets:[{data:dc, backgroundColor:cv("--series-4"), borderRadius:3}]}, options:baseOpts()});

  // top exercises
  const ec = {}; for(const s of S) for(const t of s.sets) if(t.working) ec[t.ex]=(ec[t.ex]||0)+1;
  const top = Object.entries(ec).sort((a,b)=>b[1]-a[1]).slice(0,12);
  draw("topExChart", {type:"bar", data:{labels:top.map(x=>x[0].replace(/\s*\((.*)\)/," ($1)")), datasets:[{data:top.map(x=>x[1]), backgroundColor:top.map(x=>groupColor(D.exMeta.get(x[0]).muscle)), borderRadius:3}]},
    options:baseOpts({indexAxis:"y", scales:{x:{...baseOpts().scales.y}, y:{...baseOpts().scales.x, ticks:{...baseOpts().scales.x.ticks, autoSkip:false, callback(v){const l=this.getLabelForValue(v); return l.length>28? l.slice(0,27)+"…" : l;}}}},
      onClick:(e,els)=>{ if(els.length){ state.exercise = top[els[0].index][0]; hooks.openTab("exercises"); } }})});
  const rb = ["1–5","6–8","9–12","13–15","16–20","21+"], rc = new Array(6).fill(0);
  for(const s of S) for(const t of s.sets){ const r=t.reps; if(!r || !t.working) continue; rc[r<=5?0:r<=8?1:r<=12?2:r<=15?3:r<=20?4:5]++; }
  draw("repChart", {type:"bar", data:{labels:rb, datasets:[{data:rc, backgroundColor:cv("--series-3"), borderRadius:3}]}, options:baseOpts()});
}

function renderHeat(days, from, to){
  const el = $("heat"); let html = "";
  const start = weekStart(from); const end = new Date(to);
  let lastMonth = -1, col = 0, lastLbl = -9, needYear = true;
  const totalCols = Math.ceil((end-start)/(7*864e5))+1, step = Math.min(14, 900/Math.max(1,totalCols));
  for(let w = new Date(start); w <= end; w.setDate(w.getDate()+7), col++){
    const dl = Math.round((totalCols-1-col)*step);  // most recent weeks (visible first) light up first
    // month label row
    let lbl = "";
    // an opening partial month is labelled only when it has room before the next month's label
    for(let i=0;i<7;i++){ const d=new Date(w); d.setDate(d.getDate()+i); if(d.getDate()===1 || lastMonth===-1){
      const room = lastMonth!==-1 || (new Date(d.getFullYear(),d.getMonth()+1,1)-d)/864e5 >= 21; lastMonth=d.getMonth();
      if(!room) continue;   // the next month may still start later this week
      if(col-lastLbl >= 3){ lbl = d.toLocaleDateString(undefined,{month:"short"}) + (d.getMonth()===0||needYear ? " '"+String(d.getFullYear()).slice(2) : ""); needYear=false; lastLbl=col; }
      break; } }
    html += `<div class="m" style="animation-delay:${dl}ms">${lbl}</div>`;
    for(let i=0;i<7;i++){
      const d = new Date(w); d.setDate(d.getDate()+i);
      if(d < new Date(from.getFullYear(),from.getMonth(),from.getDate()) || d > end){ html += `<div class="c out"></div>`; continue; }
      const v = days.get(dayKey(d)) || 0;
      const lv = v===0?0: v<=10?1: v<=20?2: v<=30?3:4;
      html += `<div class="c l${lv}" style="animation-delay:${dl+i*18}ms" title="${fmtDate(d)}: ${v ? v+" working sets" : "no working sets logged"}"></div>`;
    }
  }
  el.innerHTML = html;
  const wrap = $("heatWrap"); requestAnimationFrame(()=>{ wrap.scrollLeft = wrap.scrollWidth; });
}

/* ---------- exercises ---------- */
function exSessions(name, S){
  const out = [];
  for(const s of S){
    const sets = s.sets.filter(t=>t.ex===name); if(!sets.length) continue;
    const work = sets.filter(t=>t.type!=="warmup");
    const ws = work.filter(t=>t.w>0 && t.reps>0);
    out.push({s, sets,
      maxW: ws.length ? Math.max(...ws.map(t=>t.w)) : null,
      minW: ws.length ? Math.min(...ws.map(t=>t.w)) : null,
      e1: (bestE1(work)||{}).v ?? null, e1low: !!(bestE1(work)||{}).low,
      vol: ws.reduce((a,t)=>a+t.w*t.reps,0),
      reps: sets.reduce((a,t)=>a+(t.reps||0),0),
      bestReps: Math.max(0,...sets.map(t=>t.reps||0)),
      sec: sets.reduce((a,t)=>a+(t.sec||0),0), mi: sets.reduce((a,t)=>a+(t.mi||0),0)});
  }
  return out;
}
function setStr(t){
  const parts = [];
  if(t.w>0) parts.push(fmtW(t.w)+(t.reps?` × ${t.reps}`:` ${state.unit}`)); else if(t.reps) parts.push(`${t.reps} reps`);
  if(t.mi) parts.push(`${fmtN(t.mi,2)} mi`); if(t.sec) parts.push(t.sec>=60? `${fmtN(t.sec/60,1)} min` : `${t.sec}s`);
  return parts.join(", ") + (t.type!=="normal" ? ` (${t.type})` : "");
}
function renderExercises(S){
  const D = state.data;
  const counts = {}; for(const s of S) for(const t of s.sets) counts[t.ex]=(counts[t.ex]||0)+1;
  const names = Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b));
  const sel = $("exSelect");
  if(!names.length){ sel.innerHTML=""; $("exStats").innerHTML=""; $("exTable").innerHTML=""; $("exNote").textContent="No exercises in this range."; if(charts.exChart) charts.exChart.destroy(); return; }
  if(!state.exercise || !counts[state.exercise]) state.exercise = names[0];
  sel.innerHTML = names.map(n=>`<option value="${esc(n)}" ${n===state.exercise?"selected":""}>${esc(n)} (${counts[n]} sets)</option>`).join("");
  const m = D.exMeta.get(state.exercise), rows = exSessions(state.exercise, S), u = state.unit;
  const notes = {weighted:"Loaded exercise. The chart shows your heaviest set (solid), an estimated one-rep max (dashed; hollow points come from 11+ rep sets and are low confidence) and session volume (bars).",
    assisted:"Assisted lift. The weight is help from the machine, so a falling line is progress.",
    bodyweight:"Bodyweight movement. Progress shows up as more reps.", timed:"Timed or distance work.",
    unknown:"No load was logged for this exercise. Reps are shown; the load is unknown, not bodyweight."};
  const mixedNote = m.mixed ? ` <span class="flag">${Object.entries(m.kinds).filter(([k])=>k!==({weighted:"loaded"}[m.kind]||m.kind)).map(([k,n])=>`${n} session${n===1?"":"s"} ${k==="unknown"?"with no load logged":k==="bodyweight"?"as bodyweight":k==="loaded"?"with a load":k}`).join(", ")} — kept out of this chart's series</span>` : "";
  $("exNote").innerHTML = `<span class="pill" style="background:${groupColor(m.muscle)}">${m.muscle}</span> ${notes[m.kind]}${mixedNote}`;
  if(hooks.onExercise) hooks.onExercise(state.exercise);
  const stat = (v,l)=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const totalSets = rows.reduce((a,r)=>a+r.sets.length,0);
  let st = stat(rows.length, "sessions") + stat(fmtN(totalSets), "logged sets (incl. any warm-ups)");
  const labels = rows.map(r=>fmtShort(r.s.start));
  let datasets = [], scales = {x:baseOpts().scales.x, y:{...baseOpts().scales.y}, y1:{...baseOpts().scales.y, position:"right", grid:{display:false}}};
  const blue=cv("--series-1"), red=cv("--series-3"), soft=cv("--series-2-soft"), line=(c,d,l,ax="y")=>({type:"line",label:l,data:d,borderColor:c,backgroundColor:c,pointRadius:3,tension:.25,spanGaps:true,yAxisID:ax});
  const bar=(d,l)=>({type:"bar",label:l,data:d,backgroundColor:soft,borderRadius:3,yAxisID:"y1",order:2,maxBarThickness:26});
  if(m.kind==="weighted"){
    // actual load leads; the 1RM estimate is only trusted from sets of ≤10 reps (hollow points = estimated from 11+ reps)
    const bw = Math.max(...rows.map(r=>r.maxW||0)), rel = rows.filter(r=>r.e1 && !r.e1low), lowShare = rows.filter(r=>r.e1low).length/Math.max(1,rows.length);
    const be = rel.length ? Math.max(...rel.map(r=>r.e1)) : null;
    const ch = rel.length > 1 ? (rel[rel.length-1].e1-rel[0].e1)/rel[0].e1*100 : null;
    st += stat(fmtW(bw), `heaviest (${u})`) + stat(be!=null ? fmtW(be) : "–", be!=null ? `best est. 1RM (${u})${ch!=null?`, ${ch>=0?"+":""}${fmtN(ch,0)}% (≤10-rep sets)`:""}` : "est. 1RM: no sets of ≤10 reps");
    const e1line = line(red, rows.map(r=>r.e1? +W(r.e1).toFixed(1):null), `Estimated one-rep max (${u})${lowShare>0?" · hollow = from 11+ reps":""}`);
    e1line.pointBackgroundColor = rows.map(r=>r.e1low ? "transparent" : red); e1line.pointBorderColor = red; e1line.borderDash = [5,4];   // an estimate is always dashed; actual load is solid
    datasets = [line(blue, rows.map(r=>r.maxW? +W(r.maxW).toFixed(1):null), `Heaviest set (${u})`), e1line, bar(rows.map(r=>Math.round(W(r.vol))), `Volume (${u})`)];
    scales.y.beginAtZero = false;
    $("exChartTitle").textContent = "Strength and volume per session";
  } else if(m.kind==="assisted"){
    const ws = rows.filter(r=>r.minW!=null);
    st += stat(ws.length? fmtW(Math.min(...ws.map(r=>r.minW))) : "–", `least assistance (${u})`) + stat(Math.max(...rows.map(r=>r.bestReps)), "most reps in a set");
    datasets = [line(red, rows.map(r=>r.minW!=null? +W(r.minW).toFixed(1):null), `Least assistance (${u})`), bar(rows.map(r=>r.reps), "Total reps")];
    scales.y.beginAtZero = false;
    $("exChartTitle").textContent = "Assistance and reps per session";
  } else if(m.kind==="bodyweight" || m.kind==="unknown"){
    st += stat(Math.max(...rows.map(r=>r.bestReps)), "most reps in a set") + stat(fmtN(rows.reduce((a,r)=>a+r.reps,0)), "total reps");
    datasets = [line(red, rows.map(r=>r.bestReps), "Best set (reps)"), bar(rows.map(r=>r.reps), "Total reps")];
    $("exChartTitle").textContent = "Reps per session";
  } else {
    st += stat(fmtN(rows.reduce((a,r)=>a+r.sec,0)/60,0), "total minutes") + stat(fmtN(rows.reduce((a,r)=>a+r.mi,0),1), "total miles");
    datasets = [line(red, rows.map(r=>r.mi? +r.mi.toFixed(2):null), "Distance (mi)"), bar(rows.map(r=>+(r.sec/60).toFixed(1)), "Minutes")];
    $("exChartTitle").textContent = "Time and distance per session";
  }
  $("exStats").innerHTML = st; countUp([...$("exStats").querySelectorAll("b")]);
  const o = baseOpts({scales}); o.plugins.legend.display = true; o.plugins.legend.position = "bottom";
  draw("exChart", {data:{labels, datasets}, options:o}, state.exercise);
  $("exTable").innerHTML = `<thead><tr><th class="nosort">Date</th><th class="nosort">Sets</th>${m.kind==="weighted"?`<th class="nosort num">Est. one-rep max (${u})</th><th class="nosort num">Session volume (${u})</th>`:""}</tr></thead><tbody>` +
    [...rows].reverse().map(r=>`<tr><td style="white-space:nowrap">${fmtDate(r.s.start)}</td><td class="setlist">${r.sets.map(setStr).join("<span class='muted'> · </span>")}</td>${m.kind==="weighted"?`<td class="num${r.e1low?" muted":""}" ${r.e1low?'title="Estimated from a set of 11+ reps: low confidence"':""}>${r.e1low?"≈":""}${fmtW(r.e1)}</td><td class="num">${fmtN(W(r.vol))}</td>`:""}</tr>`).join("") + "</tbody>";
  staggerRows("exTable");
}

/* ---------- records ---------- */
function renderRecords(S){
  const D = state.data, u = state.unit;
  // PR events come from the shared record detector (whole history, filtered to the range)
  const LBL = {weight:"Heaviest set", e1rm:"Best est. 1RM", reps:"Rep PR", volume:"Best session volume", assist:"Least assistance", bwreps:"Most reps"};
  const prTxt = p => p.type==="reps" ? `${p.v} reps @ ${fmtW(p.w)} ${u}` : p.type==="bwreps" ? `${p.v} reps` : p.type==="assist" ? `${fmtW(p.v)} ${u} assist` : `${fmtW(p.v)} ${u}${p.type==="e1rm"?" (≤10-rep set)":""}`;
  const prPrev = p => p.type==="reps" ? `${p.prev} reps` : p.type==="bwreps" ? `${p.prev} reps` : `${fmtW(p.prev)} ${u}`;
  const events = (state.M.empty ? [] : state.M.prs).slice().reverse();
  $("prEvents").innerHTML = events.length
    ? `<thead><tr><th class="nosort">Date</th><th class="nosort">Exercise</th><th class="nosort">Record</th><th class="nosort">New best</th><th class="nosort">Previous</th></tr></thead><tbody>` + events.slice(0,15).map((e,i)=>`<tr><td style="white-space:nowrap">${fmtDate(e.date)}</td><td><a href="#" data-ex="${esc(e.ex)}" style="color:inherit">${esc(e.ex)}</a></td><td class="muted">${LBL[e.type]}</td><td><b class="pr-hit" style="animation-delay:${450+i*90}ms">${prTxt(e)}</b></td><td class="muted">${prPrev(e)}</td></tr>`).join("") + "</tbody>"
    : `<tbody><tr><td class="muted">No new records in this range. Choose a longer date range at the top to see more.</td></tr></tbody>`;

  const agg = new Map();
  for(const s of S) for(const t of s.sets){
    const m = D.exMeta.get(t.ex); let a = agg.get(t.ex);
    if(!a){ a = {ex:t.ex, m, sets:0, last:s.start, topW:null, topWr:0, topWd:null, e1:0, e1s:"", sv:0, minA:null, minAr:0, maxR:0, maxSec:0, maxMi:0, sessions:new Set()}; agg.set(t.ex,a); }
    a.sets++; a.sessions.add(s.key); if(s.start>a.last) a.last=s.start;
    if(t.reps>a.maxR) a.maxR=t.reps; if(t.sec>a.maxSec) a.maxSec=t.sec; if(t.mi>a.maxMi) a.maxMi=t.mi;
    if(t.type==="warmup" || !(t.w>0) || !(t.reps>0)) continue;
    if(m.kind==="weighted"){
      if(a.topW==null || t.w>a.topW || (t.w===a.topW && t.reps>a.topWr)){ a.topW=t.w; a.topWr=t.reps; a.topWd=s.start; }
      // reliable estimates (≤10 reps) win over any low-confidence one
      if(!t.low && (a.e1low || t.e1rm>a.e1)){ a.e1=t.e1rm; a.e1low=false; } else if(t.low && a.e1low!==false && t.e1rm>a.e1){ a.e1=t.e1rm; a.e1low=true; }
      if(t.w*t.reps>a.sv) a.sv=t.w*t.reps;
    } else if(m.kind==="assisted"){
      if(a.minA==null || t.w<a.minA || (t.w===a.minA && t.reps>a.minAr)){ a.minA=t.w; a.minAr=t.reps; }
    }
  }
  const all = [...agg.values()];
  const link = a => `<a href="#" data-ex="${esc(a.ex)}" style="color:inherit;font-weight:600">${esc(a.ex)}</a>`;
  // loaded table, sortable
  const cols = [
    {k:"ex", l:"Exercise", f:a=>link(a), v:a=>a.ex},
    {k:"topW", l:`Heaviest (${u})`, f:a=>`${fmtW(a.topW)} × ${a.topWr}`, v:a=>a.topW, n:1},
    {k:"e1rm", l:`Est. one-rep max (${u})`, f:a=>a.e1low ? `<span class="muted" title="Only sets of 11+ reps: low-confidence estimate">≈${fmtW(a.e1)}</span>` : fmtW(a.e1), v:a=>a.e1, n:1},
    {k:"sv", l:`Best set volume (${u})`, f:a=>fmtN(W(a.sv)), v:a=>a.sv, n:1},
    {k:"sets", l:"Sets", f:a=>a.sets, v:a=>a.sets, n:1},
    {k:"last", l:"Last done", f:a=>fmtShort(a.last), v:a=>+a.last, n:1}];
  const so = state.sort.recW;
  const wl = all.filter(a=>a.m.kind==="weighted" && a.topW!=null).sort((x,y)=>{ const c=cols.find(c=>c.k===so.k); const a=c.v(x), b=c.v(y); return (a>b?1:a<b?-1:0)*so.d; });
  $("recW").innerHTML = `<thead><tr>${cols.map(c=>`<th data-sort="${c.k}" class="${c.n?"num":""}" aria-sort="${so.k===c.k?(so.d>0?"ascending":"descending"):"none"}">${c.l}${so.k===c.k?(so.d>0?" ▲":" ▼"):""}</th>`).join("")}</tr></thead><tbody>` +
    (wl.length? wl.map(a=>`<tr>${cols.map(c=>`<td class="${c.n?"num":""}">${c.f(a)}</td>`).join("")}</tr>`).join("") : `<tr><td class="muted" colspan="6">No loaded lifts in this range.</td></tr>`) + "</tbody>";
  const al = all.filter(a=>a.m.kind==="assisted").sort((a,b)=>b.sets-a.sets);
  $("recA").innerHTML = `<thead><tr><th class="nosort">Exercise</th><th class="nosort num">Least assistance (${u})</th><th class="nosort num">Most reps</th><th class="nosort num">Sets</th><th class="nosort num">Last done</th></tr></thead><tbody>` +
    (al.length ? al.map(a=>`<tr><td>${link(a)}</td><td class="num">${a.minA!=null?`${fmtW(a.minA)} × ${a.minAr}`:"–"}</td><td class="num">${a.maxR}</td><td class="num">${a.sets}</td><td class="num">${fmtShort(a.last)}</td></tr>`).join("") : `<tr><td class="muted" colspan="5">No assisted lifts in this range.</td></tr>`) + "</tbody>";
  const bl = all.filter(a=>a.m.kind==="bodyweight"||a.m.kind==="timed"||a.m.kind==="unknown").sort((a,b)=>b.sets-a.sets);
  $("recB").innerHTML = `<thead><tr><th class="nosort">Exercise</th><th class="nosort num">Best set</th><th class="nosort num">Sets</th><th class="nosort num">Last done</th></tr></thead><tbody>` +
    (bl.length ? bl.map(a=>`<tr><td>${link(a)}</td><td class="num">${a.m.kind==="timed" ? [a.maxMi?fmtN(a.maxMi,2)+" mi":"", a.maxSec? (a.maxSec>=60? fmtN(a.maxSec/60,1)+" min": a.maxSec+"s"):""].filter(Boolean).join(", ") : a.maxR+" reps"}</td><td class="num">${a.sets}</td><td class="num">${fmtShort(a.last)}</td></tr>`).join("") : `<tr><td class="muted" colspan="4">Nothing here in this range.</td></tr>`) + "</tbody>";
  ["prEvents","recW","recA","recB"].forEach(staggerRows);
}

/* ---------- history ---------- */
function renderHistory(S, animate=true){
  const D = state.data, q = $("histSearch").value.trim().toLowerCase();
  const list = [...S].reverse().filter(s => !q || s.title.toLowerCase().includes(q) || s.exOrder.some(e=>e.toLowerCase().includes(q)));
  $("histTitle").textContent = `${fmtN(list.length)} logged workout${list.length===1?"":"s"}`;
  if(!list.length){ $("histList").innerHTML = `<p class="empty">No workouts match "${esc(q)}". Clear the filter or pick a longer range.</p>`; return; }
  $("histList").innerHTML = list.slice(0,300).map((s,idx)=>{
    let vol=0, reps=0; for(const t of s.sets){ if(!t.working) continue; reps+=t.reps||0; if(isVol(t)) vol+=t.w*t.reps; }
    const groups = [...new Set(s.exOrder.map(e=>D.exMeta.get(e).muscle))];
    return `<details class="sess${animate && !reduced?" stag":""}" style="${animate?`animation-delay:${Math.min(idx,12)*35}ms`:""}"><summary>
      <div class="date-chip"><b>${s.start.getDate()}</b><span>${s.start.toLocaleDateString(undefined,{month:"short"})}<br>${s.start.getFullYear()}</span></div>
      <div><div class="sess-title">${esc(s.title)}</div><div class="sess-meta">${s.start.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}, ${fmtDur(s.minutes)}. ${s.exOrder.length} exercises, ${s.workSets} working sets, ${fmtN(reps)} reps${s.flags.includes("duration")?' · <span class="flag">Unusual logged duration</span>':""}${s.flags.includes("fragment")?' · <span class="flag">Short workout: fewer than 4 working sets</span>':""}${vol?`, ${fmtN(W(vol))} ${state.unit}`:""}</div></div>
      <div class="sess-dots">${groups.map(g=>`<i title="${g}" style="background:${groupColor(g)}"></i>`).join("")}</div>
    </summary><div class="sess-body">${s.desc?`<p class="note">${esc(s.desc)}</p>`:""}<table><tbody>${s.exOrder.map(e=>`<tr><td><a href="#" data-ex="${esc(e)}" style="color:inherit;font-weight:600">${esc(e)}</a></td><td class="setlist">${s.sets.filter(t=>t.ex===e).map(setStr).join("<span class='muted'> · </span>")}</td></tr>`).join("")}</tbody></table></div></details>`;
  }).join("") + (list.length>300?`<p class="note">Showing the latest 300. Narrow the range or filter to see older workouts.</p>`:"");
}

/* ---------- orchestration ---------- */
function render(opts={}){
  if(!state.data) return;
  const S = filtered();
  if(state.tab==="overview") renderOverview(S);
  else if(state.tab==="exercises") renderExercises(S);
  else if(state.tab==="records") renderRecords(S);
  else if(state.tab==="history") renderHistory(S, !opts.quiet);
  else renderAnalysis();
}
// The Analysis tab lives in analysis.js; it rebuilds its HTML on each render, so its charts are rebuilt too.
const analysisCtx = {state, $, esc, fmtN, fmtW, W, fmtDate, cv, draw:(...a)=>draw(...a), baseOpts, countUp:(...a)=>countUp(...a), staggerRows:(...a)=>staggerRows(...a),
  openExercise:n=>{ state.exercise = n; hooks.openTab("exercises"); }};
function renderAnalysis(){
  for(const k in charts) if(k.startsWith("an")){ charts[k].destroy(); delete charts[k]; }
  for(const k in pending) if(k.startsWith("an")) delete pending[k];
  // Analysis defaults to the full history; the athlete can deliberately switch it to the selected range
  const D = state.data, sub = state.analysisRange === "range" ? filtered() : D.sessions;
  const data = sub === D.sessions ? D : (sub.length ? {...D, sessions:sub, first:sub[0].start, last:sub[sub.length-1].start} : null);
  if(!data){ $("anRoot").innerHTML = `<p class="empty">No workouts in this range. Switch Analysis to full history, or pick a longer range.</p>`; return; }
  if(!cacheData.has(data.sessions)) cacheData.set(data.sessions, data);
  TLAnalysis.render({...analysisCtx, state:{...state, data:cacheData.get(data.sessions)}});
}
const cacheData = new WeakMap();   // keeps the analysis cache warm while the same subset is shown

/* ---------- mounting (new) ---------- */
const TAB_HTML = {
  overview: `
    <div class="dash-hero">
      <h1 id="heroTitle"></h1>
      <p class="sub" id="heroSub"></p>
      <div class="heat-wrap" id="heatWrap"><div class="heat" id="heat"></div></div>
      <div class="heat-legend">No working sets <span class="c" style="background:var(--seq-0)"></span><span class="c l1"></span><span class="c l2"></span><span class="c l3"></span><span class="c l4"></span> More working sets</div>
      <p class="how-to-read">Each square is a day (Monday at the top); color shows that day's working sets.</p>
    </div>
    <div class="stats" id="stats"></div>
    <p class="note">Weight lifted is the sum of weight × reps for working sets with external load; bodyweight sets and machine assistance aren't included. Time and average length use workouts with a usable logged duration.</p>
    <section class="block">
      <div class="block-head"><h2>Week by week</h2>
        <div class="seg" id="weekSeg"><button type="button" data-v="sessions">Qualifying sessions</button><button type="button" data-v="sets">Working sets</button><button type="button" data-v="volume">Weight lifted</button><button type="button" data-v="minutes">Time</button></div>
      </div>
      <div class="panel"><div class="chart"><canvas id="weekChart"></canvas></div></div>
    </section>
    <section class="block reveal">
      <div class="block-head"><h2>Where your sets go</h2></div>
      <div class="panel"><div class="plates" id="plates"></div><div class="plate-key" id="plateKey"></div></div>
      <div class="panel" style="margin-top:16px"><h3>Sets per muscle group, by week</h3><div class="chart"><canvas id="muscleWeekChart"></canvas></div></div>
    </section>
    <section class="block">
      <div class="block-head"><h2>When you train</h2></div>
      <div class="grid2">
        <div class="panel"><h3>Day of week</h3><div class="chart short"><canvas id="dowChart"></canvas></div></div>
        <div class="panel"><h3>Start time</h3><div class="chart short"><canvas id="hourChart"></canvas></div></div>
      </div>
      <div class="panel" style="margin-top:16px"><h3>Workout length</h3><div class="chart short"><canvas id="durChart"></canvas></div></div>
    </section>
    <section class="block">
      <div class="block-head"><h2>What you do most</h2></div>
      <div class="grid2">
        <div class="panel"><h3>Top exercises by sets</h3><div class="chart tall"><canvas id="topExChart"></canvas></div></div>
        <div class="panel"><h3>Reps per set</h3><div class="chart tall"><canvas id="repChart"></canvas></div></div>
      </div>
    </section>`,
  exercises: `
    <section class="block first">
      <div class="ex-pick"><label class="caption field-label" for="exSelect">Exercise</label><select id="exSelect"></select></div>
      <p class="note" id="exNote"></p>
      <div class="ex-stats stats" id="exStats"></div>
      <div class="panel"><h3 id="exChartTitle">Progress</h3><div class="chart tall"><canvas id="exChart"></canvas></div></div>
      <section class="block"><div class="block-head"><h2>Every session</h2></div><div class="panel tbl-wrap"><table id="exTable"></table></div></section>
    </section>`,
  records: `
    <section class="block first"><div class="block-head"><h2>New records in this range${hintHTML("record")}</h2></div>
      <p class="note" style="margin:-4px 0 12px">Each record is a new best compared with earlier entries for the same exercise in your imported history. The latest 15 are listed.</p><div class="panel tbl-wrap"><table id="prEvents"></table></div></section>
    <section class="block"><div class="block-head"><h2>Best logged performance: loaded exercises</h2></div>
      <p class="note" style="margin:-4px 0 12px">Best values within the selected range. Estimated one-rep max uses Epley, weight × (1 + reps ÷ 30); “≈” marks estimates from 11+ rep sets (low confidence). Select a column heading to sort.</p>
      <div class="panel tbl-wrap"><table id="recW"></table></div></section>
    <section class="block"><div class="block-head"><h2>Best logged performance: assisted exercises</h2></div>
      <p class="note" style="margin:-4px 0 12px">The logged weight is help from the machine, so less assistance means you lifted more of yourself.</p>
      <div class="panel tbl-wrap"><table id="recA"></table></div></section>
    <section class="block"><div class="block-head"><h2>Bodyweight and timed</h2></div><div class="panel tbl-wrap"><table id="recB"></table></div></section>`,
  history: `
    <section class="block first">
      <div class="block-head"><h2 id="histTitle">Workouts</h2><input class="search" id="histSearch" type="search" placeholder="Filter by exercise or workout name" aria-label="Filter workouts"></div>
      <div id="histList"></div>
    </section>`,
  analysis: `<div id="anRoot"></div>`,
};

let loaded = { base: null, m: null };
// The dashboard reads the shared model; it only reshapes it, never re-parses the CSV.
export function setData(base, measurements, M) {
  if (loaded.base !== base || loaded.m !== measurements) {
    const prevEx = state.exercise;
    const r = fromBase(base, measurements); state.data = r.data; state.meas = r.meas;
    state.exercise = prevEx && r.data.exMeta.has(prevEx) ? prevEx : null;
    loaded = { base, m: measurements };
  }
  state.M = M;
}
function destroyCharts() {
  for (const k in charts) { charts[k].destroy(); delete charts[k]; }
  for (const k in pending) delete pending[k];
}
function setSeg(root, id, v) { const box = root.querySelector("#" + id); if (box) box.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v)); }

export function mount(root, tab, opts, h) {
  destroyCharts();
  hooks = h; reduced = !!opts.reduced;
  Object.assign(state, { tab, unit: opts.unit, from: opts.from, to: opts.to, analysisRange: opts.analysisRange });
  root.innerHTML = TAB_HTML[tab];
  setSeg(root, "weekSeg", state.weekMetric);
  const onClick = e => {
    const a = e.target.closest("[data-ex]");
    if (a) { e.preventDefault(); state.exercise = a.dataset.ex; hooks.openTab("exercises"); return; }
    const th = e.target.closest("th[data-sort]");
    if (th) { const k = th.dataset.sort, so = state.sort.recW; state.sort.recW = { k, d: so.k === k ? -so.d : (k === "ex" ? 1 : -1) }; render(); return; }
    const b = e.target.closest("#weekSeg button");
    if (b) { state.weekMetric = b.dataset.v; setSeg(root, "weekSeg", b.dataset.v); render(); }
  };
  const onChange = e => { if (e.target.id === "exSelect") { state.exercise = e.target.value; render(); } };
  const onInput = e => { if (e.target.id === "histSearch") render({ quiet: true }); };
  root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("input", onInput);
  const plates = root.querySelector(".reveal");
  if (plates) { if (reduced) plates.classList.add("in"); else io.observe(plates); }
  render();
  return () => { root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); root.removeEventListener("input", onInput); destroyCharts(); };
}
export function update(opts) {
  const changed = opts.unit !== state.unit || +opts.from !== +state.from || +opts.to !== +state.to || opts.analysisRange !== state.analysisRange;
  Object.assign(state, { unit: opts.unit, from: opts.from, to: opts.to, analysisRange: opts.analysisRange });
  if (changed) render();
}
export const dataBounds = () => state.data && { first: state.data.first, last: state.data.last };
