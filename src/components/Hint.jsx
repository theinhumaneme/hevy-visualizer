import { GLOSSARY } from "../lib/glossary.js";

// A small "i" that opens a one-line definition. Native <details>: keyboard, touch and screen-reader friendly.
export default function Hint({ k, label, children }) {
  const [term, def] = GLOSSARY[k] || [label, children];
  return (
    <details className="hint" onClick={e => e.stopPropagation()}>
      <summary aria-label={`What does “${label || term}” mean?`}><span aria-hidden="true">i</span></summary>
      <span className="hint-body"><b>{term}</b>{children || def}</span>
    </details>
  );
}

// Expandable "How this is calculated" block for methodology that shouldn't sit under every chart.
export function Method({ title = "How this is calculated", children }) {
  return <details className="method"><summary>{title}</summary><div className="method-body">{children}</div></details>;
}
