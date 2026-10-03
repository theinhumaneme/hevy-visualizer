import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resolveRange } from "../lib/ranges.js";
import { buildStory } from "../story/buildStory.js";
import RangePicker from "./RangePicker.jsx";

// React owns these empty sections; buildStory() fills and animates them. Each sits in its own wrapper div
// so GSAP's pin-spacer never sits between React and a node React manages.
const SCENES = [
  // navigation labels are descriptive; each scene keeps its expressive title on the page
  ["s-open", "Training summary"], ["s-commit", "Consistency"], ["s-rhythm", "Training times"], ["s-body", "Muscle groups"],
  ["s-lifts", "Exercise progress"], ["s-prs", "Personal records"], ["s-reps", "Rep ranges"], ["s-eff", "Session length"],
  ["s-scale", "Body weight"], ["s-insights", "Training highlights"], ["s-audit", "How metrics are calculated"],
];

export default function Story({ M, range, onRange, bounds, reduced, source, synthetic }) {
  const res = useMemo(() => resolveRange(range), [range]);
  const played = useRef(new Set());
  const [width, setWidth] = useState(() => innerWidth);
  const [replay, setReplay] = useState(0);

  // a new range or file is a new story: start from the top and play it again
  useLayoutEffect(() => { played.current = new Set(); scrollTo({ top: 0 }); }, [M, replay]);

  useLayoutEffect(() => {
    if (M.empty) return;
    return buildStory(M, {
      reduced, played: played.current, source, synthetic, title: range.id === "all" ? "" : res.title,
      onReplay: () => setReplay(r => r + 1),
    });
  }, [M, reduced, width, replay]);

  // width changes re-lay out every chart; scenes already played come back fully drawn
  useEffect(() => {
    let t;
    const f = () => { clearTimeout(t); t = setTimeout(() => setWidth(w => (Math.abs(innerWidth - w) > 40 ? innerWidth : w)), 250); };
    addEventListener("resize", f);
    return () => { removeEventListener("resize", f); clearTimeout(t); };
  }, []);

  if (M.empty) return (
    <main className="empty-view">
      <div className="wrap">
        <p className="eyebrow"><i>—</i>Nothing here</p>
        <h1 className="h2">No workouts in {res.title}.</h1>
        <p className="lede">Pick a different range — your log runs from {bounds.min.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p>
        <RangePicker value={range} onChange={onRange} min={bounds.min} max={bounds.max} />
        <div className="btn-row"><button className="btn" type="button" onClick={() => onRange({ id: "all" })}>Show all time</button></div>
      </div>
    </main>
  );
  return (
    <>
      <nav className="rail" id="rail" aria-label="Scenes" />
      <main id="story">
        {SCENES.map(([id, title]) => <div key={id}><section className="scene" id={id} data-title={title} /></div>)}
      </main>
    </>
  );
}
