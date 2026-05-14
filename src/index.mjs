// Public API for programmatic use.
export { init } from './init.mjs';
export { detect } from './detect.mjs';
export { buildCodeMap } from './codemap/index.mjs';
export { computeBlastRadius } from './codemap/blast-radius.mjs';
export { runVerify } from './enforce/verify.mjs';
export { retrieveLessons } from './lessons/retrieve.mjs';
export { pruneLessons } from './lessons/prune.mjs';
export { extractLessonPrompt, appendLesson } from './lessons/extract.mjs';
export { judgeLesson } from './lessons/judge.mjs';
export { checkPreEdit } from './enforce/wrapper.mjs';
export { runEvals } from './eval/runner.mjs';
export { applyAdapter, ALL_ADAPTERS } from './adapters/index.mjs';

// Token-saver public API
export { compress, countTokens } from './token-saver/input-compressor.mjs';
export { buildCavemanInstruction, CAVEMAN_LEVELS, getCurrentLevel, setLevel } from './token-saver/output-compressor.mjs';
export { enhance, scoreResponse, detectDomain } from './enforce/flash-enhancer.mjs';
export { decide, escalate, loadQuota, saveQuota, MODEL_TIERS } from './token-saver/model-router.mjs';
export { filterOutput, runProxy } from './token-saver/cli-proxy.mjs';
export { loadLedger, logCompression, estimateDollarSavings } from './token-saver/ledger.mjs';
export { startDashboard } from './token-saver/dashboard.mjs';
export { getMinimalContext, loadContextIndex, inferIntent, estimateContextTokens } from './token-saver/context.mjs';
export { serveMcp, writeMcpConfig } from './token-saver/mcp-server.mjs';
