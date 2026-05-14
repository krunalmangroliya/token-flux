// model-detector.mjs — Auto-detects the active AI model from IDE config files.
// Supports: Claude Code, Cursor, Aider, OpenCode, Cline, Continue, Windsurf, Copilot.
// Result is cached in .agent-boost/config.json as `detectedModel`.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── IDE Config Readers ───────────────────────────────────────────────────────

const IDE_READERS = [

  // ── Claude Code ──────────────────────────────────────────────────────────────
  {
    name: 'claude-code',
    paths: [
      '.claude/settings.json',
      '.claude/settings.local.json',
    ],
    globalPaths: [
      path.join(os.homedir(), '.claude', 'settings.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg.model || cfg.defaultModel || null;
      } catch { return null; }
    },
  },

  // ── Aider ─────────────────────────────────────────────────────────────────
  {
    name: 'aider',
    paths: [
      '.aider.conf.yml',
      'aider.conf.yml',
    ],
    globalPaths: [
      path.join(os.homedir(), '.aider.conf.yml'),
    ],
    extract(raw) {
      const m = raw.match(/^model:\s*(.+)/m);
      return m ? m[1].trim().replace(/['"]/g, '') : null;
    },
  },

  // ── OpenCode ─────────────────────────────────────────────────────────────
  {
    name: 'opencode',
    paths: [
      'opencode.json',
      '.opencode.json',
      'opencode.toml',
    ],
    globalPaths: [],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        // opencode format: { model: "..." } or { providers: [{ model: "..." }] }
        return cfg.model
          || cfg.defaultModel
          || cfg.providers?.[0]?.model
          || null;
      } catch {
        // TOML fallback: model = "..."
        const m = raw.match(/^model\s*=\s*["']?([^"'\n]+)/m);
        return m ? m[1].trim() : null;
      }
    },
  },

  // ── Cursor ───────────────────────────────────────────────────────────────
  {
    name: 'cursor',
    paths: [
      '.cursor/settings.json',
      '.cursor/mcp.json',
    ],
    globalPaths: [
      path.join(os.homedir(), '.cursor', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'),
      path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg['cursor.general.enabledModels']?.[0]
          || cfg['cursor.chat.model']
          || cfg.model
          || null;
      } catch { return null; }
    },
  },

  // ── Windsurf (Codeium) ───────────────────────────────────────────────────
  {
    name: 'windsurf',
    paths: [
      '.windsurf/settings.json',
    ],
    globalPaths: [
      path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
      path.join(os.homedir(), '.codeium', 'windsurf', 'settings.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg.model || cfg.defaultModel || null;
      } catch { return null; }
    },
  },

  // ── Cline / RooCode ──────────────────────────────────────────────────────
  {
    name: 'cline',
    paths: [
      '.roo/settings.json',
      '.clinerules',
    ],
    globalPaths: [
      path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg.apiModelId || cfg.model || null;
      } catch { return null; }
    },
  },

  // ── Continue (VSCode extension) ──────────────────────────────────────────
  {
    name: 'continue',
    paths: [
      '.continue/config.json',
      '.continue/config.yaml',
    ],
    globalPaths: [
      path.join(os.homedir(), '.continue', 'config.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        // Continue uses { models: [{ model: "...", ... }] }
        return cfg.models?.[0]?.model
          || cfg.defaultModel?.model
          || null;
      } catch {
        // YAML: model: "..."
        const m = raw.match(/^\s*model:\s*["']?([^"'\n]+)/m);
        return m ? m[1].trim() : null;
      }
    },
  },

  // ── Copilot (VSCode settings) ────────────────────────────────────────────
  {
    name: 'copilot',
    paths: [
      '.vscode/settings.json',
    ],
    globalPaths: [
      path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
      path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json'),
    ],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg['github.copilot.advanced']?.model
          || cfg['github.copilot.chat.completionContext.model']
          || null;
      } catch { return null; }
    },
  },

  // ── Antigravity (.antigravity config) ────────────────────────────────────
  {
    name: 'antigravity',
    paths: [
      '.antigravity/config.json',
      'antigravity.config.json',
    ],
    globalPaths: [],
    extract(raw) {
      try {
        const cfg = JSON.parse(raw);
        return cfg.model || cfg.defaultModel || null;
      } catch { return null; }
    },
  },
];

// ─── Model name normaliser ────────────────────────────────────────────────────

/**
 * Normalise a raw model string from IDE config to a clean model name
 * compatible with getModelProfile().
 * @param {string} raw e.g. "claude-3-haiku-20240307", "gpt-4o-mini-2024-07-18"
 * @returns {string} normalised e.g. "haiku", "gpt-4o-mini"
 */
export function normaliseModelName(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase().trim();

  // Strip provider prefixes like "anthropic/", "openai/", "meta-llama/"
  const stripped = s.replace(/^[a-z-]+\//, '');

  // Haiku variants
  if (stripped.includes('haiku')) return 'haiku';
  // Sonnet / Opus → not weak, return as-is (won't match weak profile)
  if (stripped.includes('sonnet') || stripped.includes('opus')) return stripped;
  // GPT-4o-mini
  if (stripped.includes('gpt-4o-mini') || stripped.includes('gpt4o-mini')) return 'gpt-4o-mini';
  // GPT-3.5
  if (stripped.includes('gpt-3.5') || stripped.includes('gpt3.5')) return 'gpt-3.5-turbo';
  // Gemini Flash
  if (stripped.includes('flash')) return 'flash';
  // Llama
  if (stripped.includes('llama')) return 'llama-3';
  // Mistral / Mixtral
  if (stripped.includes('mistral') || stripped.includes('mixtral')) return 'mistral';
  // DeepSeek
  if (stripped.includes('deepseek')) return 'deepseek';
  // Qwen
  if (stripped.includes('qwen')) return 'qwen';
  // Phi
  if (stripped.includes('phi')) return 'phi-3';
  // Codestral
  if (stripped.includes('codestral')) return 'codestral';

  return stripped; // return as-is for getModelProfile to try
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Scan all IDE config files and return the first detected model.
 * @param {string} repoRoot
 * @returns {Promise<{ model: string, normalisedModel: string, source: string } | null>}
 */
export async function detectModel(repoRoot) {
  for (const reader of IDE_READERS) {
    // Check project-local paths first, then global
    const allPaths = [
      ...reader.paths.map(p => path.join(repoRoot, p)),
      ...reader.globalPaths,
    ];

    for (const filePath of allPaths) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const model = reader.extract(raw);
        if (model) {
          return {
            model,
            normalisedModel: normaliseModelName(model),
            source: reader.name,
            configFile: filePath,
          };
        }
      } catch { /* file not found, skip */ }
    }
  }
  return null;
}

/**
 * Detect model and save result to .agent-boost/config.json.
 * @param {string} repoRoot
 * @returns {Promise<DetectResult | null>}
 */
export async function detectAndSaveModel(repoRoot) {
  const result = await detectModel(repoRoot);

  const configPath = path.join(repoRoot, '.agent-boost', 'config.json');
  let cfg = {};
  try {
    cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch { /* fresh */ }

  if (result) {
    cfg.detectedModel    = result.normalisedModel;
    cfg.detectedModelRaw = result.model;
    cfg.detectedSource   = result.source;
    cfg.detectedAt       = new Date().toISOString();
  } else {
    cfg.detectedModel    = null;
    cfg.detectedSource   = null;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
  return result;
}

/**
 * Get the cached detected model from config.json.
 * @param {string} repoRoot
 * @returns {Promise<string|null>}
 */
export async function getCachedModel(repoRoot) {
  try {
    const cfg = JSON.parse(
      await fs.readFile(path.join(repoRoot, '.agent-boost', 'config.json'), 'utf8')
    );
    return cfg.detectedModel || null;
  } catch { return null; }
}
