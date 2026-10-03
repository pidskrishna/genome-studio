# Build plan

Fourteen milestones, done in order, one per session. A milestone is done only when every check under it passes. Section numbers refer to `SPEC.md`; "clarification n" refers to its section 13.

## Milestone 0: project setup

- [x] Done

Build: git repository, Vite + TypeScript + Three.js + Vitest, the folder layout (`src/genome`, `src/sim`, `src/render`, `src/ui`), the npm scripts named in `CLAUDE.md`, a `.gitignore`.

Checks:
- `npm run typecheck`, `npm test` and `npm run build` all pass.
- `npm run dev` serves a blank page with no console errors.

## Milestone 1: genome (spec section 2, names from section 6)

- [x] Done

Build: encode and decode, header, checksum, both gene tables, slider-to-bases sync, input cleaning, link sharing through the page address, specimen names, a wild-type genome per species. Wild types are provisional until milestones 3 to 5. Header codes, binned genes, the kill clamp and the bad-checksum behaviour follow clarifications 5, 6, 9 and 11.

Checks (unit tests):
- Every gene value 0 to 4,095 survives value → bases → value.
- 10,000 random codes per species decode with every parameter inside its range.
- In 100 random genomes, every possible single-base change in positions 1 to 156 is caught by the checksum.
- Lower case, spaces and line breaks are accepted; other letters are rejected with a message.
- Kill distance never exceeds 0.8 × sensing range after decoding.
- Names: same leading bases give the same name; a fine change keeps it; a coarse change to gene 1, 2 or 3 changes it.
- Gene tables match `SPEC.md` locus by locus.
- Species AAA and AAC with version AAA decode; any other species or version is rejected with a message.
- A code with a wrong checksum loads, reports a typo warning, and comes back with the corrected checksum.
- For whole-number and multiple-choice genes, a model value written through the number field lands on its bin centre and reads back as the same setting.
- Link sharing: a code written into the page address parses back to the same code (pure functions; the end-to-end check is in milestone 7).

## Milestone 2: deterministic core (spec section 8)

- [x] Done

Build: `src/sim/dmath.ts` (sine, cosine, atan2, exp, log, pow built from basic arithmetic), `src/sim/rng.ts` (seeded generator), a geometry hash function, the web worker shell with progress messages and cancellation (a new run supersedes one in flight).

Checks:
- `dmath` results are within a relative error of 1e-12 of the built-in functions (absolute 1e-15 where the true value is near zero) over stated test ranges. The ranges cover large arguments for sine and cosine, all four quadrants for atan2, overflow and underflow for exp, and values near zero for log.
- The generator gives a fixed, recorded sequence for a fixed seed.
- A test scans `src/sim/` and fails if any forbidden call appears. The scan is an allowlist: only `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.min` and `Math.max` may appear. Every `**` whose exponent is not an integer literal fails, and so do `Date` and `performance.now`.
- Starting a second run while one is in progress cancels the first; only the second reports a result.

## Milestone 3: species A simulation (spec section 3)

- [ ] Done

Build: space colonisation in the worker, with a spatial grid for neighbour searches, pipe-model radii, relocation, subdivision, twig shedding, trunk growth across the clear stem, the zero-direction rule and the step cap (clarifications 4 and 15). Output is plain geometry data (nodes, parents, radii) plus the four gradient-driver attributes per node, so pigment edits never need the simulation. No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN (a slower script runs 10,000).
- The same code run twice gives the same geometry hash; the wild-type hash is recorded as a fixed test value.
- At every branching point, radii satisfy r^n = r1^n + r2^n (summed over all children).
- No tropism plus uniform points gives a roughly symmetric crown; positive and negative tropism shift the centre of mass up and down.
- With clear stem at its maximum and sensing range at its minimum, a trunk grows into the envelope and the organism branches.
- A genome with kill distance clamped by sensing range grows past its first step.
- A constructed case with two opposing points does not hang; it stops by the zero rule or the step cap.
- Every node carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser, not a unit test): wild type reaches maturity in under 10 seconds.
- Cross-browser, done by the owner: a dev page shows the wild-type hash; it matches in Safari, Chrome and Firefox.

## Milestone 4: species B simulation core, disc (spec section 4)

- [ ] Done

Build: the growing triangle mesh in the worker for the disc body plan: grow, relax (stable under every stiffness and thickness), divide, the repulsion grid, maturity by area multiple with the 40,000-vertex cap (clarification 1), distance from margin measured on the starting shape (clarification 7), and the gradient-driver attributes per vertex. No rendering.

Checks:
- 1,000 random disc genomes grow to maturity with no error and no NaN.
- Same code, same geometry hash; disc wild-type hash recorded.
- Flat test as in clarification 8: with margin bias at minimum the sheet stays flat (out-of-plane deviation within the starting roughness); the deviation rises as margin bias rises.
- Vertex count at maturity never exceeds 40,000.
- Every vertex carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds. If this is missed, stop and report before milestone 5.

## Milestone 5: species B, all body plans (spec section 4)

- [ ] Done

Build: ring, tube and closed sphere, growth patches, anisotropy and lift, with margins as in clarification 7.

Checks:
- 1,000 random genomes across all body plans grow to maturity with no error and no NaN (a slower script runs 10,000, parallelised across worker threads).
- Same code, same geometry hash; wild-type hash recorded.
- No triangle is degenerate at maturity: every triangle has a minimum angle above a stated threshold and non-zero area.
- Each body plan grows from the right starting shape (disc, ring, tube, sphere) and the closed sphere stays closed.

## Milestone 6: stage (spec sections 6 and 7)

- [ ] Done

Build: the Three.js stage showing species A as tubes and species B as a surface with thickness (drawn thickness as in clarification 14), in the glossy look only. Also the flat and 3D view toggle, orbit and zoom, a minimal progress indicator, and a temporary text box for pasting a code. The renderer can draw any sub-rectangle of a larger virtual image, ready for tiled export.

Checks:
- Open the app in the browser pane, take screenshots of each species' wild type in 3D and flat view, and confirm all show the organism centred and fully in frame.
- Pasting a different code changes the organism.
- A progress indicator shows during a regrow and clears when it is ready.
- A frame drawn as four sub-rectangles and stitched matches the same frame drawn whole.

## Milestone 7: editor state, code bar and gene map (spec section 5)

- [ ] Done

Build: the editor state (focus, randomise all, randomise one, lock, wild type, undo and redo, species switch), the code bar with copy and paste, the linear gene map, and the inspector as plain DOM. This replaces the temporary paste box. Layout as in spec section 6, plain styling for now.

Checks:
- Unit tests on the editor state: slider and bases stay in sync; randomise-all changes every unlocked gene and no locked gene; undo and redo restore exact codes.
- Header and checksum bases cannot be edited (clarification 10); switching species loads that species' wild type.
- End to end in the browser pane: a pasted code and a shared link both reproduce the organism they came from (same geometry hash).
- Screenshot showing the gene map, a focused gene with its inspector, and the code bar.

## Milestone 8: helix editor (spec section 5)

- [ ] Done

Build: the 3D B-form helix, gene bands, hover, click to focus with the helix turning to face the gene, the inspector attached beside it, base editing on the helix, drag to rotate, scroll to travel, and the gene map toggle.

Checks:
- Unit test: the helix geometry is right-handed and every rung pairs A with T or C with G.
- Clicking a base cycles it through A, C, G, T and updates the slider and code bar.
- Screenshot showing the helix, a focused gene with its inspector, and the code bar.

## Milestone 9: looks (spec section 7)

- [ ] Done

Build: the three looks on the stage (monochrome plate, fluorescence microscope, glossy render), each with a transparent background option. Pigment genes are wired to the renderer only. Every look still draws correctly as stitched sub-rectangles.

Checks:
- Test: changing any pigment gene does not start a simulation run.
- Screenshots of the same organism in all three looks, in both views.
- In every look, a frame drawn as stitched sub-rectangles matches the same frame drawn whole, within a small pixel tolerance.

## Milestone 10: glass interface and look theming (spec section 6)

- [ ] Done

Build: the glass control-panel style, and the restyling of the whole interface with each look.

Checks:
- Screenshots of the same organism in all three looks, with the interface restyled in each.
- In the fluorescence look, controls take their colours from the current pigment hues and update when a pigment gene changes.

## Milestone 11: draft, tray and names (spec section 6)

- [ ] Done

Build: draft-then-refine while dragging (clarification 3), the specimen tray, the name caption.

Checks:
- A draft appears in under one second for each species' wild type while dragging a form gene, and is labelled as a draft.
- Releasing the slider produces geometry with the same hash as growing that code from scratch.
- Clicking a tray thumbnail restores that exact code.

## Milestone 12: export (spec section 9)

- [ ] Done

Build: the export dialog, tiled rendering, transparent background, caption, code in PNG metadata, methods file. The file name follows clarification 12, and square sizes follow clarification 13.

Checks:
- An A2 export is exactly 4,961 × 7,016 pixels.
- No seams: an export at a size small enough to render in one pass, rendered tiled and untiled, matches within a small pixel tolerance.
- With transparent background, the corner pixels have zero alpha.
- Reading the PNG back finds the genome code in its metadata.
- The methods file lists the code, species, version and all 24 decoded values.
- A4 square exports at 2,480 × 2,480.

## Milestone 13: methods page and final pass (spec sections 10 and 12)

- [ ] Done

Build: the Methods page, including the geometry hash of the current organism and the additions to the paper's procedure from clarifications 4 and 15.

Checks:
- Every item in spec section 12 is ticked, with evidence, except the cross-browser item.
- Cross-browser item, done by the owner: open the same code in Safari, Chrome and Firefox and compare the hash shown on the Methods page.
