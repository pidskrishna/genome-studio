# Genome-driven growth studio: v0.2 specification

The tool grows procedural 3D organisms from a 160-letter ATGC code, edited on a 3D double helix, and exports them as print-size artwork. It serves two readers at once: a graphic designer who needs usable layers, and a biologist who needs the models to be real.

The flow is four steps: edit genes on the helix, a published growth model runs from them, the organism renders in one of three looks, and a PNG is exported. The same code always grows the same organism, on any machine.

Each species has its own genome. The tool has no name yet.

**Versions.**

| Version | Status | Species | Scope |
| --- | --- | --- | --- |
| v0.1 | Closed 19 October 2026 (PLAN.md milestones 0 to 13) | A: branching and venation; B: differential growth | Everything in sections 1 to 13 except sections 4a and 4b and the clarifications from 17 on |
| v0.2 | Started 19 October 2026 | Adds C: phyllotaxis (section 4a); D: seashell (section 4b) | The two new species through the whole tool: editor, stage, looks, draft, tray, export and Methods page |

v0.2 must not change species A or B: their gene tables stay as they are, and every code that grew in v0.1 grows the same geometry, with the same hash. Earlier copies of this spec called v0.1 "v1".

## 1. Decisions

These are fixed. Do not change them.

| Topic | Decision |
| --- | --- |
| Input | Nothing is uploaded. Every artwork is generated from a genome. |
| Typography | Out. The tool makes organisms only. |
| Species | v0.1: branching and venation; differential growth. v0.2 adds phyllotaxis and seashell. |
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
- **Maturity.** Growth stops at a fixed point per species (sections 3, 4, 4a and 4b). It is a constant of the encoding version, not a gene.

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

The paper covers open branching only. Closed, looping venation is not in v0.1 or v0.2 (section 11).

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

**Naming rule for every species.** Gene names describe the model parameter. Never borrow the name of a real gene.

## 4a. Species C: phyllotaxis (v0.2)

The arrangement of leaves, scales and florets around a growing tip. New organs (primordia) appear one at a time at the edge of the tip's central zone, where inhibition from the organs already there is weakest, and the tip's growth carries older organs outward. Hofmeister (1868) stated the first form of the rule, and Snow and Snow (1952) the form used here: a new organ forms when and where there is enough room. Douady and Couder showed that this alone produces the golden angle and Fibonacci spirals and, as its parameters change, alternate, opposite (decussate) and whorled arrangements: Douady, S. and Couder, Y. (1996), "Phyllotaxis as a dynamical self organizing process", parts I to III, Journal of Theoretical Biology 178:255–312. Placing organs on a receptacle and giving them shape follows Prusinkiewicz and Lindenmayer (1990), The Algorithmic Beauty of Plants, chapter 4, http://algorithmicbotany.org/papers/abop/abop.pdf. Vogel (1979), "A better way to construct the sunflower head", Mathematical Biosciences 44:179–189, is the reference for the golden-angle pattern.

Implement the threshold model of Douady and Couder (part II):

- The tip is modelled in a plane around its centre, as a projection of a cone. The central zone is a circle of radius R0.
- Every organ drifts outward with the tip's growth, at a speed proportional to its distance from the centre (part I), so that distance grows exponentially with time.
- Distances between two points use the paper's cone distance (part II, eq. 6): d² = (r0 − r1)² / N + 2N r0 r1 (1 − cos(θ0 − θ1)), where the conicity 1/N is set by the body plan: head 1, dome 2, cone 3, column 6. A conicity of 1 is the flat plane. Conicity changes which arrangements win: opposite pairs at right angles (decussate) are stable over a wide range only on the more conical receptacles.
- Each organ inhibits new organs near it. The inhibition from one organ falls with distance d as (d0 / d)^η, where d0 is the size a new organ needs, and the total inhibition at a point is the sum over all organs. d0 = Γ √N R0, where Γ (locus 2) is the width of a new organ relative to the central zone (part II, eq. 7).
- Time advances in small fixed steps. When the lowest total inhibition on the edge of the central zone falls below 1, a new organ appears at that point, and the inhibition is evaluated again at once. Several organs can so appear at almost the same moment; that is how whorls form (part II, section 3.2).
- At the start, the starting organs (locus 5) sit evenly spaced just outside the central zone.
- **Growth over time (part III, eq. 1).** Γ falls over the organism's life, as the apex grows from a seedling's: Γ(t) = (Γi + Γf) / 2 − (Γi − Γf) / 2 · tanh((t − t1) / τ), with t in units of R0 / V0, t1 = 6 and τ = 3. Γf is the gene's value (locus 2). With one starting organ Γi = 2.4, as in a seedling; with k ≥ 2 starting organs Γi = 1.8 sin(π / k), so the starting symmetry can carry on as pairs or whorls (a designed choice, after part III's initial conditions). Γi is never below Γf. The oldest organs, at the rim of a head or the base of a shoot, keep the seedling's arrangement.
- Because every rate in the model is the drift, the arrangement depends only on Γ(t), η and the conicity, not on the drift speed.

Then each organ is placed on the receptacle and given a shape:

- **Receptacle.** The plane maps onto the receptacle surface: angle around the centre is kept, and distance from the centre becomes distance from the apex along the surface, in the same order. For the column the map is logarithmic, which turns the plane's logarithmic spirals into the straight helices of a stem or cactus.
- **Organs.** Each organ is a thin, shaped sheet attached to the receptacle at its position, facing outward. Its size follows its distance from the centre up to the maturation distance (locus 12), then stays at full size. Length is measured in spacings between neighbouring organs at its position, so organs can touch or overlap, like the scales of a pine cone.

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Body plan | Receptacle: head (a disc), dome, cone, or column | 4 choices | Prusinkiewicz and Lindenmayer 1990 (receptacle is an input) |
| 2 | Inhibition range | Γ = d0 / (√N R0): the width of a new organ relative to the central zone | 0.1 to 2, log | Douady and Couder 1996 |
| 3 | Organ form | Organ shape: floret, scale, leaf, or spine | 4 choices | Prusinkiewicz and Lindenmayer 1990 (organ shape is an input) |
| 4 | Inhibition falloff | η, how sharply inhibition falls with distance | 3 to 17 | Douady and Couder 1996 |
| 5 | Starting organs | Organs present at the start | 1 to 4 | Douady and Couder 1996 (initial conditions) |
| 6 | Receptacle aspect | Height to radius; for the head, how domed the disc is | 0.1 to 4, log | Prusinkiewicz and Lindenmayer 1990 (receptacle is an input) |
| 7 | Organ length | Length in spacings between neighbouring organs | 0.5 to 4, log | Prusinkiewicz and Lindenmayer 1990 |
| 8 | Organ width | Width to length | 0.1 to 1 | Designed |
| 9 | Organ angle | Angle between organ and receptacle surface | 0° to 90° | Prusinkiewicz and Lindenmayer 1990 |
| 10 | Organ curl | Bend along the organ's length | −90° to +90° | Designed |
| 11 | Organ cupping | Curve across the organ's width, from flat to a half tube | 0 to 1 | Designed |
| 12 | Maturation | Distance from the centre at which an organ reaches full size | 5% to 100% of the final radius | Prusinkiewicz and Lindenmayer 1990 |
| 13 | Organ thickness | Drawn thickness of each organ | 2% to 30% of organ length, log | Designed |
| 14 | Size variation | Random variation in each organ's size and angle | 0 to 30% | Designed extension |
| 15 | Initiation noise | Random jitter in the angle at which each organ appears | 0° to 5° | Designed extension |
| 16 to 23 | Pigment and surface | Same eight genes as species A, loci 16 to 23 | As species A | Appearance |
| 24 | Seed | Random seed for size variation and initiation noise | 16.7 million values | Encoding |

For locus 20, the gradient driver choices are: order of appearance, distance from the apex, position along the organ (base to tip), or height.

**Maturity.** Growth runs for a fixed time, t = 20 in units of R0 / V0, a constant of the encoding version; by then the first organ has drifted e^20 central-zone radii out. The number of organs is not a gene: it follows from the inhibition genes, from a handful in an alternate arrangement to hundreds in a sunflower head. Hard caps of 2,000 organs and 120,000 vertices apply, to be tuned for speed; organs get fewer vertices before the organ cap is reached.

**Accuracy limits.** The model says where organs appear, from inhibition and growth alone, and reproduces the observed arrangements and the transitions between them. It does not model the chemistry behind the inhibition. Receptacle shapes, organ shapes and organ growth are designed geometry, not a model of how organs develop.

## 4b. Species D: seashell (v0.2)

A mollusc shell grows only at its opening, adding material along the edge of the aperture, so the shell is the trace the aperture leaves as it grows and turns. Raup showed that most coiled shells follow from a few numbers: an aperture outline, the generating curve, that grows geometrically while it coils around a fixed axis. Raup, D. M. and Michelson, A. (1965), "Theoretical morphology of the coiled shell", Science 147:1294–1295; Raup, D. M. (1966), "Geometric analysis of shell coiling: general problems", Journal of Paleontology 40:1178–1190. Fowler, Meinhardt and Prusinkiewicz (1992), "Modeling seashells", Computer Graphics 26(2):379–387 (SIGGRAPH '92), build the shell surface from that sweep and add pigment patterns from Meinhardt and Klingler (1987), "A model for pattern formation on the shells of molluscs", Journal of Theoretical Biology 126:63–89.

Implement Raup's model as a sweep:

- The generating curve is an ellipse with height to width ratio S, in a plane through the coiling axis, tilted by the aperture tilt (locus 5).
- For every turn of growth, every length in the curve and its distance from the axis multiply by W, the whorl expansion rate. Between whole turns the scaling is geometric, W^(θ / 2π) for an angle θ.
- D sets the distance from the axis: the ratio of the curve's inner edge distance to its outer edge distance from the axis.
- T sets the translation along the axis: the curve's centre moves along the axis by T times its distance from the axis.
- Growth runs in fixed angular steps. Each step adds one ring of vertices around the curve, joined to the last ring by triangles. The first ring is closed with a small cap, the embryonic shell.
- Ornament displaces the surface along its normal, by an amount proportional to the curve's current size (Fowler et al., section 2.5): ribs are bulges repeated along the growth direction, cords are bulges repeated around the curve, and nodules are extra height where the two cross.
- The aperture flare widens the curve over the last part of the final whorl.
- The edge pattern (gradient driver choice 4) is Meinhardt's activator–substrate model (Fowler et al., eq. 8), with the constants of their figure 11, which give stable stripes along the growth direction: ρ = 0.01 ± 2.5% (the random variation per cell comes from the seed), κ = 0, ρ0 = 0.001, μ = 0.01, Da = 0.002, σ = 0.015, ν = 0, Ds = 0.4. It runs on cells evenly spaced along the generating curve by the forward Euler method, a fixed number of steps per growth step, so each ring records the pattern at the moment it was laid down. These are constants of the encoding version. Pattern genes, and the activator–inhibitor model with a global hormone that gives travelling waves (Fowler et al., eq. 9), are not in v0.2 (section 11).

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Whorl expansion | W, growth of the curve per turn | 1.3 to 1,000, log | Raup 1966 |
| 2 | Translation | T, movement along the axis per unit distance from it | 0 to 8 | Raup 1966 |
| 3 | Distance from axis | D, inner to outer edge distance of the curve from the axis | 0 to 0.9 | Raup 1966 |
| 4 | Aperture shape | S, height to width of the generating curve | 0.25 to 4, log | Raup 1966 |
| 5 | Aperture tilt | Angle of the generating curve's plane to the axis | −60° to +60° | Fowler et al. 1992 |
| 6 | Handedness | Coiling direction: right (dextral) or left (sinistral) | 2 choices | Raup 1966 |
| 7 | Rib count | Ribs per turn | 0 to 40 | Fowler et al. 1992 |
| 8 | Rib height | Height of each rib | 0 to 40% of the curve's radius | Fowler et al. 1992 |
| 9 | Rib width | Width of each rib | 5% to 50% of the rib spacing | Designed extension |
| 10 | Cord count | Cords around the curve | 0 to 32 | Fowler et al. 1992 |
| 11 | Cord height | Height of each cord | 0 to 20% of the curve's radius | Fowler et al. 1992 |
| 12 | Nodules | Extra height where ribs and cords cross | 0 to 1 | Designed extension |
| 13 | Aperture flare | How far the lip widens over the last part of the final whorl | 0 to 1 | Designed extension |
| 14 | Wall thickness | Drawn thickness of the shell wall | 1% to 20% of the curve's radius, log | Designed |
| 15 | Growth irregularity | Random variation in growth from step to step, leaving growth lines | 0 to 1 | Designed extension |
| 16 to 23 | Pigment and surface | Same eight genes as species A, loci 16 to 23 | As species A | Appearance |
| 24 | Seed | Random seed for growth irregularity and the edge pattern's starting noise | 16.7 million values | Encoding |

For locus 20, the gradient driver choices are: growth lines (the step a ring was laid down), position around the curve, ornament relief, or edge pattern.

**Maturity.** Growth stops when the generating curve reaches a fixed multiple of its starting size, or after a fixed number of whorls, whichever comes first; both are constants of the encoding version. The number of whorls is not a gene: a low expansion rate gives a tall spire of many whorls, a high one a single wide whorl, as in an abalone. A hard cap of 120,000 vertices applies, to be tuned for speed.

**Overlapping whorls.** When the distance from the axis is small, each whorl wraps the one before, as in real shells, and the surface passes through itself where they meet. This is expected; species B's rule against passing through itself does not apply.

**Accuracy limits.** Raup's model describes the geometry of coiling, not the biology of the mantle that builds it. Ribs and cords follow Fowler et al.; rib width, nodules, the aperture flare and growth irregularity are designed. The edge pattern uses one fixed set of the published model's constants, so it shows the mechanism, not the range of patterns real shells have.

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
| Organ arrangement (v0.2) | Published model, implemented as written | Douady and Couder 1996; Snow and Snow's rule |
| Receptacles and organ shapes (v0.2) | Designed geometry, after a published method | Prusinkiewicz and Lindenmayer 1990, chapter 4 |
| Shell coiling (v0.2) | Published geometric model, implemented as written | Raup and Michelson 1965; Raup 1966; Fowler, Meinhardt and Prusinkiewicz 1992 |
| Shell edge pattern (v0.2) | Published mechanism, fixed constants | Meinhardt and Klingler 1987; Fowler, Meinhardt and Prusinkiewicz 1992 |
| Shell ribs and cords (v0.2) | Published method | Fowler, Meinhardt and Prusinkiewicz 1992 |
| Shell rib width, nodules, flare and growth irregularity (v0.2) | Designed extension | Added for visual range |
| Helix geometry and base pairing | Textbook structure of B-form DNA | Standard molecular biology |
| Genome to parameter mapping | Designed abstraction | Real genes do not encode model parameters directly. The code is an addressing scheme, not a model of gene expression. |
| Genes marked "designed" in the gene tables | Designed extension | Added for visual range; labelled as such in the app |

The Methods page lists each model, its equations, every gene with its range and scale, the references above, and the limits stated here. It also shows the geometry hash of the current organism, so the same code can be compared across browsers and machines.

## 11. Not in v0.2

Do not build these. Keep the listed hooks so they can be added later.

| Later feature | Hook to keep |
| --- | --- |
| Time slider and age-mapped growth | Growth runs step by step. |
| Animated growth | Arrives with the time slider. Until then the tool shows only the draft and the finished organism. |
| Breeding: mutation, crossover, selection | Every code is viable and genes sit at fixed loci. |
| Controllable environment | The environment is a set of named constants in one place. |
| More species | The 3-base species field allows 64; A to D use four. Two candidates are noted below. |
| Shell pattern genes and travelling-wave patterns (species D) | The edge pattern's constants sit in one place. As genes they would be form genes, because the pattern is computed in the simulation. Travelling waves need Fowler et al.'s eq. 9, with a global hormone. |
| Vector export and colour separations | Geometry and pigment data stay available in memory. |
| 3D model export | Same geometry, written as a mesh file. |
| Keyboard shortcuts | Every action is a named command. |
| Phone and tablet layouts | The linear gene map. |

**Candidate species, noted on 19 October 2026 for a later version.** Neither is designed yet; each needs its own section, gene table and milestones when chosen.

| Candidate | Published basis | Form | Notes |
| --- | --- | --- | --- |
| Coral and sponge | Kaandorp (1994), accretive growth, in "Fractal Modelling: Growth and Form in Biology" (Springer); Witten and Sander (1981), diffusion-limited aggregation, Physical Review Letters 47:1400 | Branching, plate-like and encrusting colonies | Accretive growth makes a surface that could use the species B and C sheet renderer; aggregation makes branches that could use species A's tubes. |
| Closed, looping venation | Runions et al. (2005), the closed variant of their venation model, the open variant of which species A uses | Leaf veins and networks with loops | Could be a new species, or species A's model with one added gene. Adding a gene to species A needs a new encoding version so v0.1 codes keep growing the same. |

Also out: image upload, typography, accounts, galleries and any server.

## 12. Acceptance tests

The build is done when all of these pass. Evidence for each is in ACCEPTANCE.md.

**v0.1.** Closed by the owner on 19 October 2026 with the first two items open.

- [ ] The same code gives the same geometry hash in three browsers on two different machines.
- [ ] 10,000 random genomes per species all grow to maturity with no failure and no invalid numbers.
- [x] Moving any slider and reading back its bases, then typing those bases, returns the same slider value.
- [x] A pasted code and a shared link both reproduce the organism they came from.
- [x] A code with one mistyped letter loads with a typo warning.
- [x] Randomise-all changes every unlocked gene and no locked gene.
- [x] Changing a pigment gene does not regrow the organism.
- [x] Species A with uniform points, no tropism and default distances matches the character of the paper's figures, and measured branch radii satisfy the pipe formula.
- [x] Species B with margin bias at its minimum stays flat, and ruffles more as margin bias rises.
- [x] The helix is right-handed and every rung is a correct base pair.
- [x] An A2 PNG at 300 dpi exports with a transparent background and carries its code in the metadata.
- [x] The Methods page states which parts are published models and which are designed.

**v0.2.**

- [ ] Every species A and B geometry hash recorded in v0.1 is unchanged.
- [ ] 10,000 random genomes each of species C and D all grow to maturity with no failure and no invalid numbers.
- [ ] The same species C and D code gives the same geometry hash in three browsers on two different machines.
- [ ] Species C in a spiral arrangement: the mean angle between successive organs is within 1° of the golden angle, 137.5°, and the spirals visible in the head come in consecutive Fibonacci numbers.
- [ ] Species C: raising the inhibition range moves the arrangement from spiral toward alternate (180° between successive organs), as Douady and Couder report; on the cone body plan with stiff falloff, two starting organs give opposite pairs at right angles over a range of the inhibition range.
- [ ] Species D with ornament off: the generating curve grows by W per turn, a translation of 0 gives a flat coil with every whorl in one plane, and the left-handed shell is the mirror image of the right-handed one.
- [ ] Changing a pigment gene of species C or D does not regrow the organism.
- [ ] Species C and D draw in all three looks and both views, and export as stitched tiles within the tile tolerance.
- [ ] The Methods page states which parts of species C and D are published models and which are designed.

Left to the implementer: the random number generator, the mesh data structure, the shading technique for the monochrome plate, the syllable tables, the wild-type genomes, the organ and receptacle shapes of species C, and final tuning of gene ranges so the whole range of every gene is stable and visibly different.

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

**v0.2 clarifications.** Agreed with the owner on 19 October 2026, when v0.2 started. They cover the two new species and change nothing for species A and B.

17. **Header (section 2).** Species C is AAG and species D is AAT, both with encoding version AAA. Species A and B keep their headers and their gene maps.
18. **Provisional tables (sections 4a and 4b).** The ranges in the species C and D gene tables are provisional until that species' simulation milestone. Each such milestone starts by checking every model statement in its section against the cited papers. Where a paper differs, or a range cannot be made stable, work stops and the exact edit to this spec is proposed, as in clarification 2. Once the milestone is done, the table is fixed like the others.
19. **Geometry (sections 4a and 4b).** Species C and D each produce one triangle mesh with a drawn thickness and four gradient-driver attributes per vertex, in the same form as species B, so the existing sheet drawing, looks and tiled export draw them. Species C's drawn thickness is the organ thickness gene; species D's is the wall thickness gene. Organs may overlap and whorls may pass through each other; no triangle may have zero area.
20. **Drafts (section 6).** Species C's draft uses the same organ positions with fewer vertices per organ. Species D's draft uses larger angular steps and fewer points around the generating curve. Both use the same seed and are labelled as drafts, as in clarification 3.
21. **Species switch (sections 5 and 6).** The switch offers all four species. Choosing one loads its wild type.
22. **Species C model check (section 4a).** Added on 19 October 2026 when milestone 15 checked section 4a against Douady and Couder (1996), parts I and II, and chapter 4 of The Algorithmic Beauty of Plants. Approved by the owner: organs appear one at a time at the lowest inhibition, re-evaluated at once, rather than at every local minimum; distances use the paper's cone distance with a conicity set by the body plan; locus 2 is the paper's Γ (eq. 7), range 0.1 to 2, so heads can reach sunflower-like spiral counts; locus 4 runs 3 to 17, the paper's range of stiffness; organ width and curl are marked designed; and the rule is credited to Snow and Snow as well as Hofmeister.
23. **Species C growth over time (section 4a).** Added on 19 October 2026, approved by the owner during milestone 15. With Γ constant from the starting organs, the model mostly settles into alternating or disordered arrangements; Douady and Couder reach spirals and pairs only through a realistic history of Γ (part III). Γ therefore falls by part III's eq. 1 from Γi (2.4, or 1.8 sin(π / k) for k ≥ 2 starting organs) to the gene's value, with t1 = 6 and τ = 3, and growth runs to t = 20 instead of stopping at an outer radius.
24. **Species D model check (section 4b).** Added on 19 October 2026 when milestone 16 checked section 4b against Fowler, Meinhardt and Prusinkiewicz (1992); Raup (1966) is not freely available, and his parameters were checked through that paper and secondary sources. Approved by the owner: the edge pattern is the activator–substrate model with Fowler et al.'s figure 11 constants, not the activator–inhibitor model; ornament displaces the surface along its normal in proportion to the curve's size; ribs and cords (loci 7, 8, 10 and 11) are credited to Fowler et al.; rib width and nodules stay designed.
