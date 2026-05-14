// Eval scorer — runs the verifier against the task's fixture copy and returns pass/fail.
import { runVerify } from '../enforce/verify.mjs';

export async function scoreTask({ workDir, task }) {
  const start = Date.now();
  const code = await runVerify({ repoRoot: workDir });
  const durationMs = Date.now() - start;

  if (code === 0) {
    return { pass: true, note: 'verify 0', durationMs };
  }
  return { pass: false, note: `verify exited ${code}`, durationMs };
}
