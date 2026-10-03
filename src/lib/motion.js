/* CONFIG / TOKENS (motion + color) — mirrors the CSS custom properties in styles.css. */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import * as d3 from "d3";
import { COLOR } from "./tokens.js";

gsap.registerPlugin(ScrollTrigger, CustomEase);

export const T = {
  instant: 0.1, fast: 0.2, base: 0.4, slow: 0.7, hero: 1.2, epic: 2.2,
  tight: 0.012, stagger: 0.05, loose: 0.12,
  hold: 0.45,                 // breathing room after a hero beat
  exit: 0.7,                  // exits run at 70% of the entrance
};
CustomEase.create("outExpo", "0.16,1,0.3,1");
CustomEase.create("outQuart", "0.25,1,0.5,1");
CustomEase.create("inOut", "0.65,0,0.35,1");
CustomEase.create("inQuart", "0.5,0,0.75,0");
CustomEase.create("anticipate", "0.36,0,0.66,-0.56");
export const EASE = {
  out: "outExpo", draw: "outQuart", morph: "inOut", exit: "inQuart", anticipate: "anticipate",
  spring: "back.out(1.5)",          // UI pops (containers only, never data values)
  bouncy: "elastic.out(1,0.55)",    // PR celebrations only
  fall: "power2.in",                // gravity
};
// Colors come from tokens.js (the single source). Old key names are kept as aliases for scene code.
export const C = {
  ...COLOR,
  "bg-0": COLOR["surface-page"], "bg-1": COLOR["surface-card"], "bg-2": COLOR["surface-raised"], "bg-3": COLOR["surface-inset"],
  line: COLOR.grid, "text-hi": COLOR["text-strong"], "text-mid": COLOR["text-muted"], "text-lo": COLOR["text-subtle"],
  "accent-2": COLOR.secondary, violet: COLOR["series-3"], record: COLOR["series-record"], baseline: COLOR["series-muted"],
  "div-l": COLOR.secondary, "div-mid": COLOR["surface-inset"], "div-r": COLOR.warm,
};
export const BREAK_LINE_DAYS = 45;   // lift lines don't bridge gaps longer than this
// sequential scale for "sets" (heatmap, body map); every filled level clears 3:1 against cards
export const seq = d3.scaleLinear().domain([0, 4, 10, 18]).range([COLOR["seq-1"], COLOR["seq-2"], COLOR["seq-3"], COLOR["seq-4"]]).clamp(true);
export { gsap, ScrollTrigger, d3 };
