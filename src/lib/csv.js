// Reading Hevy exports in the browser. Nothing is uploaded: files are parsed straight from disk into memory.
import Papa from "papaparse";
import { parseRows, parseMeasurements, normalizeHeader } from "./derive.js";

// Hevy's measurements export mixes CRLF and LF line endings; normalise before PapaParse picks one.
// Headers are normalised too (case, spaces, known aliases) so older or localised exports still load.
export function parseCSVFull(text) {
  const res = Papa.parse(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"), { header: true, skipEmptyLines: true, transformHeader: normalizeHeader });
  const errors = res.errors.map(e => ({ line: e.row != null ? e.row + 2 : null, reason: e.code === "TooFewFields" || e.code === "TooManyFields" ? "Wrong number of columns" : e.message, detail: e.code }));
  return { rows: res.data, errors };
}
export const parseCSV = text => parseCSVFull(text).rows;

const MEAS_COL = /^(weight_(lbs|kg)|fat_percent|.+_(cm|in))$/;
export function kindOf(rows) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  if (cols.includes("exercise_title") && cols.includes("start_time")) return "workouts";
  if (cols.includes("date") && cols.some(c => MEAS_COL.test(c))) return "measurements";
  return null;
}

/* Reads any mix of files and sorts them into workouts / measurements by their columns.
   Returns { workouts?: {name, parsed}, measurements?: {name, list}, errors: [] }. */
export async function readExports(files) {
  const out = { errors: [] };
  for (const f of [...files]) {
    try {
      const { rows, errors } = parseCSVFull(await f.text());
      const kind = kindOf(rows);
      if (kind === "workouts") out.workouts = { name: f.name, parsed: parseRows(rows, { parseErrors: errors }) };
      else if (kind === "measurements") {
        const list = parseMeasurements(rows);
        if (!list.length) throw new Error("It's a measurements export, but it has no entries we can read.");
        out.measurements = { name: f.name, list };
      } else throw new Error("It isn't a Hevy workouts or measurements export. In Hevy, go to Profile → Settings → Export & import data and choose Export workouts.");
    } catch (e) { out.errors.push(`“${f.name}”: ${e.message.charAt(0).toUpperCase() + e.message.slice(1)}`); }
  }
  return out;
}
