#!/usr/bin/env node
// .agent-boost/scripts/self-review.mjs [task-id]
//
// Improved self-review: auto-detects task from git state, captures richer context,
// outputs the review prompt directly to stdout (enters agent context naturally),
// and saves the prompt to the task directory. Supports --auto mode that skips task-id.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadAgentBoost } from './_load.mjs';

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const isQuiet = flags.includes('--quiet');
const isStdout = flags.includes('--stdout');
const isJson = flags.includes('--json');

const { repoRoot } = await loadAgentBoost();

// ─── Auto-detect task ID ─────────────────────────────────────────────────────
let taskId = positional[0];

if (!taskId) {
  // Try to find the most recently modified task directory
  taskId = await detectActiveTask(repoRoot);
  if (!taskId) {
    console.error('No active task found. Provide a task-id or create a task directory first.');
    console.error('usage: node ./.agent-boost/scripts/self-review.mjs [task-id]');
    console.error('   or: node ./.agent-boost/scripts/self-review.mjs --auto');
    process.exit(2);
  }
  if (!isQuiet) console.error(`[self-review] auto-detected task: ${taskId}`);
}

// ─── Gather Context ──────────────────────────────────────────────────────────
const taskDir = path.join(repoRoot, '.agent-boost', 'tasks', taskId);
await fs.mkdir(taskDir, { recursive: true });

const [spec, plan, verify, diff, codemap, lessons] = await Promise.all([
  safe(path.join(taskDir, 'spec.md')),
  safe(path.join(taskDir, 'plan.md')),
  safe(path.join(taskDir, 'verify.log')),
  getDiff(repoRoot, taskDir),
  getCodemapSummary(repoRoot),
  getRelevantLessons(repoRoot, taskDir),
]);

// ─── Analyze Diff ────────────────────────────────────────────────────────────
const diffStats = analyzeDiff(diff);

// ─── Build Prompt ────────────────────────────────────────────────────────────
const prompt = buildReviewPrompt({ taskId, spec, plan, verify, diff, diffStats, codemap, lessons });

// ─── Output ──────────────────────────────────────────────────────────────────

if (isJson) {
  // Machine-readable output for integration with agent hooks
  const output = {
    taskId,
    promptPath: path.relative(repoRoot, path.join(taskDir, 'review-prompt.md')),
    reviewPath: path.relative(repoRoot, path.join(taskDir, 'review.md')),
    diffStats,
    filesChanged: diffStats.files,
  };
  console.log(JSON.stringify(output, null, 2));
} else if (isStdout) {
  // Print directly to stdout so the agent's context picks it up
  console.log(prompt);
} else {
  // Default: save to file AND print an actionable summary to stdout
  const out = path.join(taskDir, 'review-prompt.md');
  await fs.writeFile(out, prompt, 'utf8');

  console.log(`\n═══ SELF-REVIEW: ${taskId} ═══\n`);
  console.log(`📂 Files changed: ${diffStats.files.length > 0 ? diffStats.files.join(', ') : '(none detected)'}`);
  console.log(`📊 Diff size: +${diffStats.additions} -${diffStats.deletions} lines`);
  if (diffStats.newFiles.length > 0) console.log(`🆕 New files: ${diffStats.newFiles.join(', ')}`);
  if (diffStats.deletedFiles.length > 0) console.log(`🗑️  Deleted: ${diffStats.deletedFiles.join(', ')}`);
  console.log('');

  // Print the COMPACT review prompt to stdout so agents naturally see it
  console.log('──── Review this task before declaring it done ────');
  console.log('');
  console.log(`Act as a senior reviewer. You did NOT write this code.`);
  console.log(`Review the ${diffStats.additions + diffStats.deletions} changed lines against the spec below.`);
  console.log('');
  console.log('Check for:');
  console.log('  1. Bugs — logic errors, off-by-ones, null dereference');
  console.log('  2. Missing edge cases — empty inputs, boundary values, concurrency');
  console.log('  3. Anti-patterns — code that conflicts with existing repo patterns');
  console.log('  4. Missing error handling — silent failures, uncaught promises');
  console.log('  5. Missing tests — new code paths without test coverage');
  console.log('');
  console.log(`Full prompt: ${path.relative(repoRoot, out)}`);
  console.log(`Save review: ${path.relative(repoRoot, path.join(taskDir, 'review.md'))}`);
  console.log('');
  console.log('──── Spec summary ────');
  if (spec) {
    // Print first 10 meaningful lines of spec
    const specLines = spec.split('\n').filter(l => l.trim()).slice(0, 10);
    specLines.forEach(l => console.log(`  ${l}`));
    if (spec.split('\n').filter(l => l.trim()).length > 10) console.log('  ...');
  } else {
    console.log('  (no spec found)');
  }
  console.log('');
  console.log('──── Verify status ────');
  if (verify) {
    // Print last 5 meaningful lines of verify output
    const verifyLines = verify.split('\n').filter(l => l.trim()).slice(-5);
    verifyLines.forEach(l => console.log(`  ${l}`));
  } else {
    console.log('  (no verify log — run verify first)');
  }
  console.log('');
  console.log(`Verdict options: ship ✅ | revise ⚠️ | scrap ❌`);
  console.log(`If verdict is "revise" or "scrap" → fix the issues and re-run verify.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════════

function buildReviewPrompt({ taskId, spec, plan, verify, diff, diffStats, codemap, lessons }) {
  return `# Self-review prompt — ${taskId}

Act as a senior reviewer. You did not write this code. Assess the diff below against the spec and plan.
Your review must be thorough but concise. Focus on correctness, not style.

## Review Checklist

1. **Bugs** — Does the code do what the spec says? Any logic errors, off-by-ones, null dereference?
2. **Missing edge cases** — Empty inputs, boundary values, concurrent access, error states?
3. **Anti-patterns** — Code that conflicts with existing patterns in this repo?
4. **Error handling** — Are all errors handled explicitly? No silent swallows, uncaught promises?
5. **Missing tests** — Are new code paths covered by tests?
6. **Over-engineering** — Any abstraction without a second caller?
7. **Security** — SQL injection, XSS, path traversal, hardcoded secrets?
8. **Breaking changes** — Public API changes that would break callers?

## Output format

\`\`\`markdown
# Review: ${taskId}

## Bugs
- <file:line> — <what breaks and why>

## Missing edge cases
- <specific input not handled>

## Anti-patterns
- <pattern conflicting with the rest of this repo>

## Error handling gaps
- <where errors can slip through>

## Missing tests
- <new code paths without test coverage>

## Over-engineering
- <abstraction without a second caller>

## Verdict
- ship | revise | scrap
- <one-line justification>

## Suggested fixes (if verdict is revise)
1. <specific action>
2. <specific action>
\`\`\`

If the verdict is "revise" or "scrap", the task is NOT done. Fix the issues and re-run verify.

---

## Diff Stats
- Files changed: ${diffStats.files.length}
- Additions: +${diffStats.additions} lines
- Deletions: -${diffStats.deletions} lines
${diffStats.newFiles.length > 0 ? `- New files: ${diffStats.newFiles.join(', ')}\n` : ''}${diffStats.deletedFiles.length > 0 ? `- Deleted files: ${diffStats.deletedFiles.join(', ')}\n` : ''}

## Spec
${spec || '(none — reviewer should flag this as a problem)'}

## Plan
${plan || '(none)'}

## Verify output (tail)
${tail(verify, 60) || '(no verify log — flag: verify must run before review)'}

## Relevant lessons from past tasks
${lessons || '(none)'}

## Codemap context (affected modules)
${codemap || '(no codemap available)'}

## Diff
${diff || '(no diff captured — run: git diff > .agent-boost/tasks/' + taskId + '/diff.patch)'}
`;
}

function analyzeDiff(diff) {
  if (!diff) return { files: [], additions: 0, deletions: 0, newFiles: [], deletedFiles: [] };
  const lines = diff.split('\n');
  const files = new Set();
  const newFiles = new Set();
  const deletedFiles = new Set();
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    const fileMatch = /^diff --git a\/(.+) b\/(.+)/.exec(line);
    if (fileMatch) files.add(fileMatch[2]);

    if (line.startsWith('new file mode')) {
      const last = [...files].pop();
      if (last) newFiles.add(last);
    }
    if (line.startsWith('deleted file mode')) {
      const last = [...files].pop();
      if (last) deletedFiles.add(last);
    }

    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  return {
    files: [...files],
    additions,
    deletions,
    newFiles: [...newFiles],
    deletedFiles: [...deletedFiles],
  };
}

async function detectActiveTask(root) {
  const tasksDir = path.join(root, '.agent-boost', 'tasks');
  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());
    if (dirs.length === 0) return null;

    let best = null;
    for (const d of dirs) {
      const stat = await fs.stat(path.join(tasksDir, d.name));
      if (!best || stat.mtimeMs > best.mtimeMs) best = { name: d.name, mtimeMs: stat.mtimeMs };
    }
    return best?.name || null;
  } catch {
    return null;
  }
}

async function safe(p) {
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
}

function tail(s, n) {
  if (!s) return '';
  return s.split('\n').slice(-n).join('\n');
}

async function getDiff(root, taskDir) {
  // First try saved diff patch in the task directory
  const patchPath = path.join(taskDir, 'diff.patch');
  try {
    const saved = await fs.readFile(patchPath, 'utf8');
    if (saved.trim()) return saved;
  } catch {}

  // Fall back to live git diff
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);

    // Try staged first, then unstaged, then HEAD
    let { stdout } = await run('git', ['diff', '--cached', '--unified=3'], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
    if (!stdout.trim()) {
      ({ stdout } = await run('git', ['diff', '--unified=3'], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
    }
    if (!stdout.trim()) {
      ({ stdout } = await run('git', ['diff', '--unified=3', 'HEAD~1'], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
    }
    return stdout || '';
  } catch {
    return '';
  }
}

async function getCodemapSummary(root) {
  const codemapPath = path.join(root, 'CODEMAP.md');
  try {
    const content = await fs.readFile(codemapPath, 'utf8');
    // Return just the first 50 lines (module overview)
    return content.split('\n').slice(0, 50).join('\n');
  } catch {
    return '';
  }
}

async function getRelevantLessons(root, taskDir) {
  const lessonsPath = path.join(root, 'LESSONS.md');
  const specPath = path.join(taskDir, 'spec.md');
  try {
    const lessons = await fs.readFile(lessonsPath, 'utf8');
    const spec = await safe(specPath);
    if (!lessons.trim() || lessons.split('##').length <= 2) return '';

    // Extract tags from spec to find relevant lessons
    if (spec) {
      const specWords = new Set(spec.toLowerCase().match(/\b[a-z][a-z0-9_.-]+\b/g) || []);
      const sections = lessons.split(/^## /m).slice(1);
      const relevant = sections.filter(s => {
        const sLower = s.toLowerCase();
        let hits = 0;
        for (const w of specWords) {
          if (sLower.includes(w)) hits++;
        }
        return hits >= 2;
      }).slice(0, 3);
      if (relevant.length > 0) return relevant.map(s => '## ' + s).join('\n');
    }

    // Fallback: last 3 lessons
    const sections = lessons.split(/^## /m).slice(1);
    return sections.slice(-3).map(s => '## ' + s).join('\n');
  } catch {
    return '';
  }
}
