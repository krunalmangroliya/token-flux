// Prune lessons whose referenced file-path tags no longer exist in the repo.
// Archives removed lessons to .agent-boost/lessons-archive.md — never deletes.
import path from 'node:path';
import { parseLessons } from './parse.mjs';
import { readText, writeText, exists, ensureDir } from '../utils.mjs';

export async function pruneLessons({ repoRoot }) {
  const lessons = await parseLessons(repoRoot);
  if (lessons.length === 0) return { archived: 0 };

  const kept = [];
  const archived = [];

  for (const l of lessons) {
    const filePathTags = l.tags.filter((t) => /[./]/.test(t));
    if (filePathTags.length === 0) {
      kept.push(l); // concept-only lessons are kept
      continue;
    }
    let anyExists = false;
    for (const t of filePathTags) {
      if (await exists(path.join(repoRoot, t))) {
        anyExists = true;
        break;
      }
    }
    if (anyExists) kept.push(l);
    else archived.push(l);
  }

  await writeLessons(repoRoot, kept);
  if (archived.length) await appendArchive(repoRoot, archived);
  return { archived: archived.length };
}

async function writeLessons(repoRoot, lessons) {
  const header = await readLessonsHeader(repoRoot);
  const body = lessons.map((l) => l.raw).join('\n\n');
  await writeText(path.join(repoRoot, 'LESSONS.md'), header + (body ? body + '\n' : ''));
}

async function readLessonsHeader(repoRoot) {
  const p = path.join(repoRoot, 'LESSONS.md');
  if (!(await exists(p))) return '';
  const raw = await readText(p);
  const firstLesson = raw.search(/^##\s+L-/m);
  return firstLesson >= 0 ? raw.slice(0, firstLesson) : raw;
}

async function appendArchive(repoRoot, lessons) {
  const dir = path.join(repoRoot, '.agent-boost');
  await ensureDir(dir);
  const archivePath = path.join(dir, 'lessons-archive.md');
  const current = (await exists(archivePath)) ? await readText(archivePath) : '# Archived lessons\n\n';
  const appended = current.trimEnd() + '\n\n' + lessons.map((l) => `<!-- archived ${new Date().toISOString().slice(0, 10)} -->\n${l.raw}`).join('\n\n') + '\n';
  await writeText(archivePath, appended);
}
