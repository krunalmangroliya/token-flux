// Shared parser for LESSONS.md.
// Format per-lesson:
//   ## L-NNN  —  YYYY-MM-DD  —  tags: a, b, c
//   (blank line)
//   **Task:** ...
//   **Initial mistake:** ...
//   **Correct pattern:** ...
//   **Rule:** ...
import path from 'node:path';
import { readText, exists } from '../utils.mjs';

export async function parseLessons(repoRoot) {
  const p = path.join(repoRoot, 'LESSONS.md');
  if (!(await exists(p))) return [];
  const raw = await readText(p);

  const lessons = [];
  const chunks = raw.split(/^##\s+L-/m);
  // First chunk is the file header; skip.
  for (let i = 1; i < chunks.length; i++) {
    const body = '## L-' + chunks[i];
    const header = /^##\s+L-(\d+)\s*[—-]\s*(\d{4}-\d{2}-\d{2})\s*[—-]\s*tags:\s*(.*)$/m.exec(body);
    if (!header) continue;
    const id = `L-${header[1]}`;
    const date = header[2];
    const tags = header[3].split(',').map((t) => t.trim()).filter(Boolean);
    const rule = /\*\*Rule:\*\*\s+(.+?)(?:\n\n|$)/s.exec(body)?.[1]?.trim();
    const task = /\*\*Task:\*\*\s+(.+?)(?:\n\n|$)/s.exec(body)?.[1]?.trim();
    const mistake = /\*\*Initial mistake:\*\*\s+(.+?)(?:\n\n|$)/s.exec(body)?.[1]?.trim();
    const correct = /\*\*Correct pattern:\*\*\s+(.+?)(?:\n\n|$)/s.exec(body)?.[1]?.trim();
    lessons.push({ id, date, tags, rule, task, mistake, correct, raw: body.trim() });
  }
  return lessons;
}

export function nextLessonId(existing) {
  let max = 0;
  for (const l of existing) {
    const n = parseInt(l.id.replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `L-${String(max + 1).padStart(3, '0')}`;
}
