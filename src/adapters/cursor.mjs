// Cursor adapter — writes .cursor/rules/token-flux.mdc with frontmatter.
// Also drops individual skill files so Cursor can auto-attach them.
import path from 'node:path';
import { ensureDir, readText, writeText, listFiles, PKG_ROOT } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';

export async function writeCursor({ repoRoot, config }) {
  const rulesDir = path.join(repoRoot, '.cursor', 'rules');
  await ensureDir(rulesDir);

  const agentMd = await loadAgentTemplate(config);
  const mdc = [
    '---',
    'description: token-flux operating rules — read before any code change',
    'globs: ["**/*"]',
    'alwaysApply: true',
    '---',
    '',
    agentMd,
  ].join('\n');
  await writeText(path.join(rulesDir, 'token-flux.mdc'), mdc);

  // Per-skill rules
  const skillsSrc = path.join(PKG_ROOT, 'templates', 'skills');
  for (const f of await listFiles(skillsSrc, ['.md'])) {
    const base = path.basename(f, '.md');
    const body = await readText(f);
    const mdcBody = [
      '---',
      `description: Skill — ${base}`,
      'alwaysApply: false',
      '---',
      '',
      body,
    ].join('\n');
    await writeText(path.join(rulesDir, `skill-${base}.mdc`), mdcBody);
  }
}
