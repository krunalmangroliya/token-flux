// Antigravity adapter — writes GEMINI.md (always-on master rulebook) with mode-aware rules.
//
// DESIGN DECISION: We do NOT write to .agent/ folder.
// The .agent/ folder belongs to Antigravity IDE itself (user's own workspace config).
// Writing there risks overwriting the user's existing skills and commands.
//
// Instead:
// - GEMINI.md (trigger: always_on) = auto-injected into EVERY chat session automatically.
// - Skills are referenced inside GEMINI.md via path so user can invoke them manually.
// - Our skills stay safely in .agent-boost/skills/ (our own folder).
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { writeText, ensureDir, PKG_ROOT, listFiles } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';

export async function writeAntigravity({ repoRoot, config }) {
  const agentMd = await loadAgentTemplate(config);
  const mode = config.mode || 'both';

  // Copy skills to our own safe folder (not .agent/ which belongs to Antigravity IDE)
  const skillsDst = path.join(repoRoot, '.agent-boost', 'skills');
  const skillsSrc = path.join(PKG_ROOT, 'templates', 'skills');
  await ensureDir(skillsDst);
  const skillNames = [];
  for (const f of await listFiles(skillsSrc, ['.md'])) {
    const base = path.basename(f, '.md');
    await fs.copyFile(f, path.join(skillsDst, path.basename(f)));
    skillNames.push(base);
  }

  // Copy commands to our own safe folder
  const commandsDst = path.join(repoRoot, '.agent-boost', 'commands');
  const commandsSrc = path.join(PKG_ROOT, 'templates', 'commands');
  await ensureDir(commandsDst);
  for (const f of await listFiles(commandsSrc, ['.md'])) {
    await fs.copyFile(f, path.join(commandsDst, path.basename(f)));
  }

  // GEMINI.md — this is the ONLY file Antigravity auto-reads every chat (trigger: always_on).
  // We embed skill references inside it so the agent knows where to find them.
  const modeHeader = buildModeHeader(mode);
  const skillsSection = buildSkillsSection(skillNames);

  const geminiBody = [
    '---',
    'trigger: always_on',
    '---',
    '',
    modeHeader,
    '',
    agentMd,
    '',
    skillsSection,
  ].join('\n');

  await writeText(path.join(repoRoot, 'GEMINI.md'), geminiBody);
}

function buildModeHeader(mode) {
  const labels = {
    boost: '> **Mode: 🚀 BOOST** — Quality mode active. Flash Enhancer ON. Token saving OFF.',
    saver: '> **Mode: 💰 SAVER** — Token saving active. Caveman + compression ON. Enhancer OFF.',
    both:  '> **Mode: ⚡ BOTH** — All features active. Quality enhancement + token saving ON.',
  };
  return labels[mode] || labels.both;
}

function buildSkillsSection(skillNames) {
  if (!skillNames.length) return '';
  const list = skillNames.map((s) => `- \`${s}\` — read \`.agent-boost/skills/${s}.md\``).join('\n');
  return `## Available Skills\n\nWhen a task matches, read the skill file and apply its instructions:\n\n${list}\n`;
}
