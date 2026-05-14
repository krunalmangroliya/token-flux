// VS Code adapter — writes AGENT.md and registers a task for verify.mjs.
// Weakest enforcement tier — there is no agent hook surface, so we only wire the verifier.
import path from 'node:path';
import { readText, writeText, exists, ensureDir, PKG_ROOT } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';

export async function writeVscode({ repoRoot, config }) {
  const agentMd = await loadAgentTemplate(config);
  await writeText(path.join(repoRoot, 'AGENT.md'), agentMd);

  const vscodeDir = path.join(repoRoot, '.vscode');
  await ensureDir(vscodeDir);

  const tasksPath = path.join(vscodeDir, 'tasks.json');
  let current = { version: '2.0.0', tasks: [] };
  if (await exists(tasksPath)) {
    try {
      current = JSON.parse(await readText(tasksPath));
      current.tasks = current.tasks || [];
    } catch {
      // keep default
    }
  }

  const alreadyHas = current.tasks.some((t) => t.label === 'token-flux: verify');
  if (!alreadyHas) {
    current.tasks.push({
      label: 'token-flux: verify',
      type: 'shell',
      command: 'node',
      args: ['./.agent-boost/scripts/verify.mjs'],
      problemMatcher: [],
      group: { kind: 'test', isDefault: false },
    });
    current.tasks.push({
      label: 'token-flux: rebuild codemap',
      type: 'shell',
      command: 'node',
      args: ['./.agent-boost/scripts/build-codemap.mjs'],
      problemMatcher: [],
    });
  }

  await writeText(tasksPath, JSON.stringify(current, null, 2) + '\n');
}
