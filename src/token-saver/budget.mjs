// Context budget estimator — shows token cost of opening specific files.
// Strategy 6: Gives AI (and user) a concrete reason to use anatomy.md instead of raw files.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_BUDGET = 20_000; // tokens

// ─── Load anatomy index ───────────────────────────────────────────────────────

async function loadAnatomyIndex(repoRoot) {
  const anatomyPath = path.join(repoRoot, '.agent-boost', 'anatomy.md');
  try {
    const raw = await fs.readFile(anatomyPath, 'utf8');
    return parseAnatomy(raw);
  } catch {
    return null;
  }
}

/**
 * Parse anatomy.md into a map of { relPath → tokenCount }.
 * @param {string} raw
 * @returns {Map<string, number>}
 */
function parseAnatomy(raw) {
  const index = new Map();
  const lineRe = /^- `([^`]+)`[^~]*~(\d+) tok\)/;
  for (const line of raw.split('\n')) {
    const m = line.match(lineRe);
    if (m) {
      index.set(m[1], parseInt(m[2], 10));
    }
  }
  return index;
}

// ─── Resolve files against anatomy index ─────────────────────────────────────

function resolveFiles(files, index, repoRoot) {
  const resolved = [];
  const missing = [];

  for (const file of files) {
    // Try exact relative path first, then basename match
    const rel = path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
    if (index.has(rel)) {
      resolved.push({ file: rel, tokens: index.get(rel) });
    } else {
      // Basename fallback
      let found = false;
      for (const [key, tok] of index.entries()) {
        if (path.basename(key) === path.basename(file)) {
          resolved.push({ file: key, tokens: tok });
          found = true;
          break;
        }
      }
      if (!found) missing.push(file);
    }
  }

  return { resolved, missing };
}

// ─── Budget bar renderer ──────────────────────────────────────────────────────

function renderBar(used, total, width = 30) {
  const pct = Math.min(used / total, 1);
  const filled = Math.round(pct * width);
  const color = pct > 0.8 ? '🔴' : pct > 0.5 ? '🟡' : '🟢';
  return color + ' [' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

// ─── Main budget function ─────────────────────────────────────────────────────

/**
 * Estimate the token budget impact of opening specific files.
 * @param {string} repoRoot
 * @param {string[]} files - List of file paths (absolute or relative)
 * @param {{ budget?: number, json?: boolean }} opts
 */
export async function checkBudget(repoRoot, files, opts = {}) {
  const budget = opts.budget || DEFAULT_BUDGET;
  const index = await loadAnatomyIndex(repoRoot);

  if (!index) {
    return {
      error: 'No anatomy.md found. Run: token-flux scan',
      totalTokens: 0,
      budget,
    };
  }

  const totalIndexedTokens = Array.from(index.values()).reduce((s, t) => s + t, 0);

  if (files.length === 0) {
    // No files given — show full project budget summary
    return {
      mode: 'summary',
      totalIndexedTokens,
      budget,
      filesIndexed: index.size,
      pctOfBudget: Math.round((totalIndexedTokens / budget) * 100),
      recommendation: totalIndexedTokens > budget
        ? `Full project (${totalIndexedTokens.toLocaleString()} tok) exceeds budget. Use anatomy.md to choose targeted source files.`
        : `Full project fits in ${budget.toLocaleString()} token budget.`,
    };
  }

  const { resolved, missing } = resolveFiles(files, index, repoRoot);
  const totalTokens = resolved.reduce((s, f) => s + f.tokens, 0);
  const pctOfBudget = Math.round((totalTokens / budget) * 100);

  const recommendation = (() => {
    if (pctOfBudget > 80) return 'DANGER: High context cost. Narrow scope with anatomy.md, then open only required source.';
    if (pctOfBudget > 40) return 'CAUTION: Check anatomy.md first, then inspect the most relevant files.';
    return 'OK: Acceptable token cost. Open source if needed for correctness.';
  })();

  return {
    mode: 'files',
    resolved,
    missing,
    totalTokens,
    budget,
    pctOfBudget,
    bar: renderBar(totalTokens, budget),
    recommendation,
  };
}

/**
 * Format and print the budget result to stdout.
 * @param {object} result - Result from checkBudget()
 */
export function printBudget(result) {
  if (result.error) {
    console.log(`\n⚠️  ${result.error}\n`);
    return;
  }

  if (result.mode === 'summary') {
    console.log(`\n⚡ token-flux — Context Budget Summary\n`);
    console.log(`  Project total : ~${result.totalIndexedTokens.toLocaleString()} tokens (${result.filesIndexed} files)`);
    console.log(`  Budget limit  : ${result.budget.toLocaleString()} tokens`);
    console.log(`  Usage         : ${renderBar(result.totalIndexedTokens, result.budget)} ${result.pctOfBudget}%`);
    console.log(`\n  ${result.recommendation}\n`);
    return;
  }

  console.log(`\n⚡ token-flux — Context Budget Check\n`);
  console.log(`  Files requested:`);
  for (const f of result.resolved) {
    console.log(`    ${f.file.padEnd(50)} ~${f.tokens.toLocaleString()} tok`);
  }
  if (result.missing.length > 0) {
    console.log(`\n  ⚠️  Not in anatomy.md (run scan first):`);
    for (const f of result.missing) {
      console.log(`    ${f}`);
    }
  }

  console.log(`\n  Total   : ~${result.totalTokens.toLocaleString()} tokens`);
  console.log(`  Budget  : ${result.budget.toLocaleString()} tokens`);
  console.log(`  Usage   : ${result.bar} ${result.pctOfBudget}%`);
  console.log(`\n  ${result.recommendation}\n`);
}
