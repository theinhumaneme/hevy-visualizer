/* Analysis tab: descriptive analytics computed in the browser from a user's Hevy exports.
   Workouts are required; the measurements export (body weight etc.) is optional.
   index.html calls TLAnalysis.render(ctx) with its data and helpers. No advice or goals: numbers and charts only. */
const DAY = 864e5, WEEK = 7*DAY;
const MUSCLES = ["Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Calves","Core"];

// Exercise name -> movement pattern and muscle credit (primary 1, secondary 0.5). First match wins, so order matters.
const RULES = [
  [/treadmill|cycling|bike|elliptical|walking|running|\brun\b|rowing machine|jumping jack|jump rope|stair|swim|hiit|burpee|ski ?erg|sled/, "Cardio", {}],
  [/plank|dead ?bug|pallof|hollow|ab wheel|rollout|bird ?dog|farmer|carry/, "Core (anti-movement)", {Core:1}],
  [/crunch|sit ?-?up|leg raise|knee raise|toes to bar|v-?up|flutter/, "Core (flexion)", {Core:1}],
  [/russian twist|torso rotation|wood ?chop|oblique|side bend/, "Core (rotation)", {Core:1}],
  [/tricep|skull ?crusher|pushdown|push down|french press/, "Elbow extension", {Triceps:1}],
  [/leg curl|hamstring curl|nordic/, "Knee flexion", {Hamstrings:1}],
  [/curl|bicep|preacher|hammer/, "Elbow flexion", {Biceps:1}],
  [/lateral raise|side raise|front raise|upright row|y ?-?raise/, "Shoulder isolation", {Shoulders:1}],
  [/face pull|rear delt|reverse fly/, "Horizontal pull", {Shoulders:1, Back:.5}],
  [/pull ?-?up|chin ?-?up|pulldown|pull down|pullover|straight arm/, "Vertical pull", {Back:1, Biceps:.5}],
  [/\brows?\b/, "Horizontal pull", {Back:1, Biceps:.5}],
  [/shrug/, "Shrug", {Back:1}],
  [/romanian|\brdl\b|stiff ?leg|good morning|deadlift|rack pull/, "Hip hinge", {Hamstrings:1, Glutes:1, Back:.5}],
  [/back extension|hyperextension/, "Hip hinge", {Glutes:1, Hamstrings:.5}],
  [/hip thrust|glute|kickback|abduct/, "Hip extension / abduction", {Glutes:1}],
  [/adduct/, "Hip adduction", {}],
  [/leg extension/, "Knee extension", {Quads:1}],
  [/calf/, "Calf", {Calves:1}],
  [/split squat|lunge|step ?-?up|pistol/, "Lunge", {Quads:1, Glutes:.5}],
  [/squat|leg press|hack/, "Squat", {Quads:1, Glutes:.5}],
  [/shoulder press|overhead press|military|arnold|push press|landmine press/, "Vertical push", {Shoulders:1, Triceps:.5}],
  [/\bdips?\b/, "Dip", {Chest:1, Triceps:.5}],
  [/\bfly\b|flye|pec deck|crossover|cable cross/, "Chest fly", {Chest:1}],
  [/bench|chest press|push ?-?up|floor press|incline press|decline press/, "Horizontal push", {Chest:1, Triceps:.5, Shoulders:.5}],
];
const classify = name => { const n = name.toLowerCase(); for(const [re, pattern, credit] of RULES) if(re.test(n)) return {pattern, credit}; return {pattern:"Other", credit:{}}; };
const PUSH = new Set(["Horizontal push","Vertical push","Dip","Chest fly"]), PULL = new Set(["Vertical pull","Horizontal pull"]);
const UPPER = new Set(["Chest","Back","Shoulders","Biceps","Triceps"]), LOWER = new Set(["Quads","Hamstrings","Glutes","Calves"]);
const ANT = new Set(["Chest","Quads","Core","Biceps"]), POST = new Set(["Back","Hamstrings","Glutes","Calves"]);
const TOD = [["Morning", "5am–noon", h=>h>=5&&h<12], ["Afternoon", "noon–5pm", h=>h>=12&&h<17], ["Evening", "5–9pm", h=>h>=17&&h<21], ["Late night", "9pm–5am", h=>h>=21||h<5]];

const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
const weekOf = d => { const x = dayStart(d); x.setDate(x.getDate() - (x.getDay()+6)%7); return +x; };
const median = a => { if(!a.length) return null; const s = [...a].sort((x,y)=>x-y), m = s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
const sum = a => a.reduce((x,y)=>x+y,0);
const e1rm = (w, r) => r<=1 ? w : w*(1+r/30);
function slope(pts){   // least squares, x in days -> per day
  if(pts.length < 2) return null;
  const mx = mean(pts.map(p=>p.x)), my = mean(pts.map(p=>p.y));
  const num = sum(pts.map(p=>(p.x-mx)*(p.y-my))), den = sum(pts.map(p=>(p.x-mx)**2));
  return den ? {k:num/den, c:my-(num/den)*mx} : null;
}
function ranks(a){ const idx = a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]), r = new Array(a.length);
  for(let i=0;i<idx.length;){ let j=i; while(j+1<idx.length && idx[j+1][0]===idx[i][0]) j++; for(let k=i;k<=j;k++) r[idx[k][1]] = (i+j)/2+1; i=j+1; } return r; }
function spearman(x, y){ if(x.length < 3) return null; const rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry);
  const n = sum(rx.map((v,i)=>(v-mx)*(ry[i]-my))), d = Math.sqrt(sum(rx.map(v=>(v-mx)**2))*sum(ry.map(v=>(v-my)**2))); return d ? n/d : null; }

/* ---------------------------------------------------------------- body weight helpers */
function bodyWeight(M){
  if(!M) return null;
  const byDay = new Map();
  for(const r of M.rows) if(r.w!=null){ const t = +dayStart(r.date); (byDay.get(t) || byDay.set(t, []).get(t)).push(r.w); }
  const pts = [...byDay].map(([t, ws])=>({t, w:mean(ws)})).sort((a,b)=>a.t-b.t);
  if(!pts.length) return null;
  const at = t => {   // linear interpolation, clamped at the ends
    if(t <= pts[0].t) return pts[0].w; const L = pts[pts.length-1]; if(t >= L.t) return L.w;
    let lo = 0, hi = pts.length-1; while(hi-lo > 1){ const mid = (lo+hi)>>1; if(pts[mid].t <= t) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi]; return a.w + (b.w-a.w)*(t-a.t)/(b.t-a.t);
  };
  const covered = t => t >= pts[0].t - 14*DAY && t <= pts[pts.length-1].t + 14*DAY;
  const segs = []; let cur = [pts[0]];
  for(let i=1;i<pts.length;i++){ if(pts[i].t - pts[i-1].t > 30*DAY){ segs.push(cur); cur = []; } cur.push(pts[i]); }
  segs.push(cur);
  const inSeg = t => segs.some(s => t >= s[0].t && t <= s[s.length-1].t);
  return {pts, at, covered, segs, inSeg};
}

/* ---------------------------------------------------------------- compute everything */
function compute(D, M){
  const S = D.sessions, ex = D.exMeta;
  const meta = name => { const m = ex.get(name); if(!m._c){ const c = classify(name); m._pattern = c.pattern; m._credit = c.credit; m._c = true; } return m; };
  const work = t => t.working ?? t.type !== "warmup";
  const loaded = t => t.loaded ?? (meta(t.ex).kind==="weighted" && t.w>0 && t.reps>0 && work(t));
  const allSets = S.flatMap(s => s.sets);
  const BW = bodyWeight(M);
  // eligible joins only: same day, nearest within 7 days, or a ≤14-day bracket — never across a long gap
  const bwObs = BW ? BW.pts.map(p => ({date:new Date(p.t), w:p.w})) : [];
  const bwAt = d => { if(!BW) return null; const m = bwMatch(bwObs, d); return m.eligible ? m.value : null; };

  // sessions, blocks, breaks
  // session rules come from the shared model (4+ working sets; durations outside 15–240 min are flagged)
  const sess = S.map(s => ({s, real:s.real ?? s.sets.length>=4, short:s.validDur != null ? !s.validDur : s.minutes<15, day:dayStart(s.start), week:weekOf(s.start),
    sets:s.workSets ?? s.sets.length, tonnage:sum(s.sets.filter(loaded).map(t=>t.w*t.reps))}));
  const blocks = []; let b = null;
  for(const x of sess){
    if(!b || daysBetween(b.last, x.day) >= 14){ b = {first:x.day, last:x.day, items:[]}; blocks.push(b); }
    b.last = x.day; b.items.push(x);
  }
  for(const bl of blocks){ bl.days = daysBetween(bl.first, bl.last)+1; bl.real = bl.items.filter(x=>x.real).length; bl.sets = sum(bl.items.map(x=>x.sets)); bl.tonnage = sum(bl.items.map(x=>x.tonnage)); }
  const breaks = blocks.slice(1).map((bl, i) => ({from:blocks[i].last, to:bl.first, days:daysBetween(blocks[i].last, bl.first)}));
  const span = daysBetween(sess[0].day, sess[sess.length-1].day)+1, active = sum(blocks.map(bl=>bl.days));

  // calendar weeks and in-block weeks
  const firstW = sess[0].week, lastW = sess[sess.length-1].week;
  const weeks = []; for(let w=firstW; w<=lastW; w = +new Date(new Date(w).setDate(new Date(w).getDate()+7))) weeks.push(w);
  const inBlock = new Set(); for(const bl of blocks){ for(let w=weekOf(bl.first); w<=weekOf(bl.last); w = +new Date(new Date(w).setDate(new Date(w).getDate()+7))) inBlock.add(w); }
  const wk = new Map(weeks.map(w=>[w, {sessions:0, sets:0, tonnage:0, mus:Object.fromEntries(MUSCLES.map(m=>[m,0]))}]));
  for(const x of sess){
    const o = wk.get(x.week); if(x.real) o.sessions++; o.sets += x.sets; o.tonnage += x.tonnage;
    for(const t of x.s.sets){ if(!work(t)) continue; for(const [mu, c] of Object.entries(meta(t.ex)._credit)) o.mus[mu] += c; }
  }
  const blockWeeks = weeks.filter(w=>inBlock.has(w)), recentWeeks = weeks.slice(-8);
  const muscle = MUSCLES.map(mu => ({mu,
    all: mean(blockWeeks.map(w=>wk.get(w).mus[mu])), recent: mean(recentWeeks.map(w=>wk.get(w).mus[mu])), max: Math.max(...blockWeeks.map(w=>wk.get(w).mus[mu]))}));

  // balance
  const recentCut = recentWeeks[0];
  function balance(sets){
    const credit = g => sum(sets.flatMap(t => Object.entries(meta(t.ex)._credit).filter(([m])=>g.has(m)).map(([,c])=>c)));
    const pat = p => sets.filter(t=>p.has(meta(t.ex)._pattern)).length;
    return {push:pat(PUSH), pull:pat(PULL), upper:credit(UPPER), lower:credit(LOWER), quads:credit(new Set(["Quads"])),
      ham:credit(new Set(["Hamstrings"])), hamGlute:credit(new Set(["Hamstrings","Glutes"])), ant:credit(ANT), post:credit(POST)};
  }
  const workSets = allSets.filter(work);
  const bal = {all:balance(workSets), recent:balance(workSets.filter(t=>weekOf(t.s.start)>=recentCut))};

  // variety per block
  const seen = new Set(); let prev = null;
  const variety = blocks.map((bl, i) => {
    const sets = bl.items.flatMap(x=>x.s.sets), names = new Set(sets.map(t=>t.ex));
    const row = {block:i+1, first:bl.first, last:bl.last, distinct:names.size, fresh:[...names].filter(n=>!seen.has(n)).length,
      kept: prev ? [...names].filter(n=>prev.has(n)).length : null, prevN: prev ? prev.size : null,
      known: i ? sets.filter(t=>seen.has(t.ex)).length/sets.length : null};
    names.forEach(n=>seen.add(n)); prev = names; return row;
  });

  // time of day
  const real = sess.filter(x=>x.real);
  const tod = TOD.map(([name, range, f]) => { const g = real.filter(x=>f(x.s.start.getHours()));
    return {name, range, n:g.length, sets:median(g.map(x=>x.sets)), tonnage:median(g.map(x=>x.tonnage)), minutes:median(g.filter(x=>!x.short).map(x=>x.s.minutes))}; });

  // set patterns and logging signals
  const groups = []; for(const x of sess){ const by = new Map(); for(const t of x.s.sets){ (by.get(t.ex) || by.set(t.ex, []).get(t.ex)).push(t); } for(const [name, ts] of by) groups.push({name, ts:ts.filter(work).sort((a,b)=>(a.idx??0)-(b.idx??0))}); }
  const weighted = groups.filter(g => g.ts.length>=2 && g.ts.every(t=>t.w>0));
  const straight = weighted.filter(g => new Set(g.ts.map(t=>t.w)).size===1);
  const repGroups = groups.filter(g => g.ts.length>=2 && g.ts.every(t=>t.reps>0));
  const repCounts = new Map(); for(const t of allSets) if(t.reps>0) repCounts.set(t.reps, (repCounts.get(t.reps)||0)+1);
  const modeRep = [...repCounts].sort((a,b)=>b[1]-a[1])[0] || [null, 0];
  const repTotal = sum([...repCounts.values()]);
  const dupKeys = new Set(); let dups = 0;
  for(const x of sess) for(const t of x.s.sets){ const k = x.s.key+"|"+t.ex+"|"+t.idx; if(t.idx!=null && dupKeys.has(k)) dups++; dupKeys.add(k); }
  const audit = {
    sets:allSets.length, sessions:sess.length, real:real.length, fragments:sess.length-real.length, short:sess.filter(x=>x.short).length,
    exercises:ex.size, first:sess[0].day, last:sess[sess.length-1].day, dups,
    warmups:allSets.filter(t=>t.type==="warmup").length, failure:allSets.filter(t=>t.type==="failure").length, drop:allSets.filter(t=>t.type==="dropset").length,
    rpe:allSets.filter(t=>t.rpe!=null).length, timed:allSets.filter(t=>!(t.reps>0)).length, notes:allSets.filter(t=>t.note).length, descs:S.filter(s=>s.desc).length,
    modeRep:modeRep[0], modeShare:repTotal ? modeRep[1]/repTotal : 0,
    sameReps: repGroups.length ? repGroups.filter(g=>new Set(g.ts.map(t=>t.reps)).size===1).length/repGroups.length : null,
    weightedGroups:weighted.length, straight: weighted.length ? straight.length/weighted.length : null,
    ramp: weighted.length ? weighted.filter(g=>g.ts[g.ts.length-1].w > g.ts[0].w).length/weighted.length : null,
    dropW: weighted.length ? weighted.filter(g=>g.ts[g.ts.length-1].w < g.ts[0].w).length/weighted.length : null,
    repDrop: straight.length ? straight.filter(g=>g.ts[g.ts.length-1].reps < g.ts[0].reps).length/straight.length : null,
    mRows: M ? M.rows.length : 0, mEmpty: M ? M.empty : [],
  };

  // progression per exercise
  const perEx = new Map();
  for(const x of sess){
    const by = new Map(); for(const t of x.s.sets) if(work(t)) (by.get(t.ex) || by.set(t.ex, []).get(t.ex)).push(t);
    for(const [name, ts] of by){
      const m = meta(name), bw = bwAt(x.s.start);
      const ws = ts.filter(t=>t.w>0 && t.reps>0);
      const row = {date:x.s.start, week:x.week, n:ts.length,
        topW: ws.length ? Math.max(...ws.map(t=>t.w)) : null, minW: ws.length ? Math.min(...ws.map(t=>t.w)) : null,
        e1: ws.length ? Math.max(...ws.map(t=>e1rm(t.w, t.reps))) : null,
        eff: m.kind==="assisted" && bw && ws.length ? Math.max(...ws.map(t=>e1rm(Math.max(0, bw-t.w), t.reps))) : null,
        maxReps: Math.max(0, ...ts.map(t=>t.reps||0)), maxSec: Math.max(0, ...ts.map(t=>t.sec||0)), bw};
      (perEx.get(name) || perEx.set(name, []).get(name)).push(row);
    }
  }
  const activeWeeks = (a, b) => blockWeeks.filter(w => w>=a && w<=b).length;
  const prog = [];
  for(const [name, rows] of perEx){
    if(rows.length < 4) continue;
    const m = meta(name); let metric, better = 1, label;
    if(m.kind==="assisted" && rows.every(r=>r.eff!=null)){ metric = rows.map(r=>r.eff); label = "effective est. 1RM"; }
    else if(m.kind==="assisted"){ metric = rows.map(r=>r.minW); better = -1; label = "least assistance"; }
    else if(m.kind==="weighted"){ metric = rows.map(r=>r.topW); label = "top set"; }   // actual load: most sets are 11+ reps
    else if(m.kind==="bodyweight"){ metric = rows.map(r=>r.maxReps); label = "best set, reps"; }
    else { metric = rows.map(r=>r.maxSec/60); label = "longest set, min"; }
    const ok = metric.map((v,i)=>[v,i]).filter(([v])=>v!=null && isFinite(v));
    if(ok.length < 4) continue;
    // disjoint first/last windows (never overlapping, even with 4–5 sessions)
    const kw = Math.min(3, Math.floor(ok.length/2)), vals = ok.map(([v])=>v), f = mean(vals.slice(0,kw)), l = mean(vals.slice(-kw));
    const best = better>0 ? Math.max(...vals) : Math.min(...vals), bestAt = vals.lastIndexOf(best);
    const pct = f ? (l-f)/f*100*better : 0, since = vals.length-1-bestAt;
    const wks = Math.max(1, activeWeeks(rows[0].week, rows[rows.length-1].week));
    // a regression is reported even when the best was long ago
    const status = pct>=10 ? "Progressing" : pct<-5 ? "Regressed" : since>=5 ? "Stalled" : "Flat";
    prog.push({name, kind:m.kind, label, weightish: label!=="best set, reps" && label!=="longest set, min", sessions:rows.length,
      first:rows[0].date, last:rows[rows.length-1].date, f, l, best, pct, perMonth:pct/(wks/4.345), since, status});
  }
  prog.sort((a,b)=>b.pct-a.pct);

  // strength across breaks
  const brk = [];
  for(const br of breaks){
    for(const [name, rows] of perEx){
      const m = meta(name); if(m.kind!=="weighted" && m.kind!=="assisted") continue;
      const asst = m.kind==="assisted", col = asst ? "minW" : "topW";
      const pre = rows.filter(r => r[col]!=null && r.date <= +br.from+DAY && r.date > +br.from-30*DAY);
      // look for the return only inside the block that follows this break (stop at the next break)
      const nb = breaks.find(b2 => b2.from > br.to);
      const post = rows.filter(r => r[col]!=null && r.date >= br.to && (!nb || r.date <= +nb.from + DAY));
      if(!pre.length || !post.length || post[0].date > +br.to+21*DAY) continue;
      const pv = pre[pre.length-1][col], p1 = post[0][col];
      const k = post.findIndex(r => asst ? r[col]<=pv : r[col]>=pv);
      brk.push({br, name, asst, pv, p1, change: asst ? pv-p1 : p1-pv, regain: k<0 ? null : k+1});
    }
  }

  // body weight
  let body = null;
  if(BW){
    const pts = BW.pts, first = pts[0], last = pts[pts.length-1];
    const minP = pts.reduce((a,p)=>p.w<a.w?p:a), maxP = pts.reduce((a,p)=>p.w>a.w?p:a);
    const fit = arr => { const f = slope(arr.map(p=>({x:(p.t-arr[0].t)/DAY, y:p.w}))); return f && arr.length>=3 && (arr[arr.length-1].t-arr[0].t)>=7*DAY ? {k:f.k*7, pct:f.k*7/mean(arr.map(p=>p.w))*100, from:arr[0].t, to:arr[arr.length-1].t, n:arr.length, start:f.c, end:f.c+f.k*(arr[arr.length-1].t-arr[0].t)/DAY} : null; };
    const trends = [];
    BW.segs.map(fit).filter(Boolean).forEach((r, i) => trends.push({label:`Weigh-in stretch ${i+1}`, ...r}));
    for(const [lbl, d] of [["Last 4 weeks", 28], ["Last 12 weeks", 84]]){ const r = fit(pts.filter(p=>p.t >= last.t - d*DAY)); if(r) trends.push({label:lbl, ...r}); }
    // daily 7-day average inside each stretch (no line drawn across gaps of 30+ days)
    const avg = [];
    for(const sg of BW.segs){
      if(sg.length < 2){ continue; }
      const days = []; for(let t=sg[0].t; t<=sg[sg.length-1].t; t+=DAY) days.push({t, w:BW.at(t)});
      days.forEach((d, i) => { const win = days.slice(Math.max(0,i-3), i+4); avg.push({x:d.t, y:mean(win.map(v=>v.w))}); });
      avg.push({x:sg[sg.length-1].t+DAY, y:null});
    }
    // weight change across training blocks and breaks
    const near = t => pts.some(p => Math.abs(p.t - t) <= 14*DAY);
    const span2 = (a, b) => (near(+a) && near(+b)) ? {w0:BW.at(+a), w1:BW.at(+b), inside:pts.filter(p=>p.t>=+a && p.t<=+b).length} : null;
    const periods = [];
    blocks.forEach((bl, i) => { if(bl.days>=14){ const r = span2(bl.first, bl.last); if(r) periods.push({label:`Training block ${i+1}`, a:bl.first, b:bl.last, days:bl.days, ...r}); } });
    breaks.forEach(br => { const r = span2(br.from, br.to); if(r) periods.push({label:"Break", a:br.from, b:br.to, days:br.days, ...r}); });
    periods.sort((x,y)=>x.a-y.a);
    // weekly mean body weight (weeks fully inside a weigh-in stretch) vs training that week
    const wbw = new Map(); for(const w of weeks){ const ds = [0,1,2,3,4,5,6].map(i=>w+i*DAY); if(ds.every(t=>BW.inSeg(t))) wbw.set(w, mean(ds.map(t=>BW.at(t)))); }
    const delta = new Map(); weeks.forEach((w, i) => { const n = weeks[i+1]; if(n!=null && wbw.has(w) && wbw.has(n)) delta.set(w, wbw.get(n)-wbw.get(w)); });
    const corr = ["sessions","sets","tonnage"].map(key => ({key, lags:[0,1,2,3].map(L => {
      const xs = [], ys = []; weeks.forEach((w, i) => { const t2 = weeks[i+L]; if(t2!=null && delta.has(t2)){ xs.push(wk.get(w)[key]); ys.push(delta.get(t2)); } });
      return {r:spearman(xs, ys), n:xs.length}; })}));
    // relative strength for the most-trained lifts with body weight available
    const rel = prog.filter(p => p.kind==="weighted" || (p.kind==="assisted" && p.label==="effective est. 1RM"))
      .sort((a,b)=>b.sessions-a.sessions).slice(0,6).map(p => {
        const rows = perEx.get(p.name).filter(r=>r.bw);
        if(rows.length < 4) return null;
        const v = r => (p.kind==="assisted" ? r.eff : r.e1)/r.bw;
        const f = rows.slice(0,3), l = rows.slice(-3);
        return {name:p.name, kind:p.kind, f:mean(f.map(v)), l:mean(l.map(v)), fBW:mean(f.map(r=>r.bw)), lBW:mean(l.map(r=>r.bw)),
          fAbs:mean(f.map(r=>p.kind==="assisted"?r.eff:r.e1)), lAbs:mean(l.map(r=>p.kind==="assisted"?r.eff:r.e1))};
      }).filter(Boolean);
    const others = (M.cols||[]).filter(c=>c!=="weight").map(c => { const rs = M.rows.filter(r=>r[c]!=null); return {col:c, n:rs.length, first:rs[0], last:rs[rs.length-1]}; }).filter(o=>o.n);
    body = {first, last, minP, maxP, n:pts.length, trends, avg, periods, corr, corrN:delta.size, rel, others, segs:BW.segs};
  }

  return {sess, blocks, breaks, span, active, weeks, wk, muscle, recentWeeks, blockWeeks, bal, variety, tod, audit, prog, brk, body,
    mapping:[...ex.values()].map(m=>({name:m.name, kind:m.kind, sets:m.sets, pattern:meta(m.name)._pattern, credit:meta(m.name)._credit})).sort((a,b)=>b.sets-a.sets)};
}

/* ---------------------------------------------------------------- render */
let cache = {data:null, meas:null, A:null};
// what each status means in plain words (criteria are listed under "How this is calculated")
const STATUS_LABEL = {Progressing:"Higher recent performance", Regressed:"Lower recent performance", Stalled:"No recent personal best", Flat:"Similar recent performance"};
function render(ctx){
  const {state, $, esc, fmtN, fmtW, W, fmtDate, cv, draw, baseOpts, countUp, staggerRows} = ctx;
  const D = state.data, M = state.meas;
  if(cache.data !== D || cache.meas !== M) cache = {data:D, meas:M, A:compute(D, M)};
  const A = cache.A, u = state.unit, au = A.audit;
  const pct = (x, d=0) => x==null ? "–" : `${fmtN(x*100, d)}%`;
  const d = x => fmtDate(new Date(x));
  const clean = (x, dd) => Math.abs(x) < 0.5*10**-dd ? 0 : x;
  const sgn = (x, dd=1) => x==null ? "–" : (clean(x,dd)>0?"+":"") + fmtN(clean(x,dd), dd);
  const ratio = (a, b) => b ? `${fmtN(a)} : ${fmtN(b)} (${fmtN(a/b, 2)})` : `${fmtN(a)} : 0`;
  const table = (id, head, rows, numCols=[]) => `<div class="panel tbl-wrap"><table id="${id}"><thead><tr>${head.map((h,i)=>`<th class="nosort${numCols.includes(i)?" num":""}">${h}</th>`).join("")}</tr></thead><tbody>${
    rows.length ? rows.map(r=>`<tr>${r.map((c,i)=>`<td${numCols.includes(i)?' class="num"':""}>${c}</td>`).join("")}</tr>`).join("") : `<tr><td class="muted" colspan="${head.length}">Not enough logged sessions to calculate this yet.</td></tr>`}</tbody></table></div>`;
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const B = A.body;

  let h = "";
  h += `<div class="stats an-stats">`
    + stat(`${fmtN(A.active/A.span*100)}%`, `of ${fmtN(A.span)} days inside a training block`)
    + stat(fmtN(A.audit.real), `qualifying sessions (4+ working sets) of ${fmtN(A.audit.sessions)} logged`)
    + stat(fmtN(A.breaks.length), `gaps of 14+ days in the log`)
    + stat(fmtN(A.prog.filter(p=>p.status==="Progressing").length), `of ${A.prog.length} tracked exercises up 10%+`)
    + (B ? stat(sgn(W(B.last.w-B.first.w)), `${u} body weight change since ${d(B.first.t)}`) : stat("–", "body weight (not imported)"))
    + (B && B.trends.find(t=>t.label==="Last 12 weeks") ? stat(`${sgn(W(B.trends.find(t=>t.label==="Last 12 weeks").k), 2)}`, `${u}/week, last 12 weeks`) : stat(fmtN(median(A.sess.filter(x=>x.real&&!x.short).map(x=>x.s.minutes))||0)+"m", "median session"))
    + `</div>`;

  // data check
  h += `<section class="block"><div class="block-head"><h2>Data check</h2></div><div class="panel an-list"><ul>
    <li><b>${fmtN(au.sets)}</b> sets in <b>${fmtN(au.sessions)}</b> logged sessions, ${d(au.first)} to ${d(au.last)}, across <b>${fmtN(au.exercises)}</b> exercises. ${au.dups ? `${fmtN(au.dups)} duplicate set rows.` : "No duplicate set rows."}</li>
    <li><b>${fmtN(au.fragments)}</b> short workouts have 1–3 working sets. They're still logged workouts and their sets count in every total; they just don't count toward sessions per week.</li>
    <li><b>${fmtN(au.short)}</b> sessions have a flagged duration (under 15 or over 240 minutes). The export can't say why — a log entered later, a timer left running, or a split session. Their sets count, but they're left out of session-length figures.</li>
    <li>Set types: ${fmtN(au.warmups)} warm-up, ${fmtN(au.failure)} failure, ${fmtN(au.drop)} drop sets. RPE recorded on ${fmtN(au.rpe)} sets. ${fmtN(au.timed)} sets are timed or distance only. Exercise notes on ${fmtN(au.notes)} sets; descriptions on ${fmtN(au.descs)} workouts.</li>
    <li><b>${pct(au.modeShare)}</b> of sets with reps are exactly ${fmtN(au.modeRep)} reps. On <b>${pct(au.sameReps)}</b> of exercises with 2+ sets in a session, every set has the same rep count.</li>
    ${M ? `<li>Measurements export: ${fmtN(au.mRows)} rows. Columns with data: ${esc(M.cols.join(", ")||"none")}. Empty columns: ${esc(au.mEmpty.join(", ")||"none")}.</li>` : `<li>No measurements export imported, so body weight sections are hidden. In Hevy: Profile → Settings → Export & import data → Export measurements, then import it here.</li>`}
  </ul><details><summary>How each exercise is counted (${A.mapping.length})</summary>${table("anMap", ["Exercise", "Type", "Pattern", "Muscle credit", "Sets"],
    A.mapping.map(m=>[`<a href="#" data-ex="${esc(m.name)}" style="color:inherit">${esc(m.name)}</a>`, m.kind, esc(m.pattern), Object.entries(m.credit).map(([k,v])=>`${k} ${v}`).join(", ")||"–", fmtN(m.sets)]), [4])}</details></div></section>`;

  // consistency
  h += `<section class="block"><div class="block-head"><h2>Consistency</h2></div>
    <p class="note" style="margin:-4px 0 12px">A training block is a run of sessions with gaps under 14 days; a gap of 14 days or more starts a new one. Gaps describe this export only.</p>
    ${table("anBlocks", ["Block", "From", "To", "Days", "Sessions (4+ sets)", "Sessions / week", "Sets", "Sets / week", `Weight lifted (${u})`],
      A.blocks.map((bl,i)=>[i+1, d(bl.first), d(bl.last), fmtN(bl.days), `${fmtN(bl.real)} <span class="muted">of ${fmtN(bl.items.length)}</span>`, fmtN(bl.real/Math.max(1,bl.days/7),1), fmtN(bl.sets), fmtN(bl.sets/Math.max(1,bl.days/7),1), fmtN(W(bl.tonnage))]), [3,4,5,6,7,8])}
    <h3 style="margin-top:16px">Gaps of 14 days or more</h3>
    ${table("anBreaks", ["Last session before", "Next session", "Days"], A.breaks.map(br=>[d(br.from), d(br.to), fmtN(br.days)]), [2])}
    <h3 style="margin-top:16px">Time of day (sessions with 4+ sets)</h3>
    ${table("anTod", ["Time", "Sessions", "Median sets", `Median weight lifted (${u})`, "Median minutes"],
      A.tod.map(t=>[`${t.name} <span class="muted">${t.range}</span>`, fmtN(t.n), fmtN(t.sets), fmtN(t.tonnage==null?null:W(t.tonnage)), fmtN(t.minutes)]), [1,2,3,4])}
    <p class="note">Times are as exported by Hevy. If you trained in another time zone, those sessions show in the export's time zone.</p></section>`;

  // volume
  const bl = A.bal;
  h += `<section class="block"><div class="block-head"><h2>Volume by muscle</h2></div>
    <div class="panel"><h3>Sets per week</h3><div class="chart" style="height:420px"><canvas id="anMuscle"></canvas></div>
    <p class="note">Direct muscle = 1 set, secondary = ½ (credits across muscles add up to more than unique sets). Warm-up sets aren't counted. "Training weeks" averages every week inside a block, including empty ones. "Last 8 weeks" is the 8 calendar weeks ending with the latest session.</p></div>
    ${table("anMus", ["Muscle", "Training weeks avg", "Last 8 weeks avg", "Highest week"], A.muscle.map(m=>[m.mu, fmtN(m.all,1), fmtN(m.recent,1), fmtN(m.max,1)]), [1,2,3])}
    <h3 style="margin-top:16px">Balance</h3>
    ${table("anBal", ["", "All data", "Last 8 weeks"], [
      ["Push : pull sets", ratio(bl.all.push, bl.all.pull), ratio(bl.recent.push, bl.recent.pull)],
      ["Upper : lower (muscle sets)", ratio(bl.all.upper, bl.all.lower), ratio(bl.recent.upper, bl.recent.lower)],
      ["Quads : hamstrings", ratio(bl.all.quads, bl.all.ham), ratio(bl.recent.quads, bl.recent.ham)],
      ["Quads : hamstrings + glutes", ratio(bl.all.quads, bl.all.hamGlute), ratio(bl.recent.quads, bl.recent.hamGlute)],
      ["Front : back of body", ratio(bl.all.ant, bl.all.post), ratio(bl.recent.ant, bl.recent.post)]])}
    <p class="note">How to read: “99 : 62 (1.60)” means 1.6 sets of the first kind for every set of the second. These are descriptions of your log, not targets — 1 : 1 isn't required. Push and pull count sets by movement pattern; the other rows count muscle credit. Front of body = chest, quads, core, biceps; back of body = back, hamstrings, glutes, calves.</p>
    <h3 style="margin-top:16px">Exercise variety by block</h3>
    ${table("anVar", ["Block", "Dates", "Exercises", "New", "Kept from previous block", "Sets on exercises done before"],
      A.variety.map(v=>[v.block, `${fmtDate(v.first)} – ${fmtDate(v.last)}`, fmtN(v.distinct), fmtN(v.fresh), v.kept==null?"–":`${v.kept} of ${v.prevN}`, v.known==null?"–":pct(v.known)]), [2,3,5])}</section>`;

  // strength
  const unitOf = p => p.weightish ? ` ${u}` : "";
  const val = p => x => p.weightish ? fmtW(x) : fmtN(x, p.label==="longest set, min" ? 1 : 0);
  h += `<section class="block"><div class="block-head"><h2>Strength progression</h2></div>
    <div class="panel"><h3>Change between your earliest and latest sessions (up to 3 each; exercises with 4+ sessions)</h3><div class="chart" id="anProgBox"><canvas id="anProg"></canvas></div></div>
    ${table("anProgT", ["Exercise", "Measure", "Sessions", "First 3 avg", "Last 3 avg", "Best", "Change", "Per active month", "Sessions since best", "Status"],
      A.prog.map(p=>[`<a href="#" data-ex="${esc(p.name)}" style="color:inherit;font-weight:600">${esc(p.name)}</a>`, p.label + unitOf(p), fmtN(p.sessions), val(p)(p.f), val(p)(p.l), val(p)(p.best),
        `${sgn(p.pct,0)}%`, `${sgn(p.perMonth,1)}%`, fmtN(p.since), `<span class="an-st an-${p.status.toLowerCase()}">${STATUS_LABEL[p.status]}</span>`]), [2,3,4,5,6,7,8])}
    <details class="method"><summary>How this is calculated</summary><div class="method-body">
      <p>Loaded exercises are compared by actual top set. Estimated one-rep max uses Epley, weight × (1 + reps ÷ 30), and is treated as low confidence from sets of 11+ reps. Assisted exercises use least assistance (lower is better), or body weight minus assistance when a weigh-in is within 7 days.</p>
      <p>Change compares the average of your earliest sessions with your latest ones (up to 3 each, never overlapping). Higher recent performance = +10% or more. Lower recent performance = below −5%. No recent personal best = your best was 5+ sessions ago. Otherwise, similar recent performance.</p>
      <p>Recovery after a gap is only searched within the next training block; body weight is matched only from weigh-ins within 7 days or a ≤14-day bracket.</p>
    </div></details>
    <h3 style="margin-top:16px">Strength across breaks</h3>
    ${table("anBrk", ["Break", "Exercise", "Last before", "First after", "Change", "Back to pre-break level at session"],
      A.brk.map(r=>[`${fmtDate(r.br.from)} → ${fmtDate(r.br.to)} (${r.br.days} d)`, esc(r.name) + (r.asst?' <span class="muted">(assistance)</span>':""), fmtW(r.pv), fmtW(r.p1),
        Math.abs(r.change) < 0.05 ? "same" : r.asst ? `${fmtN(W(Math.abs(r.change)),1)} ${u} ${r.change>0?"less":"more"} help` : `${sgn(W(r.change))} ${u}`, r.regain ? `#${r.regain}` : "not within this block"]), [2,3,4,5])}
    <p class="note">Compares the top working weight (or least assistance) in the last session within 30 days before a break with the first session within 21 days after it.</p>
    <h3 style="margin-top:16px">Within-session patterns</h3>
    <div class="panel an-list"><ul>
      <li>${fmtN(au.weightedGroups)} loaded or assisted exercise-sessions with 2+ working sets: <b>${pct(au.straight)}</b> same weight on every set, <b>${pct(au.ramp)}</b> ended heavier than they started, <b>${pct(au.dropW)}</b> ended lighter.</li>
      <li>On straight-weight exercises, <b>${pct(au.repDrop)}</b> show fewer reps on the last set than the first.</li>
    </ul></div></section>`;

  // body weight
  if(B){
    h += `<details class="block advanced"><summary><h2>Advanced: body-weight trends estimated between weigh-ins</h2></summary>
      <p class="note">The Body weight section above shows your recorded weigh-ins and averages of them. The tables and chart here also estimate weights between weigh-ins (interpolation), so their numbers can differ.</p>
      <section class="block first"><div class="block-head"><h2>Weight estimates</h2></div>
      <div class="stats an-stats">${stat(fmtW(B.first.w), `${u} first, ${d(B.first.t)}`)}${stat(fmtW(B.minP.w), `${u} lowest, ${d(B.minP.t)}`)}${stat(fmtW(B.maxP.w), `${u} highest, ${d(B.maxP.t)}`)}${stat(fmtW(B.last.w), `${u} latest, ${d(B.last.t)}`)}</div>
      <div class="panel"><h3>Recorded weigh-ins and an interpolated 7-day average</h3><div class="chart tall"><canvas id="anBW"></canvas></div>
      <p class="note">Shaded bands are training breaks. The average is drawn from straight lines between weigh-ins and isn't drawn across gaps of 30+ days without a weigh-in.</p></div>
      ${table("anTrend", ["Period", "From", "To", "Weigh-ins", "Trend start", "Trend end", `${u} / week`, "% of body weight / week"],
        B.trends.map(t=>[t.label, d(t.from), d(t.to), fmtN(t.n), fmtW(t.start), fmtW(t.end), sgn(W(t.k),2), sgn(t.pct,2)]), [3,4,5,6,7])}
      <p class="note">Least-squares line through the weigh-ins in each period. A new weigh-in stretch starts after any 30+ day gap.</p>
      ${B.others.length ? `<h3 style="margin-top:16px">Other measurements</h3>${table("anOther", ["Measurement", "Entries", "First", "Latest", "Change"],
        B.others.map(o=>[esc(o.col.replace(/_/g," ")), fmtN(o.n), `${fmtN(o.first[o.col],1)} <span class="muted">${d(o.first.date)}</span>`, `${fmtN(o.last[o.col],1)} <span class="muted">${d(o.last.date)}</span>`, sgn(o.last[o.col]-o.first[o.col],1)]), [1,4])}` : ""}
      </section>`;
    h += `<section class="block"><div class="block-head"><h2>Training and body weight</h2></div>
      ${table("anPer", ["Period", "From", "To", "Days", `Weight at start (${u})`, `Weight at end (${u})`, `Change (${u})`, `${u} / week`, "Weigh-ins inside"],
        B.periods.map(p=>[p.label, d(p.a), d(p.b), fmtN(p.days), fmtW(p.w0), fmtW(p.w1), sgn(W(p.w1-p.w0)), sgn(W(p.w1-p.w0)/(p.days/7),2), fmtN(p.inside)]), [3,4,5,6,7,8])}
      <p class="note">Start and end weights are interpolated between weigh-ins. Periods without a weigh-in within 14 days of both ends are left out.</p>
      <h3 style="margin-top:16px">Weekly correlation</h3>
      ${table("anCorr", ["Training measure", "Weight change: same week", "1 week later", "2 weeks later", "3 weeks later"],
        B.corr.map(c=>[c.key, ...c.lags.map(l => l.r==null || l.n<6 ? `– <span class="muted">n=${l.n}</span>` : `${fmtN(clean(l.r,2),2)} <span class="muted">n=${l.n}</span>`)]), [1,2,3,4])}
      <p class="note">Each value is a Spearman rank correlation between a week's training and the change in average body weight in the same week or a later one; n is the number of paired weeks. Positive values mean weeks with more training tended to come with weight increases, negative with decreases. Correlation doesn't show cause, and with few paired weeks these values are unstable. Diet, running, sleep and water aren't in the data.</p>
      <h3 style="margin-top:16px">Strength relative to body weight</h3>
      ${table("anRel", ["Exercise", "Measure", "First 3 (× body weight)", "Last 3 (× body weight)", `Absolute (${u})`, `Body weight (${u})`],
        B.rel.map(r=>[esc(r.name), r.kind==="assisted"?"estimated effective one-rep max ÷ body weight":"estimated one-rep max ÷ body weight", fmtN(r.f,2), fmtN(r.l,2), `${fmtW(r.fAbs,0)} → ${fmtW(r.lAbs,0)}`, `${fmtW(r.fBW,0)} → ${fmtW(r.lBW,0)}`]), [2,3])}
      <p class="note">Relative strength is a multiple of body weight: 1.2× means 1.2 times your body weight.</p>
      </section></details>`;
  }
  $("anRoot").innerHTML = h;

  // charts
  // same meanings as everywhere: comparison = series-2, baseline = muted, progress = series-1
  const blue = cv("--series-2"), slate = cv("--series-muted"), red = cv("--series-2"), green = cv("--series-1"), yellow = cv("--cat-3");
  draw("anMuscle", {type:"bar", data:{labels:MUSCLES, datasets:[
      {label:"Training weeks avg", data:A.muscle.map(m=>+m.all.toFixed(1)), backgroundColor:slate, borderRadius:3, maxBarThickness:26},
      {label:"Last 8 weeks avg", data:A.muscle.map(m=>+m.recent.toFixed(1)), backgroundColor:blue, borderRadius:3, maxBarThickness:26}]},
    options:(()=>{ const o = baseOpts({indexAxis:"y"}); const bx = o.scales.x, by = o.scales.y;
      o.scales = {x:{...by, title:{display:true, text:"sets / week", color:cv("--muted")}}, y:{...bx, ticks:{...bx.ticks, autoSkip:false}}};
      o.plugins.legend.display = true; o.plugins.legend.position = "bottom"; return o; })()}, "m");
  const P = A.prog, colors = {Progressing:green, Flat:slate, Stalled:yellow, Regressed:red};
  const box = $("anProgBox"); if(box) box.style.height = Math.max(200, P.length*24+50)+"px";
  draw("anProg", {type:"bar", data:{labels:P.map(p=>p.name.length>30 ? p.name.slice(0,29)+"…" : p.name), datasets:[{data:P.map(p=>+p.pct.toFixed(1)), backgroundColor:P.map(p=>colors[p.status]), borderRadius:3}]},
    options:(()=>{ const o = baseOpts({indexAxis:"y"}); const bx = o.scales.x, by = o.scales.y; o.scales = {x:{...by, beginAtZero:true, ticks:{...by.ticks, callback:v=>v+"%"}}, y:{...bx, ticks:{...bx.ticks, autoSkip:false}}};
      o.plugins.tooltip.callbacks = {label:i=>` ${STATUS_LABEL[P[i.dataIndex].status]}: ${i.raw>0?"+":""}${i.raw}% (${P[i.dataIndex].label})`}; o.onClick = (e, els)=>{ if(els.length) ctx.openExercise(P[els[0].index].name); }; return o; })()}, "p"+P.length);
  if(B){
    const pts = B.avg.map(p=>({x:p.x, y:p.y==null?null:+W(p.y).toFixed(2)}));
    const raw = bodyPoints(M).map(p=>({x:p.t, y:+W(p.w).toFixed(2)}));
    const xmin = Math.min(B.first.t, +A.sess[0].day), xmax = Math.max(B.last.t, +A.sess[A.sess.length-1].day);
    const o = baseOpts();
    o.parsing = false; o.interaction = {mode:"nearest", intersect:false, axis:"x"};
    o.scales.x = {type:"linear", min:xmin, max:xmax, grid:{display:false}, border:{color:cv("--line")},
      ticks:{color:cv("--muted"), autoSkip:false, maxRotation:0, callback:v=>new Date(v).toLocaleDateString(undefined,{month:"short", year:"2-digit"}), font:{family:"Inter", size:12}},
      afterBuildTicks:axis => { axis.ticks = monthTicks(xmin, xmax, axis.chart.width < 500 ? 4 : 7).map(value => ({value})); }};
    o.scales.y.beginAtZero = false; o.scales.y.title = {display:true, text:u, color:cv("--muted")};
    o.plugins.legend.display = true; o.plugins.legend.position = "bottom";
    o.plugins.tooltip.callbacks = {title:i=>i.length ? fmtDate(new Date(i[0].parsed.x)) : "", label:i=>` ${i.dataset.label}: ${fmtN(i.parsed.y,1)} ${u}`};
    o.plugins.tlBands = {ranges:A.breaks.map(br=>[+br.from, +br.to]), color:cv("--soft")};
    draw("anBW", {type:"line", plugins:[BANDS], data:{datasets:[
        {label:"Weigh-in", data:raw, showLine:false, pointRadius:2.5, pointBackgroundColor:slate, borderColor:slate},
        {label:"7-day average", data:pts, pointRadius:0, borderColor:red, borderWidth:2, tension:.2, spanGaps:false}]}, options:o}, "bw");
  }
  countUp([...document.querySelectorAll("#anRoot .stats b")]);
  ["anBlocks","anProgT"].forEach(id => $(id) && staggerRows(id));
}
function monthTicks(min, max, most){   // first-of-month ticks, every 1/2/3/6/12 months so at most `most` labels fit
  const months = (new Date(max).getFullYear()-new Date(min).getFullYear())*12 + new Date(max).getMonth()-new Date(min).getMonth();
  const step = [1,2,3,6,12,24].find(s => months/s <= most) || 24, out = [];
  const d = new Date(new Date(min).getFullYear(), new Date(min).getMonth()+1, 1);
  while(d.getMonth() % step) d.setMonth(d.getMonth()+1);
  for(; +d <= max; d.setMonth(d.getMonth()+step)) out.push(+d);
  return out;
}
function bodyPoints(M){ const out = []; for(const r of M.rows) if(r.w!=null) out.push({t:+dayStart(r.date), w:r.w}); return out.sort((a,b)=>a.t-b.t); }
const BANDS = {id:"tlBands", beforeDatasetsDraw(chart, args, opts){
  const r = opts && opts.ranges; if(!r || !r.length) return;
  const {ctx, chartArea:a, scales:{x}} = chart; ctx.save(); ctx.fillStyle = opts.color || "rgba(0,0,0,.06)";
  for(const [s, e] of r){ const x0 = Math.max(a.left, x.getPixelForValue(s)), x1 = Math.min(a.right, x.getPixelForValue(e)); if(x1 > x0) ctx.fillRect(x0, a.top, x1-x0, a.bottom-a.top); }
  ctx.restore(); }};

export const TLAnalysis = {render, classify, compute};
import { match as bwMatch } from "../lib/bodyWeight.js";
