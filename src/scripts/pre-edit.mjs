#!/usr/bin/env node
// .agent-boost/scripts/pre-edit.mjs
// Hook entry for agents that support pre-tool-use gates (e.g. Claude Code).
// Reads the tool call JSON from stdin and emits a decision to stdout per the agent's hook protocol.
//
// For Claude Code specifically, exit code 2 with a message on stderr means "block with reason".
import path from 'node:path';
import { loadAgentBoost } from './_load.mjs';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

let parsed = {};
try { parsed = input.trim() ? JSON.parse(input) : {}; } catch { parsed = {}; }

const toolInput = parsed.tool_input || parsed.input || {};
const filePath = toolInput.file_path || toolInput.path || toolInput.filePath || process.argv[2];

if (!filePath) {
  // No file path to evaluate — allow by default.
  process.exit(0);
}

const { ab, repoRoot } = await loadAgentBoost();

// Read enforcement level from the snapshot.
let enforcement = 'normal';
try {
  const { promises: fs } = await import('node:fs');
  const snap = JSON.parse(await fs.readFile(path.join(repoRoot, '.agent-boost', 'scripts', 'config.snapshot.json'), 'utf8'));
  enforcement = snap.enforcement || 'normal';
} catch { /* default */ }

const result = await ab.checkPreEdit({ repoRoot, filePath, enforcement });
if (result.decision === 'deny') {
  process.stderr.write(result.reason + '\n');
  process.exit(2);
}
process.exit(0);
