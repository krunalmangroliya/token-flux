// Project scanner — generates anatomy.md (file index) and cerebrum.md (mistake log).
// Strategy 3: Now extracts real function signatures with inline comments + DO NOT READ annotations.
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Estimate tokens for a file (~4 chars ≈ 1 token) ────────────────────────

export async function estimateFileTokens(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return Math.ceil(stat.size / 4);
  } catch {
    return 0;
  }
}

// ─── Extract brief one-line description ──────────────────────────────────────

export async function extractFileDescription(filePath) {
  try {
    const buf = Buffer.alloc(800);
    const fh = await fs.open(filePath, 'r');
    await fh.read(buf, 0, 800, 0);
    await fh.close();
    const content = buf.toString('utf8').replace(/\0+$/, '');
    const lines = content.split('\n').filter(l => l.trim());

    const exports = [];
    for (const line of lines) {
      const fn = line.match(/(?:export\s+)?(?:function|const|class|async function)\s+(\w+)/);
      if (fn) exports.push(fn[1] + '()');
      const def = line.match(/^def\s+(\w+)|^class\s+(\w+)/);
      if (def) exports.push((def[1] || def[2]) + '()');
      if (exports.length >= 4) break;
    }

    const docMatch = content.match(/\/\*\*[\s\S]{0,150}?\*\/|#\s*.{10,80}/);
    const doc = docMatch ? docMatch[0].replace(/\/\*\*|\*\/|^\s*\*\s?/gm, '').trim().slice(0, 80) : '';

    const desc = doc || (exports.length > 0 ? `Exports: ${exports.join(', ')}` : 'No exports detected');
    return desc.replace(/\n/g, ' ');
  } catch {
    return 'Binary or unreadable file';
  }
}

// ─── Extract detailed function signatures (Strategy 3) ───────────────────────

export async function extractSignatures(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const signatures = [];

  // Only code files — skip JSON, MD, YAML, etc.
  const codeExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs']);
  if (!codeExts.has(ext)) return signatures;

  try {
    const buf = Buffer.alloc(6000);
    const fh = await fs.open(filePath, 'r');
    const { bytesRead } = await fh.read(buf, 0, 6000, 0);
    await fh.close();
    const content = buf.toString('utf8', 0, bytesRead).replace(/\0+$/, '');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // JS/TS: export function / export async function
      const jsExportFn = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]{0,60})\)/);
      if (jsExportFn) {
        signatures.push({ name: jsExportFn[1], params: jsExportFn[2], comment: pickComment(lines, i) });
        continue;
      }

      // JS/TS: export const name = (...) =>
      const jsArrow = trimmed.match(/^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]{0,60})\)/);
      if (jsArrow) {
        signatures.push({ name: jsArrow[1], params: jsArrow[2], comment: pickComment(lines, i) });
        continue;
      }

      // JS/TS: export class
      const jsClass = trimmed.match(/^export\s+(?:default\s+)?class\s+(\w+)/);
      if (jsClass) {
        signatures.push({ name: `class ${jsClass[1]}`, params: '', comment: '' });
        continue;
      }

      // Python: top-level def (no leading whitespace)
      const pyDef = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]{0,60})\)/);
      if (pyDef && !pyDef[1].startsWith('_')) {
        signatures.push({ name: pyDef[1], params: pyDef[2], comment: pickPyComment(lines, i) });
        continue;
      }

      // Go: exported func (capital letter)
      const goFunc = trimmed.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]{0,60})\)/);
      if (goFunc && /^[A-Z]/.test(goFunc[1])) {
        signatures.push({ name: goFunc[1], params: goFunc[2], comment: '' });
        continue;
      }

      if (signatures.length >= 12) break;
    }
  } catch { /* unreadable */ }

  return signatures;
}

async function readSample(filePath, maxBytes = 30_000) {
  try {
    const buf = Buffer.alloc(maxBytes);
    const fh = await fs.open(filePath, 'r');
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    await fh.close();
    return buf.toString('utf8', 0, bytesRead).replace(/\0+$/, '');
  } catch {
    return '';
  }
}

function countLines(text) {
  return text ? text.split('\n').length : 0;
}

function tokenize(text) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9_./-]*/g) || [])
    .filter((t) => t.length >= 3)
    .slice(0, 80))];
}

function inferRoles(relPath, ext, content) {
  const p = relPath.replace(/\\/g, '/').toLowerCase();
  const c = content.toLowerCase();
  const roles = new Set();

  if (/(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\./.test(p)) roles.add('test');
  if (/\b(route|routes|router|api|controller|handler|endpoint)\b/.test(p) ||
      /\b(app|router)\.(get|post|put|patch|delete)\s*\(|export\s+(async\s+)?function\s+(get|post|put|patch|delete)\b/i.test(content)) {
    roles.add('route');
  }
  if (/\b(auth|login|logout|session|cookie|csrf|jwt|oauth|password|permission|role|2fa|mfa)\b/.test(`${p} ${c}`)) {
    roles.add('security');
  }
  if (/\b(db|database|schema|migration|prisma|sql|model|repository)\b/.test(`${p} ${c}`)) roles.add('data');
  if (/\b(index|main|server|app|cli|bin)\b/.test(p)) roles.add('entrypoint');
  if (['.tsx', '.jsx', '.vue', '.svelte', '.css', '.scss', '.html'].includes(ext) ||
      /\b(component|page|view|screen|form|button|modal)\b/.test(p)) roles.add('ui');
  if (/\b(config|settings|env|package\.json|tsconfig|vite|webpack|dockerfile|compose)\b/.test(p)) roles.add('config');
  if (/\b(fetch|axios|http\.|https\.|fs\.|spawn\(|exec\(|subprocess\.|requests\.|db\.|query\()/i.test(content)) {
    roles.add('side-effect');
  }

  return [...roles];
}

function extractImports(content, ext) {
  const imports = new Set();
  const lines = content.split('\n').slice(0, 400);
  for (const line of lines) {
    let m;
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      m = line.match(/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/);
      if (m) imports.add(m[1] || m[2] || m[3]);
    } else if (ext === '.py') {
      m = line.match(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))/);
      if (m) imports.add((m[1] || m[2]).split(',')[0].trim());
    } else if (ext === '.go') {
      m = line.match(/"([^"]+)"/);
      if (m) imports.add(m[1]);
    } else if (ext === '.rs') {
      m = line.match(/^\s*use\s+([\w:]+)/);
      if (m) imports.add(m[1]);
    }
    if (imports.size >= 20) break;
  }
  return [...imports];
}

function scoreFileRisk({ relPath, tokens, loc, roles, signatures, imports }) {
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (roles.includes('security')) add(3, 'auth/security surface');
  if (roles.includes('route')) add(2, 'route/API surface');
  if (roles.includes('data')) add(2, 'data/schema surface');
  if (roles.includes('config')) add(2, 'configuration');
  if (roles.includes('entrypoint')) add(1, 'entrypoint/public surface');
  if (roles.includes('side-effect')) add(1, 'side effects');
  if (tokens > 2500 || loc > 500) add(1, 'large file');
  if ((signatures?.length || 0) >= 10) add(1, 'many exported symbols');
  if ((imports?.length || 0) >= 12) add(1, 'many imports');
  if (/\b(index|public|api|main)\b/i.test(relPath)) add(1, 'public naming');

  if (roles.includes('test')) score = Math.min(score, 4);
  return { score: Math.min(10, score), reasons: [...new Set(reasons)] };
}

async function analyzeFileForContext(file) {
  const content = await readSample(file.fullPath);
  const loc = countLines(content);
  const roles = inferRoles(file.relPath, file.ext, content);
  const imports = extractImports(content, file.ext);
  const risk = scoreFileRisk({
    relPath: file.relPath,
    tokens: file.tokens,
    loc,
    roles,
    signatures: file.signatures,
    imports,
  });
  const signatureText = (file.signatures || []).map((s) => `${s.name} ${s.comment || ''}`).join(' ');
  const keywords = tokenize(`${file.relPath} ${file.description} ${roles.join(' ')} ${signatureText}`);

  return {
    relPath: file.relPath.replace(/\\/g, '/'),
    loc,
    roles,
    imports,
    risk,
    keywords,
  };
}

function pickComment(lines, idx) {
  const inline = lines[idx].match(/\/\/\s*(.{0,60})$/);
  if (inline) return inline[1].trim();
  if (idx > 0) {
    const prev = lines[idx - 1].trim();
    if (prev.startsWith('//')) return prev.slice(2).trim().slice(0, 60);
    if (prev.startsWith('*')) return prev.replace(/^\*+\s?/, '').trim().slice(0, 60);
  }
  return '';
}

function pickPyComment(lines, idx) {
  if (idx + 1 < lines.length) {
    const next = lines[idx + 1].trim();
    if (next.startsWith('"""') || next.startsWith("'''"))
      return next.replace(/^['"]{3}/, '').replace(/['"]{3}.*$/, '').trim().slice(0, 60);
  }
  if (idx > 0) {
    const prev = lines[idx - 1].trim();
    if (prev.startsWith('#')) return prev.slice(1).trim().slice(0, 60);
  }
  return '';
}

// ─── File extensions to index ────────────────────────────────────────────────

const INDEXABLE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.css', '.scss', '.html', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.env.example',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.venv', 'venv', 'vendor', '.agent-boost', '.token-shield',
  'coverage', '.nyc_output', 'out', '.turbo', 'target', '.idea', '.vscode', '.github',
]);

// ─── Walk directory ───────────────────────────────────────────────────────────

export async function walkProject(dir, rootDir = dir, results = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      await walkProject(fullPath, rootDir, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (INDEXABLE_EXTS.has(ext)) {
        const file = {
          relPath,
          fullPath,
          ext,
          tokens: await estimateFileTokens(fullPath),
          description: await extractFileDescription(fullPath),
          signatures: await extractSignatures(fullPath),
        };
        const context = await analyzeFileForContext(file);
        results.push({ ...file, ...context });
      }
    }
  }

  return results;
}

// ─── Group by directory ───────────────────────────────────────────────────────

function groupByDir(files) {
  const groups = {};
  for (const file of files) {
    const dir = path.dirname(file.relPath);
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(file);
  }
  return groups;
}

// ─── Build anatomy.md (Strategy 3: signatures + DO NOT READ) ─────────────────

function buildAnatomyContent(files) {
  const totalFiles = files.length;
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
  const grouped = groupByDir(files);

  let md = `# anatomy.md — Project File Index\n`;
  md += `> Auto-generated by token-flux. Do not edit manually.\n`;
  md += `> Generated: ${new Date().toISOString().slice(0, 10)} | Files: ${totalFiles} | Total: ~${totalTokens.toLocaleString()} tokens\n`;
  md += `>\n`;
  md += `> AI RULE: Read this first to choose files. It is a map, not a replacement for source.\n`;
  md += `> For the smallest safe starting point, run: \`token-flux context "<task>"\`.\n`;
  md += `> Open the exact source files needed for correctness, especially routes, auth/security, tests, and edited files.\n\n`;

  for (const [dir, dirFiles] of Object.entries(grouped)) {
    md += `## ${dir === '.' ? '(root)' : dir}/\n`;
    for (const file of dirFiles) {
      const name = file.relPath.replace(/\\/g, '/');
      const risk = file.risk?.score ? ` | risk ${file.risk.score}/10` : '';
      const roles = file.roles?.length ? ` | ${file.roles.join(', ')}` : '';
      md += `- \`${name}\` — ${file.description} (~${file.tokens} tok${risk}${roles})\n`;

      if (file.signatures && file.signatures.length > 0) {
        for (const sig of file.signatures) {
          const cmt = sig.comment ? `  // ${sig.comment}` : '';
          md += `  - \`${sig.name}(${sig.params})\`${cmt}\n`;
        }
        md += `  - _Use signatures for triage; open this file if the task depends on its implementation._\n`;
      }
    }
    md += '\n';
  }

  return md;
}

// ─── Build cerebrum.md skeleton ──────────────────────────────────────────────

export function buildContextIndex(files) {
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
  const grouped = groupByDir(files);
  const languages = {};
  for (const file of files) {
    const key = file.ext || '(none)';
    languages[key] = (languages[key] || 0) + 1;
  }

  const communities = Object.entries(grouped)
    .map(([dir, dirFiles]) => {
      const tokens = dirFiles.reduce((sum, f) => sum + f.tokens, 0);
      const maxRisk = Math.max(0, ...dirFiles.map((f) => f.risk?.score || 0));
      const roles = [...new Set(dirFiles.flatMap((f) => f.roles || []))].slice(0, 8);
      return {
        name: dir === '.' ? '(root)' : dir.replace(/\\/g, '/'),
        files: dirFiles.length,
        tokens,
        maxRisk,
        roles,
        topFiles: dirFiles
          .slice()
          .sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0) || b.tokens - a.tokens)
          .slice(0, 5)
          .map((f) => f.relPath.replace(/\\/g, '/')),
      };
    })
    .sort((a, b) => b.maxRisk - a.maxRisk || b.tokens - a.tokens);

  const indexedFiles = files
    .map((f) => ({
      path: f.relPath.replace(/\\/g, '/'),
      ext: f.ext,
      tokens: f.tokens,
      loc: f.loc || 0,
      description: f.description,
      signatures: (f.signatures || []).slice(0, 12),
      imports: (f.imports || []).slice(0, 20),
      roles: f.roles || [],
      risk: f.risk || { score: 0, reasons: [] },
      keywords: f.keywords || [],
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      files: files.length,
      totalTokens,
      languages,
    },
    communities,
    publicFiles: indexedFiles
      .filter((f) => f.roles.some((r) => ['route', 'entrypoint', 'security'].includes(r)))
      .sort((a, b) => b.risk.score - a.risk.score || b.tokens - a.tokens)
      .slice(0, 30)
      .map((f) => f.path),
    riskIndex: indexedFiles
      .filter((f) => f.risk.score > 0)
      .slice()
      .sort((a, b) => b.risk.score - a.risk.score || b.tokens - a.tokens)
      .slice(0, 40)
      .map((f) => ({
        path: f.path,
        score: f.risk.score,
        reasons: f.risk.reasons,
        tokens: f.tokens,
      })),
    largeFiles: indexedFiles
      .filter((f) => f.tokens >= 1500)
      .slice()
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 40)
      .map((f) => ({ path: f.path, tokens: f.tokens, roles: f.roles })),
    files: indexedFiles,
  };
}

function buildCerebrumSkeleton() {
  return `# cerebrum.md — Mistake Memory

> Auto-generated by token-flux. Append mistakes and preferences here.
> The AI reads this before every fix to avoid repeating mistakes.

## Format
\`\`\`
- YYYY-MM-DD: [category] Description of mistake or preference
\`\`\`

## Known Mistakes & Preferences

`;
}

// ─── Main scan entry point ────────────────────────────────────────────────────

export async function scan(projectRoot) {
  const files = await walkProject(projectRoot);
  const anatomy = buildAnatomyContent(files);
  const contextIndex = buildContextIndex(files);

  const boostDir = path.join(projectRoot, '.agent-boost');
  await fs.mkdir(boostDir, { recursive: true });
  await fs.writeFile(path.join(boostDir, 'anatomy.md'), anatomy, 'utf8');
  await fs.writeFile(path.join(boostDir, 'context-index.json'), JSON.stringify(contextIndex, null, 2) + '\n', 'utf8');

  const cerebrumPath = path.join(boostDir, 'cerebrum.md');
  try {
    await fs.access(cerebrumPath);
  } catch {
    await fs.writeFile(cerebrumPath, buildCerebrumSkeleton(), 'utf8');
  }

  return {
    files: files.length,
    totalTokens: files.reduce((s, f) => s + f.tokens, 0),
    contextIndexPath: path.join(boostDir, 'context-index.json'),
  };
}
