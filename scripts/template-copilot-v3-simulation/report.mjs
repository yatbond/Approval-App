// Summarises one or more simulation result files (later files replace earlier
// rows with the same workflow id, so a rerun of failures can be merged in).
//   node scripts/template-copilot-v3-simulation/report.mjs output/.../results.json [more.json]
import { readFileSync, writeFileSync } from "node:fs";

const byId = new Map();
for (const file of process.argv.slice(2).filter((arg) => !arg.startsWith("--"))) {
  for (const row of JSON.parse(readFileSync(file, "utf8"))) byId.set(row.id, row);
}
const rows = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

const lines = [];
const completed = rows.filter((row) => !row.failure);
lines.push(`# Simulated-user run: ${rows.length} workflows`);
lines.push("");
lines.push(`- Draft created and matching the author's intent: **${completed.length}/${rows.length}** (${pct(completed.length, rows.length)})`);
const scored = rows.filter((row) => row.proposal);
const corrections = scored.map((row) => row.proposal.correctionCount);
lines.push(`- Reader proposals scored: ${scored.length}; corrections a person made: mean ${(corrections.reduce((a, b) => a + b, 0) / Math.max(1, corrections.length)).toFixed(1)}, median ${[...corrections].sort((a, b) => a - b)[Math.floor(corrections.length / 2)] ?? "n/a"}, max ${Math.max(0, ...corrections)}`);
const times = rows.map((row) => row.steps?.describe?.ms).filter(Number.isFinite).sort((a, b) => a - b);
lines.push(`- Reading time (describe): median ${Math.round((times[Math.floor(times.length / 2)] ?? 0) / 1000)} s, p95 ${Math.round((times[Math.floor(times.length * 0.95)] ?? 0) / 1000)} s`);
lines.push("");

const families = ["fields", "documents", "stages", "conditions", "notifications", "scalars"];
lines.push("## How much the reader got right before any correction");
lines.push("");
lines.push("| Part | Right / expected | Share |");
lines.push("|---|---|---|");
for (const family of families) {
  let matched = 0;
  let expected = 0;
  for (const row of scored) {
    const entry = row.proposal.rows.find((r) => r.family === family);
    if (entry) { matched += entry.matched; expected += entry.expected; }
  }
  lines.push(`| ${family} | ${matched} / ${expected} | ${pct(matched, expected)} |`);
}
lines.push("");

const group = (key, label) => {
  const groups = new Map();
  for (const row of rows) for (const value of [].concat(key(row))) {
    const entry = groups.get(value) ?? { n: 0, ok: 0, corrections: 0, scored: 0 };
    entry.n += 1;
    if (!row.failure) entry.ok += 1;
    if (row.proposal) { entry.corrections += row.proposal.correctionCount; entry.scored += 1; }
    groups.set(value, entry);
  }
  lines.push(`## By ${label}`);
  lines.push("");
  lines.push("| " + label + " | Workflows | Draft OK | Mean corrections |");
  lines.push("|---|---|---|---|");
  for (const [value, entry] of [...groups].sort()) {
    lines.push(`| ${value} | ${entry.n} | ${entry.ok}/${entry.n} | ${(entry.corrections / Math.max(1, entry.scored)).toFixed(1)} |`);
  }
  lines.push("");
};
group((row) => row.lang, "language");
group((row) => row.features, "difficulty feature");

const kinds = new Map();
for (const row of scored) for (const correction of row.proposal.corrections) {
  const kind = correction.replace(/:.*$/u, "");
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
}
lines.push("## What people had to correct most");
lines.push("");
lines.push("| Correction | Count |");
lines.push("|---|---|");
for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) lines.push(`| ${kind} | ${count} |`);
lines.push("");

const failed = rows.filter((row) => row.failure);
lines.push(`## Workflows that did not reach a matching draft (${failed.length})`);
lines.push("");
for (const row of failed) lines.push(`- ${row.id} (${row.lang}, ${row.features.join("/")}): ${row.failure.slice(0, 220)}`);

const markdown = lines.join("\n");
console.log(markdown);
const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
if (out) writeFileSync(out, markdown);
