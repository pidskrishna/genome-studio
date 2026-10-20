import '@fontsource/ibm-plex-sans/latin-300.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import { parseGenome, pigmentsOf, shareLink, specimenName, wildType, type Pigments, type SpeciesId } from './genome';
import { Stage, type LookId, type Organism, type ViewMode } from './render/stage';
import { CodeBar } from './ui/code-bar';
import { Editor } from './ui/editor';
import { GeneMap } from './ui/gene-map';
import { HelixView } from './ui/helix-view';
import { buildShell } from './ui/shell';
import { SimClient } from './ui/sim-client';
import { Studio } from './ui/studio';
import { Tray } from './ui/tray';
import { ExportDialog } from './ui/export-dialog';
import { MethodsPage } from './ui/methods-page';
import { applyMotionTokens, motion, onReducedMotionChange } from './ui/motion';
import { exposure, installButtonPress, installCursorLight, installFocusBrackets, Reticle } from './ui/surface';
import { applyLook, applyPigmentHues } from './ui/theme';
import './ui/style.css';

// Entry point: builds the layout, the editor, the stage and the simulation client, and opens with the
// wild type (or the code in the page address, if it carries one). Every edit updates the address, so
// the page link always opens the organism on the stage.

/** The text after # in the page address. */
function hashText(hash: string): string {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

const root = document.documentElement;
applyMotionTokens();
onReducedMotionChange(() => applyMotionTokens());
const shell = buildShell(document.getElementById('app') as HTMLElement, (species) => commands.switchSpecies(species));
const stage = new Stage(shell.stage);

const linked = hashText(location.hash);
const parsed = linked.trim() === '' ? null : parseGenome(linked);
const editor = new Editor({
  code: parsed?.ok ? parsed.code : wildType('A'),
  warning: parsed?.ok ? parsed.warning : undefined,
});

const helix = new HelixView(editor);
const geneMap = new GeneMap(editor);
geneMap.element.hidden = true;
shell.editorBody.append(helix.element, geneMap.element);
const codeBar = new CodeBar(shell.codeBar, editor, {
  link: () => shareLink(location.href, editor.code),
  copy: (text) => navigator.clipboard.writeText(text),
  readClipboard: () => navigator.clipboard.readText(),
});
if (parsed && !parsed.ok) codeBar.say(`The link’s code could not be read. ${parsed.message}`, 'error');

/**
 * A new organism arrives with a focus pull (DESIGN.md section 7): the stage blurs over 180ms, the
 * organism swaps at the peak, and the blur clears over 320ms, like refocusing a microscope. It is a CSS
 * filter on the stage's canvas only; the render and the export never see it. The first organism, and
 * any with reduced motion on, arrive with a short crossfade instead.
 */
let organismShown = false;
/** True between a regrow finishing and its organism reaching the stage (the focus pull's first half). */
let swapPending = false;
/** While a gene slider is dragged, form-gene edits grow a coarse draft (clarification 3). */
let dragging = false;
let pullTimer = 0;
const stageView = {
  setOrganism(organism: Organism): void {
    const host = shell.stage;
    window.clearTimeout(pullTimer);
    swapPending = false;
    // Drafts arrive one after another while a slider is dragged: they swap in directly. The focus pull
    // is for the organism itself, when the slider is released.
    if (!organismShown || dragging) {
      organismShown = true;
      host.classList.remove('defocus', 'refocus');
      stage.setOrganism(organism);
      return;
    }
    if (motion.reduced) {
      stage.setOrganism(organism);
      host.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    host.classList.remove('refocus');
    host.classList.add('defocus');
    swapPending = true;
    pullTimer = window.setTimeout(() => {
      swapPending = false;
      stage.setOrganism(organism);
      host.classList.replace('defocus', 'refocus');
      pullTimer = window.setTimeout(() => host.classList.remove('refocus'), 340);
    }, 180);
  },
  setPigments: (p: Pigments) => stage.setPigments(p),
  setView: (mode: ViewMode) => stage.setView(mode),
};

const studio = new Studio({
  sim: new SimClient(),
  stage: stageView,
  progress: shell.progress,
  notice: (message, tone) => codeBar.say(message, tone),
  drafted: (isDraft) => (shell.draftLabel.hidden = !isDraft),
});

// The specimen tray: recent organisms of this session; a click loads that exact code again.
const tray = new Tray((code) => {
  if (code !== editor.code) editor.paste(code);
});
shell.stageArea.append(tray.element);

// Export (spec section 9): only the organism itself is exported, never a draft or a regrow in flight.
const exportDialog = new ExportDialog({
  stage,
  readyCode: () => (shell.draftLabel.hidden && !swapPending && studio.code === editor.code ? studio.code : null),
  hash: () => studio.hash,
});
shell.exportButton.addEventListener('click', () => exportDialog.open());

// The Methods page (spec section 10), with the hash of the organism on the stage.
const methodsPage = new MethodsPage({ current: () => (studio.code && studio.hash ? { code: studio.code, hash: studio.hash } : null) });
shell.methodsButton.addEventListener('click', () => methodsPage.open());

/** A small picture of the organism now on the stage, for the tray (the look and background as shown). */
function thumbnail(): string {
  const px = stage.renderImage(112, 112);
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(px.width, px.height);
  // Pixels are premultiplied; with an opaque background alpha is 255, so they can be used as they are.
  img.data.set(px.data);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The plate caption follows the code: the name changes only when the organism visibly does. */
function showCaption(code: string): void {
  shell.caption.name.textContent = specimenName(code).full;
  shell.caption.code.textContent = code;
}

document.addEventListener('slidergesture', (e) => {
  dragging = (e as CustomEvent<{ active: boolean }>).detail.active;
  // On release the organism itself regrows from the final code.
  if (!dragging) void show(editor.code);
});

async function show(code: string): Promise<void> {
  if (dragging) {
    await studio.draft(code);
    return;
  }
  const outcome = await studio.update(code);
  if (outcome.status === 'grown') {
    shell.stage.dataset.hash = outcome.hash;
    const grownCode = outcome.code;
    tray.add(grownCode);
    // The organism reaches the stage after the focus pull's first half; then draw its thumbnail.
    window.setTimeout(() => {
      if (studio.code === grownCode) tray.setImage(grownCode, thumbnail());
    }, 450);
  }
  if (outcome.status === 'grown' || outcome.status === 'unchanged') tray.setCurrent(studio.code ?? code);
}

/** Every editor action as a named command (the hook for keyboard shortcuts, spec section 11). */
const commands = {
  randomiseAll: () => editor.randomiseAll(),
  randomiseGene: () => editor.randomiseGene(),
  toggleLock: () => editor.toggleLock(),
  wildType: () => editor.resetWildType(),
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  switchSpecies: (species: SpeciesId) => editor.switchSpecies(species),
  setView: (mode: ViewMode) => showView(mode),
  setLook: (look: LookId) => showLook(look),
  setTransparent: (transparent: boolean) => showTransparent(transparent),
  paste: (text: string) => codeBar.acceptPaste(text),
  setEditorView: (view: EditorView) => showEditorView(view),
};

type EditorView = 'helix' | 'map';

/** The helix is the default; the gene map sits behind the toggle (spec section 5). */
function showEditorView(view: EditorView): void {
  helix.element.hidden = view !== 'helix';
  geneMap.element.hidden = view !== 'map';
  for (const [v, b] of Object.entries(shell.editorViews)) b.setAttribute('aria-pressed', String(v === view));
  if (view === 'helix') helix.show();
  else geneMap.reveal();
}

function showView(mode: ViewMode): void {
  studio.setView(mode);
  for (const [m, b] of Object.entries(shell.viewButtons)) b.setAttribute('aria-pressed', String(m === mode));
}

/**
 * Looks and the background option are outside the genome (spec section 7): they never touch the code.
 * The look restyles the whole interface, not only the stage (spec section 6).
 */
function applyWholeLook(look: LookId): void {
  // Everything switches at once, with no transitions, at the peak of the exposure change.
  root.classList.add('switching');
  stage.setLook(look);
  applyLook(root, look);
  helix.setLook(look);
  for (const [l, b] of Object.entries(shell.lookButtons)) b.setAttribute('aria-pressed', String(l === look));
  void root.offsetWidth;
  requestAnimationFrame(() => root.classList.remove('switching'));
}

let lookChange: Promise<void> = Promise.resolve();
function showLook(look: LookId, animate = true): void {
  if (!animate) {
    applyWholeLook(look);
    return;
  }
  lookChange = lookChange.then(() => (look === stage.look ? undefined : exposure(shell.exposureLayer, look === 'fluorescence', () => applyWholeLook(look))));
}

function showTransparent(transparent: boolean): void {
  stage.setTransparent(transparent);
  shell.transparentButton.setAttribute('aria-pressed', String(transparent));
  shell.stage.classList.toggle('transparent', transparent);
}

function refreshControls(): void {
  shell.speciesMenu.set(editor.species);
  shell.tools.undo.disabled = !editor.canUndo;
  shell.tools.redo.disabled = !editor.canRedo;
}

editor.subscribe((change) => {
  refreshControls();
  // The fluorescence look lights its controls in the pigment hues; they follow every pigment edit.
  applyPigmentHues(root, pigmentsOf(editor.code));
  showCaption(editor.code);
  if (change.type !== 'code') return;
  history.replaceState(null, '', shareLink(location.href, change.code));
  void show(change.code);
});

shell.tools.randomiseAll.addEventListener('click', commands.randomiseAll);
shell.tools.wildType.addEventListener('click', commands.wildType);
shell.tools.undo.addEventListener('click', commands.undo);
shell.tools.redo.addEventListener('click', commands.redo);
shell.editorViews.helix.addEventListener('click', () => commands.setEditorView('helix'));
shell.editorViews.map.addEventListener('click', () => commands.setEditorView('map'));
shell.viewButtons['3d'].addEventListener('click', () => commands.setView('3d'));
shell.viewButtons.flat.addEventListener('click', () => commands.setView('flat'));
for (const [look, b] of Object.entries(shell.lookButtons)) b.addEventListener('click', () => commands.setLook(look as LookId));
shell.transparentButton.addEventListener('click', () => commands.setTransparent(!stage.transparent));

// A link pasted into the address bar of this page opens its organism.
window.addEventListener('hashchange', () => {
  const text = hashText(location.hash);
  if (text.trim() !== '' && text !== editor.code) commands.paste(text);
  // The address shows the stored code: corrected if it had a typo, unchanged if it was rejected.
  history.replaceState(null, '', shareLink(location.href, editor.code));
});

// Pasting anywhere outside a text field loads the pasted code.
document.addEventListener('paste', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.closest('input, textarea, [contenteditable="true"]') !== null)) return;
  const text = e.clipboardData?.getData('text');
  if (!text) return;
  e.preventDefault();
  commands.paste(text);
});

installCursorLight();
installFocusBrackets();
installButtonPress();
helix.setReticle(new Reticle());
applyPigmentHues(root, pigmentsOf(editor.code));
showCaption(editor.code);

showView('3d');
showLook(stage.look, false);
showTransparent(false);
showEditorView('helix');
refreshControls();
history.replaceState(null, '', shareLink(location.href, editor.code));
void show(editor.code);

if (import.meta.env.DEV) Object.assign(window, { studio, stage, editor, commands, helix, geneMap, codeBar, tray, exportDialog, methodsPage, motion, applyMotionTokens, exportReady: () => exportDialog.ready });
