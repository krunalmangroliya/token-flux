// Pre-edit wrapper — called by the hosting agent's edit-tool hook.
// Enforces the discipline: CODEMAP consulted, plan exists, blast-radius reviewed.
// Designed to integrate with Claude Code-style hooks: reads JSON from stdin, writes a decision to stdout.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exists, readJson } from '../utils.mjs';

/**
 * @param {{ repoRoot: string, filePath: string, toolInput?: any, enforcement?: string }} opts
 * @returns {Promise<{ decision: 'allow' | 'deny', reason?: string }>}
 */
export async function checkPreEdit({ repoRoot, filePath, enforcement }) {
  if (enforcement === 'advisory') return { decision: 'allow' };

  const relFile = path.relative(repoRoot, path.resolve(repoRoot, filePath)).split(path.sep).join('/');

  // Skip gate for token-flux scratch space and its own metadata.
  if (relFile.startsWith('.agent-boost/tasks')) return { decision: 'allow' };
  if (relFile === 'LESSONS.md' || relFile === 'CODEMAP.md' || relFile.endsWith('AGENT.md') || relFile === 'CLAUDE.md') {
    return { decision: 'allow' };
  }

  const currentTask = await detectCurrentTask(repoRoot);
  if (!currentTask) {
    if (enforcement === 'strict') {
      return {
        decision: 'deny',
        reason:
          'BLOCKED: No active task directory found under .agent-boost/tasks/. ' +
          'Write a spec.md and plan.md for this task before editing files. See ./.agent-boost/skills/spec-first.md.',
      };
    }
    return { decision: 'allow' };
  }

  const taskDir = path.join(repoRoot, '.agent-boost', 'tasks', currentTask);

  const planPath = path.join(taskDir, 'plan.md');
  if (!(await exists(planPath))) {
    return {
      decision: 'deny',
      reason: `BLOCKED: No plan found for task ${currentTask}. Write ${planPath} before editing. See ./.agent-boost/skills/plan-then-code.md.`,
    };
  }

  const readLogPath = path.join(taskDir, 'read-log');
  const readLog = (await exists(readLogPath)) ? await fs.readFile(readLogPath, 'utf8') : '';
  if (!readLog.split('\n').some((line) => line.trim() && relFile.includes(line.trim()))) {
    return {
      decision: 'deny',
      reason:
        `BLOCKED: CODEMAP.md has not been consulted for ${relFile}. ` +
        `Run: node ./.agent-boost/scripts/pack-context.mjs ${relFile} — or append the file path to ${readLogPath} after reading the relevant CODEMAP section. ` +
        `See ./.agent-boost/skills/consult-codemap.md.`,
    };
  }

  const blastPath = path.join(taskDir, 'blast-radius-reviewed');
  const blast = (await exists(blastPath)) ? await fs.readFile(blastPath, 'utf8') : '';
  if (!blast.split('\n').some((line) => line.trim() && relFile.includes(line.trim()))) {
    return {
      decision: 'deny',
      reason:
        `BLOCKED: Blast radius not reviewed for ${relFile}. ` +
        `Run: node ./.agent-boost/scripts/blast-radius.mjs ${relFile} — then append to ${blastPath}. ` +
        `See ./.agent-boost/skills/check-blast-radius.md.`,
    };
  }

  return { decision: 'allow' };
}

async function detectCurrentTask(repoRoot) {
  const tasksDir = path.join(repoRoot, '.agent-boost', 'tasks');
  if (!(await exists(tasksDir))) return null;
  let entries;
  try { entries = await fs.readdir(tasksDir, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length === 0) return null;
  let best = null;
  for (const name of dirs) {
    const stat = await fs.stat(path.join(tasksDir, name));
    if (!best || stat.mtimeMs > best.mtimeMs) best = { name, mtimeMs: stat.mtimeMs };
  }
  return best?.name || null;
}
