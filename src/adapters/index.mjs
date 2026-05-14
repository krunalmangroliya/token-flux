// Adapter registry. Each adapter maps the universal package files to one agent runtime's native format.
import path from 'node:path';
import { readText, PKG_ROOT } from '../utils.mjs';
import { buildCavemanInstruction } from '../token-saver/output-compressor.mjs';

import { writeGeneric } from './generic.mjs';
import { writeClaudeCode } from './claude-code.mjs';
import { writeCursor } from './cursor.mjs';
import { writeCline } from './cline.mjs';
import { writeOpenCode } from './opencode.mjs';
import { writeAider } from './aider.mjs';
import { writeVscode } from './vscode.mjs';
import { writeAntigravity } from './antigravity.mjs';

const REGISTRY = {
  generic: writeGeneric,
  'claude-code': writeClaudeCode,
  cursor: writeCursor,
  cline: writeCline,
  opencode: writeOpenCode,
  aider: writeAider,
  vscode: writeVscode,
  antigravity: writeAntigravity,
};

export const ALL_ADAPTERS = Object.keys(REGISTRY);

export async function applyAdapter(name, ctx) {
  const fn = REGISTRY[name];
  if (!fn) throw new Error(`unknown adapter: ${name}`);
  return fn(ctx);
}

/**
 * Loads the correct AGENT.md template based on active mode (boost | saver | both).
 * Falls back to the generic AGENT.md for legacy configs with no mode set.
 * Injects token-saver rules when mode is 'saver' or 'both'.
 */
export async function loadAgentTemplate(config) {
  const mode = config.mode || 'both';
  const modeFile = path.join(PKG_ROOT, 'templates', `AGENT-${mode}.md`);
  const fallbackFile = path.join(PKG_ROOT, 'templates', 'AGENT.md');

  let agentMd;
  try {
    agentMd = await readText(modeFile);
  } catch {
    // Fallback for old installs or unknown mode
    agentMd = await readText(fallbackFile);
    if (config.tokenSaver) {
      const cavemanInstruction = buildCavemanInstruction(config.cavemanLevel);
      agentMd += `\n\n## Token Saver Rules\n\n`;
      agentMd += `- **Output Compression:** ${cavemanInstruction}\n`;
      agentMd += `- **Terminal Compression:** Whenever you need to run a shell command (especially tests, \`git log\`, \`git diff\`, or \`ls\`), you MUST prepend \`token-flux proxy\` to it. Example: \`token-flux proxy "npm run test"\`.\n`;
    }
  }

  return agentMd;
}

