import { useMemo, useRef, useState } from "react";
import { MUSCLES } from "../lib/derive.js";
import { fmt, fmtD } from "../lib/format.js";
import { useDialog } from "../lib/useDialog.js";
import CoveragePanel from "./CoveragePanel.jsx";

const FLAG = { fragment: "Short workout: fewer than 4 working sets", duration: "Unusual logged duration (under 15 or over 240 min)" };

/* Everything the importer dropped, altered or flagged — and the two corrections the athlete can make:
   re-map an exercise's muscles, and include/exclude whole sessions. Corrections live in this tab only. */
export default function DataReview({ open, onClose, base, M, corrections, onCorrections }) {
  const box = useRef(null);
  const [tab, setTab] = useState("coverage");
  const [q, setQ] = useState("");
  useDialog(open, box, onClose, { modal: true });
  const a = base.audit;
  const exclude = new Set(corrections.exclude || []);
  const flaggedSids = useMemo(() => new Set(a.flagged.map(f => f.sid)), [a]);
  const sessions = useMemo(() => {
    const live = new Map(base.sessions.map(s => [s.sid, s]));
    return [...a.allSessions].sort((x, y) => y.start - x.start).map(s => ({ ...s, live: live.get(s.sid), flagged: flaggedSids.has(s.sid) }));
  }, [base, a, flaggedSids]);
  const exRows = useMemo(() => [...a.exerciseMap].sort((x, y) => (x.mapped - y.mapped) || (y.corrected - x.corrected) || x.ex.localeCompare(y.ex)), [a]);
  if (!open) return null;

  const toggleSession = sid => {
    const next = new Set(exclude); next.has(sid) ? next.delete(sid) : next.add(sid);
    onCorrections({ ...corrections, exclude: [...next] });
  };
  const setMuscles = (ex, primary, secondary) => {
    const muscles = { ...(corrections.muscles || {}) };
    if (primary === "") delete muscles[ex];
    else muscles[ex] = primary === "cardio" ? "cardio" : [primary, ...(secondary && secondary !== primary ? [secondary] : [])];
    onCorrections({ ...corrections, muscles });
  };
  const issues = [...a.excludedRows, ...a.parseErrors.map(e => ({ ...e, parse: true }))].sort((x, y) => (x.line ?? 0) - (y.line ?? 0));
  const ql = q.trim().toLowerCase();
  const nCorr = Object.keys(corrections.muscles || {}).length + exclude.size;

  return (
    <div className="drawer-wrap" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" ref={box} role="dialog" aria-modal="true" aria-labelledby="drTitle" tabIndex={-1}>
        <header className="drawer-head">
          <div><p className="eyebrow"><i>●</i>Data review</p><h2 id="drTitle" className="h2 small">Review imported data</h2></div>
          <button className="chip" type="button" onClick={onClose} aria-label="Close data review">Close</button>
        </header>
        <ul className="dr-summary">
          <li><b>{fmt(a.rows)}</b> rows read · <b>{fmt(issues.length)}</b> dropped, altered or unreadable</li>
          <li><b>{fmt(a.sessions)}</b> workouts included · <b>{fmt(a.flagged.reduce((n, f) => n + f.flags.length, 0))}</b> notes on <b>{fmt(a.flagged.length)}</b> workouts · <b>{fmt(exclude.size)}</b> excluded by you</li>
          <li><b>{fmt(a.unmapped.length)}</b> exercises without a muscle mapping · <b>{fmt(Object.keys(corrections.muscles || {}).length)}</b> corrected</li>
        </ul>
        <div className="seg" role="tablist" aria-label="Review sections">
          {[["coverage", "Data completeness"], ["issues", "Import issues"], ["sessions", "Workouts"], ["exercises", "Muscle assignments"]].map(([k, l]) =>
            <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === "coverage" && M && <CoveragePanel base={base} M={M} open />}
        {tab === "issues" && (issues.length ? (
          <div className="tw dr-table"><table><thead><tr><th className="n">CSV line</th><th>Reason</th><th>Detail</th></tr></thead><tbody>
            {issues.slice(0, 300).map((r, i) => <tr key={i}><td className="n">{r.line ?? "–"}</td><td>{r.reason}{r.kept ? " (row kept)" : ""}</td><td className="muted">{r.detail}</td></tr>)}
          </tbody></table>{issues.length > 300 && <p className="note">Showing the first 300 of {fmt(issues.length)}.</p>}</div>
        ) : <p className="lede">Every row was read and kept. No duplicates, unreadable dates, impossible weights or malformed lines.</p>)}

        {tab === "sessions" && (<>
          <p className="note">Checked workouts are included everywhere. Unchecking one removes all of its sets from every view until you check it again or reload. Notes describe what was logged — a short workout may be complete as logged, and the export can't say why a duration is unusual.</p>
          <input className="search" type="search" placeholder="Filter by workout name or date" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter sessions" />
          <ul className="dr-list">
            {sessions.filter(s => !ql || s.title.toLowerCase().includes(ql) || fmtD(s.start).toLowerCase().includes(ql)).slice(0, 400).map(s => (
              <li key={s.sid} className={exclude.has(s.sid) ? "off" : ""}>
                <label className="toggle"><input type="checkbox" checked={!exclude.has(s.sid)} onChange={() => toggleSession(s.sid)} />
                  <span><b>{fmtD(s.start, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</b> · {s.title}
                    {s.live && <small> · {s.live.workSets} working sets{s.live.minutes != null ? ` · ${fmt(s.live.minutes)} min` : ""}</small>}</span></label>
                {s.live?.flags.map(f => <span key={f} className="flag">{FLAG[f]}</span>)}
                {exclude.has(s.sid) && <span className="flag">Excluded</span>}
              </li>
            ))}
          </ul>
        </>)}

        {tab === "exercises" && (<>
          <p className="note">The primary muscle gets 1 set of credit, the secondary ½. Changes apply everywhere: body map, balance, plates, analysis.</p>
          <input className="search" type="search" placeholder="Filter exercises" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter exercises" />
          <div className="tw dr-table"><table><thead><tr><th>Exercise</th><th>Pattern · load</th><th>Primary</th><th>Secondary</th><th /></tr></thead><tbody>
            {exRows.filter(r => !ql || r.ex.toLowerCase().includes(ql)).map(r => {
              const o = (corrections.muscles || {})[r.ex];
              const primary = r.cardio ? "cardio" : r.direct[0] || "", secondary = r.cardio ? "" : r.secondary[0] || r.direct[1] || "";
              return (
                <tr key={r.ex} className={!r.mapped ? "warn" : ""}>
                  <td>{r.ex}{!r.mapped && <span className="flag">Not mapped — counts as Other</span>}{r.corrected && <span className="flag ok">Corrected</span>}</td>
                  <td className="muted">{r.pattern} · {r.load === "external" ? "external load" : r.load}{r.source === "keyword" ? " (guessed from the name)" : ""}</td>
                  <td><select aria-label={`Primary muscle for ${r.ex}`} value={primary} onChange={e => setMuscles(r.ex, e.target.value, secondary)}>
                    <option value="">{o ? "Use automatic" : "Other / none"}</option>
                    {Object.entries(MUSCLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    <option value="cardio">Cardio (not counted)</option>
                  </select></td>
                  <td><select aria-label={`Secondary muscle for ${r.ex}`} value={secondary} disabled={!primary || primary === "cardio"} onChange={e => setMuscles(r.ex, primary, e.target.value)}>
                    <option value="">None</option>
                    {Object.entries(MUSCLES).filter(([k]) => k !== primary).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></td>
                  <td>{o && <button className="chip" type="button" onClick={() => setMuscles(r.ex, "")}>Reset</button>}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        </>)}
        <footer className="drawer-foot">
          <span className="note">{nCorr ? `${nCorr} correction${nCorr === 1 ? "" : "s"} · kept in this tab only` : "No corrections"}</span>
          {nCorr > 0 && <button className="btn ghost" type="button" onClick={() => onCorrections({ muscles: {}, exclude: [] })} aria-describedby="resetHint">Reset all</button>}
          {nCorr > 0 && <span id="resetHint" className="note" style={{ margin: 0 }}>Restores automatic muscle assignments and includes every workout again.</span>}
        </footer>
      </aside>
    </div>
  );
}
