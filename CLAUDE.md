# Genome-driven growth studio

A browser tool that grows 3D organisms from a 160-base ATGC code, edited on a 3D double helix.

- Current version: **v0.2**, adding species C (phyllotaxis) and D (seashell); milestones 14 to 18. v0.1 (species A and B, milestones 0 to 13) is closed and tagged `v0.1`.
- `SPEC.md` is the source of truth for what to build. Do not change its decisions; if something in it is impossible or contradictory, stop and ask.
- `PLAN.md` lists the milestones in order, each with the checks that prove it is done.
- `DESIGN.md` is the agreed interface design (looks, glass, motion, every interaction); `dev/interaction-lab.html` is its working reference.
- `NOTES.md` records decisions not in the spec, checks run and what is outstanding; `ACCEPTANCE.md` gives the evidence for spec section 12.

## Stack

TypeScript, Vite, Three.js, Vitest, and IBM Plex from `@fontsource` (approved 4 October 2026). Static site, no server, no accounts, no third-party requests. Desktop browsers only.

## Commands

- `npm run dev` starts the dev server
- `npm test` runs all tests; `npx vitest run <path>` runs one file (prefer this while working)
- `npm run typecheck` checks types
- `npm run build` makes the production build

## Rules that must never break

IMPORTANT: the same genome code must produce bit-identical geometry on every machine.

- All simulation code lives in `src/sim/`. It runs in one web worker, single-threaded.
- Inside `src/sim/`, never call `Math.random`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2`, `Math.exp`, `Math.log`, `Math.pow`, or `**` with a non-integer exponent. Use `src/sim/dmath.ts` and the seeded generator in `src/sim/rng.ts`. Plain arithmetic, `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.min` and `Math.max` are fine.
- Inside `src/sim/`, nothing may depend on time, frame rate, screen size, or the order of object keys.
- Rendering code never writes back into simulation state.
- Every possible 160-base code with a valid header must decode to an organism that grows without errors or NaN. Clamp ranges to guarantee it.
- Gene tables in `src/genome/` must match `SPEC.md` exactly: locus order, names, ranges, scales.
- v0.2 must not change species A or B: every code that grew in v0.1 grows the same geometry, with the same hash.
- Never name a gene after a real biological gene.
- Pigment genes must never trigger a regrow.

## Workflow

- Work on one milestone from `PLAN.md` at a time. Do not start the next one unless asked.
- Ask before adding any dependency beyond the stack above.
- After a set of changes, run `npm run typecheck` and the relevant tests, and show the output.
- A milestone is done only when every check listed for it passes. Then tick its box in `PLAN.md`, commit with a descriptive message, and stop.
- Interface text uses sentence case and British spelling (colour, randomise).

## Compact instructions

When compacting, keep: the current milestone number, the list of files changed in this session, and any failing test output.
