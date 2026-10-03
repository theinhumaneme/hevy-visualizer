import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepare, parseRows, inUnit, startOfDay, deriveMetrics } from "./lib/derive.js";
import { parseCSV, readExports } from "./lib/csv.js";
import { synthCSV } from "./lib/synthetic.js";
import { resolveRange } from "./lib/ranges.js";
import Landing from "./components/Landing.jsx";
import DataReview from "./components/DataReview.jsx";
import HelpDrawer from "./components/HelpDrawer.jsx";
import TopBar, { TABS } from "./components/TopBar.jsx";
import { RangeMenu } from "./components/RangePicker.jsx";
import Story from "./components/Story.jsx";
import Recap from "./components/Recap.jsx";
import Compare from "./components/Compare.jsx";
// Chart.js only loads when a dashboard tab is opened
const Dashboard = lazy(() => import("./components/Dashboard.jsx"));

const IDS = TABS.map(t => t[0]);
const DASH = new Set(["overview", "exercises", "records", "history", "analysis"]);
const tabFromHash = () => { const t = location.hash.replace("#", ""); return IDS.includes(t) ? t : "story"; };
const pref = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const motionMQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

/* Stateless: the exports live only in this tab's memory. Reloading the page starts over.
   (localStorage holds only display preferences: motion, ambient, units.) */
export default function App() {
  const [data, setData] = useState(null);   // { parsed, workoutsText, workoutsName, measurements, measureText, measureName, synthetic }
  const [tab, setTab] = useState(tabFromHash);
  const [banner, setBanner] = useState(null);
  const [range, setRange] = useState({ id: "all" });             // Story + the dashboard tabs
  const [recapRange, setRecapRange] = useState({ id: "lastMonth" });
  const [unit, setUnitState] = useState(() => { const u = pref.get("story:unit"); return u === "lbs" ? "lb" : u; });   // older saves used "lbs"   // null = the export's own unit
  const [reduced, setReduced] = useState(() => { const p = pref.get("story:motion"); return p ? p === "reduce" : motionMQ.matches; });
  const [ambientPaused, setAmbientPaused] = useState(() => pref.get("story:ambient") === "paused");
  const [dragging, setDragging] = useState(false);
  const [corrections, setCorrections] = useState({ muscles: {}, exclude: [] });   // athlete fixes, this tab only
  const [review, setReview] = useState(false);
  const [help, setHelp] = useState(false);
  const [welcome, setWelcome] = useState(false);   // shown once per loaded export; reopen from Help
  const chooser = useRef(null);
  const [target, setTargetState] = useState(() => +pref.get("story:target") || null);   // weekly session target (A03); null = inferred
  const setTarget = t => { setTargetState(t); pref.set("story:target", String(t)); };
  const depth = useRef(0);

  useEffect(() => { const f = () => setTab(tabFromHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { document.body.classList.toggle("paused", ambientPaused); }, [ambientPaused]);
  useEffect(() => { document.documentElement.classList.toggle("reduced", reduced); }, [reduced]);
  // follow the OS setting live, unless the athlete chose explicitly in the app
  useEffect(() => {
    if (!motionMQ.addEventListener) return;
    const f = () => { if (!pref.get("story:motion")) setReduced(motionMQ.matches); };
    motionMQ.addEventListener("change", f); return () => motionMQ.removeEventListener("change", f);
  }, []);
  // plain buttons anywhere (including the HTML-string views) can open the review or the file chooser
  useEffect(() => {
    const f = e => { if (e.target.closest?.("[data-open-review]")) setReview(true); if (e.target.closest?.("[data-choose-files]")) chooser.current?.click(); };
    document.addEventListener("click", f); return () => document.removeEventListener("click", f);
  }, []);

  const go = useCallback(t => { if (location.hash !== "#" + t) history.pushState(null, "", "#" + t); setTab(t); scrollTo({ top: 0 }); }, []);
  const setUnit = u => { setUnitState(u); pref.set("story:unit", u); };

  const load = useCallback(async files => {
    const r = await readExports(files);
    const errs = r.errors;
    const needWorkouts = !r.workouts && !data && r.measurements;
    if (needWorkouts) errs.push("Add a Hevy workout export to continue. Measurements are optional and add body-weight context.");
    if (r.workouts || (r.measurements && data)) {
      setData(prev => ({
        parsed: r.workouts ? r.workouts.parsed : prev.parsed,
        workoutsText: r.workouts ? r.workouts.text : prev.workoutsText,
        workoutsName: r.workouts ? r.workouts.name : prev.workoutsName,
        synthetic: r.workouts ? false : prev.synthetic,
        // a new workouts file keeps body weight you already added
        measurements: r.measurements ? r.measurements.list : prev?.measurements ?? null,
        measureText: r.measurements ? r.measurements.text : prev?.measureText ?? null,
        measureName: r.measurements ? r.measurements.name : prev?.measureName ?? null,
      }));
      if (r.workouts) { setRange({ id: "all" }); setCorrections({ muscles: {}, exclude: [] }); setWelcome(true); scrollTo({ top: 0 }); }
    }
    setBanner(errs.length ? { text: errs.join(" "), err: true, title: needWorkouts && errs.length === 1 ? "Workout export needed" : null } : null);
  }, [data]);

  const loadSample = () => {
    const text = synthCSV();
    setData({ parsed: parseRows(parseCSV(text)), workoutsText: text, workoutsName: "sample data", synthetic: true, measurements: null, measureText: null, measureName: null });
    setRange({ id: "all" }); setBanner(null); setCorrections({ muscles: {}, exclude: [] });
  };
  const clear = () => { setData(null); setBanner(null); history.replaceState(null, "", location.pathname); setTab("story"); scrollTo({ top: 0 }); };

  // drop files anywhere, on any screen
  useEffect(() => {
    const enter = e => { if (![...(e.dataTransfer?.types || [])].includes("Files")) return; e.preventDefault(); depth.current++; setDragging(true); };
    const leave = () => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } };
    const over = e => e.preventDefault();
    const drop = e => { e.preventDefault(); depth.current = 0; setDragging(false); if (e.dataTransfer?.files?.length) load(e.dataTransfer.files); };
    addEventListener("dragenter", enter); addEventListener("dragleave", leave); addEventListener("dragover", over); addEventListener("drop", drop);
    return () => { removeEventListener("dragenter", enter); removeEventListener("dragleave", leave); removeEventListener("dragover", over); removeEventListener("drop", drop); };
  }, [load]);

  const U = unit || (data && data.parsed.unit) || "lb";
  const base = useMemo(() => data && prepare(inUnit(data.parsed, U), corrections), [data, U, corrections]);
  const bounds = useMemo(() => base && { min: startOfDay(base.audit.first), max: startOfDay(new Date()) }, [base]);
  const res = useMemo(() => resolveRange(range), [range]);
  // one set of range metrics feeds Story, Compare and the dashboard tabs
  const M = useMemo(() => base && deriveMetrics(base, { from: res.from, to: res.to, measurements: data.measurements || [], target }), [base, res, data, target]);
  // presentation context: the cinematic finish on Landing/Story, a quieter one on data-heavy views
  const [sampleDismissed, setSampleDismissed] = useState(false);
  const showSample = !!data?.synthetic && !banner && !sampleDismissed;
  useEffect(() => {
    const h = document.documentElement;
    h.classList.toggle("view-data", !!data && tab !== "story");
    h.classList.toggle("has-banner", !!banner || showSample);
    h.classList.toggle("has-welcome", !!data && welcome);
  }, [data, tab, banner, showSample, welcome]);
  const source = data && (data.synthetic ? "Sample data — not a real athlete"
    : `${data.workoutsName}${data.measureName ? ` + ${data.measureName}` : ""} · read in this browser, never uploaded`);

  return (
    <>
      <div className="ambient" aria-hidden="true"><i /><i /></div>
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="tip" id="tip" role="status" hidden />
      <input ref={chooser} type="file" accept=".csv,text/csv" multiple hidden onChange={e => { load(e.target.files); e.target.value = ""; }} />
      <div className={"drop" + (dragging && data ? " on" : "")} aria-hidden="true">
        <p>Drop your Hevy exports<small>Workouts CSV, and optionally measurements. They stay in this browser.</small></p>
      </div>

      {!data ? <Landing onFiles={load} onSample={() => { setSampleDismissed(false); setWelcome(true); loadSample(); }} reduced={reduced} dragging={dragging} /> : (
        <>
          <TopBar tab={tab} onTab={go} data={data} onFiles={load} onClear={clear} onReview={() => setReview(true)} onHelp={() => setHelp(true)} unit={U} onUnit={setUnit}
            reduced={reduced} onReduced={v => { setReduced(v); pref.set("story:motion", v ? "reduce" : "full"); }}
            ambientPaused={ambientPaused} onAmbient={v => { setAmbientPaused(v); pref.set("story:ambient", v ? "paused" : "running"); }}>
            {(tab === "story" || tab === "compare" || DASH.has(tab)) && <RangeMenu value={range} onChange={setRange} min={bounds.min} max={bounds.max} />}
          </TopBar>
          {tab === "story" && <Story M={M} range={range} onRange={setRange} bounds={bounds}
            reduced={reduced} source={source} synthetic={data.synthetic} />}
          {tab === "recap" && <Recap base={base} measurements={data.measurements} target={target} range={recapRange} onRange={setRecapRange} bounds={bounds}
            reduced={reduced} synthetic={data.synthetic} />}
          {tab === "compare" && <Compare base={base} res={res} M={M} reduced={reduced} />}
          {DASH.has(tab) && <Suspense fallback={<div className="skeleton" role="status" aria-label="Loading charts"><i style={{ height: 28, width: "40%" }} /><i style={{ height: 96 }} /><i style={{ height: 280 }} /></div>}><Dashboard tab={tab} onTab={go} base={base} measurements={data.measurements} M={M} unit={U} from={res.from} to={res.to} rangeId={range.id} rangeLabel={res.title} reduced={reduced}
            target={target || (M && !M.empty ? M.streak.inferredTarget : 2)} onTarget={setTarget} /></Suspense>}
          <footer>{source}</footer>
          <HelpDrawer open={help} onClose={() => setHelp(false)} onWelcome={() => setWelcome(true)} onTab={go} />
          {welcome && (
            <aside className="welcome" role="status" aria-label="Getting started">
              <h2>Your training is loaded</h2>
              <p>Start with Overview for your training summary, or scroll through Story for the highlights. Choose a date range at the top to explore a specific period.</p>
              <div className="btn-row">
                <button className="btn" type="button" onClick={() => { setWelcome(false); go("overview"); }}>Open Overview</button>
                <button className="btn ghost" type="button" onClick={() => setWelcome(false)}>Dismiss</button>
              </div>
              <p className="note" style={{ marginTop: 0 }}>You can reopen this from Help.</p>
            </aside>
          )}
          <DataReview open={review} onClose={() => setReview(false)} base={base} M={M} corrections={corrections} onCorrections={setCorrections} />
        </>
      )}
      {banner && (
        <div className={"banner" + (banner.err ? " err" : "")} role="alert">
          <b>{banner.title || (banner.err ? "We couldn't read this file" : "Note")}</b>{banner.text}
          <button className="chip" type="button" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}
      {showSample && (
        <div className="banner" role="status"><b>Example data</b>You're exploring example workouts. Load your Hevy export to see your own results.
          <button className="chip" type="button" onClick={() => setSampleDismissed(true)}>Dismiss</button></div>
      )}
    </>
  );
}
