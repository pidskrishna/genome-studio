# Session notes

## Status
- Every milestone (0 to 13) is closed. Milestone 10 was split into 10a to 10c with the owner's approval (4 October 2026).
- On 19 October 2026 the owner closed four milestones without their last checks, as good enough or not critical. If any of these is ever wanted, the details are below and in PLAN.md:
  - 5: the full 10,000-genome species B run (`npm run test:slow:b`, about 3 h); 2,000 have passed since the last fixes.
  - 10b: the frame-time check. Chrome was mostly 60 Hz jitter around the 16.7 ms cut-off plus one 300 ms stall; Safari ran at about 28 fps (cause not diagnosed: a 30 fps cap such as Low Power Mode, or a heavy frame). `helix.measureFrames()` reports refresh, missed frames, per-phase p95 and the GPU to diagnose it.
  - 10c: the screenshot comparison against the lab with the pane shown, and a real clipboard copy.
  - 13: spec section 12 items 1 (hash on a second machine) and 2 (species B 10,000); both stay unticked in SPEC.md.
- Recorded hashes: species A wild type `642a289e51e48070`; species B disc wild type `a0865f1229602174`. On 4 October 2026 the owner confirmed both match in Safari, Chrome and Firefox on one machine; spec section 12 also needs a second machine.
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
- Gene bands are the code-strand backbone, one glass tube per band (so a band can be picked), with a frosted ring where each gene begins; names and group colours are on the margin ruler (10b). Base colours (10a): the genome-browser convention, A green, C blue, G orange, T red (DESIGN.md section 2).
- Focusing (10b, light leads): the gene lights over 150 ms, then the helix turns (critically damped, 520 ms) so its middle base pair faces the viewer at 24% of the column's height, and the inspector opens below it. Clicking a base cycles it, selects it for typing and focuses its gene without turning. Clicking a band or ruler segment toggles focus. Escape clears the selection, then the focus. Horizontal drag spins (released drags glide, then settle on a detent), the wheel travels (not over the inspector).
- The inspector (`inspector.ts`) is shared by the helix and the gene map. The helix has its own canvas and renderer and skips `snapVertices`, since it is never exported.
- Dev hooks: `helix.showBase(p)` / `helix.showGene(locus)` turn to face and return client `{x, y, visible}`; `basePoint`, `genePoint`, `pickAt`, `state`.
- Browser check (4 October 2026): clicking base 13 four times went G→T→A→C→G, updating slider, number field, code bar and link each time.

Inspector and code bar (`lens-slider.ts`, `interaction.ts`, milestone 10c, checks pending)
- The inspector's slider is the lens slider (ARIA slider over raw values; fine control from `fineSpeed`). Slider, number field, bases and the gene's code-bar group share `data-link="gene-N"`; `pulse()` lights them together, `hold()` while dragging. The editable part of the inspector is wrapped in `.lockable` with a condensation frost.
- Randomise all: `rippleSchedule` gives each gene a 26 ms slot (header none, checksum last, locked genes keep their slot but stay still). The code bar holds old letters until each group's turn; the helix pulses and flashes on the same schedule (pulses scheduled ahead show the previous colour until they start). Any later editor event finishes a running ripple at once.
- Copy reads the code out gene by gene (14 ms apart) and rolls the button to "Copied" (or "Copy failed"); paste writes groups in at the same rhythm. Progress is a 1px hairline under the top bar with a mono readout; a new organism arrives with a focus pull (CSS blur on the stage canvas only; first organism and reduced motion crossfade).
- Checks so far (4 October 2026): randomise with genes 3 and 17 locked changed all 22 other genes and left 3 and 17 alone, with 23 groups held back for the ripple; copied text equalled the code and pasting it back through the paste box restored it exactly (the pane refused the real clipboard write and showed "Copy failed", as designed).

Draft, tray and names (`src/sim/draft.ts`, `studio.ts`, `tray.ts`, milestone 11)
- Draft (clarification 3) jobs `speciesADraft` and `speciesBDraft`. Species A: D doubled (segment length × 2) and an eighth of the points from the same seed, so point spacing in D and the sensing range are unchanged with no cube root; tip radius and twig shedding halve (same physical size); kill distance keeps its D length and the envelope limit is reapplied to the smaller envelope. Species B: cell size × 2. Minimum 24 points.
- `Studio.draft` holds a draft under the key `draft:<form key>`, so the update on release always regrows the organism and the draft's hash is never taken for it. The lens slider dispatches `slidergesture` (bubbling) on grab and release; `main.ts` drafts while it is active and regrows on release. Drafts swap in without the focus pull. Keyboard steps regrow fully, as before.
- Tray: full organisms only, newest first, each code once, at most 10; shown from the second organism; a click pastes that exact code. Thumbnails are 112 px renders of the stage (`renderImage`) taken 450 ms after the organism arrives.
- Caption: bottom left of the stage, the italic specimen name with the full code in fine mono (spec section 6: a plate caption with its code); it follows every edit.
- Checks (19 October 2026): a draft appeared 33 ms (A) and 234 ms (B) after a drag step on each wild type, labelled "Draft"; on release the hashes (A `e6ae491746b3499a`, B `818bf12719583bdc`) matched growing those codes from scratch in a fresh worker and in Node; clicking each of four tray thumbnails restored its exact code (editor, stage and link). Node draft timing for both wild types is under a second (`tests/sim/draft.test.ts`).

Export (`src/export/`, `ui/export-dialog.ts`, milestone 12)
- `sizes.ts`: presets at 300 dpi, landscape swaps, square takes the short edge (clarification 13), custom 1 to 20,000 px; file name = specimen name + first 12 letters of the code (clarification 12). `methods.ts`: code, species, version, hash, look, view, size and all 24 genes (value in words, exact value, gene value, bases).
- `png.ts`: own PNG writer (Sub filter, platform `CompressionStream('deflate')`, one IDAT per compressed piece, tEXt for 'Genome code', Title, Software, Description) and reader. No canvas, so sizes beyond Safari's ~16.7 MP canvas limit work (A2 is 34.8 MP).
- `exporter.ts`: renders tile by tile with `stage.renderRegion` (yielding between tiles; cancellable), tiles plus bloom margin within `maxTileSize`; converts to straight alpha in place for transparent; draws the plate caption on a strip and blends it in. `Stage` gained a `Framing` option ('stage' or 'fit': same direction, `frame3DAlong`) and `finishRegions()`. Flat is always fitted.
- Only the organism itself is exported: not a draft, not a regrow in flight, and not during the focus pull's first half (`swapPending` in `main.ts`; found when a check rendered the previous organism).
- Checks (19 October 2026): A2 is 4,961 × 7,016 (4 tiles, 1.3 s, 6.2 MB) and A4 square 2,480 × 2,480, both read back from the PNG with valid CRCs and the code in metadata; transparent exports have zero alpha in all four corners for both wild types in all three looks; the methods file has 24 gene lines, the code and the hash (`a0865f1229602174` for the species B wild type).
- Seams (900 × 1200, fit, 3 × 4 tiles against one pass; 8 organisms × 3 looks): 23 of 24 within `TILE_TOLERANCE`; plate and fluorescence exact in every case; worst difference 1 level. The one failure is the species B wild type in glossy: 8 pixels at 1 level, one of them on a seam (tolerance allows none on a seam). Untiled and tiled renders each repeat exactly; the differences come from glossy's GPU interpolation and, rarely, single-pixel depth ties where a sheet folds against itself (seen once at 14 levels in an earlier random set).
- Tried and rejected: aligning tile edges to multiples of 32 px. It fixed that random organism but dropped `dev/stage-tiles.html` from 64 to 58 of 64, so the differences only moved. Removed.
- Owner's decision (19 October 2026): export seams may differ by at most 1 level (invisible); the rest of `TILE_TOLERANCE` stands. With that, the sweep passes 24 of 24. Not done, and the route if exactness is ever needed: exact interpolation in glossy's physical shader, and depth written from the exact interpolation in every look, so depth ties resolve identically in tiles.
- Known, rare: a single interior pixel can flip at a depth tie where a sheet folds against itself (14 levels once, in an earlier random set; not on a seam).

Methods page and acceptance (`methods-content.ts`, `methods-page.ts`, `ACCEPTANCE.md`, milestone 13)
- Methods is a modal sheet from the top bar, so it can show the current organism (name, species, version, hash, code). Content is plain data in `methods-content.ts`, with numbers taken from the code's constants: the published/designed table (spec section 10), each species' procedure, equations, additions (each marked Designed, Designed extension or Numerical choice: clarifications 4, 5, 15 and 16, the duplicate-child rule, species B's designs), limits, references, encoding, draft and determinism notes, and both gene tables with range, scale and status.
- PNG exports now record 300 dpi in a pHYs chunk (11,811 px/m), read back by `readPng`.
- `ACCEPTANCE.md` gives evidence for each spec section 12 item; items 3 to 12 are ticked in SPEC.md. Fresh browser checks on 19 October 2026: pasted codes and links reproduce hashes (`67d2f6837c13705a`, `daadf677c643ecc1`); A2 transparent export (4,961 × 7,016, 300 dpi, zero-alpha corners, code in metadata). Item 8's visual part (the paper's character) is my judgement and the owner may want to confirm it.

Frame-time check (10b), owner's runs on 4 to 5 October 2026
- Chrome: 548 frames, within 0.728, p95 16.8 ms, worst 300 ms (1454 × 779). Mostly 60 Hz jitter around the 16.7 ms cut-off, plus one 300 ms stall; our own script per step is 2 to 4 ms, so the stall is GPU or compositing (first shader compile, or the frosted inspector re-blurring the moving canvas).
- Safari: 285 frames (about 28 fps), within 0.004, p95 45 ms (1454 × 813). Either a 30 fps cap (Low Power Mode) or a heavy frame; `measureFrames` now also reports refresh, missed frames, per-phase p95 and the GPU to tell which. Pending: the owner's re-run, and their decision on counting "on time" as not missing a display refresh rather than the literal 16.7 ms.

## Known issues and shortcuts
- **Neutral values aren't exactly 0:** anisotropy and lift can only reach 0.00024 (an even number of steps).
- **Species A tropism:** its effect on centre of mass is real but tiny, so the test averages 20 seeds. The clear effect is on branch direction.
- **Species B ruffles look modest** on stage (about 5% of the radius; the wild-type disc reads as a flat plate with a frilled rim). Not tuned yet: any range or constant change needs owner approval (clarification 2).
- **Speed:** species B averages 2–3 s per genome, with extreme cases at 25–45 s (low growth rate, sphere, many passes). Wild types take 0.2 s (A) and about 2 s (B) in the browser. `npm test` takes about 50 s with `testTimeout` at 60 s. `test:slow` (A 10,000 + B 1,000) takes about 25 min.
- **Helix:** in a short column the full inspector, opened below the focused gene, covers much of the helix beneath it (the gene itself stays visible at 24% of the height). The base tooltip shows only over something pickable.
- **Top bar** wraps to two lines at about 1024 px.
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

Glass interface (`src/ui/theme.ts`, `motion.ts`, `surface.ts`, `style.css`, milestone 10a)
- DESIGN.md is the design; `dev/interaction-lab.html` (modules in `dev/lab/`) is its working reference, with every variant the owner chose from. Lab picks are recorded in DESIGN.md section 7.
- Tokens per look live in `theme.ts` (`LOOK_TOKENS`) and are written to the root as CSS custom properties by `applyLook`; tests check every look has every token, the stage token equals the renderer's background, and the helix backdrop matches. Fluorescence accents read `--hue` (pigment A) and `--hue-b` (pigment B), rewritten on every edit by `applyPigmentHues`, so pigment edits restyle controls without a regrow.
- Plate paper and ink are the renderer's own (`#f3efe4`, `#1c1a17`); the lab's cool paper clashed with the stage and the owner chose to warm the interface rather than change exports.
- Layout: the stage spans all three grid rows under the top bar and code bar (glass, `--fill-1`); the helix column has its own backdrop. `--top-h` and `--code-h` give the bars' heights for anything placed on the stage.
- Look switch: `exposure()` lifts to 30% white (black into fluorescence) over 160ms, switches stage, tokens and helix at the peak with transitions off (`.switching`), and settles over 240ms. Reduced motion: an 80 + 80ms crossfade through `--bg`.
- Motion: critically damped springs solved exactly (`Damped`, ω = 7 / settle time); `motion.reduced` follows the system setting (dev handle `motion.pref`, then `applyMotionTokens()`). With it on: no scaling or travel (buttons, segments, reticle, helix turn jump), rim sweep stopped.
- Buttons are glass words (`button()` defaults to `btn glass`); the press is CSS `.down` added by `installButtonPress`, which also handles Space and Enter. Segmented groups get one sliding glass indicator (`glassSegments`) that watches `aria-pressed`.
- Nested glass can't blur what lies behind its parent panel (the parent is a backdrop root), so small glass parts get their frost from their own fill.
- Fonts: IBM Plex Sans 300/400/400 italic/500 and Plex Mono 400/500, latin subsets, from `@fontsource` (approved dependency); every number and code is mono.
- Browser checks (4 October 2026): three looks restyle everything with the same organism (hash `642a289e51e48070`); in fluorescence, setting pigment A to 255° and B turned segment accents from green to violet and pigment marks from orange to green with no regrow; with reduced motion, all seven enabled buttons kept `transform: none` while pressed, the segment indicator landed in one frame, the look switch crossfaded through the background colour, and focusing a gene jumped.

Borosilicate helix (`src/ui/helix-scene.ts`, `helix-view.ts`, `helix-ruler.ts`, milestone 10b)
- Material: `MeshPhysicalMaterial` transmission glass (roughness 0.16, attenuation `#d8ecef`), RoomEnvironment through PMREM, scene background = the look's backdrop (the transmission samples it). The coloured cores are a `ShaderMaterial` that reads the base colour from `instanceColor` (so `rungColour` stays exact for the tests), mixes light in sRGB and ends with `colorspace_fragment`, so cores match seen directly or through glass.
- Light per base (rest 0.62, focus 1, dim 0.16) and pulses are per-instance attributes stepped by `HelixScene.step`; a single-base edit (helix or inspector) runs the meet-in-the-middle pulse from the previous colour (`aPrev`). Locked genes grow frosted sleeves (520 ms); a species switch clears them.
- The view runs on springs (`Damped`) for spin and travel; `advance()` steps by elapsed time, so dev hooks read settled positions even with paused frames. Drift: 12°/s, paused 2.5 s after any touch and while a gene is focused. Drawing is continuous only while something moves (drift counts) and the helix is on screen.
- The ruler replaces the right-hand labels and the colour legend; the status line shows only while a base is selected. `bandPoint` samples clear of a band's open tube ends (a ray at the very end could pass into the tube).
- Dev hooks: `helix.measureFrames(ms)` (frame intervals over a scripted drift, two turns, a drag and a detent) and `helix.renderCost(n)` (draw time per frame with the GPU synchronised).
- Checks (4 October 2026): four real clicks on base 13 went G, T, A, C, G, with slider 2457, 3481, 409, 1433, 2457 and number field, code bar and link following. The browser pane throttles animation frames to 2 per second when it lacks focus, so `measureFrames` there is meaningless; `renderCost` at 1440 × 900 (helix canvas 480 × 696 at 2×) gave a mean of 3 to 4 ms and a 95th percentile of 4.2 to 7.5 ms in all three looks. The real frame-time check must be run by the owner in Chrome and Safari.

## Working notes
- In dev these are on `window`: `editor`, `commands`, `studio`, `stage`, `helix`, `geneMap`, `codeBar`, `tray`, `exportDialog`, `methodsPage`, `motion`, `applyMotionTokens`, `exportReady()`.
- The Claude browser pane: when hidden the page does not draw (screenshots can be stale); when unfocused it limits animation frames to about 2 per second and refuses clipboard writes. Simulation workers and render-to-image keep full speed. Use a separate tab for checks; screenshot pixels scale with the pane's size (read `innerWidth` to convert).
- `dev/interaction-lab.html` is the design reference for DESIGN.md; `dev/stage-tiles.html` is milestone 9's 64-case tile check (`window.tileSummary`).
