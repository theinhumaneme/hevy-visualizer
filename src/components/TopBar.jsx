import { useEffect, useRef, useState } from "react";
import { useDialog } from "../lib/useDialog.js";

export const TABS = [["story", "Story"], ["recap", "Recap"], ["overview", "Overview"], ["exercises", "Exercises"],
  ["records", "Records"], ["history", "History"], ["analysis", "Analysis"], ["compare", "Compare"]];

export function Mark() {   // the brand mark
  return <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--surface-raised)" /><rect x="5" y="14.5" width="22" height="3" rx="1.5" fill="var(--text-subtle)" />
    <rect x="8" y="8" width="4" height="16" rx="1.5" fill="var(--accent)" /><rect x="20" y="8" width="4" height="16" rx="1.5" fill="var(--accent)" /></svg>;
}

/* Brand · view tabs · filters (date range + unit, grouped) · files. Below 1100px the tabs move to a bottom bar
   that keeps the active tab in view and shows a chevron while more tabs are off-screen. */
export default function TopBar({ tab, onTab, data, onFiles, onClear, onReview, onHelp, unit, onUnit, reduced, onReduced, ambientPaused, onAmbient, children }) {
  const input = useRef(null);
  const [menu, setMenu] = useState(false), menuRef = useRef(null), popRef = useRef(null);
  const bottom = useRef(null), [atEnd, setAtEnd] = useState(false);
  useDialog(menu, popRef, () => setMenu(false));
  useEffect(() => {
    const nav = bottom.current; if (!nav) return;
    const cur = nav.querySelector('[aria-current="page"]');
    if (cur) cur.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
    const f = () => setAtEnd(nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
    f(); nav.addEventListener("scroll", f, { passive: true }); addEventListener("resize", f);
    return () => { nav.removeEventListener("scroll", f); removeEventListener("resize", f); };
  }, [tab, reduced]);
  const links = TABS.map(([id, label]) => <a key={id} href={"#" + id} aria-current={tab === id ? "page" : undefined}
    onClick={e => { e.preventDefault(); onTab(id); }}>{label}</a>);
  return (
    <>
      <div className="progress" id="progress" aria-hidden="true" />
      <header className="topbar">
        {tab === "story"
          ? <div className="hud" id="hud" aria-hidden="true"><b id="hudNum">0</b><span id="hudUnit">lb lifted</span></div>
          : <a className="brand" href="#story" onClick={e => { e.preventDefault(); onTab("story"); }}><Mark /><span>Training Story</span></a>}
        <nav className="tabs" aria-label="Views">{links}</nav>
        <div className="controls">
          <div className="filters" role="group" aria-label="View filters">
            {children}
            {children && <span className="divider" aria-hidden="true" />}
            <div className="seg unit" role="group" aria-label="Weight unit">
              {[["lb", "lb"], ["kg", "kg"]].map(([v, l]) => <button key={v} type="button" aria-pressed={unit === v} onClick={() => onUnit(v)}>{l}</button>)}
            </div>
          </div>
          <button className="chip help-chip" type="button" onClick={onHelp} aria-label="Help">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M6.2 6.2a1.9 1.9 0 113 1.5c-.7.4-1.2.8-1.2 1.6M8 11.5v.2" /></svg>
            <span className="chip-long">Help</span>
          </button>
          <div className="menu" ref={menuRef}>
            <button className="chip" type="button" aria-expanded={menu} aria-label="Files and settings" onClick={() => setMenu(m => !m)}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" /></svg>
              <span>Files<span className="chip-long"> &amp; settings</span></span>
            </button>
            {menu && (
              <div className="popover files" role="dialog" aria-label="Your files" ref={popRef}>
                <p className="caption">Loaded files</p>
                <p className="note" style={{ marginTop: 4 }}>Read in this browser and never uploaded. Reloading or closing the tab clears them.</p>
                <ul>
                  <li><b>Workouts</b><span>{data.workoutsName}</span></li>
                  <li><b>Measurements</b><span>{data.measureName || "none — add one for body weight"}</span></li>
                </ul>
                <div className="btn-row">
                  <button className="btn" type="button" onClick={() => input.current.click()}>Load exports</button>
                  <button className="btn ghost" type="button" onClick={() => { setMenu(false); onReview(); }}>Review imported data</button>
                </div>
                <p className="note">A new workouts export replaces the loaded history (it isn't merged). Loaded measurements stay until you load a new measurements export.</p>
                <div className="btn-row"><button className="btn ghost" type="button" onClick={() => { setMenu(false); onClear(); }}>Clear loaded data</button></div>
                <p className="note" style={{ marginTop: 4 }}>Clearing returns you to the start screen.</p>
                <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ""; setMenu(false); }} />
                <hr />
                <label className="toggle"><input type="checkbox" checked={reduced} onChange={e => onReduced(e.target.checked)} /> Reduce motion</label>
                <label className="toggle"><input type="checkbox" checked={ambientPaused} onChange={e => onAmbient(e.target.checked)} /> Pause ambient background</label>
                <p className="note">Settings and your weekly target are saved on this device.</p>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={"tabs-bottom-wrap" + (atEnd ? " at-end" : "")}>
        <nav className="tabs-bottom" aria-label="Views" ref={bottom}>{links}</nav>
        <span className="more" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" /></svg></span>
      </div>
    </>
  );
}
