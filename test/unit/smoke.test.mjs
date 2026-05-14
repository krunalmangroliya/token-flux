// Smoke tests for the token-flux package itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { detect } from '../../src/detect.mjs';
import { init } from '../../src/init.mjs';
import { buildCodeMap } from '../../src/codemap/index.mjs';
import { retrieveLessons } from '../../src/lessons/retrieve.mjs';
import { judgeLesson } from '../../src/lessons/judge.mjs';
import { appendLesson } from '../../src/lessons/extract.mjs';
import { ALL_ADAPTERS } from '../../src/adapters/index.mjs';
import { enhance, scoreResponse } from '../../src/enforce/flash-enhancer.mjs';
import { compress } from '../../src/token-saver/input-compressor.mjs';
import { stripResponseFiller, buildCavemanInstruction, DEFAULT_CAVEMAN_LEVEL } from '../../src/token-saver/output-compressor.mjs';
import { scan } from '../../src/token-saver/project-scanner.mjs';
import { getMinimalContext } from '../../src/token-saver/context.mjs';
import { writeMcpConfig } from '../../src/token-saver/mcp-server.mjs';

test('detect: recognizes a node project', async () => {
  const dir = await mkTempRepo({
    'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }),
  });
  const d = await detect(dir);
  assert.ok(d.languages.includes('javascript') || d.languages.includes('typescript'));
  assert.ok(d.commands.test);
});

test('init: lays down scaffolding with --yes defaults', async () => {
  const dir = await mkTempRepo({
    'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }),
    'src/index.mjs': 'export const hello = () => 1;\n',
  });
  await init({ repoRoot: dir, yes: true, adapters: ['generic'], enforcement: 'normal', runtime: false, hooks: false });

  assert.ok(await exists(path.join(dir, 'AGENT.md')));
  assert.ok(await exists(path.join(dir, 'CODEMAP.md')));
  assert.ok(await exists(path.join(dir, 'LESSONS.md')));
  assert.ok(await exists(path.join(dir, '.agent-boost', 'config.json')));
  assert.ok(await exists(path.join(dir, '.agent-boost', 'scripts', 'verify.mjs')));
});

test('buildCodeMap: emits entries for a simple repo', async () => {
  const dir = await mkTempRepo({
    'src/thing.mjs': 'export function thing() { return 42; }\n',
  });
  const map = await buildCodeMap({ repoRoot: dir, withRuntime: false });
  assert.ok(map.entries.length >= 1);
  const e = map.entries.find((x) => x.path === 'src/thing.mjs');
  assert.ok(e);
  assert.ok(e.exports.some((s) => s.name === 'thing'));
});

test('lessons: append + retrieve round trip', async () => {
  const dir = await mkTempRepo({ 'LESSONS.md': '# Lessons\n\n' });
  const block =
    `## NEW_LESSON\n` +
    `tags: src/auth.ts, session\n` +
    `task: Add remember-me\n` +
    `mistake: Forgot to update REFRESH_TOKEN_TTL alongside session TTL\n` +
    `correct: Change both constants together\n` +
    `rule: When editing SESSION_TTL, grep REFRESH_TOKEN_TTL and update both\n`;

  const judged = await judgeLesson({ repoRoot: dir, block });
  assert.equal(judged.ok, true, `judge rejected: ${judged.reasons.join(', ')}`);
  const res = await appendLesson({ repoRoot: dir, block });
  assert.equal(res.appended, true);

  const retrieved = await retrieveLessons({ repoRoot: dir, query: 'updating session TTL in auth' });
  assert.ok(retrieved.includes('L-001'));
  assert.ok(retrieved.toLowerCase().includes('refresh_token_ttl') || retrieved.toLowerCase().includes('remember-me'));
});

test('judge: rejects vague lessons', async () => {
  const dir = await mkTempRepo({ 'LESSONS.md': '# Lessons\n\n' });
  const block = `## NEW_LESSON\ntags: bug\ntask: \nmistake: \ncorrect: \nrule: try harder\n`;
  const res = await judgeLesson({ repoRoot: dir, block });
  assert.equal(res.ok, false);
});

test('adapters list is non-empty', () => {
  assert.ok(ALL_ADAPTERS.length >= 5);
  assert.ok(ALL_ADAPTERS.includes('generic'));
  assert.ok(ALL_ADAPTERS.includes('claude-code'));
});

test('boost prompt adds production gates without visible think tags', () => {
  const result = enhance('fix 2FA login route and frontend form error state', { model: 'haiku' });
  assert.ok(result.enhanced.includes('## PRODUCTION GATES'));
  assert.ok(result.enhanced.includes('Security gate'));
  assert.ok(result.enhanced.includes('Route gate'));
  assert.ok(result.enhanced.includes('Frontend gate'));
  assert.equal(result.enhanced.includes('<think>'), false);
});

test('response scoring catches missing security route and verification coverage', () => {
  const result = scoreResponse('```js\nexport function login() { return true; }\n```', {
    isCodeTask: true,
    originalPrompt: 'fix 2FA login route security bug in frontend form',
    promptLength: 60,
  });
  assert.equal(result.signals.securityGap, true);
  assert.equal(result.signals.routeGap, true);
  assert.equal(result.signals.noVerification, true);
  assert.equal(result.verdict === 'good', false);
});

test('compression preserves code details and output filter preserves code blocks', () => {
  const prompt = 'Please fix this:\n```js\n// TODO: preserve this marker\nconst text = "please keep me";\n```';
  const compressed = compress(prompt).compressed;
  assert.ok(compressed.includes('// TODO: preserve this marker'));
  assert.ok(compressed.includes('"please keep me"'));

  const filtered = stripResponseFiller('Sure!\n```js\nconsole.log("great question");\n```\nDone.');
  assert.ok(filtered.includes('```js\nconsole.log("great question");\n```'));
});

test('scanner writes relative paths and allows targeted source inspection', async () => {
  const dir = await mkTempRepo({
    'src/auth/login.mjs': 'export function login(user) { return Boolean(user); }\n',
  });
  await scan(dir);
  const anatomy = await fs.readFile(path.join(dir, '.agent-boost', 'anatomy.md'), 'utf8');
  assert.ok(anatomy.includes('src/auth/login.mjs'));
  assert.ok(anatomy.includes('map, not a replacement for source'));
  assert.ok(await exists(path.join(dir, '.agent-boost', 'context-index.json')));
});

test('minimal context ranks risky task files before broad source reads', async () => {
  const dir = await mkTempRepo({
    'src/auth/login.mjs': 'export function login(req) { if (!req.session) throw new Error("auth"); return true; }\n',
    'src/auth/login.test.mjs': 'import { login } from "./login.mjs";\nexport function testLogin() { return login({ session: true }); }\n',
    'src/ui/button.mjs': 'export function button() { return "ok"; }\n',
  });
  await scan(dir);
  const ctx = await getMinimalContext(dir, 'fix login auth session bug', { autoScan: false });
  assert.equal(ctx.status, 'ok');
  assert.equal(ctx.intent, 'security');
  assert.ok(ctx.relevantFiles.some((f) => f.path === 'src/auth/login.mjs'));
  assert.ok([...ctx.relevantFiles, ...ctx.supportingFiles].some((f) => f.path === 'src/auth/login.test.mjs'));
  assert.ok(ctx.risk.score >= 3);
});

test('mcp config registers token-flux server without removing other servers', async () => {
  const dir = await mkTempRepo({
    '.mcp.json': JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
  });
  await writeMcpConfig(dir);
  const cfg = JSON.parse(await fs.readFile(path.join(dir, '.mcp.json'), 'utf8'));
  assert.equal(cfg.mcpServers.other.command, 'x');
  assert.equal(cfg.mcpServers['token-flux'].command, 'token-flux');
  assert.deepEqual(cfg.mcpServers['token-flux'].args, ['mcp', 'serve']);
});

test('output compression defaults to quality-preserving full mode', () => {
  assert.equal(DEFAULT_CAVEMAN_LEVEL, 'full');
  assert.ok(buildCavemanInstruction('ultra').includes('Never abbreviate identifiers'));
  assert.ok(buildCavemanInstruction('light').includes('Concise'));
});

async function mkTempRepo(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
  return dir;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}
