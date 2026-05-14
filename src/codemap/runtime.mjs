// Runtime enrichment — ingests coverage + call-count signals into existing codemap entries.
// Best-effort: if no coverage artifact exists, annotate each symbol as `isUntested` so the agent
// at least sees the warning.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exists, readText } from '../utils.mjs';

export async function ingestRuntime(repoRoot, entries) {
  const coverage = await loadAnyCoverage(repoRoot);
  const callerMap = buildCallerIndex(entries);

  for (const entry of entries) {
    const absPath = path.resolve(repoRoot, entry.path);
    const covForFile = coverage?.filesByPath?.get(normalizeCoveragePath(absPath)) || null;

    for (const sym of entry.exports || []) {
      const callers = callerMap.get(sym.name) || [];
      sym.callers = callers.filter((c) => c !== entry.path);
      if (!covForFile) {
        if (sym.callCount == null) sym.isUntested = true;
      } else {
        const fn = covForFile.fnMap && findFnByName(covForFile, sym.name);
        if (fn) {
          const hits = covForFile.f?.[fn.id] ?? 0;
          sym.callCount = hits;
          if (hits === 0) sym.isUntested = true;
        } else {
          sym.isUntested = true;
        }
        if (covForFile.linePct != null) sym.coverage = covForFile.linePct;
      }
      if ((sym.callers || []).length === 0 && (sym.callCount ?? 0) === 0) sym.isDead = true;
    }
  }
  return entries;
}

function buildCallerIndex(entries) {
  // Very rough: for each file, scan its raw imports + identifier tokens.
  // The static extractor already gave us imports; we pair imports with known exported names to suggest callers.
  const nameToCallers = new Map();
  const knownNames = new Set();
  for (const e of entries) for (const s of e.exports || []) knownNames.add(s.name);

  for (const e of entries) {
    const text = e._raw || null;
    // We don't keep raw text; approximate via exports + imports membership.
    // Real caller detection will come via AST in a later iteration. For now, rely on imports.
    for (const imp of e.imports || []) {
      // If the imported module resolves within the repo, attribute its exports as potentially called.
      const candidate = e.path.split('/').slice(0, -1).concat(imp.replace(/^\.\//, '')).join('/');
      for (const other of entries) {
        if (other.path.startsWith(candidate) || other.path.replace(/\.(ts|js|mjs|cjs|py|go|rs|cs)$/, '') === candidate) {
          for (const sym of other.exports || []) {
            if (!nameToCallers.has(sym.name)) nameToCallers.set(sym.name, []);
            nameToCallers.get(sym.name).push(e.path);
          }
        }
      }
    }
  }
  return nameToCallers;
}

async function loadAnyCoverage(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'coverage', 'coverage-final.json'),       // istanbul/jest/nyc
    path.join(repoRoot, 'coverage', 'lcov-report', 'index.html'), // coverage present but no JSON — signal only
    path.join(repoRoot, '.coverage'),                              // python coverage.py
  ];
  for (const c of candidates) {
    if (await exists(c)) {
      if (c.endsWith('.json')) return parseIstanbul(await readText(c));
      return { filesByPath: new Map() }; // existence-only signal
    }
  }
  return null;
}

function parseIstanbul(raw) {
  const data = JSON.parse(raw);
  const filesByPath = new Map();
  for (const [absPath, rec] of Object.entries(data)) {
    const totalStatements = Object.keys(rec.statementMap || {}).length;
    const coveredStatements = totalStatements === 0 ? 0 : Object.values(rec.s || {}).filter((n) => n > 0).length;
    const linePct = totalStatements === 0 ? 100 : Math.round((100 * coveredStatements) / totalStatements);
    filesByPath.set(normalizeCoveragePath(absPath), {
      fnMap: rec.fnMap,
      f: rec.f,
      linePct,
    });
  }
  return { filesByPath };
}

function findFnByName(fileRec, name) {
  for (const [id, fn] of Object.entries(fileRec.fnMap || {})) {
    if (fn.name === name) return { id, ...fn };
  }
  return null;
}

function normalizeCoveragePath(p) {
  return p.split(path.sep).join('/').toLowerCase();
}
