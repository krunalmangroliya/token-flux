// Retrieve top-k lessons for a given task description.
// Strategy: tag match (exact token overlap) with fall-back to lightweight token-bag similarity
// over the combined task+mistake+rule text. No vector DB, no hosted service.
import { parseLessons } from './parse.mjs';

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'be',
  'was', 'were', 'for', 'with', 'by', 'this', 'that', 'it', 'as', 'from', 'into', 'when',
]);

/**
 * @param {{ repoRoot: string, query: string, limit?: number }} opts
 */
export async function retrieveLessons({ repoRoot, query, limit = 3 }) {
  const lessons = await parseLessons(repoRoot);
  if (lessons.length === 0) return renderBlock([]);

  const queryTokens = tokenize(query);
  const scored = lessons.map((l) => {
    const tagSet = new Set(l.tags.map((t) => t.toLowerCase()));
    const tagHits = [...queryTokens].filter((t) => tagSet.has(t)).length;

    const body = [l.task, l.mistake, l.rule].filter(Boolean).join(' ');
    const bodyTokens = tokenize(body);
    const bodyHits = [...queryTokens].filter((t) => bodyTokens.has(t)).length;

    // Recency bias: newer lessons get a tiny boost.
    const recency = dateScore(l.date);
    const score = tagHits * 5 + bodyHits + recency;
    return { ...l, score, tagHits, bodyHits };
  });

  const top = scored
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return renderBlock(top);
}

function renderBlock(top) {
  if (top.length === 0) return '<!-- RELEVANT_LESSONS: none -->';
  const lines = ['<!-- RELEVANT_LESSONS: top ' + top.length + ' -->'];
  lines.push('# Relevant past lessons');
  lines.push('');
  for (const l of top) {
    lines.push(`## ${l.id} — ${l.date} — tags: ${l.tags.join(', ')}`);
    lines.push(`**Rule:** ${l.rule || '(no rule recorded)'}`);
    if (l.task) lines.push(`_task: ${l.task}_`);
    lines.push('');
  }
  return lines.join('\n');
}

function tokenize(s) {
  const out = new Set();
  for (const tok of (s || '').toLowerCase().match(/[a-z0-9][a-z0-9_./-]{1,}/g) || []) {
    if (!STOP.has(tok) && tok.length >= 3) out.add(tok);
  }
  return out;
}

function dateScore(d) {
  if (!d) return 0;
  const then = new Date(d).getTime();
  if (Number.isNaN(then)) return 0;
  const ageDays = (Date.now() - then) / 86400000;
  if (ageDays < 30) return 2;
  if (ageDays < 90) return 1;
  return 0;
}
