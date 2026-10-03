import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { setData, mount, update } from "../dashboard/legacy.js";
import { deriveMetrics } from "../lib/derive.js";
import CoveragePanel from "./CoveragePanel.jsx";
import ConsistencyPanel from "./ConsistencyPanel.jsx";
import ProgressionExplorer from "./ProgressionExplorer.jsx";
import MuscleDosePanel from "./MuscleDosePanel.jsx";
import BodyWeightPanel from "./BodyWeightPanel.jsx";

// title, purpose, and the interactions each tab really supports
const TITLES = {
  overview: ["Overview", "See how often you trained, how much work you logged, and which exercises and muscle groups you trained.",
    "Hover, tap or focus a chart for its numbers. Select an exercise in “Top exercises” to open its progress."],
  exercises: ["Exercises", "Choose an exercise to explore its sets, weights, reps and progress over time.",
    "To compare several exercises' trends, use Compare → Exercises."],
  records: ["Records", "Explore new personal records and your best logged performances for each exercise.",
    "Select an exercise name to open its progress. Select a column heading in “Loaded exercises” to sort."],
  history: ["History", "Browse your logged workouts. Open a workout to see its exercises and sets.",
    "Filter by workout or exercise name."],
  analysis: ["Analysis", "Explore training frequency, muscle-group sets, exercise trends and body-weight context.",
    "Analysis covers your full history unless you switch it to the selected range below."],
};
const dl = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Hosts the dashboard tabs. The ported renderer owns everything inside `root`; the metric panels around it
// are React. All of them read the same prepared model (`base`) and range metrics (`M`).
export default function Dashboard({ tab, onTab, base, measurements, M, unit, from, to, rangeId, rangeLabel, reduced, target, onTarget }) {
  const root = useRef(null), hooks = useRef({});
  const [analysisRange, setAnalysisRange] = useState("full");
  const [exercise, setExercise] = useState(null);
  hooks.current.openTab = onTab;
  const U = unit === "kg" ? "kg" : "lb";
  // Analysis defaults to the full history; its React sections follow the same scope switch
  const Mfull = useMemo(() => tab === "analysis" ? deriveMetrics(base, { measurements: measurements || [], target }) : null, [tab, base, measurements, target]);
  const MA = tab === "analysis" && analysisRange === "full" ? Mfull : M;
  useLayoutEffect(() => {
    setData(base, measurements, M);
    return mount(root.current, tab, { unit: U, from, to, reduced, analysisRange }, { openTab: t => hooks.current.openTab(t), onExercise: ex => setExercise(ex) });
  }, [tab, base, measurements, reduced]);
  useLayoutEffect(() => { setData(base, measurements, M); update({ unit: U, from, to, analysisRange }); }, [M, U, from, to, analysisRange]);
  const [title, sub, help] = TITLES[tab];
  const scopeM = tab === "analysis" ? MA : M;
  const filtered = tab === "analysis" ? analysisRange === "range" && rangeId !== "all" : rangeId !== "all";
  return (
    <main className="dash">
      <div className="wrap">
        <p className="eyebrow"><i>●</i>{filtered ? rangeLabel : tab === "analysis" ? "Full history" : "All time"}</p>
        <h1 className="view-title">{title}</h1>
        <p className="purpose">{sub}</p>
        <p className="scope-line">{scopeM && !scopeM.empty ? <>Showing <b>{dl(scopeM.rangeStart)} – {dl(scopeM.rangeEnd)}</b>{tab === "analysis" ? "" : " · change it with the date range at the top"}. </> : null}{help}</p>
        {tab === "overview" && <CoveragePanel base={base} M={M} />}
        {tab === "analysis" && (<>
          <div className="seg scope" role="group" aria-label="Analysis covers">
            <button type="button" aria-pressed={analysisRange === "full"} onClick={() => setAnalysisRange("full")}>Full history</button>
            <button type="button" aria-pressed={analysisRange === "range"} onClick={() => setAnalysisRange("range")} disabled={rangeId === "all"}
              title={rangeId === "all" ? "Pick a date range in the top bar first" : undefined}>Selected range{rangeId !== "all" ? ` (${rangeLabel})` : ""}</button>
          </div>
          <nav className="section-nav" aria-label="Analysis sections">
            {[["an-muscles", "Muscles"], ["an-weight", "Body weight"], ["anRoot", "Blocks, balance & progression"]].map(([id, l]) =>
              <a key={id} href={"#" + id} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); }}>{l}</a>)}
          </nav>
          {MA && !MA.empty && <MuscleDosePanel base={base} M={MA} reduced={reduced} />}
          {MA && <BodyWeightPanel M={MA} unit={base.unit} reduced={reduced} />}
        </>)}
        <div ref={root} />
        {tab === "overview" && <ConsistencyPanel base={base} M={M} target={target} onTarget={onTarget} reduced={reduced} />}
        {tab === "exercises" && !M.empty && <ProgressionExplorer key={exercise} base={base} M={M} exercise={exercise} reduced={reduced} />}
      </div>
    </main>
  );
}
