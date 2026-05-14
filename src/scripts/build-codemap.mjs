#!/usr/bin/env node
// .agent-boost/scripts/build-codemap.mjs
import { loadAgentBoost } from './_load.mjs';

const withRuntime = process.argv.includes('--with-runtime');
const { ab, repoRoot } = await loadAgentBoost();
const data = await ab.buildCodeMap({ repoRoot, withRuntime });
console.log(`codemap: ${data.entries.length} file(s) indexed, wrote CODEMAP.md + .agent-boost/codemap.json`);
