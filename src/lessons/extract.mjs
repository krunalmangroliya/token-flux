// Extract-lesson: does NOT call an LLM itself.
// Writes a self-contained prompt into the task directory that the running agent reads and
// answers itself. This keeps the package model-agnostic.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exists, readText, writeText } from '../utils.mjs';
import { parseLessons } from './parse.mjs';

export async function extractLessonPrompt({ repoRoot, taskId }) {
  const taskDir = path.join(repoRoot, '.agent-boost', 'tasks', taskId);
  if (!(await exists(taskDir))) throw new Error(`task directory not found: ${taskDir}`);

  const spec = await safeRead(path.join(taskDir, 'spec.md'));
  const plan = await safeRead(path.join(taskDir, 'plan.md'));
  const review = await safeRead(path.join(taskDir, 'review.md'));
  const verifyLog = await safeRead(path.join(taskDir, 'verify.log'));
  const diff = await safeRead(path.join(taskDir, 'diff.patch'));

  const lessons = await parseLessons(repoRoot);
  const existingRules = lessons.slice(-20).map((l) => `- ${l.id}: ${l.rule || '(no rule)'} [tags: ${l.tags.join(', ')}]`).join('\n');

  const prompt = `# Lesson extraction prompt — ${taskId}

You just finished a task. Read the artifacts below and decide whether this task produced a lesson worth keeping.

## Rules for writing a lesson

- Write a lesson only if the task had a non-trivial initial mistake. If it went cleanly, output exactly \`NO_LESSON\` and stop.
- The rule must be one line, imperative mood, specific enough that following it would have prevented the mistake.
- Tags: every file path touched + every domain concept named in the spec. No generic tags ("bug", "test").
- Do not duplicate an existing rule (see list below).

## Output format (if writing a lesson)

\`\`\`
## NEW_LESSON
tags: <comma-separated>
task: <one sentence>
mistake: <what was wrong initially>
correct: <what should have been done>
rule: <one-line imperative>
\`\`\`

## Existing recent rules (do not duplicate)

${existingRules || '(none yet)'}

## Task artifacts

### spec.md
${spec || '(no spec captured)'}

### plan.md
${plan || '(no plan captured)'}

### review.md
${review || '(no review captured)'}

### verify output (last 80 lines)
${tail(verifyLog, 80) || '(no verify log)'}

### diff.patch (first 200 lines)
${head(diff, 200) || '(no diff captured)'}

---

Answer now. If no lesson is warranted, output \`NO_LESSON\`. Otherwise output the \`NEW_LESSON\` block.
`;

  const outPath = path.join(taskDir, 'lesson-prompt.md');
  await writeText(outPath, prompt);
  return outPath;
}

/**
 * Append a lesson block (output from the agent) to LESSONS.md.
 * Accepts the block shape emitted by the extraction prompt above.
 * @param {{ repoRoot: string, block: string }} opts
 */
export async function appendLesson({ repoRoot, block }) {
  if (/^\s*NO_LESSON\s*$/m.test(block)) return { appended: false };

  const match = /##\s*NEW_LESSON\s*([\s\S]*)/m.exec(block);
  if (!match) throw new Error('unrecognized lesson block — expected "## NEW_LESSON" header');
  const body = match[1];
  const tags = (/tags:\s*(.+)/i.exec(body)?.[1] || '').trim();
  const task = (/task:\s*(.+)/i.exec(body)?.[1] || '').trim();
  const mistake = (/mistake:\s*(.+)/i.exec(body)?.[1] || '').trim();
  const correct = (/correct:\s*(.+)/i.exec(body)?.[1] || '').trim();
  const rule = (/rule:\s*(.+)/i.exec(body)?.[1] || '').trim();

  const existing = await parseLessons(repoRoot);
  const nextId = nextIdFrom(existing);
  const date = new Date().toISOString().slice(0, 10);

  const entry = [
    '',
    `## ${nextId}  —  ${date}  —  tags: ${tags}`,
    '',
    `**Task:** ${task}`,
    '',
    `**Initial mistake:** ${mistake}`,
    '',
    `**Correct pattern:** ${correct}`,
    '',
    `**Rule:** ${rule}`,
    '',
  ].join('\n');

  const p = path.join(repoRoot, 'LESSONS.md');
  const current = (await exists(p)) ? await readText(p) : '';
  await writeText(p, current.trimEnd() + '\n' + entry);
  return { appended: true, id: nextId };
}

function nextIdFrom(existing) {
  let max = 0;
  for (const l of existing) {
    const n = parseInt(l.id.replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `L-${String(max + 1).padStart(3, '0')}`;
}

async function safeRead(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return '';
  }
}

function tail(s, n) {
  if (!s) return '';
  const lines = s.split('\n');
  return lines.slice(-n).join('\n');
}
function head(s, n) {
  if (!s) return '';
  const lines = s.split('\n');
  return lines.slice(0, n).join('\n');
}
