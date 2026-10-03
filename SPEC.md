# Genome-driven growth studio: v1 specification

The tool grows procedural 3D organisms from a 160-letter ATGC code, edited on a 3D double helix, and exports them as print-size artwork. It serves two readers at once: a graphic designer who needs usable layers, and a biologist who needs the models to be real.

The flow is four steps: edit genes on the helix, a published growth model runs from them, the organism renders in one of three looks, and a PNG is exported. The same code always grows the same organism, on any machine.

Version 1 ships two species, each with its own genome: branching and venation, and differential growth. The tool has no name yet.

## 1. Decisions

These are fixed. Do not change them.

| Topic | Decision |
| --- | --- |
| Input | Nothing is uploaded. Every artwork is generated from a genome. |
| Typography | Out. The tool makes organisms only. |
| Species in v1 | Branching and venation; differential growth. |
| Genome per species | Each species has its own genome and its own gene map. |
| Genome size | 24 genes per species: 23 parameter genes and 1 seed gene. |
| Genome form | One ATGC string. Sliders and bases stay in sync: moving one rewrites the other. |
| Sharing | Pasting a code reproduces the exact organism it came from. |
| Main editor | The 3D double helix. A randomise-all button is required. |
| Control style | Precise parameter setting. |
| Growth space | Organisms grow in true 3D. Flat is a top-down view of the same organism. |
| Appearance | Colour and surface are genes. |
| Age | Not a gene. Every organism grows to a fixed maturity. |
| Environment | Constant. No environment controls. |
| Looks | Three, chosen by the user: monochrome plate, fluorescence microscope, glossy render. |
| Output | PNG at print size. |
| Devices | Desktop browsers only. |

## 2. Genome encoding

A genome is exactly 160 bases, read as base-4 numbers with A = 0, C = 1, G = 2, T = 3.

| Position | Length | Field | Meaning |
| --- | --- | --- | --- |
| 1 to 3 | 3 bases | Species | Which growth model and gene map to use (64 possible) |
| 4 to 6 | 3 bases | Encoding version | Lets old codes keep working after the gene map changes |
| 7 to 144 | 23 genes of 6 bases | Parameter genes | Each gene is a number from 0 to 4,095. The three most form-defining genes come first, because the specimen name is read from them. |
| 145 to 156 | 12 bases | Seed gene | Random seed, about 16.7 million values |
| 157 to 160 | 4 bases | Checksum | Catches typing errors in a pasted code |

Rules:

- **Decoding.** A gene value v maps to its parameter as min + (v / 4095) × (max − min). Parameters marked "log" use a log scale. Whole-number and multiple-choice parameters divide the range into equal bins.
- **Every code is viable.** Any bases in the gene and seed region must decode to an organism that grows without failing. Ranges are clamped to guarantee this.
- **Two-way sync.** Moving a slider rewrites that gene's 6 bases. Editing a base moves the slider. The mapping is one-to-one.
- **Checksum.** Recomputed on every edit. It must change when any single base in positions 1 to 156 changes. A pasted code with a wrong checksum still loads, with a warning that it may contain a typo.
- **Input tolerance.** Accept lower case, spaces and line breaks. Reject any other letters with a clear message. Store and display upper case without spaces.
- **Second strand.** The complementary strand (A with T, C with G) is derived for display and never stored.
- **Fixed loci.** Gene order is fixed per species and version.
- **Link sharing.** The code also travels in the page address after a # sign, so a link opens the same organism.
- **Maturity.** Growth stops at a fixed point per species (sections 3 and 4). It is a constant of the encoding version, not a gene.

## 3. Species A: branching and venation

This is the space colonisation algorithm of Runions, Lane and Prusinkiewicz (2007), "Modeling Trees with a Space Colonization Algorithm", https://www.algorithmicbotany.org/papers/colonization.egwnp2007.pdf, the 3D extension of their leaf venation model (2005), https://www.algorithmicbotany.org/papers/venation.sig2005.pdf.

Implement the paper's procedure as written:

- N attraction points are seeded inside an envelope; one or more starting nodes sit at the base.
- Each iteration, every attraction point influences the single nearest node, if that node is within the radius of influence.
- Each influenced node v grows a new node at v + D·n̂, where n̂ is the normalised sum of the normalised vectors from v to each point influencing it (paper eq. 2). With tropism vector g, the direction is (n̂ + g) normalised (paper eq. 3).
- An attraction point is removed when any node is closer to it than the kill distance.
- Branch radius uses the pipe model, from the tips toward the base: r^n = r1^n + r2^n (paper eq. 1), with every tip at the tip radius.
- Optional post-processing as in the paper: node relocation halfway toward the basal neighbour, and curve subdivision.

Lengths are in units of D, the segment length, as in the paper. The one exception is the sensing range, which is set in mean spacings between attraction points (clarification 16).

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Habit: aspect | Envelope height to width | 0.4 to 4, log | Paper (envelope is an input) |
| 2 | Tropism | Vertical growth bias | −0.5 to +0.5 | Paper, eq. 3 |
| 3 | Space density | N, number of attraction points | 300 to 12,000, log | Paper |
| 4 | Sensing range | Radius of influence | 2.5 to 12 point spacings, log | Paper |
| 5 | Clearance | Kill distance | 1 D to 20 D, never above the sensing range or a quarter of the envelope radius | Paper |
| 6 | Segment length | D, relative to envelope height | 0.4% to 2%, log | Paper |
| 7 | Surface seeking | Attraction points uniform (0), or crowded near the envelope (1) | 0 to 1 | Paper |
| 8 | Habit: taper | Envelope from cone, through sphere, to inverted cone | −1 to +1 | Paper (envelope is an input) |
| 9 | Clear stem | Gap between base node and envelope | 0 to 50% of height | Paper (envelope is an input) |
| 10 | Origins | Number of starting nodes | 1 to 6 | Paper |
| 11 | Pipe exponent | n in the branch radius formula | 2.0 to 3.0 | Paper, eq. 1 |
| 12 | Tip radius | Radius of terminal branches | 0.05 D to 0.5 D | Paper |
| 13 | Angle relaxation | Strength of node relocation toward the base | 0 to 1 | Paper |
| 14 | Limb smoothing | Curve subdivision passes | 0 to 3 | Paper |
| 15 | Twig shedding | Remove terminal branches shorter than a threshold | 0 to 10 D | Designed extension |
| 16 | Pigment A | Hue of the first pigment | 0 to 360° | Appearance |
| 17 | Pigment B | Hue of the second pigment | 0 to 360° | Appearance |
| 18 | Saturation | Colour strength | 0 to 1 | Appearance |
| 19 | Lightness | Overall tone | 0.1 to 0.9 | Appearance |
| 20 | Gradient driver | What the A-to-B gradient follows: distance from base, branch radius, branch order, or height | 4 choices | Appearance |
| 21 | Gradient contrast | How sharply A turns into B | 0 to 1 | Appearance |
| 22 | Gloss | Surface from matt to wet | 0 to 1 | Appearance |
| 23 | Glow | Translucency and light emission | 0 to 1 | Appearance |
| 24 | Seed | Random seed for point placement | 16.7 million values | Encoding |

**Maturity.** Growth ends as in the paper: when all attraction points are removed, or none is within range of any node.

**Fixed environment.** One organism, vertical axis up, no neighbours, no obstacles, no changing light.

The paper covers open branching only. Closed, looping venation is not in v1.

## 4. Species B: differential growth

A thin sheet that grows faster at its margin than in its interior, so it cannot stay flat and buckles into ruffles. The mechanism is real: Nath, Crawford, Carpenter and Coen (2003), "Genetic Control of Surface Curvature", Science 299:1404, http://doi.org/10.1126/science.1079354, showed that excess marginal growth makes snapdragon leaves crinkle. Sharon and Efrati (2010), "The mechanics of non-Euclidean plates", Soft Matter 6:5693, review the mechanics.

The simulation is a triangle mesh. Each step does three things in a fixed order:

1. **Grow.** The rest length of each edge increases by an amount set by its distance from the margin.
2. **Relax.** The mesh settles under stretch resistance, bending resistance and short-range repulsion that stops the sheet passing through itself.
3. **Divide.** Edges longer than the split length are divided, so mesh resolution keeps up with growth.

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Body plan | Starting form: disc, ring, tube, or closed sphere | 4 choices | Designed |
| 2 | Margin bias | Ratio of growth at the margin to growth in the interior | 1 to 20, log | Nath 2003 |
| 3 | Thickness | Sheet thickness h; sets stretch stiffness (∝ h), bending stiffness (∝ h³) and rendered thickness | 0.2 to 3 cell widths, log | Plate mechanics |
| 4 | Growth rate | Rest-length increase per step | 0.2% to 3%, log | Model |
| 5 | Growth zone | How far growth reaches in from the margin | 2% to 100% of radius | Nath 2003 |
| 6 | Anisotropy | Growth along the margin versus toward it | −1 to +1 | Model |
| 7 | Stiffness | Overall elastic modulus | 0.1 to 10, log | Plate mechanics |
| 8 | Personal space | Repulsion radius | 1 to 4 cell widths | Model |
| 9 | Repulsion | Repulsion strength | 0.1 to 10, log | Model |
| 10 | Starting roughness | Out-of-plane noise that seeds the first buckles | 0 to 5% of radius | Model |
| 11 | Patch size | Scale of spatial variation in growth rate | 5% to 100% of radius | Designed extension |
| 12 | Patch contrast | Strength of that variation | 0 to 1 | Designed extension |
| 13 | Lift | Vertical bias, from spreading flat to rising | −1 to +1 | Designed extension |
| 14 | Relaxation | Relax passes per growth step, from tense to settled | 1 to 20 | Model |
| 15 | Cell size | Edge split length | 0.5% to 2% of final size, log | Model |
| 16 to 23 | Pigment and surface | Same eight genes as species A, loci 16 to 23 | As species A | Appearance |
| 24 | Seed | Random seed for starting noise and growth patches | 16.7 million values | Encoding |

For locus 20, the gradient driver choices are: distance from margin, curvature, order of growth, or height.

A closed sphere has no margin; for that body plan, "margin" means the growth patches defined by loci 11 and 12.

**Maturity.** Growth stops when the total rest area of the sheet reaches a fixed multiple of its starting area. A hard cap of 40,000 vertices also applies, to be tuned for speed. See clarification 1 in section 13.

**Accuracy limits.** This is a spring-mesh approximation of thin-sheet elasticity. It reproduces buckling and ruffling qualitatively, and its parameters are dimensionless. It must not be presented as a quantitative model of any tissue.

**Naming rule for both species.** Gene names describe the model parameter. Never borrow the name of a real gene.

## 5. Helix interface

The helix is the editor, not a decoration: every gene is selected and changed on it.

**Geometry.** Draw correct B-form DNA: right-handed, about 10.5 base pairs per turn, two antiparallel strands, visible major and minor grooves. A 160-base genome is about 15 turns. The four bases have four fixed colours, and each rung pairs A with T and C with G.

**Genes on the helix.** Each gene is a labelled band along the backbone. Form genes, pigment genes, the seed, the header and the checksum are visually distinct groups.

**Interaction.**

- Drag to rotate the helix; scroll to travel along it.
- Hover a gene to see its name and current value.
- Click a gene to focus it. The helix turns to face it and an inspector opens beside it.
- The inspector shows the gene's slider, an exact number field, its 6 bases as editable letters, the real model parameter with its unit, one sentence on what it does, and its reference.
- Click a single base to cycle it through A, C, G, T, or type the letter.

**Buttons.**

- Randomise all genes.
- Randomise the focused gene.
- Lock a gene, so that randomise-all leaves it alone.
- Reset to wild type, the default genome for the species.
- Undo and redo.
- Switch species, which loads that species' wild type.

**Code bar.** The full 160-letter code is always visible, grouped by gene, with copy and paste. Pasting a valid code replaces the organism.

**Response to edits.** A change to a pigment gene updates the picture at once without regrowing. A change to a form gene or the seed regrows the organism, with a progress indicator until it is ready.

**Gene map.** A flat, linear list of all 24 genes sits behind a toggle for precise work. The helix stays the default.

## 6. Screen layout and visual style

One desktop screen: the helix on the left, the organism on the right.

| Region | Position | Holds |
| --- | --- | --- |
| Top bar | Full width, top | Species, look, flat or 3D, export. Only things outside the genome. |
| Helix editor | Left column, vertical, about a third of the width | The helix, the inspector attached to the focused gene, randomise, wild type, undo and redo |
| Stage | Right, the remaining width | The organism, with orbit and zoom in 3D view |
| Specimen tray | Bottom right of the stage | Thumbnails of recent organisms from this session; click one to return to it |
| Code bar | Full width, bottom | The 160-letter code grouped by gene, with copy and paste |

**Visual style.** A clean, precise control panel that reads as glass: translucent frosted panels, fine highlights on edges, soft depth between layers. It is a flat 2D layout that looks dimensional, not a 3D scene. The helix itself is the one true 3D object in the panel.

**The interface follows the look.** Switching look restyles the whole interface, not only the stage.

| Look | Interface |
| --- | --- |
| Monochrome plate | Off-white paper, ink-black type, frosted white glass panels |
| Fluorescence microscope | Black, dark smoked glass panels, controls lit in the organism's pigment hues |
| Glossy render | Neutral studio grey, clear glass panels with soft reflections |

**Draft, then refine.** While a form gene's slider is being dragged, the organism regrows as a coarse draft in under one second. On release it regrows at full quality. The draft is a preview of the same code, never a different organism.

**Specimen names.** Every organism gets a two-part Latin-style name, shown as a plate caption with its code. The name tracks what the organism looks like.

- The first word, the genus, comes from the species field (bases 1 to 3). All organisms of one species share a genus.
- The second word, the epithet, comes from the two leading bases of each of the first three genes: bases 7 to 8, 13 to 14 and 19 to 20. Those bases set each gene's coarse value in 16 steps, giving 4,096 epithets per genus.
- Fine adjustments keep the name. A visible change to one of the first three genes renames the organism. Two codes that share those bases always share a name.
- The epithet is built from fixed syllable tables, so it is always pronounceable, and the same bases give the same name in every version of the tool.

**Start.** There is no landing page. The tool opens with the wild type on the stage.

## 7. Views and looks

The genome defines the organism; the view and the look are how it is imaged, and they sit outside the code. One specimen can be imaged three ways without changing its genome.

| View | Camera | Use |
| --- | --- | --- |
| Flat | Straight down, no perspective, fixed framing | Crisp graphic layers |
| 3D | Free orbit with perspective | Sculptural images |

| Look | Background | How the pigment genes are used |
| --- | --- | --- |
| Monochrome plate | Off-white paper | Ink only. Lightness and gradient genes set tone; hue is ignored. Shading by line or stipple, like an engraved scientific plate. |
| Fluorescence microscope | Black | Pigment hues become emitted light. The glow gene sets intensity and bloom. Depth fades into darkness. |
| Glossy render | Neutral studio | Pigment hues are surface colour. The gloss gene sets the finish, with soft shadows and reflections. |

Every look offers a transparent background, so the organism can be placed as a layer in other design work.

## 8. Architecture and determinism

The growth simulation must produce the same geometry from the same code on every machine.

**Pipeline.** Helix editor ⇄ genome code → decoder. From the decoder, form genes and the seed go to the growth simulation (processor, seeded), which produces geometry, which goes to the renderer (graphics card), which produces the screen image and the PNG. Pigment genes go from the decoder straight to the renderer, skipping the simulation. View and look feed the renderer and are not in the code.

**What "exact" means.** Identical code gives bit-identical geometry: the same vertices in the same order. The rendered picture is visually identical but not guaranteed bit-identical, because graphics cards differ.

**Rules that make it hold.**

- The simulation runs on the processor, in a background worker, on a single thread.
- The simulation is written in TypeScript and uses its own maths module for sine, cosine, exponentials, logarithms and powers, because the browser's versions can differ between browsers. Basic arithmetic and square root are safe. If the speed targets are missed, the core can move to WebAssembly behind the same interface.
- All randomness comes from one seeded generator fed by the seed gene. The browser's own random function is never used.
- Iteration order is fixed. Nothing depends on timing, frame rate or screen size.
- The graphics card is used for drawing only.

**Stack.** A static web app with no server and no accounts: TypeScript with Vite, Three.js for rendering, and Vitest for tests.

**Speed targets.** A wild-type organism reaches maturity in under 10 seconds on a mid-range laptop, with a progress indicator. Pigment edits redraw within one frame. Neighbour searches use a spatial grid. These are targets to tune, not measured figures.

## 9. Export

The required output is a PNG at print size, in the current view and look.

| Preset | Pixels at 300 dpi |
| --- | --- |
| A4 | 2,480 × 3,508 |
| A3 | 3,508 × 4,961 |
| A2 | 4,961 × 7,016 |
| Custom | Any width and height in pixels |

- Large sizes are rendered in tiles and stitched, so export is not limited by the graphics card's maximum image size.
- A transparent background is an option in every look.
- The genome code is written into the PNG's metadata and into the file name.
- A methods file can be saved with the image: the code, species, encoding version and every decoded parameter value.
- The code itself can be copied as text or as a link.

**Export dialog.** One dialog, read top to bottom, with a live preview on one side.

1. **Size.** A4, A3, A2 or custom. Show both the pixel size and the printed size at 300 dpi.
2. **Orientation.** Portrait, landscape or square.
3. **Framing.** The organism as currently framed on the stage, or fitted to the page with a margin.
4. **Background.** The look's own background, or transparent.
5. **Caption.** Off by default. When on, the specimen name and code are set along the bottom edge, plate style.
6. **Methods file.** A tick box to save the parameter file alongside the image.
7. **File name.** Filled in from the specimen name and the start of the code; editable.

One Export button starts the render. A progress bar shows while tiles are rendered, and the dialog can be cancelled at any point.

## 10. Scientific grounding

The tool is accurate at the level of its growth models and openly a designed abstraction at the level of its genome. It must say so itself, on a Methods page inside the app.

| Part | Status | Basis |
| --- | --- | --- |
| Branching growth | Published model, implemented as written | Runions, Lane and Prusinkiewicz 2007; Runions et al. 2005 |
| Branch thickness | Published rule | Pipe model, as used in the 2007 paper, exponent usually between 2 and 3 |
| Ruffling from marginal growth | Published mechanism, approximate simulation | Nath et al. 2003; Sharon and Efrati 2010 |
| Helix geometry and base pairing | Textbook structure of B-form DNA | Standard molecular biology |
| Genome to parameter mapping | Designed abstraction | Real genes do not encode model parameters directly. The code is an addressing scheme, not a model of gene expression. |
| Genes marked "designed" in the gene tables | Designed extension | Added for visual range; labelled as such in the app |

The Methods page lists each model, its equations, every gene with its range and scale, the references above, and the limits stated here. It also shows the geometry hash of the current organism, so the same code can be compared across browsers and machines.

## 11. Not in v1

Do not build these. Keep the listed hooks so they can be added later.

| Later feature | Hook to keep in v1 |
| --- | --- |
| Time slider and age-mapped growth | Growth runs step by step. |
| Animated growth | Arrives with the time slider. v1 shows only the draft and the finished organism. |
| Breeding: mutation, crossover, selection | Every code is viable and genes sit at fixed loci. |
| Controllable environment | The environment is a set of named constants in one place. |
| More species | The 3-base species field allows 64. |
| Closed, looping venation | Needs its own gene. |
| Vector export and colour separations | Geometry and pigment data stay available in memory. |
| 3D model export | Same geometry, written as a mesh file. |
| Keyboard shortcuts | Every action is a named command. |
| Phone and tablet layouts | The linear gene map. |

Also out: image upload, typography, accounts, galleries and any server.

## 12. Acceptance tests

The build is done when all of these pass.

- [ ] The same code gives the same geometry hash in three browsers on two different machines.
- [ ] 10,000 random genomes per species all grow to maturity with no failure and no invalid numbers.
- [ ] Moving any slider and reading back its bases, then typing those bases, returns the same slider value.
- [ ] A pasted code and a shared link both reproduce the organism they came from.
- [ ] A code with one mistyped letter loads with a typo warning.
- [ ] Randomise-all changes every unlocked gene and no locked gene.
- [ ] Changing a pigment gene does not regrow the organism.
- [ ] Species A with uniform points, no tropism and default distances matches the character of the paper's figures, and measured branch radii satisfy the pipe formula.
- [ ] Species B with margin bias at its minimum stays flat, and ruffles more as margin bias rises.
- [ ] The helix is right-handed and every rung is a correct base pair.
- [ ] An A2 PNG at 300 dpi exports with a transparent background and carries its code in the metadata.
- [ ] The Methods page states which parts are published models and which are designed.

Left to the implementer: the random number generator, the mesh data structure, the shading technique for the monochrome plate, the syllable tables, the wild-type genomes, and final tuning of gene ranges so the whole range of every gene is stable and visibly different.

## 13. Clarifications

Agreed with the owner on 4 October 2026. These resolve gaps and contradictions in the sections above. They do not change any decision in section 1 or any row of the gene tables.

1. **Species B maturity (section 4).** Growth stops when the total rest area of the sheet reaches a fixed multiple of its starting area. The multiple is a constant of the encoding version. Cell size (locus 15) stays "% of final size", where final size is the size at that area. 40,000 vertices is a hard cap, so the vertex count at maturity varies with cell size.
2. **Tuning ranges and constants (section 12, last line).** If tuning needs a gene range or a growth constant to change, work stops and the exact edit to this spec is proposed. Once approved, this spec and the gene tables change together, and recorded geometry hashes are re-recorded.
3. **Draft (section 6).** The draft is a low-resolution run of the same code with the same algorithm. For species A it uses fewer attraction points, drawn from the same seed, and a longer segment length. For species B it uses larger cells. It shares the organism's character and outline but not its fine detail, and is labelled as a draft.
4. **Clear stem (section 3, locus 9).** Until the organism first branches, whenever no attraction point is within the radius of influence of any node, the newest node of each stem grows one D straight up, plus tropism, until points come into range. Once the organism has branched, growth ends as in the paper when no point is within range. If a stem climbs past every point, growth ends. This is common practice in implementations rather than a step of the paper, and the Methods page says so.
5. **Kill distance (section 3, locus 5).** The decoded kill distance is the smallest of the gene's value, 0.8 × the decoded sensing range in D, and a quarter of the envelope's largest radius, so that a stem cannot clear every point on its way up. The inspector shows the clamped value with a note saying which limit applies.
6. **Whole-number and multiple-choice genes (section 2).** Every slider runs over the raw gene value 0 to 4,095, so sliders and bases are one-to-one. The displayed setting steps between bins. The exact number field takes the model value and writes the centre of its bin.
7. **Species B margin (section 4).** Distance from the margin is measured once on the starting shape and carried by every vertex through splits. Ring: both edges are margins. Tube: both open ends. Closed sphere: the growth patches, as section 4 says. "% of radius" means percent of the starting radius.
8. **Flat test (section 12).** Run with the disc body plan, the wild type, and anisotropy, patch contrast and lift at their neutral values. With margin bias at its minimum, the out-of-plane deviation stays within the starting roughness. As margin bias rises, the deviation rises.
9. **Header (section 2).** Species A is AAA, species B is AAC, and encoding version 1 is AAA. A code with an unknown species or version is rejected with a clear message, and the current organism stays.
10. **Helix editing (section 5).** Header and checksum bases are shown but cannot be edited on the helix. Species changes only through the switch button.
11. **Wrong checksum (section 2).** A pasted code with a wrong checksum loads with a typo warning, and the code bar shows the corrected checksum at once. The warning stays until the next edit.
12. **Export file name (section 9).** The file name is the specimen name plus the start of the code. The full code is in the PNG metadata and the methods file.
13. **Square orientation (section 9).** The side of a square export is the short edge of the chosen size, for example A4 square is 2,480 × 2,480.
14. **Species B drawn thickness (section 4, locus 3).** The drawn thickness is the smaller of the thickness and the personal space, so the drawn sheet does not visibly pass through itself. Stretch and bending stiffness use the full thickness gene. The inspector shows the clamp.
15. **Species A stopping (section 3).** A node whose growth direction sums to zero does not grow that step. Growth also stops after a fixed number of steps, a constant of the encoding version. Both are stated on the Methods page as additions to the paper's procedure.
16. **Sensing range (section 3, locus 4).** Added on 4 October 2026 at the owner's request. The radius of influence is set in mean spacings between attraction points, where the mean spacing is the cube root of the envelope volume divided by the number of points. In D it is the gene's value times that spacing. With a radius fixed at 4 D to 64 D, about four in ten random genomes grew as a bare, unbranched stem, because the sparsest envelopes put points further apart than the largest radius. The inspector shows the value both in spacings and in D.
