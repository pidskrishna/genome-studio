# v0.3 staging

The v0.3 plan (species E, coral, and F, fungal fruit body), ready to apply once v0.2's milestone 18 is committed. Prepared 20 October 2026.

| File | Goes into |
| --- | --- |
| `spec-species.md` | SPEC.md, sections 4c and 4d, before section 5 |
| `spec-grounding-rows.md` | SPEC.md, section 10 table |
| `spec-acceptance.md` | SPEC.md, section 12, a v0.3 list |
| `spec-clarifications.md` | SPEC.md, section 13, clarifications 25 to 31 |
| `plan-v0.3.md` | PLAN.md, milestones 19 to 24 |
| `apply.mjs` | Makes those edits, plus small ones to SPEC.md (title, versions, sections 2, 3, 4b and 11), CLAUDE.md, README.md and NOTES.md |

## Run it

From the repository root, after the other agent's commit:

    node v0.3-staging/apply.mjs --dry-run
    node v0.3-staging/apply.mjs --commit

`--dry-run` lists the edits without writing. `--commit` writes, commits the five files, and deletes this folder. Without `--commit` it only writes, so you can read `git diff` first.

It refuses to run if milestone 18 is not ticked in PLAN.md, if the working tree has other uncommitted changes, or if v0.3 is already applied. `--force` skips the first two checks. It edits by anchor lines, so changes made since 20 October are kept; if an anchor is missing, nothing is written and it says which.
