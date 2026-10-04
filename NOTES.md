# Session notes

## Status
- Milestones 0–4 done. Milestone 5 is committed (`7fd4b3b`) but its box is unticked: only 2,000 of the 10,000 random species B genomes have run since the last fixes (all passed). `npm run test:slow:b` runs all 10,000 (about 3 h at about 45 genomes/min). Next: milestone 6.
- Owner still to do: the cross-browser hash check on `dev/species-a.html` and `dev/species-b.html` (run `npm run dev`).
- Recorded hashes: species A wild type `642a289e51e48070`; species B disc wild type `a0865f1229602174`.
- Owner preference: ask before any check run longer than about 20 minutes, and offer a smaller sample with its bound.

## Decisions not in SPEC.md
Genome (`src/genome`)
- Checksum: odd-weighted sum of digits mod 256, as 4 bases, so any single-base change is caught.
- Log-scale genes decode with `detPow` (square roots only), so decoding is deterministic.
- Names: fixed syllable tables; the genera are Ramula (species A) and Plicula (B). Space density is kept as a real number; the simulation rounds it.
- `writeBase` refuses header and checksum positions. Wild types are provisional values in `wildtype.ts`.

Determinism (`src/sim`)
- `dmath.ts` uses fdlibm kernels with double-double argument reduction. `rng.ts` is xoshiro128** seeded by splitmix32, with streams. The hash is two 32-bit lanes over exact bits.
- Simulation tests live in `tests/sim`, because the allowlist scan forbids `Math.sin` etc. in `src/sim`.
- Worker: jobs are generators yielding progress; `src/ui/sim-client.ts` (`SimClient`) supersedes runs. Job kinds are `speciesA` and `speciesB`, each taking `{ code }`.

Species A
- Units are D = 1 and y is up. The envelope is a solid of revolution blending sphere and cone, with the closed-form volume in `src/genome/speciesA.ts`.
- Several origins sit on a ring of 0.15 × envelope radius. Surface seeking 1 moves 80% of points into the outer 10% shell.
- A node never regrows on top of an existing child. This is not in the spec yet; it belongs on the Methods page beside clarification 15.
- Relocation moves a node 0.5 × gene of the way to its parent. Smoothing is cubic B-spline subdivision.
- Twig shedding goes shortest first and never removes the last branching point.
- Driver order: distance from base, radius, branch order (Gravelius), height.
- Owner-approved spec edits already made: clarifications 4 and 5 changed, and clarification 16 added (sensing range is in point spacings, 2.5 to 12).

Species B (`src/sim/speciesB`)
- The starting radius is 1. Ring inner radius 0.5; tube length 2. Material coordinates are 3D starting positions, so the tube has no seam.
- Growth stops at 4 × the starting rest area. Final size is the diameter of a disc with the final rest area. The growth rate is the mean growth; margin bias, anisotropy and patches only redistribute it.
- Each step, the mesh is first scaled by the mean growth. Relaxation then moves each vertex to a weighted average of full corrections: stretch 1, bending h²/12, repulsion r/(1+r) with r = repulsion ÷ stiffness (each push capped at 0.1 personal space), and lift, saturating against stiffness. So stiffness only matters relative to repulsion and lift.
- Repulsion acts only between vertices at least 3 personal spaces apart in material distance (scaled by mean growth).
- Anisotropy strength is 0.5 (a ratio of 3:1 at ±1), measured in the rest geometry.
- Lift +1 pushes the margin up. Lift −1 pushes it outward along the sheet, as tension; it is not a plane attractor, which crushed tubes and spheres.
- The sphere's margin is where patch noise is above 0 (or the single highest point if none is), with distance measured along the starting mesh.
- Minimum roughness is 1e-4.
- Triangles are oriented outward. Driver order: margin distance, signed curvature, birth step, height. `drawnThickness` = min(h, personal space) × cell width (clarification 14).
- Mesh-quality guards: Delaunay flips in rest geometry (never across folds over 60°); a 150° cap on rest angles; a shape guard voting any triangle under 15° back to its rest shape; 20 settle passes and re-triangulation of folded-flat caps at maturity.
- Degenerate means any angle below 0.5° or zero area. That threshold is my choice.

## Known issues and shortcuts
- **Neutral values aren't exactly 0:** anisotropy and lift can only reach 0.00024 (an even number of steps).
- **Species A tropism:** its effect on centre of mass is real but tiny, so the test averages 20 seeds. The clear effect is on branch direction.
- **Species B ruffles look modest:** about 5% of the radius. Visual tuning waits for milestone 6, and any range or constant change needs owner approval (clarification 2).
- **Speed:** species B averages 2–3 s per genome, with extreme cases at 25–45 s (low growth rate, sphere, many passes). Wild types take 0.2 s (A) and about 2 s (B) in the browser.
- **Test times:** `npm test` takes about 50 s with `testTimeout` at 60 s. `test:slow` (A 10,000 + B 1,000) takes about 25 min.
- **Methods page (milestone 13) must state:** the duplicate-child rule, the clear stem lasting until the first branch, and all the species B designs above, marked as designed or numerical.

## For milestone 6
- Outputs: `BranchGeometry` (positions in D, parents, radii, drivers, envelope) and `SheetGeometry` (positions in starting radii, triangles, drivers, `cellWidth`, `drawnThickness`). Both are y-up, both carry a hash, and their buffers are transferred.
- Rendering never writes back into simulation state. Pigment genes are renderer-only (spec 8).
- Useful helpers: `parseGenome`, `parseHash`, `shareLink`, `wildType`, `specimenName` in `src/genome`.
- The `.claude/launch.json` entry `dev` runs the Vite server.
