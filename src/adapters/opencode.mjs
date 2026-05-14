// OpenCode adapter — writes AGENT.md + opencode.json with mode-aware rules.
// opencode.json format: https://opencode.ai/docs/configuration
import path from 'node:path';
import { readText, writeText, exists } from '../utils.mjs';
import { loadAgentTemplate } from './index.mjs';

export async function writeOpenCode({ repoRoot, config }) {
  const mode = config.mode || 'both';

  // Write AGENT.md with mode-specific content
  const agentMd = await loadAgentTemplate(config);
  await writeText(path.join(repoRoot, 'AGENT.md'), agentMd);

  // Read or create opencode.json
  const configPath = path.join(repoRoot, 'opencode.json');
  let current = {};
  if (await exists(configPath)) {
    try {
      current = JSON.parse(await readText(configPath));
    } catch {
      current = {};
    }
  }

  // $schema for editor autocomplete
  current.$schema = current.$schema || 'https://opencode.ai/config.json';

  // instructions — files opencode reads as system context
  current.instructions = current.instructions || [];
  for (const file of ['AGENT.md', 'CODEMAP.md', 'LESSONS.md']) {
    if (!current.instructions.includes(file)) current.instructions.push(file);
  }

  // rules — inline system prompt injected before every session
  current.rules = buildRules(mode, config);

  // model — set a sensible default based on mode if not already configured
  if (!current.model) {
    current.model = mode === 'saver' ? 'anthropic/claude-opus-4-5' : 'google/gemini-2.0-flash';
  }

  // autoshare — off by default for privacy
  current.autoshare = current.autoshare ?? false;

  await writeText(configPath, JSON.stringify(current, null, 2) + '\n');
}

function buildRules(mode, config) {
  const base = [
    'Read AGENT.md before starting any task.',
    'Read CODEMAP.md to understand the codebase structure.',
    'Read LESSONS.md and apply any relevant lessons before writing code.',
    'Run `node ./.agent-boost/scripts/verify.mjs` before marking a task done.',
  ];

  if (mode === 'boost' || mode === 'both') {
    base.push(
      'Think step by step before writing code. State your reasoning explicitly.',
      'After writing code, self-critique: Is this correct? Is this complete? Can I simplify?',
      'Never truncate output — write complete, correct implementations.',
    );
  }

  if (mode === 'saver' || mode === 'both') {
    const caveman = config.cavemanLevel || 'full';
    const styles = {
      lite: 'Be concise. Skip filler phrases. Give answers directly.',
      full: 'Caveman mode: skip filler, short sentences, no pleasantries. Format: problem → fix → done.',
      ultra: 'Ultra-compressed: max info per token, fragments OK, no filler ever.',
    };
    base.push(
      styles[caveman] || styles.full,
      'Prepend `token-flux proxy` to any shell command that produces long output.',
    );
  }

  return base.join('\n');
}
