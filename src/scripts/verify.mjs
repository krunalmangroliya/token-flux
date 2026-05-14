#!/usr/bin/env node
// .agent-boost/scripts/verify.mjs — drop-in verifier.
import { loadAgentBoost } from './_load.mjs';

const { ab, repoRoot } = await loadAgentBoost();
const code = await ab.runVerify({ repoRoot });
process.exit(code);
