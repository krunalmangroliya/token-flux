// smart-mode.mjs — Adaptive mode engine for "both" mode.
// Detects model tier (weak/strong/unknown) and returns the right
// feature configuration dynamically — no manual switching needed.
import { detectModel, getCachedModel, normaliseModelName } from './token-saver/model-detector.mjs';
import { getModelProfile } from './enforce/flash-enhancer.mjs';
import { getMode, MODES } from './mode.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Model Tier Classification ────────────────────────────────────────────────

/**
 * Strong models — don't need quality boosting, prioritise token saving.
 * These models produce reliable output without scaffolding.
 */
const STRONG_MODELS = new Set([
  'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet', 'claude-sonnet',
  'claude-opus', 'sonnet', 'opus',
  'gpt-4o', 'gpt-4', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3',
  'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-pro', 'gemini-ultra',
  'deepseek-v3', 'deepseek-r1',       // full DeepSeek v3/R1 are strong
  'llama-3-70b', 'llama-3.1-405b',    // large Llamas are borderline strong
  'mistral-large', 'mixtral-8x22b',
]);

/**
 * Weak models — quality boosting ON, token saving LITE.
 */
const WEAK_MODELS = new Set([
  'haiku', 'claude-haiku',
  'gpt-4o-mini', 'gpt-3.5-turbo',
  'flash', 'gemini-flash', 'flash-lite',
  'llama-3',                            // 8B/standard Llama
  'mistral-7b', 'mistral',
  'deepseek-coder',                     // coder variant is weaker than v3
  'qwen',
  'phi-3',
  'codestral',
  'generic-weak',
]);

/**
 * Classify a normalised model name as 'weak', 'strong', or 'unknown'.
 * @param {string} normalisedModel
 * @returns {'weak'|'strong'|'unknown'}
 */
export function classifyModel(normalisedModel) {
  if (!normalisedModel) return 'unknown';
  const lower = normalisedModel.toLowerCase();

  for (const s of STRONG_MODELS) {
    if (lower.includes(s) || s.includes(lower)) return 'strong';
  }
  for (const w of WEAK_MODELS) {
    if (lower.includes(w) || w.includes(lower)) return 'weak';
  }
  return 'unknown';
}

// ─── Adaptive Feature Configs ─────────────────────────────────────────────────

/**
 * Feature config for each tier in "both" adaptive mode.
 */
export const ADAPTIVE_CONFIGS = {
  weak: {
    tier:            'weak',
    label:           '🚀 Adaptive Boost (weak model detected)',
    description:     'Weak model: quality enhancement ON, token saving LITE.',
    features: {
      flashEnhancer:    true,   // quality boost ON — model needs it
      inputCompressor:  false,  // don't compress input — model needs full context
      outputCompressor: false,  // weak models need quality over answer compression
      cavemanLevel:     'off',
      modelRouter:      true,   // route to stronger model if budget allows
      cliProxy:         true,   // always compress terminal noise
    },
  },
  strong: {
    tier:            'strong',
    label:           '💰 Adaptive Saver (strong model detected)',
    description:     'Strong model: maximum token saving, no quality scaffolding needed.',
    features: {
      flashEnhancer:    false,  // strong model doesn't need expert persona injection
      inputCompressor:  true,   // compress prompts aggressively
      outputCompressor: true,   // ultra caveman mode
      cavemanLevel:     'ultra',
      modelRouter:      false,  // already on best model
      cliProxy:         true,   // always compress terminal noise
    },
  },
  unknown: {
    tier:            'unknown',
    label:           '⚡ Adaptive Balanced (model unknown)',
    description:     'Unknown model: balanced — quality + moderate token saving.',
    features: {
      flashEnhancer:    true,   // apply boost as safety net
      inputCompressor:  false,
      outputCompressor: true,
      cavemanLevel:     'full', // moderate compression
      modelRouter:      true,
      cliProxy:         true,
    },
  },
};

// ─── Resolve Active Features ──────────────────────────────────────────────────

/**
 * Get the effective feature set for the current repo.
 * In "both" mode, dynamically resolves based on detected model tier.
 * In "boost" or "saver" mode, returns the static feature set.
 *
 * @param {string} repoRoot
 * @returns {Promise<ActiveConfig>}
 */
export async function resolveActiveConfig(repoRoot) {
  const mode = await getMode(repoRoot);

  if (mode === 'boost') {
    return {
      mode,
      tier:    'weak',
      label:   MODES.boost.label,
      features: MODES.boost.features,
      modelId: null,
      adaptive: false,
    };
  }

  if (mode === 'saver') {
    return {
      mode,
      tier:    'strong',
      label:   MODES.saver.label,
      features: MODES.saver.features,
      modelId: null,
      adaptive: false,
    };
  }

  // ── "both" mode — adaptive ──────────────────────────────────────────────────
  const liveResult = await detectModel(repoRoot);
  const normModel  = liveResult?.normalisedModel || await getCachedModel(repoRoot) || '';
  const tier       = classifyModel(normModel);
  const adaptive   = ADAPTIVE_CONFIGS[tier];

  return {
    mode,
    tier,
    label:    adaptive.label,
    features: adaptive.features,
    modelId:  normModel || null,
    modelRaw: liveResult?.model || null,
    source:   liveResult?.source || (normModel ? 'cached' : null),
    adaptive: true,
  };
}

// ─── Status Printer ───────────────────────────────────────────────────────────

/**
 * Print the current adaptive mode status to stdout.
 * @param {string} repoRoot
 * @param {import('picocolors')} pc
 */
export async function printAdaptiveStatus(repoRoot, pc) {
  const cfg = await resolveActiveConfig(repoRoot);

  const tierBadge = {
    weak:    pc.yellow('🚀 BOOST (weak model)'),
    strong:  pc.green('💰 SAVER (strong model)'),
    unknown: pc.cyan('⚡ BALANCED (unknown model)'),
  }[cfg.tier] || pc.dim('unknown');

  console.log(`\n⚡ token-flux — Smart Mode Status\n`);
  console.log(`  Mode       : ${pc.bold(cfg.mode.toUpperCase())}${cfg.adaptive ? ' (adaptive)' : ''}`);
  console.log(`  Active as  : ${tierBadge}`);

  if (cfg.modelId) {
    const src = cfg.source ? ` [from ${cfg.source}]` : '';
    console.log(`  Model      : ${pc.bold(cfg.modelId)}${src}`);
  } else {
    console.log(`  Model      : ${pc.dim('not detected — run: token-flux detect-model')}`);
  }

  console.log(`\n  Features:`);
  const f = cfg.features;
  const on  = (v) => v ? pc.green('ON ') : pc.red('OFF');
  console.log(`    Flash Enhancer   : ${on(f.flashEnhancer)}  — quality boost for weak models`);
  console.log(`    Input Compressor : ${on(f.inputCompressor)}  — compress prompts before sending`);
  console.log(`    Output Compress  : ${on(f.outputCompressor)}  — caveman mode: ${f.cavemanLevel || 'off'}`);
  console.log(`    Model Router     : ${on(f.modelRouter)}  — route to stronger model if needed`);
  console.log(`    CLI Proxy        : ${on(f.cliProxy)}  — compress terminal output`);
  console.log('');
}
