# Build plan

Done in order, one milestone per session. A milestone is done only when every check under it passes. Section numbers refer to `SPEC.md`; "clarification n" refers to its section 13.

- **v0.1**, milestones 0 to 13: closed on 19 October 2026 (species A and B). Four were closed by the owner without their last checks; each says what was not run.
- **v0.2**, milestones 14 to 18: started on 19 October 2026 (species C, phyllotaxis, and D, seashell). Milestones 14 to 18 done; v0.2 is complete, with milestone 18 closed by the owner on a sample (see below).
- **v0.3**, milestones 19 to 24: planned on 20 October 2026 (species E, coral, and F, fungal fruit body, and a design pass for the species switch). Milestones 19 and 20 done; next: milestone 21.

# v0.1

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

- [x] Done

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

- [x] Done

Build: the growing triangle mesh in the worker for the disc body plan: grow, relax (stable under every stiffness and thickness), divide, the repulsion grid, maturity by area multiple with the 40,000-vertex cap (clarification 1), distance from margin measured on the starting shape (clarification 7), and the gradient-driver attributes per vertex. No rendering.

Checks:
- 1,000 random disc genomes grow to maturity with no error and no NaN.
- Same code, same geometry hash; disc wild-type hash recorded.
- Flat test as in clarification 8: with margin bias at minimum the sheet stays flat (out-of-plane deviation within the starting roughness); the deviation rises as margin bias rises.
- Vertex count at maturity never exceeds 40,000.
- Every vertex carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds. If this is missed, stop and report before milestone 5.

## Milestone 5: species B, all body plans (spec section 4)

- [x] Done: closed by the owner on 19 October 2026 as good enough. Not run: the full 10,000-genome species B check (2,000 of 10,000 passed since the last fixes, none failed).

Build: ring, tube and closed sphere, growth patches, anisotropy and lift, with margins as in clarification 7.

Checks:
- 1,000 random genomes across all body plans grow to maturity with no error and no NaN (a slower script runs 10,000, parallelised across worker threads).
- Same code, same geometry hash; wild-type hash recorded.
- No triangle is degenerate at maturity: every triangle has a minimum angle above a stated threshold and non-zero area.
- Each body plan grows from the right starting shape (disc, ring, tube, sphere) and the closed sphere stays closed.

## Milestone 6: stage (spec sections 6 and 7)

- [x] Done

Build: the Three.js stage showing species A as tubes and species B as a surface with thickness (drawn thickness as in clarification 14), in the glossy look only. Also the flat and 3D view toggle, orbit and zoom, a minimal progress indicator, and a temporary text box for pasting a code. The renderer can draw any sub-rectangle of a larger virtual image, ready for tiled export.

Checks:
- Open the app in the browser pane, take screenshots of each species' wild type in 3D and flat view, and confirm all show the organism centred and fully in frame.
- Pasting a different code changes the organism.
- A progress indicator shows during a regrow and clears when it is ready.
- A frame drawn as four sub-rectangles and stitched matches the same frame drawn whole.

## Milestone 7: editor state, code bar and gene map (spec section 5)

- [x] Done

Build: the editor state (focus, randomise all, randomise one, lock, wild type, undo and redo, species switch), the code bar with copy and paste, the linear gene map, and the inspector as plain DOM. This replaces the temporary paste box. Layout as in spec section 6, plain styling for now.

Checks:
- Unit tests on the editor state: slider and bases stay in sync; randomise-all changes every unlocked gene and no locked gene; undo and redo restore exact codes.
- Header and checksum bases cannot be edited (clarification 10); switching species loads that species' wild type.
- End to end in the browser pane: a pasted code and a shared link both reproduce the organism they came from (same geometry hash).
- Screenshot showing the gene map, a focused gene with its inspector, and the code bar.

## Milestone 8: helix editor (spec section 5)

- [x] Done

Build: the 3D B-form helix, gene bands, hover, click to focus with the helix turning to face the gene, the inspector attached beside it, base editing on the helix, drag to rotate, scroll to travel, and the gene map toggle.

Checks:
- Unit test: the helix geometry is right-handed and every rung pairs A with T or C with G.
- Clicking a base cycles it through A, C, G, T and updates the slider and code bar.
- Screenshot showing the helix, a focused gene with its inspector, and the code bar.

## Milestone 9: looks (spec section 7)

- [x] Done

Build: the three looks on the stage (monochrome plate, fluorescence microscope, glossy render), each with a transparent background option. Pigment genes are wired to the renderer only. Every look still draws correctly as stitched sub-rectangles.

Checks:
- Test: changing any pigment gene does not start a simulation run.
- Screenshots of the same organism in all three looks, in both views.
- In every look, a frame drawn as stitched sub-rectangles matches the same frame drawn whole, within a small pixel tolerance.

## Milestone 10a: glass and look theming (spec section 6, DESIGN.md)

- [x] Done

Milestone 10 was split into 10a to 10c on 4 October 2026, with the owner's approval; DESIGN.md is the design they follow.

Build: the glass control-panel style and the restyling of the whole interface with each look: the tokens for each look, IBM Plex (bundled), glass panels with rim light, light sweep and cursor light, fluorescence accents from pigments A and B, the exposure look switch, segmented controls, the button press, the reticle cursor, focus brackets, and reduced-motion support.

Checks:
- Screenshots of the same organism in all three looks, with the interface restyled in each.
- In the fluorescence look, controls take their colours from the current pigment hues and update when a pigment gene changes.
- With reduced motion on, nothing on screen travels or scales; changes are crossfades.
- Unit tests for the pure parts: every look defines every token, accent hues follow the pigment genes, and springs settle without overshoot.

## Milestone 10b: the borosilicate helix (spec section 5, DESIGN.md)

- [x] Done: closed by the owner on 19 October 2026 as not critical. Not passed: the frame-time check (Chrome 72.8% of frames within 16.7 ms, p95 16.8 ms, one 300 ms stall; Safari about 28 fps). The other checks passed.

Build: the borosilicate helix material with lit cores and frosted gene boundaries, the margin ruler (names on approach, name and value on hover), focusing with light leads, drag detents, idle drift and breathing, base cycling with light meeting in the middle, and lock frost on the helix.

Checks:
- Clicking base 13 four times goes G, T, A, C, G, updating slider, number field, code bar and link each time.
- At least 95% of frames take 16.7ms or less over 10 seconds of drift, turns and drags at 1440 × 900, in Chrome and Safari.
- Screenshots of the helix in all three looks.
- Unit tests for the detent and the ruler's label fading.

## Milestone 10c: inspector and code bar interactions (spec sections 5 and 6, DESIGN.md)

- [x] Done: closed by the owner on 19 October 2026 as not critical. Not run: the screenshot comparison against the lab with the pane shown, and a copy into the real clipboard (copied text and paste round-trip were checked).

Build: the lens slider with fine control and keys, linked pulses, lock frost in the inspector, the gene-by-gene randomise ripple, gene-by-gene copy and paste, and the regrow focus pull with hairline progress.

Checks:
- Randomise all changes every unlocked gene and leaves locked genes alone, with the ripple running.
- Copy then paste reproduces the exact code.
- Screenshots of the real app match the lab and DESIGN.md; mismatches fixed.
- Unit tests for the fine-drag speed and the ripple schedule.

## Milestone 11: draft, tray and names (spec section 6)

- [x] Done

Build: draft-then-refine while dragging (clarification 3), the specimen tray, the name caption.

Checks:
- A draft appears in under one second for each species' wild type while dragging a form gene, and is labelled as a draft.
- Releasing the slider produces geometry with the same hash as growing that code from scratch.
- Clicking a tray thumbnail restores that exact code.

## Milestone 12: export (spec section 9)

- [x] Done

Build: the export dialog, tiled rendering, transparent background, caption, code in PNG metadata, methods file. The file name follows clarification 12, and square sizes follow clarification 13.

Checks:
- An A2 export is exactly 4,961 × 7,016 pixels.
- No seams: an export at a size small enough to render in one pass, rendered tiled and untiled, matches within a small pixel tolerance. The owner set this tolerance on 19 October 2026: a pixel on a seam may differ by at most 1 level; everywhere else, at most 1 level on at most 0.01% of pixels (`TILE_TOLERANCE`).
- With transparent background, the corner pixels have zero alpha.
- Reading the PNG back finds the genome code in its metadata.
- The methods file lists the code, species, version and all 24 decoded values.
- A4 square exports at 2,480 × 2,480.

## Milestone 13: methods page and final pass (spec sections 10 and 12)

- [x] Done: closed by the owner on 19 October 2026 as not critical. Not done: spec section 12 items 1 (hash on a second machine) and 2 (species B 10,000 run); see ACCEPTANCE.md.

Build: the Methods page, including the geometry hash of the current organism and the additions to the paper's procedure from clarifications 4 and 15.

Checks:
- Every item in spec section 12 is ticked, with evidence, except the cross-browser item.
- Cross-browser item, done by the owner: open the same code in Safari, Chrome and Firefox and compare the hash shown on the Methods page.

# v0.2

Species C (phyllotaxis, spec section 4a) and species D (seashell, spec section 4b), through the whole tool. v0.2 clarifications are 17 to 21. In every v0.2 milestone, species A and B must keep growing exactly as in v0.1: the full test suite passes and their recorded hashes are unchanged.

## Milestone 14: genome for species C and D (spec sections 2, 4a and 4b)

- [x] Done

Build: both gene tables, headers AAG and AAT (clarification 17), decoding with every clamp, wild types (provisional until milestones 15 and 16), and specimen names for the two new genera. The rest of the tool keeps offering only A and B until milestone 17.

Checks (unit tests):
- Gene tables match `SPEC.md` locus by locus for all four species.
- 10,000 random codes per new species decode with every parameter inside its range.
- Every gene value 0 to 4,095 survives value → bases → value; whole-number and multiple-choice genes land on their bin centres (clarification 6).
- Species AAG and AAT with version AAA decode; any other unused species is still rejected with a message.
- The checksum, typo warning and link sharing work for C and D codes as for A and B.
- Names: the two new genera differ from A's and B's; the epithet rules hold as in milestone 1.
- The species A and B wild-type hashes are unchanged.

## Milestone 15: species C simulation (spec section 4a)

- [x] Done

First: check every model statement in section 4a against Douady and Couder (1996), parts I to III, and against chapter 4 of The Algorithmic Beauty of Plants. Where they differ, stop and propose the spec edit (clarification 18).

Build: the threshold model in the worker on the plane (organ drift, cone distance, inhibition sum, initiation at the lowest inhibition below threshold, starting organs, Γ falling over time by part III's eq. 1), the map onto the four receptacles, organ meshes for the four organ forms, maturation, size variation, initiation noise, the caps, and the four gradient-driver attributes per vertex. Output in the species B geometry form (clarification 19). No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN (a slower script runs 10,000).
- Same code, same geometry hash; wild-type hash recorded.
- With initiation noise at 0, a soft falloff and a spiral arrangement, the mean angle between the last organs is within 1° of 137.5°, and the parastichy counts near the apex are consecutive Fibonacci numbers.
- Raising the inhibition range moves the mean angle toward 180° (alternate); on the cone body plan with stiff falloff, two starting organs give opposite pairs at right angles (decussate) over a range of the inhibition range (Douady and Couder part II, figure 4).
- The organ count never exceeds 2,000, the vertex count never exceeds 120,000, and no triangle has zero area.
- The angle around the centre is kept by the receptacle map, and on the column the spirals become helices of constant pitch.
- Every vertex carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds.

## Milestone 16: species D simulation (spec section 4b)

- [x] Done

First: check every model statement in section 4b against Raup (1966), Fowler, Meinhardt and Prusinkiewicz (1992), and Meinhardt and Klingler (1987). Where they differ, stop and propose the spec edit (clarification 18).

Build: Raup's sweep in the worker (generating curve, expansion, distance from axis, translation, tilt, handedness), the embryonic cap, ribs, cords, nodules, aperture flare, growth irregularity, the edge pattern, the stopping rules and vertex cap, and the four gradient-driver attributes per vertex. Output in the species B geometry form (clarification 19). No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN (a slower script runs 10,000).
- Same code, same geometry hash; wild-type hash recorded.
- With ornament, flare and irregularity off: the generating curve's size grows by W per turn within 1e-9 relative error; a translation of 0 puts every whorl centre in one plane; distance from axis 0 closes the umbilicus.
- The left-handed shell is the right-handed one mirrored, vertex for vertex.
- The vertex count never exceeds 120,000 and no triangle has zero area, including at the cap and at high whorl expansion.
- The edge pattern forms stripes along the growth direction on the wild type (it is not uniform around the curve), and changes with the seed.
- Every vertex carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds.

## Milestone 17: species C and D in the app (spec sections 5 to 9)

- [x] Done

Build: the species switch with four species (clarification 21, as a segmented control per DESIGN.md), drawing C and D on the stage in all three looks and both views, the editor, helix, gene map and inspector for the new genes, drafts (clarification 20), the tray, export and methods file.

Checks:
- Screenshots of each new species' wild type in all three looks, in both views, centred and fully in frame.
- In every look, a C and a D frame drawn as stitched sub-rectangles matches the same frame drawn whole, within `TILE_TOLERANCE`.
- Test: changing any pigment gene of C or D does not start a simulation run.
- A draft appears in under one second for each new wild type while dragging a form gene, labelled as a draft; on release the hash equals growing that code from scratch.
- End to end in the browser pane: a pasted code and a shared link of each new species reproduce the organism (same hash); switching species loads each wild type.
- An A4 export of each new species has the right size and carries its code in the metadata; the methods file lists all 24 decoded values.
- Screenshot of the switch with four species, in each look.

## Milestone 18: Methods page and v0.2 acceptance (spec sections 10 and 12)

- [x] Done: closed by the owner on 20 October 2026 with a sample. Not run: the full 10,000 random species C genomes (4,000 passed with no failure, so the failure rate is below 0.075% at 95% confidence); and the owner's cross-browser hash check (Safari, Firefox, second machine). Species D passed all 10,000.

Build: Methods page content for species C and D (models, equations, every gene with range and scale, references, limits, which parts are published and which designed), and v0.2 evidence in ACCEPTANCE.md.

Checks:
- Every v0.2 item in spec section 12 is ticked, with evidence, except the cross-browser item.
- The 10,000-genome runs for C and D: ask the owner before starting any run over about 20 minutes, and offer a smaller sample with its bound.
- Cross-browser item, done by the owner: open a C and a D code in Safari, Chrome and Firefox, on two machines, and compare the hash on the Methods page.

# v0.3

Species E (coral, spec section 4c) and species F (fungal fruit body, spec section 4d), through the whole tool. v0.3 clarifications are 25 onward. In every v0.3 milestone, species A to D must keep growing exactly as in v0.2: the full test suite passes and their recorded hashes are unchanged.

## Milestone 19: genome for species E and F (spec sections 2, 4c and 4d)

- [x] Done

Build: both gene tables, headers ACA and ACC (clarification 25), decoding with every clamp, wild types (provisional until milestones 20 and 21), and specimen names for the two new genera. The rest of the tool keeps offering only A to D until milestone 23.

Checks (unit tests):
- Gene tables match `SPEC.md` locus by locus for all six species.
- 10,000 random codes per new species decode with every parameter inside its range.
- Every gene value 0 to 4,095 survives value → bases → value; whole-number and multiple-choice genes land on their bin centres (clarification 6).
- Species ACA and ACC with version AAA decode; any other unused species is still rejected with a message.
- The checksum, typo warning and link sharing work for E and F codes as for A to D.
- Names: the two new genera differ from the other four; the epithet rules hold as in milestone 1.
- The species A to D wild-type hashes are unchanged.

## Milestone 20: species E simulation (spec section 4c)

- [x] Done

First: check every model statement in section 4c against Kaandorp and Sloot (2001), Merks et al. (2003) and Kaandorp et al. (2005), and against Kaandorp (1994) where available. Where they differ, stop and propose the spec edit (clarification 26). Done on 20 October 2026: clarification 32.

Build: the starting forms, the nutrient lattice with its source plane and absorbing floor, the diffusion solver (clarification 29), rasterising the colony into the lattice, uptake at polyp height, the growth function with the curvature factor, growth threshold and uptake response, polyp division and merging, smoothing, irregularity, the stopping rules and vertex cap, corallite relief, and the four gradient-driver attributes per vertex. Output in the species B geometry form (clarification 27). No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN. There is no 10,000 run for species E (clarification 31). Passed on 20 October 2026 (`npm run test:slow:e`, 46 minutes on eight threads).
- Same code, same geometry hash; wild-type hash recorded.
- With the curvature rule off, the wild type has more than one branch tip at maturity.
- Compactness rises as growth to transport rises, over at least four values across its range (clarification 32).
- Raising the polyp spacing gives thicker branches and a more compact colony (clarification 33).
- With growth very slow against transport, the field matches the steady-state (Laplace) solution within a stated tolerance.
- The vertex count never exceeds 120,000 and no triangle has zero area.
- Every vertex carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds.

## Milestone 21: species F simulation (spec section 4d)

- [ ] Done

First: check every model statement in section 4d against Meškauskas, McNulty and Moore (2004) and Meškauskas, Fricker and Moore (2004). Where they differ, stop and propose the spec edit (clarification 26).

Build: hyphal sections and tips, the density, long-range and parallel fields on a spatial grid (clarification 29), the tropism sum, persistence, branching, the five programmes with their phases, the caps, tube geometry, and the four gradient-driver attributes per node. Output in the species A geometry form (clarification 27). No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN (a slower script runs 10,000).
- Same code, same geometry hash; wild-type hash recorded.
- Colony programme: the ratio of the longest to the shortest principal axis of the tip positions is below a stated bound; lowering the branching threshold lowers the tip count and raises the mean section length.
- Cup programme: fewer hyphae cross a small disc on the axis than an equal disc at the rim.
- Mushroom programme on the wild type: the cap's width is more than twice the stem's.
- On a small mycelium, the grid fields agree with the direct sum over every point within a stated tolerance.
- The tip, segment and vertex caps hold.
- Every node carries all four gradient-driver attributes, with no NaN.
- Speed benchmark (in the browser): wild type reaches maturity in under 10 seconds.

## Milestone 22: species switch design pass (DESIGN.md)

- [ ] Done

Six species do not fit the four-segment control (DESIGN.md, "Segmented controls"; clarification 30). The switch is redesigned by milestone 10's process, stopping for the owner after each phase:

1. Interview: what the switch shows for each species (letter, form name, genus), where it sits, how it behaves, and how it grows past six (the species field allows 64).
2. Lab: three variants in `dev/interaction-lab.html`, each with six species, in all three looks.
3. DESIGN.md: the chosen design written up. Any conflict with `SPEC.md` is approved by the owner first.

Nothing in the app changes in this milestone; milestone 23 builds it. It needs only milestone 19, so it can run beside milestones 20 and 21 if the owner asks.

Checks:
- The owner has picked a variant in the lab, and the DESIGN.md update is approved.
- The lab shows the chosen switch with six species in all three looks; it works with the arrow keys and respects reduced motion.
- The design says how a seventh species would be added without a redesign.

## Milestone 23: species E and F in the app (spec sections 5 to 9)

- [ ] Done

Build: the species switch with six species as designed in milestone 22 (clarification 30), drawing E and F on the stage in all three looks and both views, the editor, helix, gene map and inspector for the new genes, drafts (clarification 28), the tray, export and methods file.

Checks:
- Screenshots of each new species' wild type in all three looks, in both views, centred and fully in frame.
- In every look, an E and an F frame drawn as stitched sub-rectangles matches the same frame drawn whole, within `TILE_TOLERANCE`.
- Test: changing any pigment gene of E or F does not start a simulation run.
- A draft appears in under one second for each new wild type while dragging a form gene, labelled as a draft; on release the hash equals growing that code from scratch.
- End to end in the browser pane: a pasted code and a shared link of each new species reproduce the organism (same hash); switching species loads each wild type.
- An A4 export of each new species has the right size and carries its code in the metadata; the methods file lists all 24 decoded values.
- Screenshot of the switch with six species, in each look, matching the lab design from milestone 22.

## Milestone 24: Methods page and v0.3 acceptance (spec sections 10 and 12)

- [ ] Done

Build: Methods page content for species E and F (models, equations, every gene with range and scale, references, limits, which parts are published, designed or numerical choices), and v0.3 evidence in ACCEPTANCE.md.

Checks:
- Every v0.3 item in spec section 12 is ticked, with evidence, except the cross-browser item.
- The 10,000-genome run for F: ask the owner before starting any run over about 20 minutes, and offer a smaller sample with its bound. Species E stays at 1,000 (clarification 31).
- Cross-browser item, done by the owner: open an E and an F code in Safari, Chrome and Firefox, on two machines, and compare the hash on the Methods page.
