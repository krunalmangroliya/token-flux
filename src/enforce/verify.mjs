// The verifier — runs format / lint / typecheck / test / build / secrets in order.
// Writes a human-readable transcript to .agent-boost/tasks/current/verify.log when a task exists.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { exists, readJson, writeText } from '../utils.mjs';

/**
 * @param {{ repoRoot: string, taskId?: string }} opts
 * @returns {Promise<number>} exit code; 0 = pass
 */
export async function runVerify({ repoRoot, taskId }) {
  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  const snapshotPath = path.join(repoRoot, '.agent-boost', 'scripts', 'config.snapshot.json');
  let commands = {};
  let enforcement = 'normal';
  if (await exists(snapshotPath)) {
    const snap = await readJson(snapshotPath);
    commands = snap.commands || {};
    enforcement = snap.enforcement || 'normal';
  } else if (await exists(configPath)) {
    const cfg = await readJson(configPath);
    commands = cfg.commands || {};
    enforcement = cfg.enforcement || 'normal';
  } else {
    console.error('[verify] no .agent-boost config found. Run: token-flux init');
    return 2;
  }

  const steps = [
    { name: 'autofix',   cmd: commands.autofix,   blocking: false, isAutofix: true },
    { name: 'format',    cmd: commands.format,    blocking: enforcement === 'strict' },
    { name: 'lint',      cmd: commands.lint,      blocking: enforcement !== 'advisory' },
    { name: 'typecheck', cmd: commands.typecheck, blocking: enforcement !== 'advisory' },
    { name: 'test',      cmd: commands.test,      blocking: enforcement !== 'advisory' },
    { name: 'build',     cmd: commands.build,     blocking: enforcement !== 'advisory' },
    { name: 'secrets',   cmd: commands.secrets,   blocking: enforcement === 'strict' },
  ];

  const transcriptLines = [];
  const log = (s) => { console.log(s); transcriptLines.push(s); };

  let firstFailure = 0;
  for (const step of steps) {
    if (!step.cmd) {
      if (!step.isAutofix) log(`[${step.name}] skipped (no command configured)`);
      continue;
    }

    if (step.isAutofix) {
      log(`[${step.name}] $ ${step.cmd} (Zero-Token Pre-Agent Verification)`);
      await runCommand(step.cmd, repoRoot, transcriptLines);
      log(`[${step.name}] ✓ auto-fix applied`);
      continue;
    }

    log(`[${step.name}] $ ${step.cmd}`);
    const rc = await runCommand(step.cmd, repoRoot, transcriptLines);
    if (rc === 0) {
      log(`[${step.name}] ✓ pass`);
    } else {
      log(`[${step.name}] ✗ fail (exit ${rc})`);
      if (step.blocking && firstFailure === 0) firstFailure = rc || 1;
      // Don't short-circuit — the agent wants the full picture of what's broken.
    }
  }

  // Persist transcript for the task if one is active.
  const resolvedTaskId = taskId || (await detectActiveTask(repoRoot));
  if (resolvedTaskId) {
    const p = path.join(repoRoot, '.agent-boost', 'tasks', resolvedTaskId, 'verify.log');
    await writeText(p, transcriptLines.join('\n') + '\n');
  }

  if (firstFailure !== 0) {
    log('');
    log(`verify: FAILED — task is not done.`);
  } else {
    log('');
    log('verify: PASS');
  }
  return firstFailure;
}

async function detectActiveTask(repoRoot) {
  const tasksDir = path.join(repoRoot, '.agent-boost', 'tasks');
  if (!(await exists(tasksDir))) return null;
  let dirs;
  try { dirs = await fs.readdir(tasksDir, { withFileTypes: true }); } catch { return null; }
  const active = dirs.filter((d) => d.isDirectory() && d.name !== 'current').map((d) => d.name);
  if (active.length === 0) return null;
  // Most recently modified wins.
  let best = null;
  for (const name of active) {
    const stat = await fs.stat(path.join(tasksDir, name));
    if (!best || stat.mtimeMs > best.mtimeMs) best = { name, mtimeMs: stat.mtimeMs };
  }
  return best?.name || null;
}

function runCommand(cmd, cwd, transcriptLines) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const args = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];
    const child = spawn(shell, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(s);
      transcriptLines.push(s.replace(/\s+$/, ''));
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      process.stderr.write(s);
      transcriptLines.push(s.replace(/\s+$/, ''));
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}
