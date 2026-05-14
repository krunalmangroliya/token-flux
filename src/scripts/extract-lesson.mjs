#!/usr/bin/env node
// .agent-boost/scripts/extract-lesson.mjs <task-id>
// Generates a lesson-extraction prompt for the agent to answer. If the agent emits a block
// back on stdin (pipe mode) the script also validates + appends it to LESSONS.md.
import { loadAgentBoost } from './_load.mjs';
import path from 'node:path';

const taskId = process.argv[2];
if (!taskId) {
  console.error('usage: node ./.agent-boost/scripts/extract-lesson.mjs <task-id> [--append < block.md]');
  process.exit(2);
}
const appendMode = process.argv.includes('--append');

const { ab, repoRoot } = await loadAgentBoost();

if (!appendMode) {
  const outPath = await ab.extractLessonPrompt({ repoRoot, taskId });
  console.log(`prompt written to ${path.relative(repoRoot, outPath)}`);
  console.log('');
  console.log('Next: read the prompt, answer it (produce either NO_LESSON or a NEW_LESSON block),');
  console.log('then run this script with --append piping the block on stdin to record it.');
  process.exit(0);
}

let block = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) block += chunk;

const judged = await ab.judgeLesson({ repoRoot, block });
if (!judged.ok) {
  console.error('lesson rejected:');
  for (const r of judged.reasons) console.error(`  - ${r}`);
  process.exit(1);
}
const appended = await ab.appendLesson({ repoRoot, block });
if (appended.appended) console.log(`appended ${appended.id} to LESSONS.md`);
else console.log('no lesson appended (NO_LESSON block).');
