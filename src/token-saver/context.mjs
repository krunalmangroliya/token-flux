// Minimal context router inspired by graph-based MCP workflows.
// It gives the agent a tiny, risk-aware starting packet before any large reads.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scan } from './project-scanner.mjs';
import { countTokens } from './input-compressor.mjs';

const execFileP = promisify(execFile);

const DETAIL_LIMITS = {
  minimal: { files: 5, support: 3, communities: 3, large: 3, signatures: 3 },
  standard: { files: 8, support: 5, communities: 5, large: 5, signatures: 6 },
  full: { files: 15, support: 8, communities: 8, large: 8, signatures: 12 },
};

const INTENTS = {
  review: ['review', 'pr', 'merge', 'diff', 'change', 'changed'],
  debug: ['debug', 'bug', 'fix', 'error', 'crash', 'fail', 'failure', 'broken'],
  refactor: ['refactor', 'rename', 'clean', 'split', 'dead', 'simplify'],
  test: ['test', 'coverage', 'spec', 'assert'],
  security: ['auth', 'security', 'login', 'session', 'csrf', 'jwt', 'oauth', 'permission', 'password'],
  explore: ['understand', 'explore', 'architecture', 'onboard', 'where', 'how'],
};

export async function getMinimalContext(repoRoot, task = '', opts = {}) {
  const detailLevel = DETAIL_LIMITS[opts.detailLevel] ? opts.detailLevel : 'minimal';
  const limits = DETAIL_LIMITS[detailLevel];
  const index = await loadContextIndex(repoRoot, { autoScan: opts.autoScan !== false });
  const taskTokens = tokenize(task);
  const intent = inferIntent(task);
  const fileRefs = extractFileRefs(task);
  const changedFiles = normalizeList(opts.changedFiles?.length ? opts.changedFiles : await detectChangedFiles(repoRoot, opts.base || 'HEAD~1'));
  const changedSet = new Set(changedFiles);

  const scored = index.files
    .map((file) => scoreFile(file, { taskTokens, intent, fileRefs, changedSet }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.file.risk?.score || 0) - (a.file.risk?.score || 0) || a.file.tokens - b.file.tokens);

  let primary = uniqueByPath(scored.map((item) => ({
    path: item.file.path,
    tokens: item.file.tokens,
    risk: item.file.risk?.score || 0,
    roles: item.file.roles || [],
    why: item.why.slice(0, 4),
    signatures: (item.file.signatures || []).slice(0, limits.signatures),
  }))).slice(0, limits.files);

  if (primary.length === 0) {
    primary = fallbackFiles(index, intent, limits.files);
  }

  const support = findSupportFiles(index, primary, intent, limits.support);
  const selectedPaths = new Set([...primary, ...support].map((f) => f.path));
  const selectedTokens = [...primary, ...support].reduce((sum, f) => sum + (f.tokens || 0), 0);
  const risk = computeRisk(index, [...selectedPaths], changedFiles);
  const savingsPercent = estimateSavings(index.stats.totalTokens, selectedTokens);

  const result = {
    status: 'ok',
    task,
    intent,
    detailLevel,
    summary: `${index.stats.files} files indexed (~${index.stats.totalTokens.toLocaleString()} tok). Start with ${primary.length} file(s), ~${selectedTokens.toLocaleString()} tok (${savingsPercent}% less than full repo index).`,
    risk,
    changedFiles,
    relevantFiles: primary,
    supportingFiles: support,
    nextSteps: buildNextSteps(intent, primary, support, risk),
    qualityRules: [
      'Read listed files first; expand only when an API contract, caller, route, auth/security path, or test requires it.',
      'Use anatomy/context as triage only. Open source for correctness before editing.',
      'Keep routes, API contracts, auth/security checks, tests, errors, file paths, and commands exact.',
    ],
  };

  if (detailLevel !== 'minimal') {
    result.communities = (index.communities || []).slice(0, limits.communities);
    result.publicFiles = (index.publicFiles || []).slice(0, limits.files);
    result.largeFilesToAvoid = (index.largeFiles || []).slice(0, limits.large);
    result.riskIndex = (index.riskIndex || []).slice(0, limits.files);
  }

  return result;
}

export async function loadContextIndex(repoRoot, opts = {}) {
  const indexPath = path.join(repoRoot, '.agent-boost', 'context-index.json');
  try {
    return JSON.parse(await fs.readFile(indexPath, 'utf8'));
  } catch {
    if (opts.autoScan === false) {
      throw new Error('No .agent-boost/context-index.json found. Run: token-flux scan');
    }
    await scan(repoRoot);
    return JSON.parse(await fs.readFile(indexPath, 'utf8'));
  }
}

export function inferIntent(task) {
  const lower = task.toLowerCase();
  let best = { intent: 'explore', score: 0 };
  for (const [intent, words] of Object.entries(INTENTS)) {
    const score = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
    if (score > best.score) best = { intent, score };
  }
  return best.intent;
}

export function printContext(result, pc = null) {
  const bold = pc?.bold || ((s) => s);
  const dim = pc?.dim || ((s) => s);
  const colorRisk = (risk) => {
    if (!pc) return risk;
    if (risk === 'high') return pc.red(risk);
    if (risk === 'medium') return pc.yellow(risk);
    return pc.green(risk);
  };

  console.log(`\n${bold('token-flux context')}`);
  if (result.task) console.log(`Task: ${result.task}`);
  console.log(`Intent: ${result.intent} | Risk: ${colorRisk(result.risk.level)} (${result.risk.score}/10)`);
  console.log(result.summary);

  console.log('\nStart files:');
  for (const file of result.relevantFiles) {
    console.log(`  - ${file.path} (~${file.tokens} tok, risk ${file.risk}/10)`);
    if (file.why?.length) console.log(`    why: ${file.why.join(', ')}`);
    if (result.detailLevel !== 'minimal' && file.signatures?.length) {
      for (const sig of file.signatures.slice(0, 3)) {
        console.log(`    sig: ${sig.name}(${sig.params || ''})`);
      }
    }
  }

  if (result.supportingFiles.length) {
    console.log('\nSupport files:');
    for (const file of result.supportingFiles) {
      console.log(`  - ${file.path} (~${file.tokens} tok) - ${file.why.join(', ')}`);
    }
  }

  if (result.changedFiles.length) {
    console.log(`\nChanged files: ${result.changedFiles.join(', ')}`);
  }

  if (result.detailLevel !== 'minimal' && result.communities?.length) {
    console.log('\nCommunities:');
    for (const c of result.communities) {
      console.log(`  - ${c.name}: ${c.files} files, ~${c.tokens} tok, max risk ${c.maxRisk}/10`);
    }
  }

  console.log('\nNext:');
  result.nextSteps.forEach((step, idx) => console.log(`  ${idx + 1}. ${step}`));
  console.log(dim(''));
}

function scoreFile(file, { taskTokens, intent, fileRefs, changedSet }) {
  let score = 0;
  const why = [];
  const filePath = file.path.toLowerCase();
  const roles = file.roles || [];
  const keywords = new Set(file.keywords || []);

  if (changedSet.has(file.path)) {
    score += 30;
    why.push('changed file');
  }

  for (const ref of fileRefs) {
    const normalizedRef = ref.replace(/\\/g, '/').toLowerCase();
    if (filePath.endsWith(normalizedRef) || filePath.includes(normalizedRef)) {
      score += 40;
      why.push(`mentioned ${ref}`);
    }
  }

  for (const token of taskTokens) {
    if (keywords.has(token)) {
      score += 5;
      if (why.length < 5) why.push(`keyword ${token}`);
    } else if (filePath.includes(token)) {
      score += 4;
      if (why.length < 5) why.push(`path ${token}`);
    }
  }

  const roleBoost = roleScore(intent, roles);
  if (roleBoost > 0) {
    score += roleBoost;
    why.push(`${intent} role match`);
  }

  if ((file.risk?.score || 0) >= 6 && ['review', 'debug', 'security'].includes(intent)) {
    score += 5;
    why.push('high-risk surface');
  }

  return { file, score, why: [...new Set(why)] };
}

function roleScore(intent, roles) {
  const has = (role) => roles.includes(role);
  if (intent === 'security') return (has('security') ? 18 : 0) + (has('route') ? 8 : 0) + (has('data') ? 4 : 0);
  if (intent === 'debug') return (has('route') ? 8 : 0) + (has('security') ? 6 : 0) + (has('side-effect') ? 4 : 0);
  if (intent === 'review') return (has('route') ? 5 : 0) + (has('security') ? 6 : 0) + (has('test') ? 3 : 0);
  if (intent === 'test') return has('test') ? 15 : 0;
  if (intent === 'refactor') return has('entrypoint') ? 5 : 0;
  return (has('entrypoint') ? 8 : 0) + (has('route') ? 5 : 0);
}

function findSupportFiles(index, primary, intent, limit) {
  const primaryPaths = new Set(primary.map((f) => f.path));
  const primaryTerms = new Set(primary.flatMap((f) => tokenize(path.basename(f.path, path.extname(f.path)))));
  const candidates = [];

  for (const file of index.files) {
    if (primaryPaths.has(file.path)) continue;
    const roles = file.roles || [];
    let score = 0;
    const why = [];

    if (roles.includes('test') && intent !== 'explore') {
      score += 8;
      why.push('nearby test candidate');
    }
    for (const term of primaryTerms) {
      if (term.length >= 3 && file.path.toLowerCase().includes(term)) {
        score += 5;
        why.push(`matches ${term}`);
      }
    }
    if (intent === 'security' && roles.includes('security')) {
      score += 4;
      why.push('security companion');
    }
    if (score > 0) candidates.push({ file, score, why: [...new Set(why)] });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.file.tokens - b.file.tokens)
    .slice(0, limit)
    .map(({ file, why }) => ({
      path: file.path,
      tokens: file.tokens,
      risk: file.risk?.score || 0,
      roles: file.roles || [],
      why,
    }));
}

function computeRisk(index, selectedPaths, changedFiles) {
  const selected = new Set(selectedPaths);
  const changed = new Set(changedFiles);
  const files = index.files.filter((f) => selected.has(f.path) || changed.has(f.path));
  const maxRisk = Math.max(0, ...files.map((f) => f.risk?.score || 0));
  let score = maxRisk;
  const reasons = new Set(files.flatMap((f) => f.risk?.reasons || []));
  if (changedFiles.length >= 5) {
    score += 1;
    reasons.add('many changed files');
  }
  if (files.some((f) => (f.roles || []).includes('security'))) reasons.add('security-sensitive context');
  if (files.some((f) => (f.roles || []).includes('route'))) reasons.add('route/API context');
  score = Math.min(10, score);
  return {
    score,
    level: score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low',
    reasons: [...reasons].slice(0, 6),
  };
}

function fallbackFiles(index, intent, limit) {
  const preferredRoles = intent === 'test'
    ? ['test']
    : intent === 'security'
      ? ['security', 'route']
      : ['entrypoint', 'route', 'security'];
  return index.files
    .filter((f) => (f.roles || []).some((role) => preferredRoles.includes(role)))
    .sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0) || a.tokens - b.tokens)
    .slice(0, limit)
    .map((file) => ({
      path: file.path,
      tokens: file.tokens,
      risk: file.risk?.score || 0,
      roles: file.roles || [],
      why: ['fallback from project role index'],
      signatures: (file.signatures || []).slice(0, DETAIL_LIMITS.minimal.signatures),
    }));
}

function buildNextSteps(intent, primary, support, risk) {
  const files = [...primary, ...support].map((f) => f.path).slice(0, 6);
  const steps = [];
  if (files.length) steps.push(`Run: token-flux budget ${files.map(quoteIfNeeded).join(' ')}`);
  steps.push('Open the listed source files; do not read the whole repo.');
  if (risk.level !== 'low') steps.push('Expand to callers/routes/tests before editing because risk is not low.');
  if (intent === 'review') steps.push('Use changed files first, then check affected tests and route/API surfaces.');
  else if (intent === 'debug') steps.push('Reproduce with the smallest failing test/command, wrapped in token-flux proxy.');
  else if (intent === 'security') steps.push('Verify auth/session/permission checks and regression tests before finishing.');
  else steps.push('Use token-flux context --detail standard if the listed files are not enough.');
  return steps;
}

async function detectChangedFiles(repoRoot, base) {
  const changed = new Set();
  try {
    const { stdout } = await execFileP('git', ['diff', '--name-only', base, '--'], { cwd: repoRoot, timeout: 5000 });
    for (const line of stdout.split('\n')) if (line.trim()) changed.add(normalizePath(line.trim()));
  } catch { /* no git or no base */ }

  try {
    const { stdout } = await execFileP('git', ['status', '--porcelain'], { cwd: repoRoot, timeout: 5000 });
    for (const line of stdout.split('\n')) {
      const file = line.slice(3).trim();
      if (!file) continue;
      const renamed = file.includes(' -> ') ? file.split(' -> ').pop() : file;
      changed.add(normalizePath(renamed));
    }
  } catch { /* no git */ }

  return [...changed];
}

function tokenize(text) {
  return [...new Set((String(text).toLowerCase().match(/[a-z0-9][a-z0-9_./-]*/g) || [])
    .filter((t) => t.length >= 3))];
}

function extractFileRefs(text) {
  return (String(text).match(/[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,8}/g) || []).map(normalizePath);
}

function normalizeList(files) {
  return [...new Set((files || []).map(normalizePath).filter(Boolean))];
}

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

function uniqueByPath(files) {
  const seen = new Set();
  const out = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    out.push(file);
  }
  return out;
}

function estimateSavings(totalTokens, selectedTokens) {
  if (!totalTokens) return 0;
  return Math.max(0, Math.round((1 - selectedTokens / totalTokens) * 100));
}

function quoteIfNeeded(file) {
  return /\s/.test(file) ? `"${file}"` : file;
}

export function estimateContextTokens(result) {
  return countTokens(JSON.stringify(result));
}
