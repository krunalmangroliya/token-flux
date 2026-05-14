// Smart model routing — decides free vs paid model based on quota state.
// Now with: user-configurable quotas, auto-reset, persistent state, task complexity scoring,
// usage tracking, and cost-aware routing.
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Model Registry ──────────────────────────────────────────────────────────

export const MODEL_TIERS = {
  free:    ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gpt-4o-mini', 'claude-haiku', 'deepseek-v3', 'llama-3.1-8b', 'qwen-2.5-7b'],
  mid:     ['gemini-1.5-pro', 'gemini-2.5-pro', 'gpt-4o', 'claude-sonnet', 'claude-3.5-sonnet', 'deepseek-r1'],
  premium: ['gemini-2.5-pro-preview', 'gpt-4-turbo', 'gpt-4.1', 'claude-opus', 'claude-4-opus'],
};

/** Approximate cost per 1K tokens (input) for display/estimation */
const COST_PER_1K = {
  free:    0.0,
  mid:     0.003,
  premium: 0.015,
};

// ─── Default Quotas (realistic free tier limits) ─────────────────────────────

export function getDefaultQuota() {
  const now = Date.now();
  const fiveHours = 5 * 60 * 60 * 1000;
  const oneDay    = 24 * 60 * 60 * 1000;

  return {
    flash: {
      model: 'gemini-2.0-flash',
      limit: 1500,        // requests per reset window (Gemini free tier is generous)
      remaining: 1500,
      resetAt: now + fiveHours,
      resetEvery: fiveHours,
      costPer1K: 0.0,
    },
    claude: {
      model: 'claude-sonnet',
      limit: 100,          // typical Cursor/Claude Code free tier
      remaining: 100,
      resetAt: now + oneDay,
      resetEvery: oneDay,
      costPer1K: 0.003,
    },
    premium: {
      model: 'claude-opus',
      limit: 20,           // very limited
      remaining: 20,
      resetAt: now + oneDay,
      resetEvery: oneDay,
      costPer1K: 0.015,
    },
    custom: null,          // user can define their own model slot
  };
}

// ─── Quota Persistence ───────────────────────────────────────────────────────

export async function loadQuota(repoRoot) {
  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const quota = cfg.quotaState || getDefaultQuota();
    return autoResetQuotas(quota);
  } catch {
    return getDefaultQuota();
  }
}

export async function saveQuota(repoRoot, quota) {
  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  let cfg = {};
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    cfg = JSON.parse(raw);
  } catch { /* fresh config */ }
  cfg.quotaState = quota;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
}

/**
 * Configure user's custom quota limits.
 * @param {string} repoRoot
 * @param {{ flash?: Object, claude?: Object, premium?: Object, custom?: Object }} overrides
 */
export async function configureQuota(repoRoot, overrides) {
  const quota = await loadQuota(repoRoot);
  for (const [slot, config] of Object.entries(overrides)) {
    if (slot === 'custom' && config) {
      quota.custom = {
        model: config.model || 'custom-model',
        limit: config.limit || 50,
        remaining: config.remaining ?? config.limit ?? 50,
        resetAt: Date.now() + (config.resetEvery || 24 * 60 * 60 * 1000),
        resetEvery: config.resetEvery || 24 * 60 * 60 * 1000,
        costPer1K: config.costPer1K || 0.0,
        priority: config.priority ?? 1,   // lower = preferred
      };
    } else if (quota[slot]) {
      Object.assign(quota[slot], config);
    }
  }
  await saveQuota(repoRoot, quota);
  return quota;
}

// ─── Auto-Reset Logic ────────────────────────────────────────────────────────

/**
 * Automatically reset quotas whose window has expired.
 * Called on every load — never shows stale exhausted state.
 */
function autoResetQuotas(quota) {
  const now = Date.now();
  for (const slot of ['flash', 'claude', 'premium', 'custom']) {
    const q = quota[slot];
    if (!q) continue;
    if (now >= q.resetAt) {
      // Calculate how many reset windows have passed
      const windowsPassed = Math.floor((now - q.resetAt) / q.resetEvery) + 1;
      q.remaining = q.limit;
      q.resetAt = now + q.resetEvery - ((now - q.resetAt) % q.resetEvery);
    }
  }
  return quota;
}

// ─── Time Formatting ─────────────────────────────────────────────────────────

export function formatTimeLeft(ms) {
  if (ms <= 0) return 'resetting now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Task Complexity Scoring ─────────────────────────────────────────────────

/**
 * Score how complex a task is (0.0–1.0) to help decide model tier.
 * High complexity → prefer stronger model if available.
 * @param {string} prompt
 * @param {{ fileCount?: number, blastRadiusScore?: number }} [context]
 * @returns {{ complexity: number, factors: string[] }}
 */
export function scoreComplexity(prompt, context = {}) {
  let complexity = 0;
  const factors = [];

  // Length-based (longer prompts = more complex tasks)
  if (prompt.length > 2000) { complexity += 0.2; factors.push('long prompt'); }
  else if (prompt.length > 800) { complexity += 0.1; factors.push('medium prompt'); }

  // Multi-file signals
  if (/\b(multiple files|across files|several files|all files|every file)\b/i.test(prompt)) {
    complexity += 0.2; factors.push('multi-file task');
  }

  // Architecture-level signals
  if (/\b(refactor|restructure|migrate|architecture|system design|redesign|overhaul)\b/i.test(prompt)) {
    complexity += 0.25; factors.push('architectural change');
  }

  // Concurrency/async signals
  if (/\b(concurrent|parallel|race condition|deadlock|mutex|semaphore|async.*complex|distributed)\b/i.test(prompt)) {
    complexity += 0.2; factors.push('concurrency');
  }

  // Security signals
  if (/\b(security|auth|vulnerab|injection|xss|csrf|encrypt|jwt|oauth|permission)\b/i.test(prompt)) {
    complexity += 0.15; factors.push('security-sensitive');
  }

  // Performance signals
  if (/\b(performance|optimize|bottleneck|cache|latency|throughput|memory leak|profil)\b/i.test(prompt)) {
    complexity += 0.15; factors.push('performance-critical');
  }

  // Blast radius context
  if (context.blastRadiusScore && context.blastRadiusScore >= 7) {
    complexity += 0.15; factors.push('high blast radius');
  }
  if (context.fileCount && context.fileCount > 5) {
    complexity += 0.1; factors.push(`${context.fileCount} files affected`);
  }

  return { complexity: Math.min(1.0, complexity), factors };
}

// ─── Routing Decision ────────────────────────────────────────────────────────

/**
 * Smart routing: picks the best available model considering complexity, quota, and cost.
 * @param {Object} quota - quota state (from loadQuota)
 * @param {{ prompt?: string, complexity?: number, preferCheap?: boolean }} [context]
 * @returns {{ model: string, slot: string, reason: string, tier: string, complexity?: number, flashTimeLeft: string, claudeTimeLeft: string, premiumTimeLeft?: string, waitFor?: string }}
 */
export function decide(quota, context = {}) {
  const now = Date.now();
  const { prompt, complexity: forcedComplexity, preferCheap = true } = context;

  // Calculate complexity if prompt is provided
  const complexityResult = prompt ? scoreComplexity(prompt) : null;
  const complexity = forcedComplexity ?? complexityResult?.complexity ?? 0;

  // Check availability for each slot
  const slots = [];
  for (const name of ['flash', 'claude', 'premium', 'custom']) {
    const q = quota[name];
    if (!q) continue;
    const timeLeft = q.resetAt - now;
    const isAvailable = q.remaining > 0;
    const minThreshold = name === 'flash' ? 10 : name === 'claude' ? 5 : 2;
    const isHealthy = isAvailable && q.remaining > minThreshold;

    slots.push({
      name,
      model: q.model,
      tier: name === 'flash' ? 'free' : name === 'claude' ? 'mid' : name === 'premium' ? 'premium' : (q.priority <= 1 ? 'free' : 'mid'),
      isAvailable,
      isHealthy,
      remaining: q.remaining,
      timeLeft,
      costPer1K: q.costPer1K || COST_PER_1K[name] || 0,
    });
  }

  const flashTimeLeft = formatTimeLeft((quota.flash?.resetAt || now) - now);
  const claudeTimeLeft = formatTimeLeft((quota.claude?.resetAt || now) - now);
  const premiumTimeLeft = quota.premium ? formatTimeLeft((quota.premium.resetAt || now) - now) : 'n/a';

  const base = { flashTimeLeft, claudeTimeLeft, premiumTimeLeft };

  // HIGH complexity → try to use mid/premium tier
  if (complexity >= 0.6) {
    // Try premium first for very complex tasks
    if (complexity >= 0.8) {
      const premium = slots.find(s => s.name === 'premium' && s.isHealthy);
      if (premium) {
        return {
          model: premium.model, slot: 'premium', tier: 'premium',
          reason: `Complex task (${(complexity * 100).toFixed(0)}%) — using premium model`,
          complexity, ...base,
        };
      }
    }
    // Try mid-tier
    const mid = slots.find(s => s.name === 'claude' && s.isHealthy);
    if (mid) {
      return {
        model: mid.model, slot: 'claude', tier: 'mid',
        reason: `Complex task (${(complexity * 100).toFixed(0)}%) — using mid-tier model`,
        complexity, ...base,
      };
    }
  }

  // NORMAL routing: prefer cheapest available
  if (preferCheap) {
    // Custom slot with low cost?
    const custom = slots.find(s => s.name === 'custom' && s.isHealthy);
    if (custom && custom.costPer1K === 0) {
      return {
        model: custom.model, slot: 'custom', tier: custom.tier,
        reason: `Custom free model available`,
        complexity, ...base,
      };
    }

    const flash = slots.find(s => s.name === 'flash' && s.isHealthy);
    if (flash) {
      return {
        model: flash.model, slot: 'flash', tier: 'free',
        reason: `Flash quota available (free, ${flash.remaining} remaining)`,
        complexity, ...base,
      };
    }
  }

  // Fallback: any available slot in order of cheapness
  const available = slots.filter(s => s.isHealthy).sort((a, b) => a.costPer1K - b.costPer1K);
  if (available.length > 0) {
    const best = available[0];
    return {
      model: best.model, slot: best.name, tier: best.tier,
      reason: `Using ${best.name} (${best.remaining} remaining)`,
      complexity, ...base,
    };
  }

  // All exhausted — find the slot that resets soonest
  const exhausted = slots.filter(s => !s.isHealthy).sort((a, b) => a.timeLeft - b.timeLeft);
  const soonest = exhausted[0];

  return {
    model: null, slot: null, tier: null,
    reason: 'All model quotas exhausted',
    complexity, ...base,
    waitFor: soonest?.name || 'flash',
    waitTime: soonest ? formatTimeLeft(soonest.timeLeft) : 'unknown',
  };
}

// ─── Usage Tracking ──────────────────────────────────────────────────────────

/**
 * Record a model usage. Decrements the remaining count for the used slot.
 * @param {string} repoRoot
 * @param {string} slot - 'flash' | 'claude' | 'premium' | 'custom'
 * @param {{ tokens?: number }} [meta]
 */
export async function recordUsage(repoRoot, slot, meta = {}) {
  const quota = await loadQuota(repoRoot);
  if (quota[slot]) {
    quota[slot].remaining = Math.max(0, quota[slot].remaining - 1);
    // Track cumulative token usage per slot
    if (!quota[slot].totalTokens) quota[slot].totalTokens = 0;
    quota[slot].totalTokens += meta.tokens || 0;
  }
  await saveQuota(repoRoot, quota);
  return quota;
}

// ─── Escalation ──────────────────────────────────────────────────────────────

const ESCALATION_MAP = {
  'gemini-2.0-flash':      'gemini-2.5-pro',
  'gemini-2.0-flash-lite': 'gemini-2.0-flash',
  'gemini-1.5-flash':      'gemini-1.5-pro',
  'gpt-4o-mini':           'gpt-4o',
  'claude-haiku':          'claude-sonnet',
  'deepseek-v3':           'deepseek-r1',
  'llama-3.1-8b':          'claude-sonnet',
  'qwen-2.5-7b':           'claude-sonnet',
  'gemini-1.5-pro':        'gemini-2.5-pro-preview',
  'gemini-2.5-pro':        'gemini-2.5-pro-preview',
  'gpt-4o':                'gpt-4-turbo',
  'claude-sonnet':         'claude-opus',
  'claude-3.5-sonnet':     'claude-4-opus',
  'deepseek-r1':           'claude-opus',
  'flash':                 'claude',
  'claude':                'premium',
};

/**
 * Get the escalation target for a model (one tier up).
 * @param {string} currentModel
 * @returns {string}
 */
export function escalate(currentModel) {
  return ESCALATION_MAP[currentModel] || 'claude';
}

/**
 * Get full escalation path from current model to the top.
 * @param {string} currentModel
 * @returns {string[]}
 */
export function getEscalationPath(currentModel) {
  const path = [currentModel];
  let current = currentModel;
  const visited = new Set();
  while (ESCALATION_MAP[current] && !visited.has(current)) {
    visited.add(current);
    current = ESCALATION_MAP[current];
    path.push(current);
  }
  return path;
}

/**
 * Get a summary of the current routing state for display.
 * @param {Object} quota
 * @returns {{ slots: Array, activeModel: string, tier: string, totalRemaining: number }}
 */
export function getRoutingSummary(quota) {
  const decision = decide(quota);
  const slots = [];
  for (const name of ['flash', 'claude', 'premium', 'custom']) {
    const q = quota[name];
    if (!q) continue;
    slots.push({
      name,
      model: q.model,
      remaining: q.remaining,
      limit: q.limit,
      pctLeft: q.limit > 0 ? Math.round((q.remaining / q.limit) * 100) : 0,
      timeLeft: formatTimeLeft(q.resetAt - Date.now()),
      costPer1K: q.costPer1K || 0,
    });
  }
  const totalRemaining = slots.reduce((sum, s) => sum + s.remaining, 0);
  return {
    slots,
    activeModel: decision.model,
    tier: decision.tier,
    totalRemaining,
  };
}
