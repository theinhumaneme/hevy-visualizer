import { useEffect, useRef } from "react";
import { gsap, T, EASE } from "../lib/motion.js";

const PREVIEW = [
  ["var(--series-1)", "Consistency", "Calendar, streaks and weekly rhythm"],
  ["var(--series-2)", "Progress", "Comparable sets, reps at a load, trends"],
  ["var(--series-record)", "Records", "Every new best, judged against your history"],
  ["var(--series-3)", "Comparisons", "Any two workouts or up to four lifts"],
];

/* First screen, in order: headline → upload (primary action) → sample data → privacy → how to export → what you get.
   The drop area has distinct hover, keyboard-focus and drag-over states. */
export default function Landing({ onFiles, onSample, reduced, dragging }) {
  const root = useRef(null), input = useRef(null);
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (reduced) { gsap.from(".land-inner", { opacity: 0, duration: T.fast }); return; }   // crossfade only
      gsap.from(".land .mask>span", { yPercent: 110, duration: T.slow, ease: EASE.out, stagger: T.stagger * 1.4, delay: 0.1 });
      gsap.from(".land .reveal", { opacity: 0, y: 12, duration: T.base, ease: EASE.out, stagger: T.stagger, delay: 0.4 });
    }, root);
    return () => ctx.revert();
  }, [reduced]);
  const words = "See your training progress clearly.".split(" ");
  return (
    <main className="land" ref={root}>
      <div className="land-inner">
        <header className="land-head">
          <p className="eyebrow reveal"><i>●</i>Training Story · for Hevy exports</p>
          <h1 className="land-title">{words.map((w, i) => <span key={i} className="mask"><span>{w}&nbsp;</span></span>)}</h1>
          <p className="lede reveal">Explore your consistency, exercise progress and personal records from your Hevy workout history.</p>
        </header>

        <section className="land-upload reveal" aria-label="Add your export">
          <div className={"dropzone" + (dragging ? " is-drag" : "")} role="button" tabIndex={0} aria-describedby="dz-hint"
            onClick={() => input.current.click()}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current.click(); } }}>
            <span className="dz-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V4M7 9l5-5 5 5M4 15v5h16v-5" /></svg></span>
            <b>{dragging ? "Release to load your files" : "Drop your Hevy CSV here"}</b>
            {!dragging && <span className="dz-cta">or choose files</span>}
            <small id="dz-hint">workouts.csv is required · measurement_data.csv is optional — select both at once</small>
            <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="land-alt"><span>No export handy?</span><button className="btn ghost" type="button" onClick={onSample}>Try it with sample data</button></div>
          <div className="privacy">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
            <div>
              <span>Your files are processed in this browser and never uploaded.</span>
              <details className="method"><summary>What's kept, and where</summary><div className="method-body">
                <p>Your workout and measurement files are read in this browser tab and never sent anywhere. Reloading or closing the tab clears the loaded data, including any corrections you make in Data review.</p>
                <p>Display preferences — units, reduced motion, the background effect — and your weekly workout target are saved on this device so they're ready next time.</p>
              </div></details>
            </div>
          </div>
        </section>

        <section className="land-how card reveal" aria-labelledby="howTitle">
          <h2 id="howTitle">How to export from Hevy</h2>
          <ol className="how">
            <li><span><b>Open Hevy</b> → Profile → Settings</span></li>
            <li><span><b>Export &amp; import data</b> → Export workouts</span></li>
            <li><span>Optional: <b>Export measurements</b> for body weight</span></li>
          </ol>
        </section>

        <ul className="land-preview reveal" aria-label="What you get">
          {PREVIEW.map(([c, t, d]) => <li key={t}><i style={{ background: c }} /><b>{t}</b><span>{d}</span></li>)}
        </ul>
      </div>
    </main>
  );
}
