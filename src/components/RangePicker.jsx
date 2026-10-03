import { useRef, useState } from "react";
import { useDialog } from "../lib/useDialog.js";
import { PRESETS, resolveRange, toISO, presetLabel, presetNote } from "../lib/ranges.js";

const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Preset chips plus a custom from/to. `value` is { id, from?, to? } with ISO dates for custom.
export default function RangePicker({ value, onChange, min, max, compact }) {
  const res = resolveRange(value);
  const span = res.from || res.to ? `${res.from ? fmt(res.from) : "First workout"} – ${res.to ? fmt(res.to) : "today"}` : "Every workout you've logged";
  return (
    <div className={"range" + (compact ? " compact" : "")}>
      <div className="seg wrap" role="group" aria-label="Date range">
        {PRESETS.map(p => (
          <button key={p.id} type="button" aria-pressed={value.id === p.id}
            onClick={() => onChange(p.id === "custom" ? { id: "custom", from: value.from || toISO(res.from || min), to: value.to || toISO(res.to || max) } : { id: p.id })}>
            {presetLabel(p)}
          </button>
        ))}
      </div>
      {value.id === "custom" ? (
        <div className="custom-range">
          <label><span className="caption">From</span>
            <input type="date" value={value.from || ""} min={toISO(min)} max={value.to || toISO(max)} onChange={e => onChange({ ...value, from: e.target.value })} /></label>
          <label><span className="caption">To</span>
            <input type="date" value={value.to || ""} min={value.from || toISO(min)} max={toISO(max)} onChange={e => onChange({ ...value, to: e.target.value })} /></label>
        </div>
      ) : <p className="caption range-span">{presetNote[value.id] ? `${presetNote[value.id]} · ` : ""}{span}</p>}
    </div>
  );
}

// Compact pill for the top bar: shows the active range, opens the full picker in a popover.
export function RangeMenu({ value, onChange, min, max }) {
  const [open, setOpen] = useState(false), ref = useRef(null), pop = useRef(null);
  useDialog(open, pop, () => setOpen(false));
  const label = value.id === "custom" ? (() => { const r = resolveRange(value); return `${r.from ? fmt(r.from) : "Start"} – ${r.to ? fmt(r.to) : "today"}`; })() : presetLabel(PRESETS.find(p => p.id === value.id));
  return (
    <div className="menu" ref={ref}>
      <button className="chip" type="button" aria-expanded={open} aria-haspopup="dialog" aria-label={`Date range: ${label}`} onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /></svg>
        <span>{label}</span>
      </button>
      {open && <div className="popover" role="dialog" aria-label="Choose a date range" ref={pop}><RangePicker value={value} onChange={v => { onChange(v); if (v.id !== "custom") setOpen(false); }} min={min} max={max} compact /></div>}
    </div>
  );
}
