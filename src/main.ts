import { parseHash, wildType } from './genome';
import { Stage, type ViewMode } from './render/stage';
import { buildShell } from './ui/shell';
import { SimClient } from './ui/sim-client';
import { Studio } from './ui/studio';
import './ui/style.css';

// Entry point: builds the layout, the stage and the simulation client, and opens with the wild type
// (or the code in the page address, if it carries one).

const shell = buildShell(document.getElementById('app') as HTMLElement);
const stage = new Stage(shell.stage);
const studio = new Studio({
  sim: new SimClient(),
  stage,
  progress: shell.progress,
  notice(message, tone) {
    shell.notice.textContent = message;
    shell.notice.dataset.tone = tone;
  },
});

function showView(mode: ViewMode): void {
  studio.setView(mode);
  for (const [m, button] of Object.entries(shell.viewButtons)) button.setAttribute('aria-pressed', String(m === mode));
}

async function grow(input: string): Promise<void> {
  const outcome = await studio.load(input);
  if (outcome.status === 'grown') {
    shell.codeInput.value = outcome.code;
    shell.stage.dataset.hash = outcome.hash;
  }
}

shell.viewButtons['3d'].addEventListener('click', () => showView('3d'));
shell.viewButtons.flat.addEventListener('click', () => showView('flat'));
shell.growButton.addEventListener('click', () => void grow(shell.codeInput.value));

showView('3d');
const linked = parseHash(location.hash);
const start = linked?.ok ? linked.code : wildType('A');
shell.codeInput.value = start;
void grow(start);

if (import.meta.env.DEV) Object.assign(window, { studio, stage });
