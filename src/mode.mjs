// Mode system — defines boost vs saver operating modes.
// boost  = weak/low model + output quality improvement
// saver  = strong/high model + token saving
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MODES = {
  boost: {
    name: 'BOOST',
    label: '🚀 Boost Mode',
    description: 'Optimised for weak/low models. Improves output quality. Token saving disabled.',
    features: {
      flashEnhancer:    true,
      inputCompressor:  false,
      outputCompressor: false,
      modelRouter:      false,
      cliProxy:         false,
    },
  },
  saver: {
    name: 'SAVER',
    label: '💰 Saver Mode',
    description: 'Optimised for strong/high models. Maximum token saving. Quality enhancer disabled.',
    features: {
      flashEnhancer:    false,
      inputCompressor:  true,
      outputCompressor: true,
      modelRouter:      true,
      cliProxy:         true,
    },
  },
  both: {
    name: 'BOTH',
    label: '⚡ Both Modes',
    description: 'All features enabled. Quality enhancement + token saving active together.',
    features: {
      flashEnhancer:    true,
      inputCompressor:  true,
      outputCompressor: true,
      modelRouter:      true,
      cliProxy:         true,
    },
  },
};

const CONFIG_FILE = (repoRoot) => path.join(repoRoot, '.agent-boost', 'config.json');

export async function getMode(repoRoot) {
  try {
    const raw = await fs.readFile(CONFIG_FILE(repoRoot), 'utf8');
    const cfg = JSON.parse(raw);
    return MODES[cfg.mode] ? cfg.mode : 'both';
  } catch {
    return 'both';
  }
}

export async function setMode(repoRoot, mode) {
  if (!MODES[mode]) {
    throw new Error(`Invalid mode "${mode}". Choose: boost | saver | both`);
  }
  const configPath = CONFIG_FILE(repoRoot);
  let cfg = {};
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    cfg = JSON.parse(raw);
  } catch { /* fresh config */ }
  cfg.mode = mode;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
  return mode;
}

export function getModeInfo(mode) {
  return MODES[mode] || MODES.boost;
}

export async function isFeatureEnabled(repoRoot, feature) {
  const mode = await getMode(repoRoot);
  return MODES[mode]?.features[feature] ?? false;
}
