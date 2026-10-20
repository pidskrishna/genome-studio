# v0.3

Species E (coral, spec section 4c) and species F (fungal fruit body, spec section 4d), through the whole tool. v0.3 clarifications are 25 to 31. In every v0.3 milestone, species A to D must keep growing exactly as in v0.2: the full test suite passes and their recorded hashes are unchanged.

## Milestone 19: genome for species E and F (spec sections 2, 4c and 4d)

- [ ] Done

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

- [ ] Done

First: check every model statement in section 4c against Kaandorp and Sloot (2001), Merks et al. (2003) and Kaandorp et al. (2005), and against Kaandorp (1994) where available. Where they differ, stop and propose the spec edit (clarification 26).

Build: the starting forms, the nutrient lattice with its source plane and absorbing floor, the diffusion solver (clarification 29), rasterising the colony into the lattice, uptake at polyp height, the growth function with the curvature factor, growth threshold and uptake response, polyp division and merging, smoothing, irregularity, the stopping rules and vertex cap, corallite relief, and the four gradient-driver attributes per vertex. Output in the species B geometry form (clarification 27). No rendering.

Checks:
- 1,000 random genomes grow to maturity with no error and no NaN. There is no 10,000 run for species E (clarification 31).
- Same code, same geometry hash; wild-type hash recorded.
- With the curvature rule off, the wild type has more than one branch tip at maturity.
- Compactness rises as growth to transport falls, over at least four values across its range.
- Raising the polyp spacing lowers the number of branch tips and raises the mean distance between them.
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
