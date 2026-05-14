// Eval harness runner.
//
// For each task: copy the fixture to a temp dir, apply the seeded state, optionally run an
// external agent (out of scope for this harness — the user provides the diff), apply the diff,
// run the fixture's verify chain, score pass/fail.
//
// The harness ships with a `--mock` mode that applies the reference diff from each task — this
// validates the evaluation pipeline end-to-end without requiring a real agent.
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scoreTask } from './scorer.mjs';
import { init } from '../init.mjs';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ pkgRoot: string, runs?: number, tasksDir?: string, mock?: boolean, agentDiffProvider?: Function }} opts
 */
export async function runEvals(opts = {}) {
  const pkgRoot = opts.pkgRoot || path.resolve(__dirname, '..', '..');
  const runs = opts.runs || 1;
  const mock = opts.mock !== false; // default to mock when no external agent is wired
  const tasksDir = opts.tasksDir || path.join(pkgRoot, 'test', 'evals', 'tasks');

  const taskFiles = (await fs.readdir(tasksDir)).filter((f) => f.endsWith('.json')).sort();
  if (taskFiles.length === 0) {
    console.log(`[eval] no tasks found in ${tasksDir}`);
    return { passed: 0, failed: 0, total: 0, rows: [] };
  }

  const rows = [];
  let passed = 0;
  let failed = 0;

  for (const f of taskFiles) {
    const task = JSON.parse(await fs.readFile(path.join(tasksDir, f), 'utf8'));
    for (let run = 1; run <= runs; run++) {
      const outcome = await runOneTask({ pkgRoot, task, mock, agentDiffProvider: opts.agentDiffProvider });
      rows.push({ task: task.id, run, ...outcome });
      if (outcome.pass) passed++;
      else failed++;
      console.log(`[eval] ${task.id} run=${run} → ${outcome.pass ? 'PASS' : 'FAIL'} ${outcome.note ? '(' + outcome.note + ')' : ''}`);
    }
  }

  const csvPath = path.join(pkgRoot, 'test', 'evals', 'results.csv');
  await writeCsv(csvPath, rows);
  console.log(`\n[eval] summary: ${passed}/${passed + failed} pass`);
  console.log(`[eval] CSV: ${csvPath}`);
  return { passed, failed, total: passed + failed, rows };
}

async function runOneTask({ pkgRoot, task, mock, agentDiffProvider }) {
  const fixtureSrc = path.join(pkgRoot, 'test', 'evals', 'fixtures', task.fixture);
  if (!(await exists(fixtureSrc))) {
    return { pass: false, note: `fixture missing: ${task.fixture}` };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'token-flux-eval-'));
  try {
    await copyDir(fixtureSrc, workDir);

    // Apply the "seeded" pre-state (the fixture's pristine state + any task-specific setup).
    if (task.setup?.removeFiles) for (const f of task.setup.removeFiles) await fs.rm(path.join(workDir, f), { force: true });
    if (task.setup?.writeFiles) for (const [p, content] of Object.entries(task.setup.writeFiles)) {
      await fs.mkdir(path.dirname(path.join(workDir, p)), { recursive: true });
      await fs.writeFile(path.join(workDir, p), content, 'utf8');
    }

    // Install dependencies if fixture has a package.json.
    if (await exists(path.join(workDir, 'package.json'))) {
      try { await execFileP('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: workDir, shell: true }); }
      catch (e) { return { pass: false, note: `npm install failed: ${shortErr(e)}` }; }
    }

    // Initialize token-flux inside the fixture (testing the real init flow).
    await init({ repoRoot: workDir, yes: true, adapters: ['generic'], enforcement: 'normal', runtime: false, hooks: false });

    // Narrow verify to only `test` for fixture evaluation — format/lint/typecheck are not relevant
    // to measuring whether the diff produces correct behavior in the eval sandbox.
    await overrideVerifyCommands(workDir, task);

    // Obtain the diff to apply — either from the agent provider or the reference diff (mock).
    let diff;
    if (agentDiffProvider) {
      diff = await agentDiffProvider({ workDir, task });
    } else if (mock && task.referenceDiff) {
      diff = task.referenceDiff;
    } else {
      return { pass: false, note: 'no agent provider and no reference diff' };
    }

    if (!diff) return { pass: false, note: 'empty diff produced' };

    // Apply diff.
    try {
      await applyDiff(workDir, diff);
    } catch (e) {
      return { pass: false, note: `diff apply failed: ${shortErr(e)}` };
    }

    // Run the verifier and score.
    return await scoreTask({ workDir, task });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function applyDiff(workDir, diff) {
  // Diffs in task JSON are "simple patch": an array of { path, content } replacements.
  if (Array.isArray(diff)) {
    for (const patch of diff) {
      const p = path.join(workDir, patch.path);
      await fs.mkdir(path.dirname(p), { recursive: true });
      if (patch.delete) {
        await fs.rm(p, { force: true });
      } else {
        await fs.writeFile(p, patch.content, 'utf8');
      }
    }
    return;
  }
  // Otherwise treat as unified diff text — shell out to git apply.
  const patchPath = path.join(workDir, '.agent-boost', 'scratch.patch');
  await fs.mkdir(path.dirname(patchPath), { recursive: true });
  await fs.writeFile(patchPath, diff, 'utf8');
  await execFileP('git', ['apply', '--unsafe-paths', patchPath], { cwd: workDir });
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.agent-boost') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function overrideVerifyCommands(workDir, task) {
  const snapPath = path.join(workDir, '.agent-boost', 'scripts', 'config.snapshot.json');
  const snap = JSON.parse(await fs.readFile(snapPath, 'utf8'));
  if (task.fixture?.startsWith('ts-')) {
    snap.commands = { test: 'node --test tests/*.test.mjs' };
  } else if (task.fixture?.startsWith('py-')) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    snap.commands = { test: `${py} -m unittest discover -s tests` };
  }
  snap.enforcement = 'normal';
  await fs.writeFile(snapPath, JSON.stringify(snap, null, 2) + '\n', 'utf8');
}

async function writeCsv(p, rows) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const header = 'task,run,pass,note,durationMs\n';
  const body = rows.map((r) => `${r.task},${r.run},${r.pass ? 1 : 0},"${(r.note || '').replace(/"/g, '""')}",${r.durationMs || 0}`).join('\n');
  await fs.writeFile(p, header + body + '\n', 'utf8');
}

function shortErr(e) {
  return (e?.stderr || e?.message || String(e)).split('\n').slice(0, 3).join(' | ').slice(0, 300);
}
