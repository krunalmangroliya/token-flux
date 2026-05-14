// Caveman mode — compresses AI output tokens via system instruction injection.
// Three levels: lite (40%), full (65%), ultra (75% savings).
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CAVEMAN_LEVELS = {
  light: { name: 'Light', savingPct: 25, description: 'Concise, quality-first' },
  lite:  { name: 'Lite',  savingPct: 25, description: 'Concise, quality-first' },
  full:  { name: 'Full',  savingPct: 45, description: 'Compact, complete answers' },
  ultra: { name: 'Ultra', savingPct: 60, description: 'Aggressive prose compression' },
};

/** Default caveman level — ultra for maximum token savings */
export const DEFAULT_CAVEMAN_LEVEL = 'full';

// Whole sentences that are pure filler — match these fully
const FILLER_SENTENCES = [
  /^(sure|certainly|of course|absolutely|no problem|you're welcome)[!.,]?$/i,
  /^great (question|point|observation)[!.,]?$/i,
  /^happy to help[!.,]?$/i,
  /^i('d| would) be happy to help( you)?( with that)?[!.,]?$/i,
  /^i('d| would) love to help( you)?( with that)?[!.,]?$/i,
  /^i hope (this|that) helps[!.,]?$/i,
  /^let me know if you have any (other )?questions[!.,]?$/i,
  /^feel free to (ask|reach out)[^.!?]{0,30}[!.,]?$/i,
  /^(of course|absolutely),? (here('s| is)|i'll)[^.!?]{0,50}[!.,]?$/i,
  /^i('m| am) (glad|happy) (you asked|to help)[^.!?]{0,40}[!.,]?$/i,
];

// Prefixes to strip from the beginning of a sentence (keep the rest of the sentence)
const FILLER_PREFIXES = [
  /^(as an ai,?\s*|as a language model,?\s*|as your ai assistant,?\s*)/i,
  /^(to summarize,?\s*|in summary,?\s*|to recap,?\s*)/i,
  /^(that(?:'s| is) a (?:great|excellent|wonderful) (?:question|point)[,.]?\s*)/i,
];

export function stripResponseFiller(text) {
  if (!text || !text.trim()) return text;

  return text
    .split(/(```[\s\S]*?```)/g)
    .map(part => part.startsWith('```') ? part : stripProseFiller(part))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripProseFiller(text) {
  return text
    .split(/(\n+)/)
    .map(part => part.includes('\n') ? part : stripSentenceFiller(part))
    .join('');
}

function stripSentenceFiller(text) {
  // Split into sentences on . ! ? followed by whitespace or end
  const sentences = text.split(/(?<=[.!?])\s+/);

  const kept = [];
  for (let s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;

    // Drop if the entire sentence is a filler phrase
    if (FILLER_SENTENCES.some(re => re.test(trimmed))) continue;

    // Strip filler prefix from beginning of sentence, keep the rest
    for (const re of FILLER_PREFIXES) {
      s = s.replace(re, '');
    }

    if (s.trim()) kept.push(s.trim());
  }

  return kept.join(' ').trim();
}

export function buildCavemanInstruction(level = 'full') {
  const instructions = {
    light: `RESPONSE STYLE: Concise. No filler phrases. Give the answer directly. For code tasks include: root cause, exact fix, verification. Keep technical accuracy and completeness above token saving.`,

    lite: `RESPONSE STYLE: Concise. No filler phrases. Give the answer directly. For code tasks include: root cause, exact fix, verification. Keep technical accuracy and completeness above token saving.`,

    full: `RESPONSE STYLE: Compact but complete. Skip filler and pleasantries. For code tasks use: root cause -> fix -> verification -> result. Do not omit edge cases, security checks, file paths, commands, or failing-test output.`,

    ultra: `RESPONSE STYLE: Ultra-compressed prose, not ultra-compressed reasoning. Fragments OK, but code, file paths, commands, API names, routes, auth/security details, tests, and error messages must stay exact. Never abbreviate identifiers. Never skip verification.`,
  };

  return instructions[level] || instructions.full;
}

export async function getCurrentLevel(repoRoot) {
  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg.cavemanLevel || DEFAULT_CAVEMAN_LEVEL;
  } catch {
    return DEFAULT_CAVEMAN_LEVEL;
  }
}

export async function setLevel(repoRoot, level) {
  if (!CAVEMAN_LEVELS[level]) throw new Error(`Invalid level: ${level}. Use light/lite, full, or ultra.`);
  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  let cfg = {};
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    cfg = JSON.parse(raw);
  } catch { /* fresh config */ }
  cfg.cavemanLevel = level;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
  return level;
}
