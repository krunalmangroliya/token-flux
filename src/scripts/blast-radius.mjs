#!/usr/bin/env node
// .agent-boost/scripts/blast-radius.mjs <file>
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadAgentBoost } from './_load.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node ./.agent-boost/scripts/blast-radius.mjs <file>');
  process.exit(2);
}

const { ab, repoRoot } = await loadAgentBoost();
const result = await ab.computeBlastRadius({ repoRoot, file });

console.log(`Editing ${result.file} will affect:\n`);
console.log(`  Direct importers (${result.direct.length}):`);
for (const p of result.direct.slice(0, 20)) console.log(`    ${p}`);
if (result.direct.length > 20) console.log(`    … and ${result.direct.length - 20} more`);

console.log(`\n  Transitive (${result.transitive.length}):`);
for (const p of result.transitive.slice(0, 20)) console.log(`    ${p}`);
if (result.transitive.length > 20) console.log(`    … and ${result.transitive.length - 20} more`);

console.log(`\n  Co-change history:`);
for (const c of result.coChange) console.log(`    ${c.file}  — changed together ${c.count} time(s)`);
if (result.coChange.length === 0) console.log('    (none — file is new or not in git)');

console.log(`\n  Risk score: ${result.riskScore} / 10`);
if (result.reasons.length) console.log(`    reasons: ${result.reasons.join(', ')}`);

// Append to the current task's blast-radius-reviewed file, if one exists.
await markReviewed(repoRoot, result.file);

async function markReviewed(root, f) {
  const tasksDir = path.join(root, '.agent-boost', 'tasks');
  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (dirs.length === 0) return;
    let best = null;
    for (const name of dirs) {
      const stat = await fs.stat(path.join(tasksDir, name));
      if (!best || stat.mtimeMs > best.mtimeMs) best = { name, mtimeMs: stat.mtimeMs };
    }
    if (!best) return;
    const p = path.join(tasksDir, best.name, 'blast-radius-reviewed');
    let current = '';
    try { current = await fs.readFile(p, 'utf8'); } catch { /* empty */ }
    if (current.split('\n').some((l) => l.trim() === f)) return;
    await fs.writeFile(p, (current.endsWith('\n') || !current ? current : current + '\n') + f + '\n', 'utf8');
    console.log(`\n_(marked reviewed: ${path.relative(root, p)})_`);
  } catch {
    /* ignore */
  }
}

