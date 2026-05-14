// Blast radius — for a given file, compute direct importers, transitive importers, co-change pairs,
// and a single risk score 0–10.
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readJson, exists } from '../utils.mjs';

const execFileP = promisify(execFile);

/**
 * @param {Object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.file       relative or absolute
 * @returns {Promise<BlastRadius>}
 */
export async function computeBlastRadius({ repoRoot, file }) {
  const rel = path.isAbsolute(file) ? path.relative(repoRoot, file).split(path.sep).join('/') : file.split(path.sep).join('/');

  const codemapPath = path.join(repoRoot, '.agent-boost', 'codemap.json');
  if (!(await exists(codemapPath))) {
    throw new Error('no codemap found — run: node ./.agent-boost/scripts/build-codemap.mjs');
  }
  const codemap = await readJson(codemapPath);
  const entries = codemap.entries;

  const direct = [];
  for (const e of entries) {
    for (const imp of e.imports || []) {
      if (importResolvesToFile(e.path, imp, rel)) {
        direct.push(e.path);
        break;
      }
    }
  }

  // Transitive: BFS from direct importers up to depth 3.
  const visited = new Set(direct);
  let frontier = direct;
  const transitive = new Set();
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) {
      for (const e of entries) {
        if (visited.has(e.path)) continue;
        for (const imp of e.imports || []) {
          if (importResolvesToFile(e.path, imp, f)) {
            visited.add(e.path);
            transitive.add(e.path);
            next.push(e.path);
            break;
          }
        }
      }
    }
    frontier = next;
  }

  const coChange = await gitCoChange(repoRoot, rel);

  const target = entries.find((e) => e.path === rel);
  const score = scoreRisk({
    direct: direct.length,
    transitive: transitive.size,
    coChange,
    target,
  });

  return {
    file: rel,
    direct: direct.sort(),
    transitive: [...transitive].sort(),
    coChange: coChange.slice(0, 10),
    riskScore: score.score,
    reasons: score.reasons,
  };
}

function importResolvesToFile(importerPath, importSpec, targetRel) {
  if (!importSpec) return false;

  // Strip extension from target for comparison.
  const targetNoExt = targetRel.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|cs)$/, '');

  // Relative import
  if (importSpec.startsWith('.')) {
    const base = importerPath.split('/').slice(0, -1).join('/');
    const resolved = normalizePath((base ? base + '/' : '') + importSpec);
    const resolvedNoExt = resolved.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|cs)$/, '');
    if (resolvedNoExt === targetNoExt) return true;
    if (resolvedNoExt + '/index' === targetNoExt) return true;
    return false;
  }
  // Bare / package import — only matches if target is inside a known package. We skip this for risk.
  return false;
}

function normalizePath(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

async function gitCoChange(repoRoot, relPath) {
  try {
    const { stdout } = await execFileP(
      'git',
      ['log', '--name-only', '--pretty=format:--COMMIT--', '--', relPath],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    const counts = new Map();
    const commits = stdout.split('--COMMIT--');
    for (const c of commits) {
      const files = c.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!files.includes(relPath)) continue;
      for (const f of files) {
        if (f === relPath) continue;
        counts.set(f, (counts.get(f) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([file, count]) => ({ file, count }));
  } catch {
    return []; // not a git repo, or no history
  }
}

function scoreRisk({ direct, transitive, coChange, target }) {
  let score = 0;
  const reasons = [];
  if (direct > 5) { score += 3; reasons.push('many direct importers'); }
  else if (direct > 2) { score += 2; reasons.push('several direct importers'); }
  else if (direct > 0) { score += 1; }
  if (transitive > 15) { score += 3; reasons.push('wide transitive reach'); }
  else if (transitive > 5) { score += 2; }
  if (coChange.length && coChange[0].count >= 5) { score += 2; reasons.push('frequent co-change'); }
  if (target && (target.loc || 0) > 300) { score += 1; reasons.push('large file'); }
  if (target && (target.complexity || 0) > 25) { score += 1; reasons.push('complex file'); }
  // Public-API heuristic: file name in common export positions.
  if (target && /\b(index|main|public|api)\b/i.test(target.path)) { score += 1; reasons.push('public API surface'); }
  return { score: Math.min(10, score), reasons };
}
