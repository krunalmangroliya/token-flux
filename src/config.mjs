// Config read/write. Single source of truth: .agent-boost/config.json.
import path from 'node:path';
import { readJson, writeJson, exists } from './utils.mjs';

export const CONFIG_REL = '.agent-boost/config.json';

/**
 * @typedef {Object} AgentBoostConfig
 * @property {number} version
 * @property {string[]} languages        Detected: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'dotnet'
 * @property {Object} commands
 * @property {string} [commands.test]
 * @property {string} [commands.lint]
 * @property {string} [commands.typecheck]
 * @property {string} [commands.format]
 * @property {string} [commands.build]
 * @property {string} [commands.coverage]
 * @property {string} [commands.secrets]
 * @property {string} [commands.autofix]
 * @property {string[]} adapters         e.g. ['generic', 'claude-code']
 * @property {'strict'|'normal'|'advisory'} enforcement
 * @property {boolean} runtime           whether runtime tracing / coverage enrichment is on
 * @property {boolean} gitHooks          whether git hooks are installed
 * @property {boolean} tokenSaver        whether token-saver features are enabled
 * @property {'lite'|'full'|'ultra'} cavemanLevel  caveman output compression level
 */

export async function loadConfig(repoRoot) {
  const p = path.join(repoRoot, CONFIG_REL);
  if (!(await exists(p))) return null;
  return readJson(p);
}

export async function saveConfig(repoRoot, config) {
  const p = path.join(repoRoot, CONFIG_REL);
  await writeJson(p, config);
}

export function defaultConfig() {
  return {
    version: 1,
    languages: [],
    commands: {},
    adapters: ['generic'],
    enforcement: 'normal',
    runtime: true,
    gitHooks: false,
    tokenSaver: true,
    cavemanLevel: 'full',
  };
}
