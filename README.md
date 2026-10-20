# Genome-driven growth studio

Grow 3D organisms from a 160-letter code, edit that code on a 3D double helix, and export the result as print-size artwork.

## What this project is for

**The aim: to let anyone grow scientifically grounded organic forms by editing one short code, and get a picture good enough to print.**

Every organism in the studio is grown by a published growth model from biology or theoretical morphology: how trees branch, how leaf edges ruffle, how florets pack into spirals, how seashells coil. Each model has around two dozen parameters. Instead of a wall of sliders, those parameters are written as a single 160-letter code in the letters A, C, G and T, and the code is shown and edited as a double helix.

The tool serves two people at once:

- **A graphic designer**, who wants striking, usable organic forms as clean layers for posters, books and other design work.
- **A biologist**, who wants those forms to come from real models, implemented as published, with every reference stated.

The same code always grows exactly the same organism, on any machine, so a code can be shared, pasted or sent as a link and it will reproduce the original organism.

## About the DNA helix: it is a control, not a biology lesson

**The DNA helix and the A, C, G, T code are not a biologically accurate model of how DNA works.** They are an interface: a familiar, intuitive way to see and control the parameters of a growth model.

- Each "gene" is simply 6 letters that store one number, the value of one model parameter (for example branch thickness or shell expansion rate). Real genes do not encode model parameters like this.
- Nothing in the tool models transcription, translation, proteins, gene regulation, mutation or inheritance. The code is an addressing scheme, not a model of gene expression.
- Gene names are invented and never named after real biological genes.
- What *is* textbook-accurate is the shape of the helix itself (right-handed B-form DNA, about 10.5 base pairs per turn, A paired with T and C with G), because it makes the editor read correctly.

In short, the growth models are real science; the genome is a designed control panel for them. The app says the same on its Methods page.

## The species

Each species is its own growth model with its own 24-gene genome (23 parameter genes and 1 seed gene).

| Species | Form | Based on |
| --- | --- | --- |
| A: branching and venation | Trees, shrubs, vein networks | Space colonisation: Runions, Lane and Prusinkiewicz (2007) |
| B: differential growth | Ruffled, buckled sheets, like lettuce or coral edges | Excess marginal growth: Nath et al. (2003); Sharon and Efrati (2010) |
| C: phyllotaxis | Sunflower heads, pine cones, cacti, leafy shoots | Douady and Couder (1996); Prusinkiewicz and Lindenmayer (1990) |
| D: seashell | Coiled shells with ribs, cords and pigment stripes | Raup (1966); Fowler, Meinhardt and Prusinkiewicz (1992) |
| E: coral (planned, v0.3) | Branching, plate-like and encrusting colonies | Accretive growth in a nutrient field: Kaandorp and Sloot (2001); Merks et al. (2003); Kaandorp et al. (2005) |
| F: fungal fruit body (planned, v0.3) | Cups, flasks and mushrooms grown from hyphae | The Neighbour-Sensing model: Meškauskas, McNulty and Moore (2004) |

## How it works

1. **Edit genes on the helix.** Rotate and scroll along it, click a gene to open its inspector, drag its slider or type its letters. Randomise everything, lock the genes you like, undo and redo.
2. **The growth model runs.** Form genes and the seed regrow the organism, in a background worker. Colour genes repaint it instantly without regrowing.
3. **Choose a look.** Monochrome plate (like an engraved scientific plate), fluorescence microscope, or glossy render, viewed flat from above or in free-orbit 3D.
4. **Export a PNG.** A4, A3, A2 or a custom size at 300 dpi, with an optional transparent background. The code is written into the file's metadata, and a methods file listing every parameter can be saved alongside it.

Each organism also gets a two-part Latin-style specimen name read from its code, so similar-looking organisms share a name.

## Running it on your own computer

The studio is a static website with no server, accounts or outside requests. You run it locally with a small development server.

### What you need

- [Node.js](https://nodejs.org/) version 22 or later (this includes `npm`)
- [Git](https://git-scm.com/)
- A desktop browser with WebGL 2, such as recent Chrome, Firefox, Safari or Edge. Phones and tablets are not supported.

### Set-up

1. Download the code:

   ```bash
   git clone https://github.com/pidskrishna/genome-studio.git
   ```

2. Go into the folder:

   ```bash
   cd genome-studio
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the address it prints in your browser, usually [http://localhost:5173](http://localhost:5173). The studio opens straight onto a wild-type organism. Stop the server with `Ctrl + C` in the terminal.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Checks types and makes a production build in `dist/` |
| `npx vite preview` | Serves the production build locally, to try it before hosting |
| `npm test` | Runs the test suite (about a minute) |
| `npm run typecheck` | Checks TypeScript types only |
| `npm run test:slow`, `test:slow:b`, `test:slow:c`, `test:slow:d` | Grow thousands of random genomes to prove every code is viable. These take from minutes to hours. |

The production build in `dist/` is plain static files, so it can be hosted on any static web host.

## Sharing an organism

The full code is always shown in the code bar along the bottom of the screen. Copy it and paste it into the code bar to reload the exact organism, or share the page address: the code travels after the `#`, so the link opens the same organism.

## How the code is laid out

A genome is exactly 160 letters, read as base-4 numbers (A = 0, C = 1, G = 2, T = 3):

| Letters | Field |
| --- | --- |
| 1 to 3 | Species |
| 4 to 6 | Encoding version, so old codes keep working |
| 7 to 144 | 23 parameter genes of 6 letters each, every one a number from 0 to 4,095 |
| 145 to 156 | Seed gene, for the model's randomness |
| 157 to 160 | Checksum, to catch typing mistakes in a pasted code |

Every possible code with a valid header grows a working organism: parameter ranges are clamped so nothing can fail.

## Project layout

| Path | Holds |
| --- | --- |
| `src/genome/` | Encoding, decoding and gene tables for each species |
| `src/sim/` | The growth simulations, deterministic and run in a web worker |
| `src/render/` | Three.js rendering of the organism and the three looks |
| `src/export/` | Tiled print-size PNG export, metadata and the methods file |
| `src/ui/` | The helix editor, inspector, code bar, export dialog and Methods page |
| `tests/` | Vitest tests, including the long viability runs |
| `dev/` | Development test pages for each species and the interface reference |
| `SPEC.md` | The full specification |
| `PLAN.md` | Milestones and the checks that prove each one is done |
| `DESIGN.md` | The interface design |
| `NOTES.md`, `ACCEPTANCE.md` | Decisions, checks run, and evidence for the acceptance tests |

## Built with

TypeScript, Vite, Three.js, Vitest and the IBM Plex typefaces.

## Status

Version 0.3: species A to D (v0.1 and v0.2) are done; species E and F are planned. See `PLAN.md` for progress.
