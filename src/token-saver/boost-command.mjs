// boost-command.mjs — Orchestrates the full boost pipeline:
// 1. Detect domain + task type
// 2. Inject CODEMAP section for mentioned files (Strategy 4)
// 3. Inject relevant LESSONS (Strategy 4)
// 4. Apply chain-of-thought scaffold (Strategy 5)
// 5. Build expert-enhanced prompt ready to paste into AI
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { enhance, detectDomain, detectTaskType } from '../enforce/flash-enhancer.mjs';
import { detectModel, getCachedModel } from './model-detector.mjs';


// ─── CODEMAP Section Extractor (Strategy 4) ──────────────────────────────────

/**
 * Extract relevant CODEMAP sections for files mentioned in the prompt.
 * @param {string} repoRoot
 * @param {string} prompt
 * @returns {Promise<string>} Relevant codemap snippet or ''
 */
async function extractCodemapContext(repoRoot, prompt) {
  const codemapPath = path.join(repoRoot, 'CODEMAP.md');
  try {
    const raw = await fs.readFile(codemapPath, 'utf8');
    const lines = raw.split('\n');

    // Extract file paths mentioned in the prompt
    const fileRefs = prompt.match(/[\w./\\-]+\.\w{1,6}/g) || [];
    const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);

    const relevant = [];
    let capture = false;
    let captureLines = 0;

    for (const line of lines) {
      // Start capturing if line matches a file ref or keyword
      const isMatch =
        fileRefs.some(f => line.includes(f)) ||
        keywords.some(k => line.toLowerCase().includes(k));

      if (isMatch && !capture) {
        capture = true;
        captureLines = 0;
      }

      if (capture) {
        relevant.push(line);
        captureLines++;
        if (captureLines >= 12) { // cap each section at 12 lines
          capture = false;
          relevant.push('');
        }
      }
    }

    if (relevant.length === 0) return '';

    const snippet = relevant.slice(0, 40).join('\n').trim(); // max 40 lines total
    const tokens = Math.ceil(snippet.length / 4);
    return `## Repo Context (from CODEMAP.md — ${tokens} tok)\n${snippet}`;
  } catch {
    try {
      const anatomyPath = path.join(repoRoot, '.agent-boost', 'anatomy.md');
      const raw = await fs.readFile(anatomyPath, 'utf8');
      const lines = raw.split('\n');
      const fileRefs = prompt.match(/[\w./\\-]+\.\w{1,6}/g) || [];
      const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const relevant = lines.filter(line =>
        fileRefs.some(f => line.includes(f)) ||
        keywords.some(k => line.toLowerCase().includes(k))
      ).slice(0, 45).join('\n').trim();
      if (!relevant) return '';
      const tokens = Math.ceil(relevant.length / 4);
      return `## Repo Context (from .agent-boost/anatomy.md - ${tokens} tok)\n${relevant}`;
    } catch {
      return ''; // CODEMAP/anatomy not built yet - skip gracefully
    }
  }
}

// ─── LESSONS Extractor (Strategy 4) ──────────────────────────────────────────

/**
 * Extract top 2 relevant lessons from LESSONS.md for the prompt.
 * @param {string} repoRoot
 * @param {string} prompt
 * @returns {Promise<string>} Relevant lessons block or ''
 */
async function extractLessonsContext(repoRoot, prompt) {
  const lessonsPath = path.join(repoRoot, 'LESSONS.md');
  try {
    const raw = await fs.readFile(lessonsPath, 'utf8');
    const keywords = prompt.toLowerCase().split(/\W+/).filter(w => w.length > 4);

    // Split into lesson blocks (## L-NNN headers)
    const blocks = raw.split(/(?=^## L-\d+)/m).filter(b => b.includes('## L-'));

    // Score each block by keyword overlap
    const scored = blocks.map(block => {
      const lower = block.toLowerCase();
      const score = keywords.filter(k => lower.includes(k)).length;
      return { block, score };
    }).filter(b => b.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length === 0) return '';

    // Take top 2, extract just the Rule line from each
    const rules = scored.slice(0, 2).map(({ block }) => {
      const ruleMatch = block.match(/\*\*Rule:\*\*\s*(.+)/);
      const titleMatch = block.match(/## (L-\d+)[^\n]*/);
      return ruleMatch
        ? `- ${titleMatch?.[1] || 'Lesson'}: ${ruleMatch[1].trim()}`
        : block.split('\n').slice(0, 3).join(' ').trim().slice(0, 120);
    });

    return `## Relevant Lessons (from LESSONS.md)\n${rules.join('\n')}`;
  } catch {
    return ''; // No LESSONS.md yet — skip
  }
}

// ─── Main Boost Pipeline ─────────────────────────────────────────────────────

/**
 * Run the full boost pipeline on a prompt.
 * @param {string} prompt
 * @param {string} repoRoot
 * @param {{ domain?: string, taskType?: string, noCodemap?: boolean, noLessons?: boolean }} opts
 * @returns {Promise<BoostResult>}
 */
export async function runBoost(prompt, repoRoot, opts = {}) {
  const detected = detectDomain(prompt);
  const task     = detectTaskType(prompt);

  // Auto-detect model from IDE if not explicitly passed
  let model = opts.model || '';
  if (!model) {
    // Try live detection first, then fall back to cache
    const liveResult = await detectModel(repoRoot);
    model = liveResult?.normalisedModel || await getCachedModel(repoRoot) || '';
  }

  const [codemapCtx, lessonsCtx] = await Promise.all([
    opts.noCodemap ? '' : extractCodemapContext(repoRoot, prompt),
    opts.noLessons ? '' : extractLessonsContext(repoRoot, prompt),
  ]);

  const repoContext = [codemapCtx, lessonsCtx].filter(Boolean).join('\n\n') || null;

  const result = enhance(prompt, {
    domain:   opts.domain || detected.domain,
    taskType: opts.taskType || task.type,
    repoContext,
    model,
  });

  const codemapTok  = codemapCtx ? Math.ceil(codemapCtx.length / 4) : 0;
  const lessonCount = lessonsCtx ? (lessonsCtx.match(/^- /gm) || []).length : 0;

  return {
    enhanced:       result.enhanced,
    domain:         result.domain,
    role:           result.role,
    taskType:       result.taskType,
    secondary:      result.secondary,
    modelId:        result.modelId,
    modelDetected:  !!model,
    codemapTok,
    lessonCount,
    repoContext:    !!repoContext,
    originalLength: prompt.length,
    enhancedLength: result.enhanced.length,
    enhancedTokens: Math.ceil(result.enhanced.length / 4),
  };
}


/**
 * Format and print the boost result to stdout.
 * @param {object} result - from runBoost()
 * @param {import('picocolors')} pc
 */
export function printBoostResult(result, pc) {
  const tierIcon  = result.domain === 'general' ? '🔧' : '🎯';
  const secondary = result.secondary.length > 0 ? ` + ${result.secondary.join(', ')}` : '';
  const modelLabel = result.modelId && result.modelId !== 'generic-weak'
    ? pc.bold(result.modelId)
    : pc.dim('auto (generic-weak fallback)');

  console.log(`\n${pc.bold(pc.cyan('🚀 token-flux — BOOST Mode'))}\n`);
  console.log(`  ${tierIcon} Domain   : ${pc.bold(result.domain)}${secondary}`);
  console.log(`  🧠 Role     : ${result.role}`);
  console.log(`  📋 Task     : ${pc.bold(result.taskType.toUpperCase())}`);
  console.log(`  🤖 Model    : ${modelLabel}`);
  if (result.codemapTok > 0) {
    console.log(`  🗺  CODEMAP  : ${result.codemapTok} tok injected`);
  } else {
    console.log(`  🗺  CODEMAP  : ${pc.dim('not found — run: token-flux codemap')}`);
  }
  if (result.lessonCount > 0) {
    console.log(`  📚 Lessons  : ${result.lessonCount} relevant lesson(s) injected`);
  } else {
    console.log(`  📚 Lessons  : ${pc.dim('none yet — lessons grow as you work')}`);
  }
  console.log(`  📦 Size     : ${result.originalLength} → ${result.enhancedLength} chars (~${result.enhancedTokens} tok)`);

  console.log(`\n${pc.dim('─── PASTE THIS INTO YOUR AI ─'.padEnd(60, '─'))}\n`);
  console.log(result.enhanced);
  console.log(`\n${pc.dim('─'.repeat(60))}\n`);
}
