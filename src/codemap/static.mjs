// Static extraction for the code map.
// TypeScript/JavaScript: uses the `typescript` compiler package (pure JS, no native deps).
// Python / Go / Rust / C# / other: regex-based extraction. Good enough for signatures,
// imports, exports, and side-effect markers — the four things the map actually needs.
import path from 'node:path';
import ts from 'typescript';
import { listFiles, readText } from '../utils.mjs';

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const PY_EXT = new Set(['.py']);
const GO_EXT = new Set(['.go']);
const RS_EXT = new Set(['.rs']);
const CS_EXT = new Set(['.cs']);
const ALL_EXT = [...TS_EXT, ...JS_EXT, ...PY_EXT, ...GO_EXT, ...RS_EXT, ...CS_EXT];

const SIDE_EFFECT_PATTERNS = [
  /\bfs\.(read|write|append|rm|mkdir|unlink)/,
  /\bfetch\s*\(/,
  /\bhttps?\.(get|post|request)/,
  /\baxios\./,
  /\bnew\s+XMLHttpRequest/,
  /\bdb\.(query|execute|insert|update|delete)/,
  /\bexec\s*\(|\bspawn\s*\(|\bexecSync\s*\(|\bsubprocess\./,
  /\bopen\s*\(/,                         // python
  /\brequests\.(get|post|put|delete)/,    // python
  /\bos\.(system|popen|remove|rename)/,   // python
];

export async function extractStatic(repoRoot) {
  const files = await listFiles(repoRoot, ALL_EXT);
  const entries = [];
  for (const abs of files) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    const ext = path.extname(abs);
    const text = await readText(abs);
    let entry;
    if (TS_EXT.has(ext) || JS_EXT.has(ext)) entry = extractTs(rel, text, ext);
    else if (PY_EXT.has(ext)) entry = extractPy(rel, text);
    else if (GO_EXT.has(ext)) entry = extractGo(rel, text);
    else if (RS_EXT.has(ext)) entry = extractRs(rel, text);
    else if (CS_EXT.has(ext)) entry = extractCs(rel, text);
    if (entry) entries.push(entry);
  }
  return entries;
}

function extractTs(relPath, text, ext) {
  const scriptKind =
    ext === '.tsx' ? ts.ScriptKind.TSX :
    ext === '.jsx' ? ts.ScriptKind.JSX :
    TS_EXT.has(ext) ? ts.ScriptKind.TS :
    ts.ScriptKind.JS;
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, scriptKind);

  const imports = [];
  const exportsArr = [];
  let complexity = 1;

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) imports.push(spec.text);
    }
    // Export-level declarations
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (isExported && ts.isFunctionDeclaration(node) && node.name) {
      exportsArr.push({ kind: 'function', name: node.name.text, signature: functionSignature(node, sf) });
    } else if (isExported && ts.isClassDeclaration(node) && node.name) {
      exportsArr.push({ kind: 'class', name: node.name.text, signature: `class ${node.name.text}` });
    } else if (isExported && ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          const sig = d.initializer && ts.isArrowFunction(d.initializer)
            ? arrowSignature(d.name.text, d.initializer, sf)
            : `const ${d.name.text}`;
          exportsArr.push({ kind: 'const', name: d.name.text, signature: sig });
        }
      }
    } else if (isExported && ts.isInterfaceDeclaration(node)) {
      exportsArr.push({ kind: 'interface', name: node.name.text, signature: `interface ${node.name.text}` });
    } else if (isExported && ts.isTypeAliasDeclaration(node)) {
      exportsArr.push({ kind: 'type', name: node.name.text, signature: `type ${node.name.text}` });
    } else if (isDefault && ts.isExportAssignment(node)) {
      exportsArr.push({ kind: 'default', name: 'default', signature: 'export default …' });
    }

    // Cyclomatic-ish complexity: branches add 1.
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.CatchClause:
        complexity += 1;
        break;
      default:
        break;
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  const sideEffects = extractSideEffects(text);
  const purpose = inferPurpose(text, exportsArr);

  return {
    path: relPath,
    purpose,
    loc: text.split('\n').length,
    complexity,
    imports: uniq(imports),
    exports: exportsArr,
    sideEffects,
  };
}

function functionSignature(node, sf) {
  const name = node.name?.text || 'anonymous';
  const params = node.parameters.map((p) => paramText(p, sf)).join(', ');
  const ret = node.type ? `: ${node.type.getText(sf)}` : '';
  return `function ${name}(${params})${ret}`;
}

function arrowSignature(name, arrow, sf) {
  const params = arrow.parameters.map((p) => paramText(p, sf)).join(', ');
  const ret = arrow.type ? `: ${arrow.type.getText(sf)}` : '';
  return `const ${name} = (${params})${ret} => …`;
}

function paramText(p, sf) {
  try {
    return p.getText(sf);
  } catch {
    return p.name?.getText?.(sf) || '?';
  }
}

function extractPy(relPath, text) {
  const imports = [];
  const exports = [];
  for (const line of text.split('\n')) {
    const imp = /^\s*(?:from\s+([\w.]+)\s+import\s+|import\s+([\w.,\s]+))/.exec(line);
    if (imp) imports.push(imp[1] || imp[2].split(',')[0].trim());
    const fn = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/.exec(line);
    if (fn && !line.trimStart().startsWith('_')) {
      exports.push({
        kind: 'function',
        name: fn[1],
        signature: `def ${fn[1]}(${fn[2]})${fn[3] ? ` -> ${fn[3].trim()}` : ''}`,
      });
    }
    const cls = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?:/.exec(line);
    if (cls && !cls[1].startsWith('_')) {
      exports.push({
        kind: 'class',
        name: cls[1],
        signature: `class ${cls[1]}${cls[2] ? `(${cls[2]})` : ''}`,
      });
    }
  }
  return {
    path: relPath,
    purpose: inferPurposeFromDocstring(text) || inferPurpose(text, exports),
    loc: text.split('\n').length,
    complexity: countPyBranches(text),
    imports: uniq(imports),
    exports,
    sideEffects: extractSideEffects(text),
  };
}

function countPyBranches(text) {
  const m = text.match(/^\s*(if|elif|for|while|try|except)\b/gm);
  return 1 + (m ? m.length : 0);
}

function extractGo(relPath, text) {
  const imports = [];
  const exports = [];
  const importBlock = /import\s*\(\s*([\s\S]*?)\)/.exec(text);
  if (importBlock) {
    for (const l of importBlock[1].split('\n')) {
      const q = /"([^"]+)"/.exec(l);
      if (q) imports.push(q[1]);
    }
  }
  for (const line of text.split('\n')) {
    const fn = /^func\s+(?:\([^)]+\)\s+)?([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*([^{]*))?\s*\{?/.exec(line);
    if (fn) {
      exports.push({
        kind: 'function',
        name: fn[1],
        signature: `func ${fn[1]}(${fn[2]})${fn[3] ? ' ' + fn[3].trim() : ''}`.trim(),
      });
    }
    const t = /^type\s+([A-Z][A-Za-z0-9_]*)\s+(struct|interface)/.exec(line);
    if (t) exports.push({ kind: t[2], name: t[1], signature: `type ${t[1]} ${t[2]}` });
  }
  return {
    path: relPath,
    purpose: inferPurpose(text, exports),
    loc: text.split('\n').length,
    complexity: countGenericBranches(text),
    imports: uniq(imports),
    exports,
    sideEffects: extractSideEffects(text),
  };
}

function extractRs(relPath, text) {
  const imports = [];
  const exports = [];
  for (const line of text.split('\n')) {
    const use = /^\s*use\s+([\w:]+)/.exec(line);
    if (use) imports.push(use[1]);
    const fn = /^pub(?:\s*\([^)]*\))?\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{;]+))?/.exec(line);
    if (fn) {
      exports.push({
        kind: 'function',
        name: fn[1],
        signature: `fn ${fn[1]}(${fn[2]})${fn[3] ? ` -> ${fn[3].trim()}` : ''}`,
      });
    }
    const st = /^pub\s+struct\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (st) exports.push({ kind: 'struct', name: st[1], signature: `struct ${st[1]}` });
    const en = /^pub\s+enum\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (en) exports.push({ kind: 'enum', name: en[1], signature: `enum ${en[1]}` });
  }
  return {
    path: relPath,
    purpose: inferPurpose(text, exports),
    loc: text.split('\n').length,
    complexity: countGenericBranches(text),
    imports: uniq(imports),
    exports,
    sideEffects: extractSideEffects(text),
  };
}

function extractCs(relPath, text) {
  const imports = [];
  const exports = [];
  for (const line of text.split('\n')) {
    const using = /^\s*using\s+([\w.]+)\s*;/.exec(line);
    if (using) imports.push(using[1]);
    const cls = /^\s*public\s+(?:sealed\s+|static\s+|abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (cls) exports.push({ kind: 'class', name: cls[1], signature: `class ${cls[1]}` });
    const method = /^\s*public\s+(?:static\s+|virtual\s+|override\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_<>, ]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/.exec(line);
    if (method && method[2][0] === method[2][0].toUpperCase()) {
      exports.push({ kind: 'method', name: method[2], signature: `${method[1].trim()} ${method[2]}(${method[3]})` });
    }
  }
  return {
    path: relPath,
    purpose: inferPurpose(text, exports),
    loc: text.split('\n').length,
    complexity: countGenericBranches(text),
    imports: uniq(imports),
    exports,
    sideEffects: extractSideEffects(text),
  };
}

function countGenericBranches(text) {
  const m = text.match(/\b(if|for|while|switch|case|catch)\b/g);
  return 1 + (m ? m.length : 0);
}

function extractSideEffects(text) {
  const hits = new Set();
  for (const re of SIDE_EFFECT_PATTERNS) {
    const m = text.match(re);
    if (m) hits.add(m[0]);
  }
  return [...hits];
}

function inferPurpose(text, exports) {
  // Prefer a top-of-file block comment.
  const top = text.slice(0, 400);
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(top);
  if (block) {
    const line = block[1].replace(/^\s*\*\s?/gm, '').split('\n').find((l) => l.trim());
    if (line) return firstSentence(line);
  }
  const line1 = /^\s*(?:\/\/|#)\s*(.*)/m.exec(top);
  if (line1 && line1[1].trim()) return firstSentence(line1[1]);
  if (exports && exports.length) {
    const names = exports.slice(0, 3).map((e) => e.name).join(', ');
    return `exports ${names}`;
  }
  return undefined;
}

function inferPurposeFromDocstring(text) {
  const m = /^\s*"""([\s\S]*?)"""/m.exec(text);
  if (!m) return undefined;
  const first = m[1].split('\n').find((l) => l.trim());
  return first ? firstSentence(first.trim()) : undefined;
}

function firstSentence(s) {
  const trimmed = s.trim();
  const dot = trimmed.search(/[.!?](?:\s|$)/);
  return dot > 0 ? trimmed.slice(0, dot + 1) : trimmed.slice(0, 120);
}

function uniq(arr) {
  return [...new Set(arr)];
}
