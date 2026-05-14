// weak-model enhancer — works for ALL low-cost models, not just Flash.
// Covers: Gemini Flash/Flash-Lite, Claude Haiku, GPT-4o-mini, Llama 3,
//         Mistral 7B, DeepSeek-Coder, Qwen, Phi-3, Codestral, and more.
// Each model has a profile of known weaknesses + targeted prompt fixes.

// ─── Model Profiles ───────────────────────────────────────────────────────────
// Known weaknesses + targeted injections per low-cost model family.

export const MODEL_PROFILES = {
  // Google
  'gemini-flash':      { aliases: ['flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'flash-lite', 'gemini-flash-lite'],
    weaknesses: ['vague answers', 'skips edge cases', 'over-hedges'],
    fixes: ['State the answer directly. No hedging.', 'List every edge case explicitly before coding.', 'Verify exact route/API names against the repo before editing.', 'Never use "it depends" without giving the specific conditions.'] },
  // Anthropic
  'claude-haiku':      { aliases: ['haiku', 'claude-3-haiku', 'claude-haiku-3'],
    weaknesses: ['truncates responses', 'skips error handling', 'uses // ... shorthand'],
    fixes: ['Never truncate. Write the COMPLETE implementation.', 'Always add try/catch or null checks - no silent failures.', 'No // ... or # ... placeholders anywhere in code.', 'Finish both backend and frontend wiring when the task touches a user workflow.'] },
  // OpenAI
  'gpt-4o-mini':       { aliases: ['4o-mini', 'gpt4o-mini', 'gpt-4o-mini'],
    weaknesses: ['excessive caveats', 'over-explains obvious things', 'adds unnecessary disclaimers'],
    fixes: ['Skip caveats and disclaimers. Go straight to the solution.', 'Do not re-explain things the user already knows.', 'Check security and validation paths explicitly for auth/session/payment changes.', 'No "Note that...", "Keep in mind...", "It\'s worth mentioning..." sentences.'] },
  'gpt-3.5-turbo':     { aliases: ['gpt-3.5', 'turbo', 'gpt3.5'],
    weaknesses: ['outdated API knowledge', 'misses async patterns', 'shallow error handling'],
    fixes: ['Use modern async/await. No callbacks unless the codebase uses them.', 'Verify API names against the task context — do not guess.', 'Handle ALL error paths: null, undefined, network failure, auth failure.'] },
  // Meta
  'llama-3':           { aliases: ['llama3', 'llama-3', 'llama-3-8b', 'llama-3-70b', 'llama3.1', 'llama3.2'],
    weaknesses: ['hallucinates API names', 'ignores instructions mid-response', 'poor multi-step reasoning'],
    fixes: ['ONLY use APIs and functions that appear in the provided code context.', 'Follow the numbered steps in order. Do not skip steps.', 'Re-read the task after each step to stay on track.'] },
  // Mistral
  'mistral-7b':        { aliases: ['mistral', 'mistral-7b', 'mistral-small', 'mixtral', 'mistral-nemo'],
    weaknesses: ['needs explicit format', 'skips explanation', 'inconsistent code style'],
    fixes: ['Use the EXACT format shown in the protocol below.', 'After every code block, write one sentence explaining what it does.', 'Match the code style of the examples provided.'] },
  // DeepSeek
  'deepseek-coder':    { aliases: ['deepseek', 'deepseek-coder', 'deepseek-v2', 'deepseek-r1'],
    weaknesses: ['good at code but skips tests', 'ignores existing patterns', 'over-engineers'],
    fixes: ['Include at least one test or usage example.', 'Match the simplest pattern already used in the codebase.', 'Prefer the minimal solution. Do not add abstractions not asked for.'] },
  // Qwen
  'qwen':              { aliases: ['qwen', 'qwen2', 'qwen-7b', 'qwen-14b', 'qwen-coder'],
    weaknesses: ['language mixing', 'verbose reasoning', 'inconsistent variable naming'],
    fixes: ['Respond ONLY in English.', 'Skip the reasoning — just show the solution.', 'Use the same variable naming convention as the existing code.'] },
  // Microsoft
  'phi-3':             { aliases: ['phi', 'phi-3', 'phi-3-mini', 'phi-3.5', 'phi-4'],
    weaknesses: ['very small context', 'loses track of task', 'produces partial code'],
    fixes: ['Focus ONLY on the specific task asked. Ignore everything else.', 'Write the complete function. Do not stop mid-way.', 'If the task requires multiple files, do them ONE AT A TIME.'] },
  // Codestral / Mistral code
  'codestral':         { aliases: ['codestral', 'codestral-latest'],
    weaknesses: ['skips docstrings/comments', 'ignores test requirements'],
    fixes: ['Add a one-line comment above each function explaining its purpose.', 'If tests are mentioned, write them.'] },
  // Generic fallback for unknown cheap models
  'generic-weak':      { aliases: [],
    weaknesses: ['inconsistent quality'],
    fixes: ['Follow every numbered instruction in order.', 'Write complete, runnable code. No placeholders.', 'Map existing routes/API contracts before changing code.', 'Preserve auth, permissions, 2FA/MFA, CSRF, session, and input validation behavior.', 'Explain the verification result briefly after the code.'] },
};

/**
 * Find a model profile by name/alias (case-insensitive).
 * @param {string} modelName
 * @returns {{ id: string } & ModelProfile}
 */
export function getModelProfile(modelName) {
  if (!modelName) return { id: 'generic-weak', ...MODEL_PROFILES['generic-weak'] };
  const lower = modelName.toLowerCase().trim();
  for (const [id, profile] of Object.entries(MODEL_PROFILES)) {
    if (id === lower || profile.aliases.some(a => lower.includes(a))) {
      return { id, ...profile };
    }
  }
  return { id: 'generic-weak', ...MODEL_PROFILES['generic-weak'] };
}

/**
 * Build the model-specific instruction block.
 * @param {string} modelName
 * @returns {{ id: string, instruction: string }}
 */
export function buildModelInstruction(modelName) {
  const profile = getModelProfile(modelName);
  if (profile.fixes.length === 0) return { id: profile.id, instruction: '' };
  const lines = [
    `## MODEL-SPECIFIC RULES (${profile.id})`,
    `Known weaknesses for this model: ${profile.weaknesses.join(', ')}.`,
    `Apply these fixes:`,
    ...profile.fixes.map((f, i) => `${i + 1}. ${f}`),
  ];
  return { id: profile.id, instruction: lines.join('\n') };
}

// ─── Domain Registry ─────────────────────────────────────────────────────────

const DOMAINS = {
  react:      { keywords: ['react', 'jsx', 'tsx', 'component', 'usestate', 'useeffect', 'props', 'hooks', 'redux', 'next.js', 'gatsby', 'nextjs', 'zustand', 'suspense', 'server component'],
                role: 'Senior React / Next.js developer',                       weight: 1.5 },
  javascript: { keywords: ['javascript', 'js', 'node', 'nodejs', 'express', 'npm', 'async', 'await', 'promise', 'fetch', 'api', 'typescript', 'ts', 'deno', 'bun', 'esm', 'commonjs', 'webpack', 'vite'],
                role: 'Senior JavaScript / TypeScript developer',               weight: 1.0 },
  python:     { keywords: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'pip', 'def ', 'class ', 'import ', 'pydantic', 'sqlalchemy', 'celery', 'pytest', 'asyncio'],
                role: 'Senior Python developer',                                weight: 1.0 },
  sql:        { keywords: ['sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'select', 'insert', 'update', 'delete', 'join', 'query', 'migration', 'schema', 'index', 'orm', 'prisma', 'drizzle'],
                role: 'Senior database engineer (SQL expert)',                  weight: 1.2 },
  auth:       { keywords: ['auth', 'login', 'logout', 'register', 'password', '2fa', 'mfa', 'otp', 'session', 'cookie', 'jwt', 'oauth', 'csrf', 'permission', 'rbac', 'role', 'token', 'secret'],
                role: 'Senior application security and authentication engineer', weight: 1.7 },
  api:        { keywords: ['route', 'endpoint', 'controller', 'middleware', 'request', 'response', 'status code', 'rest', 'graphql', 'openapi', 'webhook', 'handler'],
                role: 'Senior backend API engineer',                             weight: 1.3 },
  css:        { keywords: ['css', 'scss', 'sass', 'tailwind', 'style', 'flexbox', 'grid', 'animation', 'responsive', 'media query', 'styled-components', 'emotion'],
                role: 'Senior UI/CSS engineer',                                 weight: 1.0 },
  docker:     { keywords: ['docker', 'kubernetes', 'k8s', 'container', 'dockerfile', 'compose', 'deploy', 'nginx', 'ci/cd', 'github actions', 'terraform', 'helm', 'aws', 'gcp', 'azure'],
                role: 'Senior DevOps / infrastructure engineer',                weight: 1.0 },
  rust:       { keywords: ['rust', 'cargo', 'fn ', 'let mut', 'ownership', 'borrow', 'tokio', 'async fn', 'impl ', 'trait ', 'lifetime'],
                role: 'Senior Rust systems programmer',                         weight: 1.3 },
  go:         { keywords: ['golang', 'go ', 'func ', 'goroutine', 'channel', 'struct{', 'interface{', 'go mod', 'gin', 'fiber', 'cobra'],
                role: 'Senior Go developer',                                    weight: 1.2 },
  java:       { keywords: ['java', 'spring', 'springboot', 'maven', 'gradle', 'junit', 'hibernate', 'jpa', 'servlet', 'tomcat', 'lombok', 'annotation'],
                role: 'Senior Java / Spring Boot developer',                    weight: 1.0 },
  php:        { keywords: ['php', 'laravel', 'symfony', 'composer', 'artisan', 'eloquent', 'blade', 'wordpress'],
                role: 'Senior PHP / Laravel developer',                         weight: 1.0 },
  shell:      { keywords: ['bash', 'shell', 'zsh', 'script', 'chmod', 'grep', 'awk', 'sed', 'cron', 'systemd', 'makefile'],
                role: 'Senior systems engineer and shell scripting expert',     weight: 1.0 },
  swift:      { keywords: ['swift', 'swiftui', 'uikit', 'xcode', 'ios', 'macos', 'cocoapods', 'spm'],
                role: 'Senior iOS / Swift developer',                           weight: 1.2 },
  kotlin:     { keywords: ['kotlin', 'android', 'jetpack', 'compose', 'coroutine', 'ktor', 'koin'],
                role: 'Senior Kotlin / Android developer',                      weight: 1.2 },
  testing:    { keywords: ['test', 'spec', 'jest', 'mocha', 'vitest', 'cypress', 'playwright', 'selenium', 'unit test', 'integration test', 'e2e', 'mock', 'stub', 'fixture'],
                role: 'Senior QA / test automation engineer',                   weight: 0.8 },
};

const DEFAULT_ROLE = 'Senior software engineer with 10+ years experience';

// ─── Chain-of-Thought Scaffold (Strategy 5) ──────────────────────────────────

/**
 * Forces weak models to check the right things before coding without exposing
 * long chain-of-thought in the final answer.
 * @param {string} taskType
 * @returns {string}
 */
export function buildThinkingScaffold(taskType = 'general') {
  const prompts = {
    debug:    ['Root cause', 'Minimal reproduction or failing path', 'Why this fix works', 'Regression risk'],
    security: ['Trust boundary', 'Protected action', 'Bypass/failure cases', 'Security regression risk'],
    feature:  ['Requirement', 'Files to change', 'Approach', 'Edge cases and error states'],
    refactor: ['What problem is being fixed', 'Behavior that must not change', 'Approach', 'Tests to verify'],
    test:     ['Function contract', 'Happy path cases', 'Edge cases', 'Error cases'],
    review:   ['Bugs found', 'Missing edge cases', 'Anti-patterns', 'Verdict: ship / revise / scrap'],
    general:  ['Goal', 'Approach', 'Assumptions', 'Risks'],
  };
  const fields = prompts[taskType] || prompts.general;
  return [
    'Before coding, make this private checklist and use it to guide the answer:',
    ...fields.map(f => `- ${f}: checked`),
    'Do not expose long chain-of-thought. Output only decisions, code, and verification.',
  ].join('\n');
}

// ─── Task Type Detection ─────────────────────────────────────────────────────

const TASK_TYPES = {
  debug:    { patterns: ['fix', 'bug', 'error', 'crash', 'broken', 'not working', 'fails', 'issue', 'exception', 'traceback', 'stack trace', 'undefined', 'null', 'nan', 'segfault', 'panic'],
              instruction: 'DEBUG PROTOCOL:\n1. Identify the root cause first - state it in ONE sentence.\n2. Show the minimal fix with a code diff.\n3. Explain WHY the fix works (what was the wrong assumption).\n4. List any side effects of this fix.' },
  security: { patterns: ['security', 'auth', 'login', 'logout', 'password', '2fa', 'mfa', 'otp', 'csrf', 'xss', 'injection', 'jwt', 'oauth', 'permission', 'session', 'cookie', 'token'],
              instruction: 'SECURITY PROTOCOL:\n1. Identify the trust boundary and protected action.\n2. Verify existing auth/session/permission/2FA behavior before changing code.\n3. Preserve or strengthen validation, CSRF, cookie/session flags, and secret handling.\n4. Add tests for bypass attempts and failure paths.\n5. Do not log secrets or weaken checks to make the happy path pass.' },
  refactor: { patterns: ['refactor', 'clean up', 'simplify', 'improve', 'optimize', 'restructure', 'extract', 'decouple', 'decompose', 'dry', 'solid'],
              instruction: 'REFACTOR PROTOCOL:\n1. Show the BEFORE pattern and explain why it\'s problematic.\n2. Show the AFTER code with the exact changes.\n3. Confirm: no behavior changes, all existing tests still pass.\n4. State the specific quality improvement (readability, testability, performance).' },
  feature:  { patterns: ['add', 'create', 'build', 'implement', 'new feature', 'integrate', 'connect', 'wire up', 'endpoint', 'component', 'module', 'functionality'],
              instruction: 'FEATURE PROTOCOL:\n1. Confirm understanding of the requirement in ONE sentence.\n2. List all files that need changes (check blast radius).\n3. Write the implementation — complete, working code. No TODOs, no placeholders.\n4. Include at least one test or usage example.\n5. Note any edge cases the caller should handle.' },
  test:     { patterns: ['write test', 'add test', 'test for', 'cover', 'coverage', 'spec for', 'assert', 'expect'],
              instruction: 'TEST PROTOCOL:\n1. List the function/module under test and its contract.\n2. Write tests covering: happy path, edge cases, error cases.\n3. Use the existing test framework and patterns in this repo.\n4. Each test must have a descriptive name stating the expected behavior.' },
  review:   { patterns: ['review', 'check', 'audit', 'look at', 'evaluate', 'assess', 'inspect', 'analyze', 'what do you think'],
              instruction: 'REVIEW PROTOCOL:\n1. Bugs: list any correctness issues with file:line references.\n2. Missing edge cases: inputs or states not handled.\n3. Anti-patterns: code that conflicts with repo conventions.\n4. Verdict: ship / revise / scrap — with one-line justification.' },
};

const TASK_TYPE_PRIORITY = {
  security: 5,
  debug: 4,
  feature: 3,
  refactor: 2,
  test: 2,
  review: 1,
};

/**
 * Detect the type of task from the prompt.
 * @param {string} prompt
 * @returns {{ type: string, instruction: string }}
 */
export function detectTaskType(prompt) {
  const lower = prompt.toLowerCase();
  let best = null;
  let bestScore = 0;
  let bestPriority = 0;

  for (const [type, { patterns, instruction }] of Object.entries(TASK_TYPES)) {
    const score = patterns.filter(p => lower.includes(p)).length;
    const priority = TASK_TYPE_PRIORITY[type] || 0;
    if (score > bestScore || (score === bestScore && score > 0 && priority > bestPriority)) {
      bestScore = score;
      bestPriority = priority;
      best = { type, instruction };
    }
  }

  return best || { type: 'general', instruction: 'Provide a complete, working solution. No TODOs, no placeholders. Show code, then explain.' };
}

/**
 * Detect the primary domain(s) from the prompt.
 * Returns the best match + any secondary domains with significant signal.
 * @param {string} prompt
 * @returns {{ domain: string, role: string, secondary: string[] }}
 */
export function detectDomain(prompt) {
  const lower = prompt.toLowerCase();
  const scores = [];

  for (const [domain, { keywords, role, weight }] of Object.entries(DOMAINS)) {
    const raw = keywords.filter(kw => lower.includes(kw)).length;
    const weighted = raw * (weight || 1.0);
    if (raw > 0) scores.push({ domain, role, score: weighted, raw });
  }

  if (scores.length === 0) return { domain: 'general', role: DEFAULT_ROLE, secondary: [] };

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const threshold = best.score * 0.5;
  const secondary = scores.slice(1).filter(s => s.score >= threshold).map(s => s.domain);

  return { domain: best.domain, role: best.role, secondary };
}

function buildProductionGates(prompt, taskType) {
  const lower = prompt.toLowerCase();
  const gates = [
    'Inspect CODEMAP/anatomy first, then open the relevant source files before editing logic.',
    'Map existing route/API/UI contracts exactly: path, method, params, response shape, and callers.',
    'Complete the full user workflow when touched: backend, frontend, state, errors, loading/empty states, and tests.',
    'Run the repo verification path (tests/typecheck/build) or state the exact blocker and residual risk.',
  ];

  if (taskType === 'security' || /\b(auth|login|logout|password|2fa|mfa|otp|csrf|xss|jwt|oauth|permission|session|cookie|token)\b/i.test(lower)) {
    gates.push('Security gate: preserve auth, permissions, 2FA/MFA, CSRF, session/cookie flags, rate limits, and secret handling.');
    gates.push('Add or update a negative test for bypass/failure behavior when security logic changes.');
  }

  if (/\b(route|endpoint|api|controller|handler|middleware|url|path)\b/i.test(lower)) {
    gates.push('Route gate: verify the actual registered route before naming or changing it; update all callers.');
  }

  if (/\b(ui|frontend|component|page|form|button|screen|react|vue|svelte|css|tailwind)\b/i.test(lower)) {
    gates.push('Frontend gate: wire data fetching/submission, validation messages, disabled states, and error display.');
  }

  return ['## PRODUCTION GATES', ...gates.map(g => `- ${g}`)].join('\n');
}

/**
 * Enhanced prompt injection — context-aware, task-type-aware, with multi-domain support.
 * @param {string} prompt
 * @param {Object} [options]
 * @param {string} [options.domain] - Force a specific domain
 * @param {string} [options.taskType] - Force a specific task type
 * @param {string} [options.repoContext] - Extra repo context (e.g., from CODEMAP.md summary)
 * @returns {{ enhanced: string, domain: string, role: string, taskType: string, secondary: string[], originalLength: number, enhancedLength: number }}
 */
export function enhance(prompt, options = {}) {
  const { domain: forcedDomain, taskType: forcedTaskType, repoContext, model } = options;

  const detected = forcedDomain
    ? { domain: forcedDomain, role: (DOMAINS[forcedDomain] && DOMAINS[forcedDomain].role) || DEFAULT_ROLE, secondary: [] }
    : detectDomain(prompt);

  const task = forcedTaskType
    ? { type: forcedTaskType, instruction: TASK_TYPES[forcedTaskType]?.instruction || '' }
    : detectTaskType(prompt);

  // Model-specific profile injection
  const modelInst = buildModelInstruction(model || '');

  // Build the multi-domain expertise line
  const expertiseLines = [];
  expertiseLines.push(`You are a ${detected.role}.`);
  if (detected.secondary.length > 0) {
    const secondaryRoles = detected.secondary.map(d => DOMAINS[d]?.role).filter(Boolean);
    expertiseLines.push(`You also have deep expertise as: ${secondaryRoles.join(', ')}.`);
  }

  const sections = [
    // Expert identity
    ...expertiseLines,
    '',
    // Chain-of-thought scaffold — forces reasoning before coding
    buildThinkingScaffold(task.type),
    '',
    // Cognitive guardrails
    "Be precise and technically accurate. If unsure, say 'I don't know' — never guess.",
    '',
    // Task-specific protocol
    `## ${task.type.toUpperCase()} TASK`,
    task.instruction,
    '',
    buildProductionGates(prompt, task.type),
    '',
  ];

  // Inject model-specific weakness fixes
  if (modelInst.instruction) {
    sections.push(modelInst.instruction);
    sections.push('');
  }

  // Inject repo context if available
  if (repoContext) {
    sections.push(`## Repo Context`);
    sections.push(repoContext);
    sections.push('');
  }

  // Quality guardrails for weak models
  sections.push(`## QUALITY RULES`);
  sections.push(`- Every code block must be complete and runnable. No \`// ...\` or \`# TODO\`.`);
  sections.push(`- Do not rely on summaries alone. Open the exact implementation files needed to avoid route/API/security mistakes.`);
  sections.push(`- Match existing patterns in the codebase. When in doubt, grep for 3 similar usages.`);
  sections.push(`- Handle errors explicitly - no silent swallows.`);
  sections.push(`- If you change a function signature, update ALL callers.`);
  sections.push(`- If auth, payments, permissions, 2FA/MFA, sessions, cookies, CSRF, or secrets are involved, preserve existing security behavior and add a negative test.`);
  sections.push(`- If UI/frontend is involved, complete states and wiring: loading, disabled, validation, empty, error, and success.`);
  sections.push(`- Verify with tests/typecheck/build where available before declaring done.`);
  sections.push('');

  // The actual prompt
  sections.push(`## TASK`);
  sections.push(prompt);

  const enhanced = sections.join('\n');

  return {
    enhanced,
    domain:     detected.domain,
    role:       detected.role,
    taskType:   task.type,
    secondary:  detected.secondary,
    modelId:    modelInst.id,
    originalLength: prompt.length,
    enhancedLength: enhanced.length,
  };
}


// ─── Response Scoring (Quality Assessment) ───────────────────────────────────

/**
 * Score a model's response for quality. Returns 0.0–1.0.
 * Uses 15+ signals across structure, code quality, explanation depth, and anti-patterns.
 * @param {string} response
 * @param {{ isCodeTask?: boolean, expectedDomain?: string, promptLength?: number }} [options]
 * @returns {{ score: number, signals: Object, verdict: 'good' | 'weak' | 'bad', details: string[] }}
 */
export function scoreResponse(response, options = {}) {
  const { isCodeTask = true, expectedDomain, promptLength = 0, originalPrompt = '' } = options;
  const lower = response.toLowerCase();
  const promptLower = originalPrompt.toLowerCase();
  const lines = response.split('\n');
  const signals = {};
  const details = [];

  let score = 1.0;

  // ── Anti-pattern penalties (hallucination, refusal, hedging) ──

  if (lower.includes('i cannot') || lower.includes('i can\'t help')) {
    score -= 0.4;
    signals.refusal = true;
    details.push('Contains refusal pattern ("I cannot")');
  }
  if (lower.includes('i don\'t have enough') || lower.includes('insufficient information')) {
    score -= 0.3;
    signals.insufficientInfo = true;
    details.push('Claims insufficient info');
  }
  if (lower.includes('as an ai') || lower.includes('as a language model') || lower.includes('i\'m just')) {
    score -= 0.2;
    signals.aiDisclaimer = true;
    details.push('Contains AI self-reference disclaimer');
  }
  if (/\b(unclear|ambiguous|vague|not sure what you mean)\b/.test(lower)) {
    score -= 0.15;
    signals.ambiguityFlag = true;
    details.push('Flags ambiguity instead of solving');
  }

  // Filler / fluff penalty
  const fillerPatterns = ['certainly!', 'absolutely!', 'great question', 'i\'d be happy to', 'sure!', 'of course!', 'wonderful question', 'excellent question'];
  const fillerCount = fillerPatterns.filter(f => lower.includes(f)).length;
  if (fillerCount >= 2) {
    score -= 0.1;
    signals.excessiveFiller = fillerCount;
    details.push(`Excessive filler phrases (${fillerCount})`);
  }

  // ── Code quality signals ──

  if (isCodeTask) {
    const codeBlockCount = (response.match(/```/g) || []).length / 2;
    signals.codeBlocks = Math.floor(codeBlockCount);

    if (codeBlockCount === 0) {
      score -= 0.35;
      details.push('No code blocks in code task');
    } else if (codeBlockCount >= 1) {
      score += 0.05;
    }

    // Check for placeholder/TODO patterns inside code blocks
    const codeContent = (response.match(/```[\s\S]*?```/g) || []).join('\n');
    const placeholders = (codeContent.match(/\/\/ \.{3}|# \.{3}|TODO|FIXME|pass\s*#|\.{3}\s*$/gm) || []).length;
    if (placeholders > 0) {
      score -= 0.15 * Math.min(placeholders, 3);
      signals.placeholders = placeholders;
      details.push(`Contains ${placeholders} placeholder(s) / TODOs in code`);
    }

    // Check for error handling
    const hasErrorHandling = /\b(try|catch|except|\.catch|if\s*\(\s*err|error\s*!=\s*nil|Result<|Option<)\b/.test(codeContent);
    if (codeContent.length > 200 && !hasErrorHandling) {
      score -= 0.1;
      signals.noErrorHandling = true;
      details.push('No error handling in code');
    }

    // Short response for code task
    if (response.length < 100) {
      score -= 0.35;
      signals.tooShort = true;
      details.push('Response too short for code task');
    } else if (response.length < 200) {
      score -= 0.15;
      details.push('Response quite short for code task');
    }

    const mentionsVerification = /\b(test|tests|tested|typecheck|lint|build|verify|verification|npm|pytest|cargo test|go test)\b/.test(lower);
    if (!mentionsVerification) {
      score -= 0.08;
      signals.noVerification = true;
      details.push('No verification step or test result mentioned');
    }
  }

  const promptIsSecuritySensitive = /\b(auth|login|logout|password|2fa|mfa|otp|csrf|xss|injection|jwt|oauth|permission|session|cookie|token|secret)\b/.test(promptLower);
  if (promptIsSecuritySensitive && !/\b(auth|permission|2fa|mfa|csrf|session|cookie|token|validate|validation|sanitize|secret|bypass|negative test)\b/.test(lower)) {
    score -= 0.18;
    signals.securityGap = true;
    details.push('Security-sensitive prompt without explicit security handling');
  }

  const promptMentionsRoute = /\b(route|endpoint|api|controller|handler|middleware|url|path)\b/.test(promptLower);
  if (promptMentionsRoute && !/\b(route|endpoint|api|method|path|caller|contract|request|response|status)\b/.test(lower)) {
    score -= 0.12;
    signals.routeGap = true;
    details.push('Route/API task without explicit contract or caller check');
  }

  const promptMentionsFrontend = /\b(ui|frontend|component|page|form|button|screen|react|vue|svelte|css|tailwind)\b/.test(promptLower);
  if (promptMentionsFrontend && !/\b(loading|disabled|validation|error|empty|success|state|submit|render|component)\b/.test(lower)) {
    score -= 0.12;
    signals.frontendGap = true;
    details.push('Frontend task without UI state or wiring coverage');
  }

  // ── Structure signals ──

  const hasStructuredSteps = /\b(step\s+\d|1\.|first,|second,|root cause|solution)/i.test(response);
  if (hasStructuredSteps) {
    score += 0.05;
    signals.structured = true;
  }

  const hasHeadings = /^#{1,3}\s/m.test(response);
  if (hasHeadings) {
    score += 0.03;
    signals.hasHeadings = true;
  }

  // ── Explanation quality ──

  const hasExplanation = lines.some(l => l.trim().length > 60 && !l.trim().startsWith('```') && !l.trim().startsWith('//') && !l.trim().startsWith('#'));
  if (isCodeTask && !hasExplanation) {
    score -= 0.1;
    signals.noExplanation = true;
    details.push('Code without explanation');
  }

  // ── Proportionality check ──

  if (promptLength > 0) {
    const ratio = response.length / promptLength;
    if (ratio < 0.3) {
      score -= 0.15;
      signals.disproportionatelyShort = true;
      details.push('Response much shorter than prompt');
    }
  }

  // ── Domain relevance ──

  if (expectedDomain && DOMAINS[expectedDomain]) {
    const domainKeywords = DOMAINS[expectedDomain].keywords;
    const domainHits = domainKeywords.filter(kw => lower.includes(kw)).length;
    if (domainHits === 0) {
      score -= 0.1;
      signals.domainMismatch = true;
      details.push(`Response doesn't reference expected domain: ${expectedDomain}`);
    }
  }

  // Clamp
  score = Math.max(0, Math.min(1, score));

  const verdict = score >= 0.75 ? 'good' : score >= 0.45 ? 'weak' : 'bad';

  return { score, signals, verdict, details };
}

/**
 * Build an improved retry prompt when the first response scored poorly.
 * Adapts based on the specific failure signals from scoring.
 * @param {string} originalPrompt
 * @param {string} previousResponse
 * @param {{ attempt?: number, signals?: Object, details?: string[] }} [options]
 * @returns {string}
 */
export function buildRetryPrompt(originalPrompt, previousResponse, options = {}) {
  const { attempt = 2, signals = {}, details = [] } = options;
  const detected = detectDomain(originalPrompt);

  const issues = [];
  if (signals.refusal || signals.insufficientInfo) issues.push('DO NOT refuse. Provide your best technical answer.');
  if (signals.tooShort) issues.push('Previous response was too short. Provide COMPLETE implementation.');
  if (signals.placeholders) issues.push('NO placeholders, NO "// ...", NO TODOs. Every line must be real code.');
  if (signals.noErrorHandling) issues.push('ADD error handling: try/catch, null checks, input validation.');
  if (signals.noExplanation) issues.push('EXPLAIN your solution. State the root cause and why this fix is correct.');
  if (signals.noVerification) issues.push('ADD verification: tests/typecheck/build run, or the exact blocker if you cannot run them.');
  if (signals.securityGap) issues.push('SECURITY GAP: address auth/session/permission/2FA/CSRF/token validation and add a negative test.');
  if (signals.routeGap) issues.push('ROUTE/API GAP: verify the registered route, method, request/response contract, and all callers.');
  if (signals.frontendGap) issues.push('FRONTEND GAP: complete loading/disabled/validation/empty/error/success states and data wiring.');
  if (signals.excessiveFiller) issues.push('SKIP all filler phrases. Get straight to the answer.');
  if (signals.noCodeBlocks || signals.codeBlocks === 0) issues.push('MANDATORY: Include working code in fenced code blocks.');

  if (issues.length === 0) issues.push('Previous response needs improvement. Be more precise and complete.');

  const maxContext = attempt <= 2 ? 400 : 200;

  return [
    `═══ ATTEMPT ${attempt} — RETRY REQUIRED ═══`,
    '',
    `You are a ${detected.role}.`,
    '',
    `## Issues with previous response:`,
    ...issues.map(i => `- ${i}`),
    '',
    `## Rules for this attempt:`,
    `- Provide COMPLETE, working code. No shortcuts.`,
    `- Be technically precise. Match repo patterns and open relevant source files before changing logic.`,
    `- Preserve route/API contracts, security behavior, UI states, and verification.`,
    `- If something is wrong in the previous response, FIX it directly.`,
    '',
    `## Previous response (for reference):`,
    '```',
    previousResponse.slice(0, maxContext) + (previousResponse.length > maxContext ? '\n...[truncated]' : ''),
    '```',
    '',
    `## Original task:`,
    originalPrompt,
  ].join('\n');
}

/**
 * Full evaluate-and-retry loop. Scores a response and if quality is below threshold,
 * returns a retry prompt. Otherwise returns null (response is acceptable).
 * @param {string} originalPrompt
 * @param {string} response
 * @param {{ attempt?: number, threshold?: number, maxRetries?: number }} [options]
 * @returns {{ accept: boolean, score: number, verdict: string, retryPrompt?: string, details: string[] }}
 */
export function evaluateAndRetry(originalPrompt, response, options = {}) {
  const { attempt = 1, threshold = 0.75, maxRetries = 3 } = options;

  const result = scoreResponse(response, {
    isCodeTask: true,
    expectedDomain: detectDomain(originalPrompt).domain,
    promptLength: originalPrompt.length,
    originalPrompt,
  });

  if (result.score >= threshold || attempt >= maxRetries) {
    return {
      accept: true,
      score: result.score,
      verdict: result.verdict,
      details: result.details,
    };
  }

  const retryPrompt = buildRetryPrompt(originalPrompt, response, {
    attempt: attempt + 1,
    signals: result.signals,
    details: result.details,
  });

  return {
    accept: false,
    score: result.score,
    verdict: result.verdict,
    retryPrompt,
    details: result.details,
  };
}
