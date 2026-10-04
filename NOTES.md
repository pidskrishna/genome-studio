# Session notes

## Status
- Milestones 0–4 and 6–9 done. Milestone 5 is committed (`7fd4b3b`) but its box is unticked: only 2,000 of the 10,000 random species B genomes have run since the last fixes (all passed). `npm run test:slow:b` runs all 10,000 (about 3 h at about 45 genomes/min). Next: milestone 10.
- Recorded hashes: species A wild type `642a289e51e48070`; species B disc wild type `a0865f1229602174`. On 4 October 2026 the owner confirmed both match in Safari, Chrome and Firefox on one machine; spec section 12 also needs a second machine (milestone 13).
- Owner preference: ask before any check run longer than about 20 minutes, and offer a smaller sample with its bound.

## Decisions not in SPEC.md
Genome (`src/genome`)
- Checksum: odd-weighted sum of digits mod 256, as 4 bases, so any single-base change is caught.
- Log-scale genes decode with `detPow` (square roots only), so decoding is deterministic.
- Names: fixed syllable tables; the genera are Ramula (species A) and Plicula (B). Space density is kept as a real number; the simulation rounds it.
- `writeBase` refuses header and checksum positions. Wild types are provisional values in `wildtype.ts`.

Determinism (`src/sim`)
- `dmath.ts` uses fdlibm kernels with double-double argument reduction. `rng.ts` is xoshiro128** seeded by splitmix32, with streams. The hash is two 32-bit lanes over exact bits.
- Simulation tests live in `tests/sim`, because the allowlist scan forbids `Math.sin` etc. in `src/sim`. Worker: jobs are generators yielding progress; `src/ui/sim-client.ts` (`SimClient`) supersedes runs. Job kinds are `speciesA` and `speciesB`, each taking `{ code }`.

Species A
- Units are D = 1, y up. The envelope is a solid of revolution blending sphere and cone (closed-form volume in `src/genome/speciesA.ts`). Origins sit on a ring of 0.15 × envelope radius. Surface seeking 1 moves 80% of points into the outer 10% shell.
- A node never regrows on top of an existing child. This is not in the spec yet; it belongs on the Methods page beside clarification 15.
- Relocation moves a node 0.5 × gene of the way to its parent. Smoothing is cubic B-spline subdivision. Twig shedding goes shortest first and never removes the last branching point. Driver order: distance from base, radius, branch order (Gravelius), height.
- Owner-approved spec edits already made: clarifications 4 and 5 changed, and clarification 16 added (sensing range is in point spacings, 2.5 to 12).

Species B (`src/sim/speciesB`)
- The starting radius is 1. Ring inner radius 0.5; tube length 2. Material coordinates are 3D starting positions, so the tube has no seam.
- Growth stops at 4 × the starting rest area. Final size is the diameter of a disc with the final rest area. The growth rate is the mean growth; margin bias, anisotropy and patches only redistribute it.
- Each step, the mesh is first scaled by the mean growth. Relaxation then moves each vertex to a weighted average of full corrections: stretch 1, bending h²/12, repulsion r/(1+r) with r = repulsion ÷ stiffness (each push capped at 0.1 personal space), and lift, saturating against stiffness. So stiffness only matters relative to repulsion and lift.
- Repulsion acts only between vertices at least 3 personal spaces apart in material distance (scaled by mean growth). Anisotropy strength is 0.5 (3:1 at ±1), measured in the rest geometry.
- Lift +1 pushes the margin up. Lift −1 pushes it outward along the sheet, as tension; it is not a plane attractor, which crushed tubes and spheres. The sphere's margin is where patch noise is above 0 (or the single highest point if none is), with distance measured along the starting mesh. Minimum roughness is 1e-4.
- Triangles are oriented outward. Driver order: margin distance, signed curvature, birth step, height. `drawnThickness` = min(h, personal space) × cell width (clarification 14).
- Mesh-quality guards: Delaunay flips in rest geometry (never across folds over 60°); a 150° cap on rest angles; a shape guard voting any triangle under 15° back to its rest shape; 20 settle passes and re-triangulation of folded-flat caps at maturity. Degenerate means any angle below 0.5° or zero area. That threshold is my choice.

Stage (`src/render`, milestone 6)
- Tubes: chains follow the thickest child, 8 sides, parallel-transport frames; a side chain starts at its parent node with its own radius; flat caps. Sheets: skins at ±drawnThickness/2 along area-weighted normals, plus a rim on open edges; tests check every body plan is watertight and wound outward.
- Framing (`framing.ts`): 3D fits the bounding sphere (FOV 30°, 10% margin) from `START_VIEW` (A: azimuth 30°, elevation 12°; B: 30°, 35°); flat is orthographic straight down, screen up = −z. A new organism resets the 3D view. No pan; orbit stops at 1.1 × the sphere radius.
- Glossy look placeholder: fixed colour `0xc7a27a` on studio grey `0x9a9c9f`, RoomEnvironment at 0.45. No tone mapping, because three.js skips it for render targets, so screen and tiles would differ.
- Tiles (`tiles.ts`, `snap.ts`): every tile uses the whole image's projection and a viewport shifted by whole pixels, and every vertex is snapped to a 1/16-pixel grid in the vertex shader. **Every material added later must go through `snapVertices`.** Images over MAX_VIEWPORT_DIMS (16,384) fall back to view-offset windows, not exact at window edges. Snapping makes interpolation affine on screen (invisible at these triangle sizes).
- Owner-approved tile pass mark (`TILE_TOLERANCE`): no difference on a seam, at most 1 level on at most 0.01% of pixels. Measured on `dev/stage-tiles.html`: B exact, A 3 and 7 of 480,000 pixels at 1 level (GPU shading rounding).
- On load the app reads a code from `#`, else opens the species A wild type. Drawing is on demand (rAF), so a hidden browser pane can give stale screenshots.

Editor (`src/ui`, milestone 7)
- `Editor` (`editor.ts`) is the pure state: code, focus, per-species locks, undo/redo of whole codes, and the typo or paste-error message (cleared by the next edit). Edits sharing a gesture id (one slider drag) are one undo step. Focus and locks are not in history.
- Randomise picks uniformly among every value except the current one, so every unlocked gene always changes. Randomise-gene does nothing on a locked gene (its button is disabled).
- `Studio.update` regrows only when `formKey` (header, form genes, seed) changes; pigment edits never start a run. Every edit rewrites the address with `history.replaceState`; `hashchange` loads a pasted link.
- The number field shows percent units as percentages (spec wording); choice genes take the index. Notes show the kill-distance limit, sensing range in D and drawn thickness (clarifications 5, 14, 16). References and wording are in `gene-info.ts`.
- Paste tries `navigator.clipboard.readText()`, then opens a paste field (the browser pane refuses clipboard reads); pasting outside a text field also works. Header and checksum are read-only rows in the gene map. Every action is in `commands` in `main.ts` (hook for shortcuts).
- End-to-end check (4 October 2026): a random code per species, pasted and opened as a link in a fresh tab, gave the same hash as growing it, and as Node.

Helix (`src/ui/helix-*.ts`, milestone 8)
- Pure geometry in `helix-geometry.ts` (Å: rise 3.38, 10.5 bp per turn, backbone radius 9.5; axis y, base 1 at the top, code strand 5′→3′ downwards at angle −i × twist, so right-handed). The paired strand is offset 144°, giving grooves of about 14 Å and 21 Å.
- Gene bands are tubes on the code-strand backbone, coloured by group as in the gene map; the paired backbone is grey. Base colours: A pink, C violet, G amber, T teal. Labels are DOM to the right of the helix.
- Focusing turns the gene's middle base pair to face the viewer and brings it to mid-view (650 ms ease). Clicking a base cycles it, selects it for typing and focuses its gene without turning. Clicking a band or label toggles focus. Escape clears the selection, then the focus. Horizontal drag spins, the wheel travels (not over the inspector).
- The inspector (`inspector.ts`) is shared by the helix and the gene map. The helix has its own canvas and renderer and skips `snapVertices`, since it is never exported.
- Dev hooks: `helix.showBase(p)` / `helix.showGene(locus)` turn to face and return client `{x, y, visible}`; `basePoint`, `genePoint`, `pickAt`, `state`.
- Browser check (4 October 2026): clicking base 13 four times went G→T→A→C→G, updating slider, number field, code bar and link each time.

## Known issues and shortcuts
- **Neutral values aren't exactly 0:** anisotropy and lift can only reach 0.00024 (an even number of steps).
- **Species A tropism:** its effect on centre of mass is real but tiny, so the test averages 20 seeds. The clear effect is on branch direction.
- **Species B ruffles look modest** on stage (about 5% of the radius; the wild-type disc reads as a flat plate with a frilled rim). Not tuned yet: any range or constant change needs owner approval (clarification 2).
- **Speed:** species B averages 2–3 s per genome, with extreme cases at 25–45 s (low growth rate, sphere, many passes). Wild types take 0.2 s (A) and about 2 s (B) in the browser. `npm test` takes about 50 s with `testTimeout` at 60 s. `test:slow` (A 10,000 + B 1,000) takes about 25 min.
- **Helix:** at narrow columns (about 340px) the inspector covers the gene labels beside it; the tooltip shows only over something pickable.
- **Methods page (milestone 13) must state:** the duplicate-child rule, the clear stem lasting until the first branch, and all the species B designs above, marked as designed or numerical.

Looks (`src/render/looks.ts`, `bloom.ts`, `exact-mesh.ts`, `colour.ts`, milestone 9)
- Vertices record their source node or sheet vertex; gradient drivers are scaled 0–1 between 1st and 99th percentiles; contrast narrows the blend (full range at 0, middle 5% at 1); hue blends the short way. Pigment edits only rewrite vertex colours and uniforms.
- Plate: tone from lightness (pigment B at 0.35 ×); hue, saturation, gloss, glow ignored. Light from upper left; hatching 45°, cross-hatching −45°, vertical lines in darkest tones; 200 lines and a 1/800 short-side outline. Transparent keeps ink only.
- Fluorescence: hue and saturation at lightness 0.5 as emitted light, additive, no depth test, rim glow, depth fade across the bounding sphere. Glow sets intensity 0.45–1.65, bloom strength 0.2–1.5, radius 0.4–2.4% of short side. Transparent: alpha is the brightest channel.
- Glossy: HSL surface colour; gloss sets roughness 0.9→0.1, clear coat 0→1, environment 0.3→0.55; glow adds up to 0.3 self-illumination. Soft shadows on the organism only (no floor: a floor plane puts vertices behind the camera, which snapping can't handle).
- Tile safety: shadow noise keyed to whole-image pixels inside `snapVertices`; tiles start on even pixels; plate and fluorescence interpolate exactly (`exact-mesh.ts`); bloom uses a padded margin (`stage.tileMargin`, exporter must keep tile plus margin within `maxTileSize`). Pixels are premultiplied; `toStraightAlpha` for PNG export.
- Tile check: `dev/stage-tiles.html` (filters `?look=&species=&view=&bg=`), read `tileSummary`. 4 October 2026: 64 of 64 pass; plate and fluorescence exact, glossy 1–7 pixels at 1 level, none on a seam.
- Dev handles: `commands.setLook('plate'|'fluorescence'|'glossy')`, `setTransparent`, `setView`; read `stage.look`, `.transparent`, `.view`. Default look is glossy.

Three.js skills (`.claude/skills/`)
- Materials, shaders, lighting and postprocessing, copied from cloudai-x/threejs-skills at `b1c6230` and corrected for r186 (`72799f1`). They are generic; where they disagree with the decisions above, these notes win:
- No tone mapping and no `OutputPass` (screen and tiles would differ). Bloom is our own `bloom.ts`, not `EffectComposer` or `UnrealBloomPass`.
- Any material built from the skills (`ShaderMaterial`, `onBeforeCompile`) must still go through `snapVertices`, except on the helix.
- Their examples use `Math.sin`, `Math.cos` and clocks: fine in `src/render` and `src/ui`, never in `src/sim`.

## For milestone 10
- In dev, `window.editor`, `commands`, `studio`, `stage`, `helix`, `geneMap` are exposed. Use a separate browser-pane tab for checks (the owner may be using the pane). Pane screenshots are 800 wide of a 1024 viewport: multiply client pixels by about 0.78.
- The top bar wraps to two lines at 1024 px. Glossy could land a 1-level pixel on a seam for some future organism; giving it exact interpolation would fix that.
