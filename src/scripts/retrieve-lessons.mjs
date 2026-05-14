#!/usr/bin/env node
// .agent-boost/scripts/retrieve-lessons.mjs <query>
import { loadAgentBoost } from './_load.mjs';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('usage: node ./.agent-boost/scripts/retrieve-lessons.mjs <task description or tags>');
  process.exit(2);
}

const { ab, repoRoot } = await loadAgentBoost();
const block = await ab.retrieveLessons({ repoRoot, query });
console.log(block);
