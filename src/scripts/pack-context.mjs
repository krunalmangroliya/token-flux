#!/usr/bin/env node
// .agent-boost/scripts/pack-context.mjs <topic>
// Emits a compact block of source relevant to <topic>. Also appends the consulted
// paths to the current task's read-log so the pre-edit gate will let you edit them.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadAgentBoost } from './_load.mjs';

const topic = process.argv.slice(2).join(' ').trim();
if (!topic) {
  console.error('usage: node ./.agent-boost/scripts/pack-context.mjs <topic>');
  process.exit(2);
}

const { repoRoot } = await loadAgentBoost();
const codemapPath = path.join(repoRoot, '.agent-boost', 'codemap.json');
const codemap = JSON.parse(await fs.readFile(codemapPath, 'utf8'));

const tokens = tokenize(topic);
const scored = codemap.entries
  .map((e) => ({ entry: e, score: score(e, tokens) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12);

console.log(`# Context pack for: ${topic}\n`);
if (scored.length === 0) {
  console.log('_No files matched. Broaden your topic or rebuild the codemap._');
  process.exit(0);
}

const readLogPath = await resolveReadLog(repoRoot);
for (const { entry } of scored) {
  console.log(`## ${entry.path}`);
  if (entry.purpose) console.log(`_${entry.purpose}_`);
  if (entry.exports?.length) {
    console.log('```');
    for (const s of entry.exports.slice(0, 12)) console.log(s.signature);
    console.log('```');
  }
  if (readLogPath) {
    await appendLine(readLogPath, entry.path);
  }
  console.log('');
}
if (readLogPath) console.log(`_(paths appended to ${path.relative(repoRoot, readLogPath)})_`);

async function resolveReadLog(root) {
  const tasksDir = path.join(root, '.agent-boost', 'tasks');
  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (dirs.length === 0) return null;
    let best = null;
    for (const name of dirs) {
      const stat = await fs.stat(path.join(tasksDir, name));
      if (!best || stat.mtimeMs > best.mtimeMs) best = { name, mtimeMs: stat.mtimeMs };
    }
    if (!best) return null;
    const p = path.join(tasksDir, best.name, 'read-log');
    await fs.mkdir(path.dirname(p), { recursive: true });
    return p;
  } catch {
    return null;
  }
}

async function appendLine(p, line) {
  let current = '';
  try { current = await fs.readFile(p, 'utf8'); } catch { current = ''; }
  if (current.split('\n').some((l) => l.trim() === line)) return;
  await fs.writeFile(p, (current.endsWith('\n') || !current ? current : current + '\n') + line + '\n', 'utf8');
}

function tokenize(s) {
  return new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9_./-]*/g) || []).filter((t) => t.length >= 3));
}

function score(entry, tokens) {
  let s = 0;
  const pathTokens = tokenize(entry.path).values();
  for (const t of pathTokens) if (tokens.has(t)) s += 3;
  for (const exp of entry.exports || []) {
    const nt = tokenize(exp.name);
    for (const t of nt) if (tokens.has(t)) s += 2;
  }
  if (entry.purpose) {
    const pt = tokenize(entry.purpose);
    for (const t of pt) if (tokens.has(t)) s += 1;
  }
  return s;
}
