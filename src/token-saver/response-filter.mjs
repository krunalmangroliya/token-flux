// Response filter — strips filler from AI responses before they bloat the context window.
// Strategy 4: Compresses the AI's OWN output, not just terminal commands.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stripResponseFiller } from './output-compressor.mjs';
import { logCompression } from './ledger.mjs';

// ─── Claude Code Hook Registration ───────────────────────────────────────────

/**
 * Writes a PostToolUse hook into .claude/settings.json that filters AI output.
 * @param {string} repoRoot
 */
export async function registerClaudeResponseHook(repoRoot) {
  const claudeDir  = path.join(repoRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  await fs.mkdir(claudeDir, { recursive: true });

  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  } catch { /* fresh */ }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  const hookEntry = {
    matcher: 'Task',
    hooks: [{
      type: 'command',
      command: `token-flux response-filter --auto`,
    }],
  };

  const alreadyInstalled = settings.hooks.PostToolUse.some(
    h => JSON.stringify(h).includes('token-flux')
  );

  if (!alreadyInstalled) {
    settings.hooks.PostToolUse.push(hookEntry);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    return '  ✅ claude-code: Response filter hook registered in .claude/settings.json';
  }
  return '  ⏭️  claude-code: Response filter hook already installed';
}

// ─── Core Filter Logic ────────────────────────────────────────────────────────

/**
 * Filter a single AI response — strips filler, measures savings.
 * @param {string} text - Raw AI response
 * @returns {{ filtered: string, originalTokens: number, savedTokens: number, savedPercent: number }}
 */
export function filterResponse(text) {
  if (!text || !text.trim()) return { filtered: text, originalTokens: 0, savedTokens: 0, savedPercent: 0 };

  const originalTokens = Math.ceil(text.length / 4);
  const filtered = stripResponseFiller(text);
  const filteredTokens = Math.ceil(filtered.length / 4);
  const savedTokens = Math.max(0, originalTokens - filteredTokens);
  const savedPercent = originalTokens > 0 ? Math.round((savedTokens / originalTokens) * 100) : 0;

  return { filtered, originalTokens, filteredTokens, savedTokens, savedPercent };
}

/**
 * Filter response from stdin and log savings to ledger.
 * Used when called from a Claude Code hook or piped input.
 * @param {string} repoRoot
 */
export async function filterFromStdin(repoRoot) {
  const input = await readStdin();
  if (!input) return;

  const result = filterResponse(input);

  // Always print the filtered result (hook or pipe consumer gets this)
  process.stdout.write(result.filtered);

  // Log savings if meaningful
  if (result.savedTokens > 5) {
    await logCompression(repoRoot, { savedTokens: result.savedTokens });
    process.stderr.write(
      `\n[⚡ token-flux response-filter: saved ${result.savedTokens} tokens (${result.savedPercent}%)]\n`
    );
  }
}

/**
 * Filter a text string and print result + stats to console.
 * Used for the CLI `response-filter` command.
 * @param {string} text
 * @param {string} repoRoot
 */
export async function filterAndReport(text, repoRoot) {
  const result = filterResponse(text);

  console.log('\n⚡ token-flux — Response Filter\n');
  console.log('─'.repeat(50));
  console.log(result.filtered || '[Empty after filter]');
  console.log('─'.repeat(50));
  console.log('\n📊 Stats:');
  console.log(`   Before : ${result.originalTokens} tokens`);
  console.log(`   After  : ${result.filteredTokens} tokens`);
  console.log(`   Saved  : ${result.savedTokens} tokens (${result.savedPercent}%)`);

  if (result.savedTokens > 0) {
    await logCompression(repoRoot, { savedTokens: result.savedTokens });
  }

  return result;
}

// ─── Stdin helper ─────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}
