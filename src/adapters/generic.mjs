// Generic adapter — writes AGENT.md + skills + commands. Works with anything that reads repo-level instructions.
import path from 'node:path';
import { copyTemplate, ensureDir, PKG_ROOT, listFiles, writeText } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';
import { promises as fs } from 'node:fs';

export async function writeGeneric({ repoRoot, config }) {
  await writeText(path.join(repoRoot, 'AGENT.md'), await loadAgentTemplate(config));

  const skillsDst = path.join(repoRoot, '.agent-boost', 'skills');
  const commandsDst = path.join(repoRoot, '.agent-boost', 'commands');
  await ensureDir(skillsDst);
  await ensureDir(commandsDst);

  const skillsSrc = path.join(PKG_ROOT, 'templates', 'skills');
  const commandsSrc = path.join(PKG_ROOT, 'templates', 'commands');

  for (const f of await listFiles(skillsSrc, ['.md'])) {
    await fs.copyFile(f, path.join(skillsDst, path.basename(f)));
  }
  for (const f of await listFiles(commandsSrc, ['.md'])) {
    await fs.copyFile(f, path.join(commandsDst, path.basename(f)));
  }
}
