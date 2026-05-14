// Install command — auto-detects AI tools and injects token-saving hooks.
// Ported from token-shield's install system, adapted for token-flux.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── System instruction injected into AI tools ──────────────────────────────

const SYSTEM_INSTRUCTION = `
## token-flux — Token Saver Active 🪨

**Compression Rules (ALWAYS follow — no exceptions):**
1. Be concise. No filler. Give the answer directly.
2. For code tasks use: root cause -> fix with code -> verification -> result.
3. Run \`token-flux context "<task>"\` first when available. Otherwise read \`.agent-boost/anatomy.md\` to choose files. Then open the exact source files needed for correctness.
4. Read \`.agent-boost/cerebrum.md\` before a fix when it exists. Do not repeat listed mistakes.
5. Do not re-read large files unless they changed or a line-level check is needed. Prefer targeted searches.
6. For noisy commands (tests, git diff, build, ls), use \`token-flux proxy "<command>"\` when available. If unavailable, run the command normally and summarize the output.
7. Never compress away routes, API contracts, auth/security checks, tests, errors, file paths, or commands.
8. When user reports a mistake, append it to \`.agent-boost/cerebrum.md\`.
9. If anatomy.md or context-index.json is missing/stale, run \`token-flux scan\` when available; otherwise continue with normal repo inspection.
10. MCP-aware agents should call \`get_minimal_context\` before broader graph/search tools.
`.trim();


const MARKER = '<!-- token-flux -->';
const MARKER_HASH = '# token-flux';

// ─── Detect which AI tools are installed ─────────────────────────────────────

function detectTools(cwd) {
  const detected = [];
  const home = os.homedir();

  // Check synchronously by attempting to read — we'll convert below
  return detected;
}

async function detectToolsAsync(cwd) {
  const detected = [];
  const home = os.homedir();

  const checks = [
    { paths: [path.join(home, '.claude'), path.join(cwd, '.claude')], tool: 'claude-code' },
    { paths: [path.join(cwd, '.cursor'), path.join(cwd, '.cursorrules')], tool: 'cursor' },
    { paths: [path.join(cwd, '.windsurf')], tool: 'windsurf' },
    { paths: [path.join(cwd, 'GEMINI.md'), path.join(cwd, '.agent')], tool: 'antigravity' },
    { paths: [path.join(cwd, '.clinerules')], tool: 'cline' },
    { paths: [path.join(cwd, 'opencode.json')], tool: 'opencode' },
  ];

  for (const check of checks) {
    for (const p of check.paths) {
      try {
        await fs.access(p);
        detected.push(check.tool);
        break;
      } catch { /* not found */ }
    }
  }

  detected.push('generic');
  return [...new Set(detected)];
}

// ─── Installers for each AI tool ─────────────────────────────────────────────

const installers = {
  'claude-code': async (cwd) => {
    const claudeMd = path.join(cwd, 'CLAUDE.md');
    let content = '';
    try { content = await fs.readFile(claudeMd, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER)) return '  ⏭️  claude-code: Already installed';
    await fs.writeFile(claudeMd, content + `\n\n${MARKER}\n${SYSTEM_INSTRUCTION}\n${MARKER}\n`);
    return '  ✅ claude-code: Injected into CLAUDE.md';
  },

  'cursor': async (cwd) => {
    const rulesPath = path.join(cwd, '.cursorrules');
    let content = '';
    try { content = await fs.readFile(rulesPath, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER_HASH)) return '  ⏭️  cursor: Already installed';
    await fs.writeFile(rulesPath, content + `\n\n${MARKER_HASH}\n${SYSTEM_INSTRUCTION}\n`);
    return '  ✅ cursor: Injected into .cursorrules';
  },

  'windsurf': async (cwd) => {
    const dir = path.join(cwd, '.windsurf');
    await fs.mkdir(dir, { recursive: true });
    const rulesPath = path.join(dir, 'rules.md');
    let content = '';
    try { content = await fs.readFile(rulesPath, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER)) return '  ⏭️  windsurf: Already installed';
    await fs.writeFile(rulesPath, content + `\n\n${MARKER}\n${SYSTEM_INSTRUCTION}\n${MARKER}\n`);
    return '  ✅ windsurf: Injected into .windsurf/rules.md';
  },

  'antigravity': async (cwd) => {
    const geminiMd = path.join(cwd, 'GEMINI.md');
    let content = '';
    try { content = await fs.readFile(geminiMd, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER)) return '  ⏭️  antigravity: Already installed';
    await fs.writeFile(geminiMd, content + `\n\n${MARKER}\n${SYSTEM_INSTRUCTION}\n${MARKER}\n`);
    return '  ✅ antigravity: Injected into GEMINI.md';
  },

  'cline': async (cwd) => {
    const rulesPath = path.join(cwd, '.clinerules');
    let content = '';
    try { content = await fs.readFile(rulesPath, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER_HASH)) return '  ⏭️  cline: Already installed';
    await fs.writeFile(rulesPath, content + `\n\n${MARKER_HASH}\n${SYSTEM_INSTRUCTION}\n`);
    return '  ✅ cline: Injected into .clinerules';
  },

  'opencode': async (cwd) => {
    const ocPath = path.join(cwd, 'opencode.json');
    try {
      const raw = await fs.readFile(ocPath, 'utf8');
      const config = JSON.parse(raw);
      if (config.systemPrompt && config.systemPrompt.includes('token-flux')) {
        return '  ⏭️  opencode: Already installed';
      }
      config.systemPrompt = (config.systemPrompt || '') + '\n\n' + SYSTEM_INSTRUCTION;
      await fs.writeFile(ocPath, JSON.stringify(config, null, 2));
      return '  ✅ opencode: Injected into opencode.json systemPrompt';
    } catch {
      return '  ⏭️  opencode: No opencode.json found';
    }
  },

  'generic': async (cwd) => {
    const agentFile = path.join(cwd, 'AGENTS.md');
    let content = '';
    try { content = await fs.readFile(agentFile, 'utf8'); } catch { /* new file */ }
    if (content.includes(MARKER)) return '  ⏭️  generic: Already installed';
    await fs.writeFile(agentFile, content + `\n\n${MARKER}\n${SYSTEM_INSTRUCTION}\n${MARKER}\n`);
    return '  ✅ generic: Created AGENTS.md with compression rules';
  },
};

// ─── Shell alias generator ───────────────────────────────────────────────────

const SHELL_ALIASES = [
  'npm', 'npx', 'node', 'pytest', 'python', 'python3',
  'git', 'cargo', 'go', 'make', 'docker', 'yarn', 'pnpm',
  'jest', 'vitest', 'eslint', 'tsc', 'ruff', 'black',
];

export async function generateAliases(cwd) {
  const scriptsDir = path.join(cwd, '.agent-boost', 'scripts');
  await fs.mkdir(scriptsDir, { recursive: true });

  const lines = [
    '#!/usr/bin/env bash',
    '# token-flux — Token Saver Shell Aliases',
    '# Generated automatically. Source this file to activate proxy for all commands.',
    '# Usage: source .agent-boost/scripts/activate.sh',
    '',
    '# Detect token-flux location',
    'ABK=$(command -v token-flux 2>/dev/null || echo "npx token-flux")',
    '',
    '# Alias all common commands through the proxy',
    ...SHELL_ALIASES.map(cmd =>
      `alias ${cmd}='$ABK proxy ${cmd}'`
    ),
    '',
    'echo "⚡ token-flux proxy aliases active. All commands will compress output."',
    'echo "   To deactivate: unalias ' + SHELL_ALIASES.join(' ') + '"',
  ];

  const activatePath = path.join(scriptsDir, 'activate.sh');
  await fs.writeFile(activatePath, lines.join('\n') + '\n', { mode: 0o755 });

  // Also write a deactivate script
  const deactivateLines = [
    '#!/usr/bin/env bash',
    '# token-flux — Deactivate proxy aliases',
    `unalias ${SHELL_ALIASES.join(' ')} 2>/dev/null`,
    'echo "⚡ token-flux proxy aliases deactivated."',
  ];
  await fs.writeFile(
    path.join(scriptsDir, 'deactivate.sh'),
    deactivateLines.join('\n') + '\n',
    { mode: 0o755 }
  );

  return activatePath;
}

// ─── Main install function ───────────────────────────────────────────────────

export async function install(cwd, specificTool = null) {
  const results = [];

  let tools;
  if (specificTool) {
    if (!installers[specificTool]) {
      throw new Error(`Unknown tool: ${specificTool}. Valid: ${Object.keys(installers).join(', ')}`);
    }
    tools = [specificTool];
  } else {
    tools = await detectToolsAsync(cwd);
  }

  for (const tool of tools) {
    const result = await installers[tool](cwd);
    results.push({ tool, message: result });
  }

  // Generate shell aliases
  const activatePath = await generateAliases(cwd);
  results.push({
    tool: 'shell',
    message: `  ✅ shell: Proxy aliases written → ${path.relative(cwd, activatePath)}\n         Run: source .agent-boost/scripts/activate.sh`,
  });

  return { tools, results };
}

export { SYSTEM_INSTRUCTION, detectToolsAsync };
