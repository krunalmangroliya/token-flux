// Constraint mining — scans test files for known input/output pairs and `toThrow` declarations,
// then attaches them to the corresponding code-map entries as preconditions / throws.
import path from 'node:path';
import { listFiles, readText } from '../utils.mjs';

const TEST_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /(^|[\\/])test[_-].*\.py$/i,
  /(^|[\\/]).+_test\.(go|py)$/i,
  /(^|[\\/])tests?[\\/].+\.(py|ts|js|go|rs)$/i,
];

export async function mineConstraints(repoRoot, entries) {
  const byName = indexByExportName(entries);
  const testFiles = (await listFiles(repoRoot, null)).filter((p) => TEST_PATTERNS.some((re) => re.test(p)));
  for (const tf of testFiles) {
    let text;
    try {
      text = await readText(tf);
    } catch {
      continue;
    }

    // toThrow(SomeError) / pytest.raises(SomeError) / assert.Error
    const throwRe = /(?:toThrow|toThrowError)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)?/g;
    let m;
    while ((m = throwRe.exec(text))) {
      if (!m[1]) continue;
      attachNearbyCallers(byName, text, m.index, (sym) => {
        sym.throws = uniqPush(sym.throws || [], m[1]);
      });
    }
    const pyRaisesRe = /pytest\.raises\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((m = pyRaisesRe.exec(text))) {
      attachNearbyCallers(byName, text, m.index, (sym) => {
        sym.throws = uniqPush(sym.throws || [], m[1]);
      });
    }

    // expect(x).toBe(y) / assert x == y — crude, but we record "has known input/output pair".
    const assertRe = /\b(?:expect|assert)\s*[\s(]/g;
    while ((m = assertRe.exec(text))) {
      attachNearbyCallers(byName, text, m.index, (sym) => {
        sym.assertionsSeen = (sym.assertionsSeen || 0) + 1;
      });
    }
  }

  // Source-level preconditions: lines like `if (!x) throw` at function entry.
  for (const entry of entries) {
    // Heuristic: we only have signatures, not bodies, so scan raw file.
    try {
      const abs = path.resolve(repoRoot, entry.path);
      const text = await readText(abs);
      for (const sym of entry.exports || []) {
        const pre = extractPreconditions(text, sym.name);
        if (pre.length) sym.preconditions = pre;
      }
    } catch {
      // ignore unreadable files
    }
  }
  return entries;
}

function indexByExportName(entries) {
  const idx = new Map();
  for (const e of entries) {
    for (const sym of e.exports || []) {
      if (!idx.has(sym.name)) idx.set(sym.name, []);
      idx.get(sym.name).push(sym);
    }
  }
  return idx;
}

function attachNearbyCallers(byName, text, idx, fn) {
  // Look at the 400 chars before the match — find any identifier that matches a known export name.
  const window = text.slice(Math.max(0, idx - 400), idx);
  const tokens = new Set(window.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);
  for (const t of tokens) {
    const syms = byName.get(t);
    if (syms) syms.forEach(fn);
  }
}

function extractPreconditions(text, fnName) {
  const pre = [];
  const re = new RegExp(`\\b(?:function\\s+${escape(fnName)}|def\\s+${escape(fnName)}|${escape(fnName)}\\s*[:=]\\s*(?:async\\s*)?(?:function|\\()).{0,400}`, 's');
  const m = re.exec(text);
  if (!m) return pre;
  const body = m[0];
  const guardRe = /\b(?:if\s*\(([^)]+)\)\s*(?:throw|return|raise)|assert\s+([^\n,;]+))/g;
  let g;
  while ((g = guardRe.exec(body))) {
    const cond = (g[1] || g[2] || '').trim();
    if (cond) pre.push(cond.slice(0, 80));
    if (pre.length >= 4) break;
  }
  return pre;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqPush(arr, v) {
  if (!arr.includes(v)) arr.push(v);
  return arr;
}
