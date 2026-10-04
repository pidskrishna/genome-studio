# Design: the glass interface

This document sets how the studio looks, moves and responds. It was agreed with the owner on 4 October 2026, through an interview and a working lab (`dev/interaction-lab.html`, with its modules in `dev/lab/`). The lab is the reference implementation: where this document gives a value, the lab uses that value.

`SPEC.md` stays the source of truth for what the tool does. This document covers how it looks and feels. Section 9 lists where the two meet and what needs the owner's approval.

## 1. Principles

1. **An instrument, not a dashboard.** "Scientific" means exact readouts with units and almost nothing else. Nothing on screen is decoration. No colour washes, no neon, no cards, no icons: every control is a word.
2. **Quiet at rest, precise in response.** The screen is nearly still and nearly wordless until you approach it. Every action gets a small, considered response that shows what changed.
3. **Glass like a cover slip.** Panels are thin, heavily frosted sheets with a fine rim of light. Depth comes from layering and frost, never from heavy shadows.
4. **Light is the only effect.** Glows, gradients and highlights appear only where real light would make them: rims, the cursor's light, light inside the helix, pulses. A pulse is light passing through, not a colour change.
5. **Damped, never bouncy.** Everything moves on critically damped springs or decelerating curves, with no overshoot. Small things answer in about 100ms; large things travel in about half a second.
6. **Colour is data.** The interface is neutral. Colour means something: a base, a gene group, the organism's pigment, or one accent per look.
7. **The look restyles everything.** Switching look changes the whole interface, not only the stage.

## 2. Colour

### Bases

The four bases use the genome-browser convention (IGV) at full strength in every look. They are data, not styling.

| Base | Colour |
| --- | --- |
| A | `#1f9d4c` green |
| C | `#2d68e8` blue |
| G | `#e07a12` orange |
| T | `#df3a3c` red |

This replaces the provisional pink, violet, amber and teal recorded in NOTES.md. The spec asks only that the four colours be fixed.

### Gene groups

Only form and pigment genes get a colour. The header, seed and checksum are grey; the seed is drawn dotted so it stays distinct. Group colours appear on the margin ruler and as the hairline under each gene in the code bar.

### Tokens per look

| Token | Plate | Fluorescence | Glossy | Use |
| --- | --- | --- | --- | --- |
| `--bg` | `#f3efe4` | `#000000` | `#9a9c9f` | Page; the renderer's paper, black, studio grey |
| `--backdrop` | `#ebe7dc` | `#000000` | `#a3a5a8` | Helix column, and the helix scene background |
| `--stage` | `#f3efe4` | `#000000` | `#9a9c9f` | Stage behind the organism |
| `--ink` | `#1c1a17` | `#e9ecef` | `#0f1114` | Text |
| `--ink-2` | ink at 62% | ink at 60% | ink at 64% | Secondary text, units |
| `--ink-3` | ink at 40% | ink at 36% | ink at 42% | Group names, disabled |
| `--hair` | ink at 14% | white at 10% | ink at 14% | Hairlines, minor ticks |
| `--hair-strong` | ink at 32% | white at 26% | ink at 32% | Track, major ticks, focus brackets |
| `--accent` | `#1c1a17` (ink) | `hsl(pigment A, 88%, 66%)` | `#33506c` blue-grey | Active and selected states, slider hairline |
| `--pulse` | `#1c1a17` | `hsl(pigment A, 90%, 70%)` | `#ffffff` | The light of a linked pulse |
| `--wash` | ink at 14% | `hsl(pigment A, 90%, 60%)` at 35% | white at 60% | A brief light behind letters (randomise, copy) |
| `--g-form` | `#5e7491` | `#8a9bb3` | `#3f5a78` | Form genes |
| `--g-pigment` | `#9a6488` | `hsl(pigment B, 70%, 62%)` | `#7b4f6e` | Pigment genes |
| `--g-other` | ink at 30% | white at 28% | ink at 30% | Header, seed, checksum |

The plate paper and ink are the renderer's own (`#f3efe4` and `#1c1a17`, `src/render/looks.ts`), so the interface and the stage read as one sheet; the owner chose this on 4 October 2026 rather than making the renderer's paper cool. In plate the accent is ink, so a pulse there shows as a hairline underline, not a colour change. In fluorescence, accents take pigment A's hue and the pigment group takes pigment B's (section 9, item 2). Both update when a pigment gene changes, without a regrow.

## 3. Glass

Every panel uses one recipe: a translucent fill, a backdrop blur, a rim of light, and a light that follows the cursor.

| Token | Plate | Fluorescence | Glossy |
| --- | --- | --- | --- |
| `--fill-1` top bar, code bar | `rgba(253,251,246,.42)` | `rgba(20,21,24,.40)` | `rgba(255,255,255,.10)` |
| `--fill-2` panels, buttons | `rgba(253,251,246,.60)` | `rgba(24,26,30,.58)` | `rgba(255,255,255,.17)` |
| `--fill-3` inspector | `rgba(254,252,248,.76)` | `rgba(28,30,35,.74)` | `rgba(255,255,255,.28)` |
| `--frost` blur | 40px | 40px | 16px (clearer, as the spec asks) |
| Backdrop saturation | 1.35 | 1.35 | 1.35 |
| `--rim-hi` / `--rim-lo` | white .98 / .40 | white .30 / .07 | white .85 / .22 |
| `--rim-edge` (inset 1px) | ink at 10% | white at 5% | black at 6% |
| `--shadow` | `0 1px 1px rgba(40,32,20,.05)` | none | `0 1px 2px rgba(0,0,0,.1), 0 8px 20px -14px rgba(0,0,0,.35)` |
| `--reflection` | none | none | `linear-gradient(115deg, transparent 32%, white .13 44%, transparent 58%)` |
| `--cursor-light` | white .75 | white .08 | white .40 |
| `--frost-fill` (lock frost) | `rgba(249,246,238,.62)` | `rgba(30,32,37,.66)` | `rgba(196,198,201,.55)` |

**Layering.** The top bar and code bar run the full width and sit over the stage's edge, so the organism shows blurred through them. The helix column has its own backdrop. The inspector floats over the helix beside the focused gene. Translucency rises with the layer: bars are nearly clear, panels are half, the inspector is mostly opaque.

**Rim light.** A 1px ring, drawn as a masked conic gradient that is brightest at two opposite corners. Its angle turns once every 48 seconds (the light sweep). With reduced motion on it stays still at 315°.

**Cursor light.** Inside any glass surface under the pointer, a soft spot of `--cursor-light` follows it: a 200px radial gradient, fading to nothing at 70%. It fades in over 220ms and out over 520ms. It sits under the content, so it never washes text.

**Nested glass.** A glass element inside a glass panel cannot blur what lies behind the panel; the browser only blurs what is inside it. So the frost of small glass parts (buttons, the slider lens, segment indicators) comes from their own fill, not from blur.

## 4. Type, space and shape

- **Typeface:** IBM Plex Sans (300, 400, 500) for the interface and IBM Plex Mono (400, 500) for every number and code. Both use the SIL Open Font License. How they are bundled needs approval (section 9, item 3).
- **Numerals:** every number, value, unit-bearing readout and the ATGC code is set in Plex Mono, so figures never jitter while changing.
- **Sizes:** labels 11px, body 12px, titles 13px weight 500. Line height 1.45; letter spacing +0.005em. Group names on the ruler are 10px, set vertically.
- **Words:** sentence case and British spelling. Controls are words, never icons. The specimen name is set in italic.
- **Spacing:** a 4px grid (4, 8, 12, 16, 24, 32, 48). Panel padding is 12px vertical and 16px horizontal. The layout is sparse.
- **Radii:** panels 6px, controls 4px, the slider lens 5px. Small and precise.

## 5. Motion

| Token | Quick small, slow large (chosen) | Moderate (fallback) |
| --- | --- | --- |
| `--t-small` presses, toggles | 100ms | 220ms |
| `--t-medium` state changes, travel, rolls | 220ms | 280ms |
| `--t-large` helix turns, frost, lifts | 520ms | 340ms |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | same |

- **Springs:** critically damped and solved exactly, so they are stable at any frame time. A spring "settling in T ms" has ω = 7 / T s⁻¹, which leaves under 1% of the distance at T. Anything you drag moves on springs; anything that appears or changes state uses `--ease-out`.
- **Idle motion:** there are exactly three idle motions:
  - The helix drifts one turn every 30 seconds.
  - The rim light sweeps round once every 48 seconds.
  - The focused gene breathes between 86% and 100% light on a 4.2-second cosine.
- **Reduced motion:** when the system setting is on, nothing travels or scales.
  - Moves become crossfades of about 160ms.
  - The helix jumps to its target.
  - The idle motions stop.
  - Light changes still fade over 140ms.

## 6. The helix

### Geometry

The geometry is unchanged: `src/ui/helix-geometry.ts` gives correct B-form DNA, the existing paired strand and the existing grooves.

- The camera has an 18° field of view and shows about 36 base pairs from top to bottom.
- The axis sits at 56% of the column's width, leaving room for the ruler on the left.
- Backbone tubes have a radius of 1.55 Å with 14 sides. Each half-rung has a frosted glass shell of radius 1.2 Å and a coloured core of radius 0.42 Å, ending 0.45 Å short of the pairing point.

### Material: borosilicate

The helix is laboratory glass. It is nearly clear, faintly cool, and physically refracts the coloured cores inside it.

| Part | Material |
| --- | --- |
| Backbones and rung shells | `MeshPhysicalMaterial`: transmission 1, roughness 0.16, thickness 2.5, ior 1.47, attenuation colour `#d8ecef` over 12 Å, environment intensity 0.9 |
| Rung cores | A custom shader carrying light and pulses, with colour management, so the cores look the same seen directly or through the glass |
| Gene boundaries | A fine frosted ring (torus 1.72 Å, tube 0.1 Å; roughness 0.75, transmission 0.5) round the code backbone where each gene begins |
| Locked genes | A frosted sleeve (radius 1.3 Å; roughness 0.7, transmission 0.7) that condenses over each rung of the gene |
| Lighting | RoomEnvironment through PMREM (blur 0.04), ambient 0.35, and a key light of 1.6 from upper left and front |
| Background | `--backdrop` of the current look, so the transmission samples the true backdrop |

No tone mapping is used, as on the stage. The helix is never exported, so it skips `snapVertices`, as now. All of this lives in `src/ui` or `src/render`; nothing touches `src/sim`.

### Light

The glass cannot carry light, so the cores do.

- **Core colour:** `mix(dim, base, 0.18 + 0.82·L) × (0.62 + 0.38·L) × 1.2`, where `L` is the base's light level:
  - 0.62 at rest.
  - 1 for the focused gene.
  - 0.16 for the rest while a gene is focused, so they dim to frosted grey.
- **Dim colour:** `#bab5aa` in plate (warm, to sit on the renderer's paper), `#34383e` in fluorescence, `#8a8d92` in glossy.

### Ruler

A margin ruler sits on the left of the helix. Each gene is a segment: 2px wide, coloured by group, with 2px gaps between segments.

- **Group names:** always shown, set vertically at 10px in `--ink-3`.
- **Gene names on approach:** a gene's name fades in as the pointer nears it. Its opacity is `1 − |pointer y − gene middle| / 70px`.
- **Hovered gene:** shows its name and current value, as the spec asks. Hovering a rung also counts.
- **Focused gene:** keeps its name and widens to 4px.
- **Locked gene:** its segment drops to 45%.
- **Clicks:** clicking a segment focuses that gene.

## 7. Interactions

Each entry gives the variant chosen in the lab.

### Helix drag, scroll and drift

- **Drag (horizontal):**
  - The helix turns directly with the pointer at 0.012 rad per pixel, with no smoothing.
  - On release it glides on its release speed for about 0.14 s.
  - It then settles, critically damped over 520ms, so that the nearest base pair faces the viewer.
  - At 70% of the settle, that base pair brightens by 0.3 and fades with a time constant of about 110ms: a soft visual click.
- **Scroll:** travels along the helix at 0.035 base pairs per unit of wheel movement, settling over 220ms. Scrolling over the inspector does not move the helix.
- **Drift:**
  - The helix turns at 12° per second whenever nothing is focused, including while the pointer is over it.
  - It pauses for 2.5 s after any press, drag or scroll.
  - It is off with reduced motion.
- **Hover:** the reticle frames the base under the pointer as a 22px ring, and the ruler names its gene and value.

### Focusing a gene: light leads

- **Trigger:** clicking a ruler segment, a rung, or a gene map row.
- **Sequence:**
  1. 0 to 150ms: the gene's cores rise to full light while every other base dims to 0.16.
  2. From 150ms: the helix turns and travels so the gene's middle base pair faces the viewer, critically damped over 520ms. The gene settles in the upper quarter of the column (24% of its height), so the full inspector fits below it; the lab's small inspector allowed mid-height, the real one does not.
  3. At about 570ms: the inspector opens just below the gene, joined to it by a hairline leader. It fades from 0 to 1 and unblurs from 4px over 220ms.
- **While focused:** the gene breathes (86% to 100%, 4.2 s) and the helix does not drift.
- **Release:** clicking the focused gene again or pressing Escape returns the lights to 0.62 over 220ms and fades the inspector out. Escape first clears a selected base, then the focus, as now.
- **Reduced motion:** the turn is instant, and the lights and inspector crossfade.

### Cycling a base: meet in the middle

- **Trigger:** clicking a rung cycles its base (A, C, G, T), selects it for typing, and focuses its gene without turning. Typing A, C, G or T sets the selected base.
- **Pulse:** two fronts of light leave both backbones together and meet at the pairing point in about 250ms, leaving the new pair's colours behind them. The rung then flashes 0.25 and fades.
- **Linked change:** the base letter in the inspector rolls in from below (220ms), and every place showing the gene's value pulses together.
- **Header and checksum:** these bases do not change. The inspector reads "These bases can't be edited."

### Dragging a slider: lens, light frost

- **At rest:**
  - A 1px track carries ticks: major every 10% (7px), minor every 2% (3px).
  - The thumb is a lens 36 × 22 px with radius 5px. It has a light frost (`--fill-2` with a 6px blur) and a 1px accent hairline at its centre.
  - The lens shows the scale beneath it at 3×.
- **Grab:** the lens lifts to 110% over 140ms, and every linked value (number field, bases, code bar letters, ruler label) stays lit with `--pulse` while held.
- **Drag:** the thumb follows the pointer directly. Fine control:
  - Holding Shift gives 1/10 speed.
  - Moving the pointer away from the track gives half speed beyond 40px, a quarter beyond 90px, and 1/10 beyond 150px.
  - The speed is named under the thumb ("Half speed", "Quarter speed", "Fine").
  - In fine control the lens magnifies 6× and shows 0.2% ticks.
- **Click on the track:** the thumb travels there over 220ms, and dragging continues from that point.
- **Release:** the lens settles back over 220ms, and the linked light decays over 640ms with a retracting hairline underline.
- **Keys:**
  - Arrows step one bin.
  - Page Up and Page Down step 64 bins.
  - Home and End jump to the ends.
- **Draft:** while a form gene is dragged, the organism shows the coarse draft (milestone 11).

### Pressing a button: sink

- **Press:** the button scales to 97% and its rim light drops to 40%, both over 100ms.
- **Release:** it returns over 220ms with `--ease-out`, with no overshoot. Space and Enter press the same way.
- **Disabled:** text in `--ink-3` and rim light at 40%. The reticle does not frame it.

### Toggling a lock: condensation

- **Button:** the word "Lock" becomes "Locked" (`aria-pressed`).
- **In the inspector:**
  - Frost condenses over the gene's controls from the edges inward over 520ms: blur 0 to 7px and fill 0 to `--frost-fill`, through a radial mask.
  - Unlocking clears it from the centre outward.
  - While locked, the controls are inert and Randomise gene is disabled.
  - Hovering the frost shows "Locked. Randomise all leaves this gene alone."
- **On the helix:** a frosted sleeve grows out through each of the gene's rungs over 520ms, from 80% to 105% of its radius.
- **Elsewhere:** in the code bar the gene drops to 45% under a frost veil, and its ruler segment drops to 45%.

### Randomising: gene by gene

- **Rule:** unchanged. Every unlocked gene moves to a different value, chosen uniformly.
- **Sequence:**
  - Genes change as blocks, one after the next, 26ms apart, in 24 distinct steps; the checksum comes last.
  - Each gene's code bar group lights with `--wash` (fading over 420ms) and its changed letters roll.
  - On the helix, the gene's rungs brighten by 0.45, and each changed base runs the meet-in-the-middle pulse (176ms).
- **Locked genes:** they stay still under their frost.
- **Reduced motion:** everything changes at once with a crossfade.

### Copying the code: gene by gene

- **Trigger:** pressing Copy writes the code to the clipboard.
- **Sequence:**
  - Each gene's letters light with `--pulse` in turn, 14ms apart, as if read out.
  - 160ms after the last gene, all fade back over 520ms.
  - The button's label rolls up from "Copy" to "Copied" (220ms), holds for 1.5 s, and rolls back.
- **Failure:** if the browser refuses the clipboard, the label reads "Copy failed" and the code bar says why.
- **Paste:** follows the same rhythm in reverse; the new letters roll in gene by gene, then the organism regrows. This was not tried in the lab.

### Switching look: uniform exposure

- **Sequence:**
  - A full-window layer of white fades in to 30% over 160ms. It is black when switching into fluorescence, like a lamp dimming.
  - At the peak, the interface, the helix material and the stage all switch to the new look, with no transitions.
  - The layer then fades out over 240ms. The whole switch takes 400ms.
- **Reduced motion:** a crossfade through `--bg` (80ms in, 80ms out).

### Segmented controls

These are species, look, flat or 3D, and helix or gene map.

- A single glass lozenge (`--fill-3`) slides to the chosen segment, critically damped over 220ms.
- Arrow keys move the choice.

### Cursor: a calm reticle

- **Free:** a 12px ring on the pointer, 1px `--reticle` with a 1px halo. It follows almost directly, with a 24ms settle.
- **Over a control:**
  - The ring grows to frame the control, 2px outside it and matching its radius plus 2px.
  - Size settles over 260ms and position over 240ms.
  - It leans 4% towards the pointer and shrinks to 97% while pressed.
  - Controls larger than 260 × 120 px are not framed.
- **Text fields:** show the system I-beam.
- **Scope:** only on fine pointers. With reduced motion, the frame does not morph.

### Keyboard focus: corner brackets

- **Brackets:** four 5px corners in 1px `--hair-strong`, 4px outside the focused control.
- **Movement:** one set of brackets glides between focused controls over 160ms and fades over 120ms. The browser's outline is replaced only where the brackets show (`:focus-visible`).

### Regrow: focus pull and progress (not yet in the lab)

- **Progress:** while growing, a 1px `--accent` hairline fills across the top of the stage. Beside it is a mono readout such as "Growing 63%".
- **When ready:** the stage blurs from 0 to 6px over 180ms, the organism swaps at the peak, and the blur clears over 320ms, like refocusing a microscope.
- **Scope:** this is a CSS filter on the stage canvas only. It never touches the render or the export.
- **Reduced motion:** a 160ms crossfade instead.
- **Before shipping:** these values are proposals. They are shown to the owner in the app during the build, and agreed there before they are final.

## 8. Performance and accessibility

- **Frame rate:** 60 frames per second during drift, turns, drags and ripples. Pass mark: 95% of frames at or under 16.7ms over a 10-second recording at 1440 × 900 on the owner's machine, in Chrome and Safari.
- **Rendering:** the helix renders continuously only while it drifts and is on screen. It stops when the tab is hidden, a gene is focused and settled, or reduced motion is on. The stage still draws on demand.
- **Reduced motion:** respected throughout (section 5). The lab's "Motion" switch simulates it.
- **Contrast:** all text keeps its contrast in every look. Every state has a word or a shape, not only a colour.

## 9. Where this meets SPEC.md: decisions

Nothing in SPEC.md has changed. The owner decided these on 4 October 2026:

1. **Gene bands (section 5).** The frosted boundary rings on the backbone, with labels and group colours in the margin ruler beside it, meet "each gene is a labelled band along the backbone". No spec edit.
2. **Fluorescence controls (section 6).** "Controls lit in the organism's pigment hues" means: accents (focus, active and selected states, the slider hairline, the reticle, pulses) take pigment A's hue; pigment-gene marks take pigment B's; text stays neutral.
3. **Fonts.** IBM Plex is bundled from the `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` npm packages (approved dependency). The app never loads fonts from a third party.

Also changing, but recorded only in NOTES.md (not spec decisions):
- The base colours (section 2).
- Focus timing: 650ms ease becomes light leads, then a 520ms damped turn.
- Drift and detents.

## 10. Fit with PLAN.md

Milestone 10 as first written ("the glass control-panel style and the restyling of the whole interface with each look") covered about a third of this. With the owner's approval (4 October 2026) it is split into three milestones, 10a to 10c, keeping 11 to 13 as they are. Each keeps every existing check and test, and adds its own.

**10a: Glass and look theming.**
- **Build:**
  - Tokens and fonts.
  - Glass panels with rim, sweep and cursor light.
  - The three looks restyling everything.
  - Fluorescence accents from pigments A and B.
  - The exposure look switch.
  - Segmented controls, button press, the reticle cursor and focus brackets.
  - Reduced-motion plumbing, and the motion module moved from the lab into `src/ui`.
- **Checks:**
  - Milestone 10's two checks: screenshots in all three looks; fluorescence controls follow the pigment hues and update on a pigment edit.
  - With reduced motion on, nothing moves or scales.
  - Unit tests for the pure parts: tokens for every look, accent from pigments, spring settle.

**10b: The borosilicate helix.**
- **Build:**
  - The material, cores and boundary rings.
  - The ruler with names on approach and name plus value on hover.
  - Light-leads focus, detents, drift and breathing.
  - Meet-in-the-middle base cycling.
  - Lock condensation on the helix.
- **Checks:**
  - The existing browser check passes: base 13 clicked four times goes G, T, A, C, G and updates everything.
  - The 60fps pass mark.
  - Screenshots in three looks.
  - Unit tests for the detent and the ruler's label opacity.

**10c: Inspector and code bar.**
- **Build:**
  - The lens slider with fine control and keys.
  - Linked pulses.
  - Lock condensation in the inspector.
  - The gene-by-gene randomise ripple.
  - Gene-by-gene copy and paste.
  - The regrow focus pull with hairline progress.
- **Checks:**
  - Randomise still leaves locked genes alone and changes every other gene.
  - Copy and paste round-trip the exact code.
  - Unit tests for the fine-drag speed and the ripple schedule.
  - Screenshots compared against the lab, with mismatches fixed.

The lab stays in `dev/` as the reference, and is committed with 10a.
