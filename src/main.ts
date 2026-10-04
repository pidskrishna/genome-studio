import { parseGenome, shareLink, wildType, type SpeciesId } from './genome';
import { Stage, type ViewMode } from './render/stage';
import { CodeBar } from './ui/code-bar';
import { Editor } from './ui/editor';
import { GeneMap } from './ui/gene-map';
import { HelixView } from './ui/helix-view';
import { buildShell } from './ui/shell';
import { SimClient } from './ui/sim-client';
import { Studio } from './ui/studio';
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

const shell = buildShell(document.getElementById('app') as HTMLElement);
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

const studio = new Studio({
  sim: new SimClient(),
  stage,
  progress: shell.progress,
  notice: (message, tone) => codeBar.say(message, tone),
});

async function show(code: string): Promise<void> {
  const outcome = await studio.update(code);
  if (outcome.status === 'grown') shell.stage.dataset.hash = outcome.hash;
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

function refreshControls(): void {
  for (const [s, b] of Object.entries(shell.speciesButtons)) b.setAttribute('aria-pressed', String(s === editor.species));
  shell.tools.undo.disabled = !editor.canUndo;
  shell.tools.redo.disabled = !editor.canRedo;
}

editor.subscribe((change) => {
  refreshControls();
  if (change.type !== 'code') return;
  history.replaceState(null, '', shareLink(location.href, change.code));
  void show(change.code);
});

shell.tools.randomiseAll.addEventListener('click', commands.randomiseAll);
shell.tools.wildType.addEventListener('click', commands.wildType);
shell.tools.undo.addEventListener('click', commands.undo);
shell.tools.redo.addEventListener('click', commands.redo);
shell.speciesButtons.A.addEventListener('click', () => commands.switchSpecies('A'));
shell.speciesButtons.B.addEventListener('click', () => commands.switchSpecies('B'));
shell.editorViews.helix.addEventListener('click', () => commands.setEditorView('helix'));
shell.editorViews.map.addEventListener('click', () => commands.setEditorView('map'));
shell.viewButtons['3d'].addEventListener('click', () => commands.setView('3d'));
shell.viewButtons.flat.addEventListener('click', () => commands.setView('flat'));

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

showView('3d');
showEditorView('helix');
refreshControls();
history.replaceState(null, '', shareLink(location.href, editor.code));
void show(editor.code);

if (import.meta.env.DEV) Object.assign(window, { studio, stage, editor, commands, helix, geneMap });
