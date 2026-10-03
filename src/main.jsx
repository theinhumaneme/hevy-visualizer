import { createRoot } from "react-dom/client";
import { applyTokens } from "./lib/tokens.js";
import "./styles.css";

applyTokens();   // one source for every color, size and duration (see lib/tokens.js)
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
