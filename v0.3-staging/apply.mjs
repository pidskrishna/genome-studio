#!/usr/bin/env node
// Applies the v0.3 plan (species E, coral, and F, fungal fruit body) to SPEC.md, PLAN.md,
// CLAUDE.md, README.md and NOTES.md. Run from anywhere: node v0.3-staging/apply.mjs [--dry-run] [--commit] [--force]
//
// Every edit finds its place by an anchor line, so edits made by others since this was written are
// kept. All edits are checked before any file is written: if one anchor is missing or matches more
// than once, nothing changes.

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const commit = flags.has("--commit");
const force = flags.has("--force");

const staged = (name) => readFileSync(join(here, name), "utf8").replace(/\s+$/, "").split("\n");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

function fail(message) {
  console.error(`Not applied: ${message}`);
  process.exit(1);
}

// --- Guards -----------------------------------------------------------------------------------

const specNow = readFileSync(join(root, "SPEC.md"), "utf8");
if (/^## 4c\. /m.test(specNow)) fail("SPEC.md already has section 4c, so v0.3 looks applied.");

const planNow = readFileSync(join(root, "PLAN.md"), "utf8");
if (!/^## Milestone 18:.*\n\n- \[x\] Done/m.test(planNow) && !force) {
  fail("milestone 18 is not ticked in PLAN.md. Wait for the other agent to commit, or pass --force.");
}

let dirty;
try {
  dirty = git("status", "--porcelain").split("\n").filter((line) => line && !line.includes("v0.3-staging/"));
} catch {
  fail("this is not a git repository.");
}
if (dirty.length > 0 && !force) {
  fail(`the working tree has uncommitted changes (another agent may still be working):\n${dirty.join("\n")}\nCommit them first, or pass --force.`);
}

// --- Edit operations --------------------------------------------------------------------------

const files = new Map();
const errors = [];
const done = [];

function lines(file) {
  if (!files.has(file)) files.set(file, readFileSync(join(root, file), "utf8").split("\n"));
  return files.get(file);
}

function findOne(file, pattern, what) {
  const all = lines(file);
  const hits = all.flatMap((line, i) => (pattern.test(line) ? [i] : []));
  if (hits.length !== 1) {
    errors.push(`${file}: ${what}: anchor ${pattern} matched ${hits.length} lines, expected 1`);
    return -1;
  }
  return hits[0];
}

function insertAfter(file, pattern, block, what) {
  const i = findOne(file, pattern, what);
  if (i >= 0) {
    lines(file).splice(i + 1, 0, ...block);
    done.push(`${file}: ${what}`);
  }
}

function insertBefore(file, pattern, block, what) {
  const i = findOne(file, pattern, what);
  if (i >= 0) {
    lines(file).splice(i, 0, ...block);
    done.push(`${file}: ${what}`);
  }
}

function replaceLine(file, pattern, block, what) {
  const i = findOne(file, pattern, what);
  if (i >= 0) {
    lines(file).splice(i, 1, ...block);
    done.push(`${file}: ${what}`);
  }
}

function replaceInLine(file, pattern, from, to, what) {
  const i = findOne(file, pattern, what);
  if (i < 0) return;
  const all = lines(file);
  if (!all[i].includes(from)) {
    errors.push(`${file}: ${what}: "${from}" not found in line ${i + 1}`);
    return;
  }
  all[i] = all[i].replace(from, to);
  done.push(`${file}: ${what}`);
}

function removeLine(file, pattern, what) {
  const i = findOne(file, pattern, what);
  if (i >= 0) {
    lines(file).splice(i, 1);
    done.push(`${file}: ${what}`);
  }
}

function append(file, block, what) {
  const all = lines(file);
  while (all.length > 0 && all[all.length - 1].trim() === "") all.pop();
  all.push("", ...block, "");
  done.push(`${file}: ${what}`);
}

// --- SPEC.md ----------------------------------------------------------------------------------

replaceLine("SPEC.md", /^# Genome-driven growth studio: v0\.\d specification$/,
  ["# Genome-driven growth studio: v0.3 specification"], "title to v0.3");
insertAfter("SPEC.md", /^\| v0\.2 \|/,
  ["| v0.3 | Planned 20 October 2026 | Adds E: coral (section 4c); F: fungal fruit body (section 4d) | The two new species through the whole tool: editor, stage, looks, draft, tray, export and Methods page, and a redesigned species switch |"],
  "versions table: v0.3 row");
insertAfter("SPEC.md", /^v0\.2 must not change species A or B/,
  ["", "v0.3 must not change species A to D: their gene tables stay as they are, and every code that grew in v0.2 grows the same geometry, with the same hash."],
  "v0.3 rule after the versions table");
replaceInLine("SPEC.md", /^\| Species \| v0\.1:/, "v0.2 adds phyllotaxis and seashell.",
  "v0.2 adds phyllotaxis and seashell. v0.3 adds coral and fungal fruit body.", "decisions: species row");
replaceInLine("SPEC.md", /^- \*\*Maturity\.\*\* Growth stops at a fixed point per species/, "(sections 3, 4, 4a and 4b)",
  "(sections 3, 4 and 4a to 4d)", "section 2: maturity sections");
replaceInLine("SPEC.md", /^The paper covers open branching only\./, "is not in v0.1 or v0.2 (section 11)",
  "is not in v0.1 to v0.3 (section 11)", "section 3: closed venation still out");
replaceInLine("SPEC.md", /^- The edge pattern \(gradient driver choice 4\)/, "are not in v0.2 (section 11)",
  "are not in v0.2 or v0.3 (section 11)", "section 4b: pattern genes still out");
insertBefore("SPEC.md", /^## 5\. Helix interface$/, [...staged("spec-species.md"), ""], "sections 4c and 4d");
insertAfter("SPEC.md", /^\| Shell rib width, nodules/, staged("spec-grounding-rows.md"), "section 10: grounding rows");
replaceLine("SPEC.md", /^## 11\. Not in v0\.2$/, ["## 11. Not in v0.3"], "section 11 heading");
replaceLine("SPEC.md", /^\| More species \|/,
  ["| More species | The 3-base species field allows 64; A to F use six. One candidate is noted below. |"],
  "section 11: more species row");
replaceLine("SPEC.md", /^\*\*Candidate species, noted on 19 October 2026/,
  ["**Candidate species, noted on 19 October 2026 for a later version.** Coral and sponge became species E in v0.3. The candidate left is not designed yet; it needs its own section, gene table and milestones when chosen."],
  "section 11: candidate paragraph");
removeLine("SPEC.md", /^\| Coral and sponge \|/, "section 11: coral candidate row removed");
insertBefore("SPEC.md", /^Left to the implementer:/, [...staged("spec-acceptance.md"), ""], "section 12: v0.3 tests");
replaceInLine("SPEC.md", /^Left to the implementer:/, "the organ and receptacle shapes of species C,",
  "the organ and receptacle shapes of species C, the starting forms and corallite shapes of species E,",
  "section 12: left to the implementer");
append("SPEC.md", staged("spec-clarifications.md"), "section 13: clarifications 25 to 31");

// --- PLAN.md ----------------------------------------------------------------------------------

insertAfter("PLAN.md", /^- \*\*v0\.2\*\*/,
  ["- **v0.3**, milestones 19 to 24: planned on 20 October 2026 (species E, coral, and F, fungal fruit body, and a design pass for the species switch). Next: milestone 19."],
  "status: v0.3 line");
append("PLAN.md", staged("plan-v0.3.md"), "v0.3 milestones 19 to 24");

// --- CLAUDE.md --------------------------------------------------------------------------------

replaceLine("CLAUDE.md", /^- Current version:/,
  ["- Current version: **v0.3**, adding species E (coral) and F (fungal fruit body); milestones 19 to 24. v0.1 (species A and B, milestones 0 to 13) and v0.2 (species C and D, milestones 14 to 18) are closed."],
  "current version");
insertAfter("CLAUDE.md", /^- v0\.2 must not change species A or B/,
  ["- v0.3 must not change species A to D: every code that grew in v0.2 grows the same geometry, with the same hash."],
  "v0.3 rule");

// --- README.md --------------------------------------------------------------------------------

insertAfter("README.md", /^\| D: seashell \|/, [
  "| E: coral (planned, v0.3) | Branching, plate-like and encrusting colonies | Accretive growth in a nutrient field: Kaandorp and Sloot (2001); Merks et al. (2003); Kaandorp et al. (2005) |",
  "| F: fungal fruit body (planned, v0.3) | Cups, flasks and mushrooms grown from hyphae | The Neighbour-Sensing model: Meškauskas, McNulty and Moore (2004) |",
], "species table: E and F");
replaceLine("README.md", /^Version 0\.2:/,
  ["Version 0.3: species A to D (v0.1 and v0.2) are done; species E and F are planned. See `PLAN.md` for progress."],
  "status line");

// --- NOTES.md ---------------------------------------------------------------------------------

insertAfter("NOTES.md", /^- \*\*v0\.2 /,
  ["- **v0.3 planned on 20 October 2026** at the owner's request: species E (coral, spec section 4c) and F (fungal fruit body, 4d), milestones 19 to 24 in PLAN.md, clarifications 25 to 31. Owner decisions that day: the coral's floor is fixed as absorbing, so the environment stays constant; the species switch gets a design pass (milestone 22) because six species do not fit the four-segment control; species E has no 10,000-genome run, only 1,000. Sources read while planning: Meškauskas, McNulty and Moore (2004) and Kaandorp et al. (2005) in full, Merks et al. (2003) in abstract only; the full model checks are the first step of milestones 20 and 21. Next: milestone 19."],
  "status: v0.3 line");

// --- Write or report --------------------------------------------------------------------------

if (errors.length > 0) fail(`${errors.length} edit(s) could not be placed:\n${errors.join("\n")}`);

console.log(`${dryRun ? "Would apply" : "Applied"} ${done.length} edits:`);
for (const line of done) console.log(`  ${line}`);
if (dryRun) process.exit(0);

for (const [file, content] of files) writeFileSync(join(root, file), content.join("\n"));

if (commit) {
  git("add", ...files.keys());
  git("commit", "-m", [
    "Plan v0.3: species E (coral) and F (fungal fruit body)",
    "",
    "- SPEC.md: sections 4c and 4d, grounding rows, section 11, v0.3 acceptance tests and",
    "  clarifications 25 to 31 (floor fixed as absorbing, no 10,000 run for E, switch redesign).",
    "- PLAN.md: milestones 19 to 24, with a design pass for the six-species switch (22).",
    "- CLAUDE.md, README.md and NOTES.md: v0.3 status.",
    "",
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
  ].join("\n"));
  rmSync(here, { recursive: true, force: true });
  console.log("Committed, and removed v0.3-staging/.");
} else {
  console.log("Review with `git diff`, then commit. Delete v0.3-staging/ afterwards.");
}
