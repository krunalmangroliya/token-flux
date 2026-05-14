// Claude Code adapter — writes CLAUDE.md, skills to .claude/skills, commands to .claude/commands,
// and registers the pre-edit hook in .claude/settings.json.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { copyTemplate, ensureDir, PKG_ROOT, listFiles, readText, writeText, exists } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';

export async function writeClaudeCode({ repoRoot, config }) {
  // CLAUDE.md
  const agentMd = await loadAgentTemplate(config);
  const header = '<!-- Managed by token-flux. This file is regenerated on `token-flux init`. -->\n\n';
  await writeText(path.join(repoRoot, 'CLAUDE.md'), header + agentMd);

  // .claude/skills/<skill>/SKILL.md — Claude Code expects a directory per skill.
  const skillsRoot = path.join(repoRoot, '.claude', 'skills');
  const skillsSrc = path.join(PKG_ROOT, 'templates', 'skills');
  for (const f of await listFiles(skillsSrc, ['.md'])) {
    const base = path.basename(f, '.md');
    const skillDir = path.join(skillsRoot, base);
    await ensureDir(skillDir);
    await fs.copyFile(f, path.join(skillDir, 'SKILL.md'));
  }

  // .claude/commands/<name>.md — slash commands
  const commandsDst = path.join(repoRoot, '.claude', 'commands');
  await ensureDir(commandsDst);
  const commandsSrc = path.join(PKG_ROOT, 'templates', 'commands');
  for (const f of await listFiles(commandsSrc, ['.md'])) {
    await fs.copyFile(f, path.join(commandsDst, path.basename(f)));
  }

  // .claude/settings.json — register pre-edit hook if enforcement allows.
  if (config.enforcement !== 'advisory') {
    await registerHook(repoRoot);
  }
}

async function registerHook(repoRoot) {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  let existingObj = {};
  if (await exists(settingsPath)) {
    try {
      existingObj = JSON.parse(await readText(settingsPath));
    } catch {
      existingObj = {};
    }
  }

  existingObj.hooks = existingObj.hooks || {};
  existingObj.hooks.PreToolUse = existingObj.hooks.PreToolUse || [];

  const alreadyRegistered = existingObj.hooks.PreToolUse.some((h) =>
    JSON.stringify(h).includes('.agent-boost/scripts/pre-edit.mjs'),
  );

  if (!alreadyRegistered) {
    existingObj.hooks.PreToolUse.push({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [
        {
          type: 'command',
          command: 'node ./.agent-boost/scripts/pre-edit.mjs',
        },
      ],
    });
  }

  await ensureDir(path.dirname(settingsPath));
  await writeText(settingsPath, JSON.stringify(existingObj, null, 2) + '\n');
}
