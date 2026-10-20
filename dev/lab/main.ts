import { pigmentsOf, specimenName, wildType } from '../../src/genome';
import type { LabLook } from './glass-helix';
import { applyType, lab, onSavedChange, saved, sectionTitles, segmented, variantNames, type Face, type Numerals } from './lab';
import { applyMotionTokens, motion, tween, easeOut, type MotionPref, type Speed } from './motion';
import { installCursorLight, installFocusBrackets, Reticle } from './surface';
import { Specimen } from './specimen';
import { buttonSection, copySection, lensFrostSection, lockSection, numeralsSection, sliderSection, typeSection, pressable } from './controls';
import { cycleSection, focusSection, materialSection, randomiseSection } from './helix-sections';
import { looksSection } from './looks-section';
import { speciesSection } from './species-section';
import './lab.css';

// Interaction lab (dev only, not part of the build): three working variants of each core interaction
// for the glass interface, to choose from before DESIGN.md is written. Open /dev/interaction-lab.html.

lab.code = wildType('A');
lab.hue = pigmentsOf(lab.code).hueA;
const root = document.documentElement;
root.dataset.look = lab.look;
root.style.setProperty('--hue', String(lab.hue));
applyType(root, lab.face, lab.numerals);
applyMotionTokens();

const reticle = new Reticle();
reticle.setEnabled(true);
installCursorLight();
installFocusBrackets();

// Toolbar ---------------------------------------------------------------------------------------------

const bar = document.getElementById('lab-bar') as HTMLElement;
const tools = bar.querySelector('.lab-tools') as HTMLElement;

function tool(label: string, control: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'tool';
  const l = document.createElement('span');
  l.className = 'tool-label';
  l.textContent = label;
  wrap.append(l, control);
  tools.append(wrap);
}

const exposure = document.getElementById('page-exposure') as HTMLElement;
let switching = false;

async function setLook(look: LabLook): Promise<void> {
  if (look === lab.look || switching) return;
  switching = true;
  exposure.style.background = look === 'fluorescence' ? '#000' : '#fff';
  const swap = (): void => {
    lab.look = look;
    root.dataset.look = look;
    document.dispatchEvent(new Event('lab:look'));
  };
  if (motion.reduced) {
    exposure.style.background = 'var(--bg)';
    await tween(80, (p) => (exposure.style.opacity = String(p * 0.85))).done;
    swap();
    await tween(80, (p) => (exposure.style.opacity = String(0.85 * (1 - p)))).done;
  } else {
    await tween(160, (p) => (exposure.style.opacity = String(p * 0.3)), easeOut).done;
    swap();
    await tween(240, (p) => (exposure.style.opacity = String(0.3 * (1 - p))), easeOut).done;
  }
  switching = false;
}

tool(
  'Look',
  segmented<LabLook>('Look', [{ value: 'plate', text: 'Plate' }, { value: 'fluorescence', text: 'Fluorescence' }, { value: 'glossy', text: 'Glossy' }], lab.look, (v) => void setLook(v)).el,
);
tool(
  'Typeface',
  segmented<Face>('Typeface', [{ value: 'plex', text: 'Plex' }, { value: 'geist', text: 'Geist' }, { value: 'chivo', text: 'Chivo' }], lab.face, (v) => {
    lab.face = v;
    applyType(root, lab.face, lab.numerals);
  }).el,
);
tool(
  'Numerals',
  segmented<Numerals>('Numerals', [{ value: 'tabular', text: 'Tabular' }, { value: 'mono', text: 'Mono' }, { value: 'code', text: 'Code only' }], lab.numerals, (v) => {
    lab.numerals = v;
    applyType(root, lab.face, lab.numerals);
  }).el,
);
tool(
  'Speed',
  segmented<Speed>('Speed', [{ value: 'quick', text: 'Quick and slow' }, { value: 'moderate', text: 'Moderate' }], motion.speed, (v) => {
    motion.speed = v;
    applyMotionTokens();
  }).el,
);
tool(
  'Motion',
  segmented<MotionPref>('Motion', [{ value: 'system', text: 'System' }, { value: 'reduced', text: 'Reduced' }, { value: 'full', text: 'Full' }], motion.pref, (v) => {
    motion.pref = v;
    applyMotionTokens();
  }).el,
);
tool(
  'Slow motion',
  segmented<'1' | '4'>('Slow motion', [{ value: '1', text: 'Off' }, { value: '4', text: '4×' }], '1', (v) => {
    motion.slow = Number(v);
    applyMotionTokens();
  }).el,
);
tool(
  'Cursor',
  segmented<'reticle' | 'system'>('Cursor', [{ value: 'reticle', text: 'Reticle' }, { value: 'system', text: 'System' }], 'reticle', (v) => reticle.setEnabled(v === 'reticle')).el,
);

// Pigment hue: the fluorescence look lights its controls in the organism's pigment hue.
const hueWrap = document.createElement('label');
hueWrap.className = 'hue-tool';
const hue = document.createElement('input');
hue.type = 'range';
hue.min = '0';
hue.max = '360';
hue.value = String(Math.round(lab.hue));
hue.setAttribute('aria-label', 'Pigment A hue');
const hueOut = document.createElement('span');
hueOut.className = 'num';
hueOut.textContent = `${Math.round(lab.hue)}°`;
hueWrap.append(hue, hueOut);
tool('Pigment A', hueWrap);

// Specimen --------------------------------------------------------------------------------------------

const specimen = new Specimen();
const status = document.getElementById('lab-status') as HTMLElement;
let hueTimer = 0;
hue.addEventListener('input', () => {
  lab.hue = Number(hue.value);
  hueOut.textContent = `${lab.hue}°`;
  root.style.setProperty('--hue', String(lab.hue));
  clearTimeout(hueTimer);
  hueTimer = window.setTimeout(() => {
    const p = pigmentsOf(lab.code);
    const shift = lab.hue - p.hueA;
    const url = specimen.render('fluorescence', { ...p, hueA: lab.hue, hueB: (p.hueB + shift + 360) % 360 });
    root.style.setProperty('--org-fluorescence', `url("${url}")`);
  }, 120);
});

async function grow(): Promise<void> {
  status.textContent = `Growing ${specimenName(lab.code).full}`;
  try {
    await specimen.grow(lab.code);
    for (const look of ['plate', 'fluorescence', 'glossy'] as LabLook[]) {
      root.style.setProperty(`--org-${look}`, `url("${specimen.render(look, pigmentsOf(lab.code))}")`);
    }
    status.textContent = '';
  } catch (e) {
    status.textContent = `The organism could not be grown: ${(e as Error).message}`;
  }
}

// Sections --------------------------------------------------------------------------------------------

const main = document.getElementById('lab-main') as HTMLElement;
main.append(
  speciesSection(),
  materialSection(reticle),
  sliderSection(),
  lensFrostSection(),
  buttonSection(),
  lockSection(),
  focusSection(reticle),
  cycleSection(reticle),
  looksSection(),
  randomiseSection(reticle),
  copySection(),
  typeSection(),
  numeralsSection(),
);

// Summary ---------------------------------------------------------------------------------------------

const summary = document.getElementById('lab-summary') as HTMLElement;
const summaryList = summary.querySelector('ol') as HTMLOListElement;
const copySummary = summary.querySelector('button') as HTMLButtonElement;
pressable(copySummary, 'sink');

function summaryText(): string {
  return Object.keys(sectionTitles)
    .map((id) => {
      const pick = saved.picks[id];
      const name = pick ? `${pick}, ${variantNames[id]?.[pick] ?? ''}` : 'no pick yet';
      const note = saved.notes[id]?.trim();
      return `${sectionTitles[id]}: ${name}${note ? `. ${note}` : ''}`;
    })
    .join('\n');
}

function renderSummary(): void {
  summaryList.replaceChildren(
    ...summaryText()
      .split('\n')
      .map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
  );
}
onSavedChange(renderSummary);
renderSummary();
copySummary.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summaryText());
    copySummary.textContent = 'Copied';
  } catch {
    copySummary.textContent = 'Copy refused by the browser';
  }
  setTimeout(() => (copySummary.textContent = 'Copy summary'), 1500);
});

window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applyMotionTokens());
Object.assign(window, { lab, motion, saved, summaryText });
void grow();
