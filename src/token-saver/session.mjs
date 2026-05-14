// Session manager — re-injects caveman compression instructions at session start.
// Solves the "model drifts and ignores AGENTS.md" problem by making it a ritual.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildCavemanInstruction, getCurrentLevel, CAVEMAN_LEVELS } from './output-compressor.mjs';
import { loadLedger, saveLedger } from './ledger.mjs';

// ─── Session Header ───────────────────────────────────────────────────────────

export async function printSessionHeader(repoRoot, opts = {}) {
  const level = opts.level || await getCurrentLevel(repoRoot);
  const levelInfo = CAVEMAN_LEVELS[level];
  const instruction = buildCavemanInstruction(level);

  // Load anatomy summary
  let anatomySummary = '';
  try {
    const anatomyPath = path.join(repoRoot, '.agent-boost', 'anatomy.md');
    const raw = await fs.readFile(anatomyPath, 'utf8');
    const lines = raw.split('\n');
    const header = lines.slice(0, 4).join('\n');
    const fileCount = (raw.match(/^- `/gm) || []).length;
    anatomySummary = `  📂 ${fileCount} files indexed in .agent-boost/anatomy.md`;
  } catch {
    anatomySummary = '  📂 Run: token-flux scan  (to index files)';
  }

  // Load cerebrum summary
  let cerebrumSummary = '';
  try {
    const cerebrumPath = path.join(repoRoot, '.agent-boost', 'cerebrum.md');
    const raw = await fs.readFile(cerebrumPath, 'utf8');
    const mistakes = (raw.match(/^- \d{4}-\d{2}-\d{2}:/gm) || []).length;
    cerebrumSummary = `  🧠 ${mistakes} known mistake(s) in .agent-boost/cerebrum.md`;
  } catch {
    cerebrumSummary = '  🧠 No cerebrum.md yet';
  }

  const banner = `
╔══════════════════════════════════════════════════════════════╗
║  ⚡ token-flux — Session Compression Active             ║
║  🪨 Caveman Mode: ${levelInfo.name.padEnd(8)} (${levelInfo.savingPct}% output reduction)       ║
╠══════════════════════════════════════════════════════════════╣
║  PASTE THIS INTO YOUR AI SYSTEM PROMPT NOW:                  ║
╚══════════════════════════════════════════════════════════════╝

${instruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Session Intelligence:
${anatomySummary}
${cerebrumSummary}
  🔒 Rule: NEVER read a file that's in anatomy.md — use signatures
  🔒 Rule: ALWAYS use: token-flux proxy "<command>"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  console.log(banner);
  await logSessionStart(repoRoot);
  return { level, instruction };
}

// ─── Session Tracking ─────────────────────────────────────────────────────────

export async function logSessionStart(repoRoot) {
  const ledger = await loadLedger(repoRoot);
  if (!ledger.lifetime.sessions) ledger.lifetime.sessions = 0;
  ledger.lifetime.sessions += 1;

  const today = new Date().toISOString().slice(0, 10);
  if (ledger.today.date !== today) {
    ledger.today = { date: today, savedTokens: 0, prompts: 0 };
  }

  await saveLedger(repoRoot, ledger);
  return ledger;
}

// ─── Generate copyable system prompt block ────────────────────────────────────

export function buildSystemPromptBlock(repoRoot, level = 'ultra') {
  const instruction = buildCavemanInstruction(level);
  const relBoost = path.relative(process.cwd(), path.join(repoRoot, '.agent-boost'));

  return `${instruction}

BEFORE reading any source file:
1. Check .agent-boost/anatomy.md first — it has signatures for every file
2. Check .agent-boost/cerebrum.md — it has known mistakes to avoid
3. NEVER read a file listed in anatomy.md (use the signatures there)
4. For ANY terminal command, use: token-flux proxy "<command>"
5. After a mistake is found, append it to .agent-boost/cerebrum.md`;
}
