#!/usr/bin/env node
// .agent-boost/scripts/prune-lessons.mjs
import { loadAgentBoost } from './_load.mjs';

const { ab, repoRoot } = await loadAgentBoost();
const res = await ab.pruneLessons({ repoRoot });
console.log(`archived ${res.archived} stale lesson(s). Originals moved to .agent-boost/lessons-archive.md.`);
