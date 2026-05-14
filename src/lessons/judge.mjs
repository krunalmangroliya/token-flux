// Judge: validates a freshly-written lesson against simple structural rules.
// Kept model-free by design: only checks shape, length, tag presence, and duplication against existing rules.
import { parseLessons } from './parse.mjs';

/**
 * @param {{ repoRoot: string, block: string }} opts
 * @returns {Promise<{ ok: boolean, reasons: string[] }>}
 */
export async function judgeLesson({ repoRoot, block }) {
  const reasons = [];
  const existing = await parseLessons(repoRoot);

  if (!/##\s*NEW_LESSON/.test(block)) {
    reasons.push('missing "## NEW_LESSON" header');
  }
  const rule = (/rule:\s*(.+)/i.exec(block)?.[1] || '').trim();
  const tags = (/tags:\s*(.+)/i.exec(block)?.[1] || '').trim();
  const task = (/task:\s*(.+)/i.exec(block)?.[1] || '').trim();
  const mistake = (/mistake:\s*(.+)/i.exec(block)?.[1] || '').trim();
  const correct = (/correct:\s*(.+)/i.exec(block)?.[1] || '').trim();

  if (!rule) reasons.push('no rule');
  else if (rule.length > 240) reasons.push('rule too long (>240 chars) — tighten it');
  else if (rule.length < 20) reasons.push('rule suspiciously short — is it specific?');
  else if (/\b(try|consider|perhaps|maybe|probably|might)\b/i.test(rule)) reasons.push('rule contains hedging words');

  if (!tags) reasons.push('no tags');
  else if (tags.split(',').length < 2) reasons.push('need at least two tags (file path + concept)');

  const generic = ['bug', 'test', 'code', 'fix', 'work'];
  const tagList = tags.split(',').map((t) => t.trim().toLowerCase());
  if (tagList.some((t) => generic.includes(t))) reasons.push(`avoid generic tag(s): ${tagList.filter((t) => generic.includes(t)).join(', ')}`);

  if (!task) reasons.push('no task summary');
  if (!mistake) reasons.push('no initial mistake captured');
  if (!correct) reasons.push('no correct pattern captured');

  // Duplication check
  for (const l of existing) {
    if (l.rule && rule && similar(l.rule, rule) > 0.85) {
      reasons.push(`duplicate of ${l.id}`);
      break;
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function similar(a, b) {
  const ta = new Set(a.toLowerCase().match(/[a-z0-9]+/g) || []);
  const tb = new Set(b.toLowerCase().match(/[a-z0-9]+/g) || []);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}
