import { useRef, useState } from "react";
import { useDialog } from "../lib/useDialog.js";
import { GLOSSARY } from "../lib/glossary.js";

const VIEWS = [
  ["Story", "Explore the highlights of your logged training, from consistency to exercise progress. Scroll from top to bottom."],
  ["Recap", "Totals and highlights for one period, with changes from the previous period. It has its own period picker."],
  ["Overview", "How often you trained, how much work you logged, and which exercises and muscle groups you trained."],
  ["Exercises", "One exercise in depth: sets, weights, reps and progress at comparable weights and reps."],
  ["Records", "New personal records and your best logged performance for each exercise."],
  ["History", "Every logged workout. Open one to see its exercises and sets."],
  ["Analysis", "Training frequency, muscle-group sets, exercise trends and body-weight context. Full history by default."],
  ["Compare", "Two workouts side by side, or the trends of up to four exercises."],
];

/* Help: getting started, what each view is for, metric definitions, and where the calculations are explained. */
export default function HelpDrawer({ open, onClose, onWelcome, onTab }) {
  const box = useRef(null);
  const [tab, setTab] = useState("start");
  useDialog(open, box, onClose, { modal: true });
  if (!open) return null;
  return (
    <div className="drawer-wrap" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" ref={box} role="dialog" aria-modal="true" aria-labelledby="helpTitle" tabIndex={-1}>
        <header className="drawer-head">
          <div><p className="eyebrow"><i>●</i>Help</p><h2 id="helpTitle" className="h2 small">How to use Training Story</h2></div>
          <button className="chip" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="seg" role="tablist" aria-label="Help sections">
          {[["start", "Getting started"], ["terms", "Metric definitions"], ["calc", "How calculations work"]].map(([k, l]) =>
            <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === "start" && <>
          <p className="purpose">Start with Overview for your training summary, or scroll through Story for the highlights. Choose a date range at the top to explore a specific period; lb/kg switches units everywhere.</p>
          <ul className="help-list">{VIEWS.map(([v, d]) => <li key={v}><b>{v}</b> — <span className="muted">{d}</span></li>)}</ul>
          <p className="note">Story versus Overview: Story is a guided highlight reel; Overview is the full summary with charts you can explore. Exercises explores one exercise; Compare → Exercises puts several side by side.</p>
          <div className="btn-row"><button className="btn ghost" type="button" onClick={() => { onClose(); onWelcome(); }}>Show the welcome note again</button></div>
        </>}
        {tab === "terms" && <dl className="glossary">{Object.values(GLOSSARY).map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>}
        {tab === "calc" && <>
          <p className="purpose">Every view uses the same definitions and the same imported data.</p>
          <ul className="help-list">
            <li><b>Working sets</b> exclude warm-ups and cardio. <b>Qualifying sessions</b> have 4+ working sets; shorter workouts still count their sets.</li>
            <li><b>Weight lifted</b> is weight × reps on working sets with external load. Bodyweight sets and machine assistance aren't included.</li>
            <li><b>Records</b> compare each workout with every earlier entry for the same exercise in your imported history.</li>
            <li><b>Estimated one-rep max</b> uses Epley and is low confidence from sets of 11+ reps; charts lead with actual weight.</li>
            <li><b>Body weight</b> is matched to a workout only from a weigh-in the same day, within 7 days, or between weigh-ins no more than 14 days apart.</li>
          </ul>
          <p className="note">The full list — exclusions, flagged durations and muscle assignments — is at the end of Story (“How metrics are calculated”) and in Files &amp; settings → Review imported data.</p>
          <div className="btn-row"><button className="btn ghost" type="button" onClick={() => { onClose(); onTab("story"); setTimeout(() => document.getElementById("s-audit")?.scrollIntoView(), 400); }}>Open “How metrics are calculated”</button></div>
        </>}
      </aside>
    </div>
  );
}
