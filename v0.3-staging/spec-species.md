## 4c. Species E: coral (v0.3)

Stony corals and many sponges grow by accretion: living tissue on the surface lays down a new layer of skeleton on top of the old one. Where a layer is thicker depends on how much nutrient the polyps there absorb, so the shape follows the nutrient field around the colony, and the field in turn depends on the shape. Branches arise because tips reach further into the nutrient and shade the hollows between them. Kaandorp, J. A. (1994), Fractal Modelling: Growth and Form in Biology, Springer; Kaandorp, J. A. and Sloot, P. M. A. (2001), "Morphological models of radiate accretive growth and the influence of hydrodynamics", Journal of Theoretical Biology 209:257–274; Merks, R. M. H., Hoekstra, A. G., Kaandorp, J. A. and Sloot, P. M. A. (2003), "Models of coral growth: spontaneous branching, compactification and the Laplacian growth assumption", Journal of Theoretical Biology 224:153–166, https://doi.org/10.1016/S0022-5193(03)00140-1; Kaandorp, J. A. et al. (2005), "Morphogenesis of the branching reef coral Madracis mirabilis", Proceedings of the Royal Society B 272:127–133, https://pmc.ncbi.nlm.nih.gov/articles/PMC1634949.

Implement the accretive growth model:

- The colony is a closed triangle mesh, starting from a small form on the floor of the growth space (locus 1). Each vertex stands for a polyp.
- The nutrient diffuses through a fixed cubic lattice from a source plane at the top of the growth space. The colony's surface and the floor both absorb it, as in Kaandorp et al. (2005), figure 1c, where the floor stands for competing encrusting organisms. Flow is zero: the diffusion-limited regime of that paper.
- Each growth step: the field is advanced by an amount of diffusion set by the growth-to-transport ratio (locus 2); each polyp's uptake c is read at the polyp height (locus 6) above its vertex and normalised by the largest uptake; each vertex moves along its averaged normal by l = s · c · k(h) (Kaandorp et al. 2005, eq. 2.3, with Kaandorp and Sloot's curvature factor k(h)), where s is the layer thickness (locus 4). A polyp whose normalised uptake is below the growth threshold (locus 7) lays down nothing.
- Edges longer than the polyp spacing (locus 3) are split; polyps closer than half of it are merged, so polyps stay closely packed.
- The curvature rule (locus 5) blends k(h) from 1 everywhere (Merks et al.: branching arises without it) to Kaandorp and Sloot's rule.
- Corallites, the cups each polyp sits in, are drawn as relief on the surface at each vertex. They do not affect growth.

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Starting form | Starting object on the floor: knob, ridge, ring, or encrusting disc | 4 choices | Designed (Kaandorp et al. 2005 start from a small sphere; the starting object is an input) |
| 2 | Growth to transport | Ratio of the growth rate to the rate of nutrient transport | 0.02 to 2, log | Merks et al. 2003 |
| 3 | Polyp spacing | Edge length at which a polyp divides | 0.5% to 3% of the growth space height, log | Kaandorp et al. 2005 |
| 4 | Layer thickness | s, the largest thickness of one growth layer | 0.1 to 1 polyp spacing | Kaandorp et al. 2005, eq. 2.3 |
| 5 | Curvature rule | Strength of the curvature factor k(h): 0 is off, as in Merks et al.; 1 is Kaandorp and Sloot's rule | 0 to 1 | Kaandorp and Sloot 2001; Merks et al. 2003 |
| 6 | Polyp height | Distance above the surface at which nutrient is absorbed | 0 to 2 polyp spacings | Kaandorp et al. 2005 |
| 7 | Growth threshold | Normalised uptake below which a polyp lays down no new layer | 0 to 0.3 | Designed extension |
| 8 | Uptake response | γ in l ∝ c^γ; 1 is the published linear rule | 0.5 to 2, log | Designed extension |
| 9 | Starting size | Size of the starting object | 2% to 10% of the growth space height, log | Designed |
| 10 | Surface smoothing | Relaxation of vertex positions after each step | 0 to 1 | Model (numerical) |
| 11 | Growth irregularity | Random variation in layer thickness from polyp to polyp | 0 to 30% | Designed extension |
| 12 | Corallite size | Diameter of each polyp's cup | 20% to 100% of the polyp spacing | Designed |
| 13 | Corallite depth | Depth of each cup | 0 to 50% of its diameter | Designed |
| 14 | Septa | Radial ridges in each cup: 0, 6, 12 or 24 | 4 choices | Designed |
| 15 | Corallite rim | Height of the raised rim around each cup | 0 to 50% of its diameter | Designed |
| 16 to 23 | Pigment and surface | Same eight genes as species A, loci 16 to 23 | As species A | Appearance |
| 24 | Seed | Random seed for growth irregularity and the starting mesh | 16.7 million values | Encoding |

For locus 20, the gradient driver choices are: growth layer (the step a surface was laid down), nutrient uptake, curvature, or height.

**Fixed environment.** The growth space, the source plane at its top, the absorbing floor, the lattice size and the diffusion constant are named constants of the encoding version, in one place (section 11). Whether the floor absorbs is not a gene, because the environment is constant (section 1, clarification 31).

**Maturity.** Growth stops when the colony's top reaches a fixed fraction of the height of the source plane, or after a fixed number of growth steps, whichever comes first; both are constants of the encoding version. A hard cap of 120,000 vertices applies, to be tuned for speed.

**Touching branches.** Branches that grow into each other may pass through each other in the mesh; the nutrient lattice treats both as solid. No triangle may have zero area.

**Accuracy limits.** The model is abiotic: it shows how much of a coral's form follows from nutrient diffusion and accretion alone, not the biology of polyps, symbionts or water flow. With the floor fixed as absorbing, the colonies are those of Kaandorp et al.'s figure 1c; the hemispherical forms of an inert floor (their figure 1d) are not reached. Corallites are drawn, not grown. It must not be presented as a model of any one coral species.

## 4d. Species F: fungal fruit body (v0.3)

A mushroom, a cup fungus or a puffball is built from hyphae: thread-like cells that grow only at their tips and branch. Meškauskas, McNulty and Moore showed that the shapes of fruit bodies can be grown by giving every hyphal tip the same simple rules, sensing the hyphae around it and a vertical orientation, and changing those rules over time in the same way for all tips; no tip needs to know where it is in the structure. Meškauskas, A., McNulty, L. J. and Moore, D. (2004), "Concerted regulation of all hyphal tips generates fungal fruit body structures: experiments with computer visualizations produced by a new mathematical model of hyphal growth", Mycological Research 108:341–353, https://doi.org/10.1017/S0953756204009670; Meškauskas, A., Fricker, M. D. and Moore, D. (2004), "Simulating colonial growth of fungi with the Neighbour-Sensing model of hyphal growth", Mycological Research 108:1241–1256, https://doi.org/10.1017/S0953756204001261.

Implement the Neighbour-Sensing model:

- The mycelium is a tree of hyphal sections, each a polyline from a branch point to a tip or to the next branch point. Growth starts from one tip at the base.
- Every hypha generates a density field that falls with the square of distance (eq. 3) and a long-range field that rises with the square root of distance (eq. 6). A section does not sense its own field (eq. 4).
- Each time step, every growing tip turns toward its cumulative tropism vector (eq. 11): away from the density field (negative autotropism, locus 3), toward the long-range field (positive autotropism, locus 8), toward the orientation angle set by the vertical orientation field (gravitropism, eq. 12), and along neighbouring hyphae (parallel tropism, locus 12). The new direction is k · old + (1 − k) · tropism, normalised (eq. 13), with persistence k (locus 5). The tip then advances one unit.
- A tip branches when the density field at the tip is below the branching threshold (locus 2), with the branching probability (locus 4). One branch keeps the parent's direction; the other leaves within the maximum branch angle (locus 14), turned toward the tropism vector.
- **The programme.** As in the paper's figures 5 to 7, the rules change over time for all tips at once, in phases. Locus 1 picks the programme: colony (no phases, a ball of mycelium); cup (flat colony, then the orientation angle turns to the cup angle, locus 7); closed (cup, then the long-range pull closes it, figure 6); flask (closed, then the pull is released and growth turns upward, a narrow neck, figure 7C); mushroom (flask, then a stem phase, locus 9, then the orientation angle turns toward the cap angle, locus 10, over the cap turn length, locus 11, so tips cascade down outside the stem, figures 5C and 7D–E). The phase lengths are constants of the encoding version except the stem phase.

| Locus | Gene | Model parameter | Range | Basis |
| --- | --- | --- | --- | --- |
| 1 | Fruit body | Programme: colony, cup, closed, flask, or mushroom | 5 choices | Meškauskas et al. 2004, figures 5 to 7 (the sequence of settings is an input) |
| 2 | Branching threshold | Density field below which a tip may branch | 0.005 to 0.5, log | Meškauskas et al. 2004, figures 3 and 4 |
| 3 | Self-avoidance | Impact of negative autotropism | 0 to 0.5 | Meškauskas et al. 2004, eq. 3 and figure 1 |
| 4 | Branching probability | Chance per step that an eligible tip branches | 1% to 100%, log | Meškauskas et al. 2004 |
| 5 | Persistence | k, how much a tip keeps its previous direction | 0 to 0.9 | Meškauskas et al. 2004, eq. 13 |
| 6 | Orientation strength | Ig, impact of the vertical orientation field | 0 to 1 | Meškauskas et al. 2004, eq. 12 |
| 7 | Cup angle | Orientation angle in the cup phase, from vertical | 0° to 90° | Meškauskas et al. 2004, figure 5A |
| 8 | Closing pull | Im, impact of long-range positive autotropism | 0 to 1 | Meškauskas et al. 2004, eqs. 6 and 7, figure 6 |
| 9 | Stem length | Length of the stem phase | 0 to 300 time units | Meškauskas et al. 2004, figure 7 (phase lengths are an input) |
| 10 | Cap angle | Final orientation angle in the cap phase | 90° to 180° | Meškauskas et al. 2004, figure 5C |
| 11 | Cap turn length | Hyphal length over which the angle turns to the cap angle | 50 to 500 units, log | Meškauskas et al. 2004, figure 5C |
| 12 | Parallel tropism | Ic, impact of growth along neighbouring hyphae | 0 to 0.5 | Meškauskas et al. 2004, eq. 9 and figure 8 |
| 13 | Spiral twist | Rotation of the orientation vector about the hyphal axis | 0° to 90° | Meškauskas et al. 2004 (vector rotation) |
| 14 | Branch angle | Largest angle between a new branch and its parent | 15° to 180° | Meškauskas et al. 2004 |
| 15 | Hypha thickness | Drawn radius of each hypha | 0.1 to 1 unit, log | Designed |
| 16 to 23 | Pigment and surface | Same eight genes as species A, loci 16 to 23 | As species A | Appearance |
| 24 | Seed | Random seed for branching decisions and branch directions | 16.7 million values | Encoding |

For locus 20, the gradient driver choices are: hyphal age (the step a segment was laid down), tips supported (the paper's colouring), phase of the programme, or height.

**Fixed environment.** The vertical orientation field (the paper's gravitropism, which could equally be light or a chemical gradient) points up and is a named constant. No substrates.

**Maturity.** Growth stops when the programme ends, a fixed number of time units after the last phase starts, or when the tip or segment cap is reached; all are constants of the encoding version. Hard caps of 4,000 growing tips, 80,000 segments and 200,000 vertices apply, to be tuned for speed.

**Accuracy limits.** The model is the paper's abstraction: the fields stand for signals of similar physical form, not for a named chemical, and the programme's phases are set by hand in the paper, as here. It shows that one set of rules for all tips can make these shapes, not how any real fungus does it. Gills and spores are not modelled.
