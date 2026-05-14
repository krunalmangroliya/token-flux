import path from 'node:path';
import { promises as fs } from 'node:fs';
import pc from 'picocolors';
import prompts from 'prompts';
import { detect } from './detect.mjs';
import { defaultConfig, loadConfig, saveConfig } from './config.mjs';
import { applyAdapter, ALL_ADAPTERS } from './adapters/index.mjs';
import { installHooks } from './enforce/hooks.mjs';
import { buildCodeMap } from './codemap/index.mjs';
import { PKG_ROOT, ensureDir, exists, writeText, readText, writeJson } from './utils.mjs';
import { setLevel, CAVEMAN_LEVELS } from './token-saver/output-compressor.mjs';
import { setMode, MODES } from './mode.mjs';
import { detectAndSaveModel } from './token-saver/model-detector.mjs';
import { classifyModel } from './smart-mode.mjs';

/**
 * @param {Object} options
 * @param {string} options.repoRoot
 * @param {boolean} [options.yes]            skip prompts, accept defaults
 * @param {string[]} [options.adapters]      override detection
 * @param {'strict'|'normal'|'advisory'} [options.enforcement]
 * @param {boolean} [options.runtime]
 * @param {boolean} [options.hooks]
 */
export async function init(options) {
  const repoRoot = path.resolve(options.repoRoot);
  console.log(pc.bold(pc.cyan('token-flux init')) + pc.dim(` @ ${repoRoot}`));

  // Step 1 — Detect.
  console.log(pc.dim('▸ detecting project...'));
  const detected = await detect(repoRoot);
  if (detected.languages.length === 0) {
    console.log(pc.yellow('  no recognized language found — continuing with generic scaffolding'));
  } else {
    console.log(pc.dim(`  languages: ${detected.languages.join(', ')}`));
    console.log(pc.dim(`  commands: ${Object.keys(detected.commands).join(', ') || '(none detected)'}`));
  }

  // Step 2 — Ask.
  const existing = await loadConfig(repoRoot);
  const config = existing || defaultConfig();
  config.languages = detected.languages;
  config.commands = { ...config.commands, ...detected.commands };

  if (!options.yes) {
    const answers = await prompts(
      [
        {
          type: 'multiselect',
          name: 'adapters',
          message: 'Which agent runtimes do you use?',
          choices: ALL_ADAPTERS.map((a) => ({ title: a, value: a, selected: ['generic', 'claude-code', 'antigravity', 'opencode'].includes(a) })),
          hint: 'space to toggle, enter to confirm',
          min: 1,
        },
        {
          type: 'select',
          name: 'enforcement',
          message: 'Enforcement level?',
          choices: [
            { title: 'strict — block on every rule', value: 'strict' },
            { title: 'normal — block on correctness, warn on style (recommended)', value: 'normal' },
            { title: 'advisory — warn only, never block', value: 'advisory' },
          ],
          initial: 1,
        },
        {
          type: 'confirm',
          name: 'runtime',
          message: 'Enable runtime enrichment (coverage + call counts)?',
          initial: true,
        },
        {
          type: 'confirm',
          name: 'hooks',
          message: 'Install git hooks (pre-commit runs verify; post-merge rebuilds code map)?',
          initial: true,
        },
        {
          type: 'select',
          name: 'mode',
          message: 'Which operating mode? (select or press Enter for default)',
          choices: [
            { title: '🚀 boost — weak/low model + quality improvement only', value: 'boost' },
            { title: '💰 saver — strong/high model + token saving only', value: 'saver' },
            { title: '⚡ both  — all features enabled (recommended default)', value: 'both' },
          ],
          initial: 2,
        },
        {
          type: (prev, values) => ['saver', 'both'].includes(values.mode) ? 'select' : null,
          name: 'cavemanLevel',
          message: 'Caveman output compression level?',
          choices: [
            { title: 'lite — 40% output saving, clean and concise', value: 'lite' },
            { title: 'full — 65% output saving, caveman style (recommended)', value: 'full' },
            { title: 'ultra — 75% output saving, maximum compression', value: 'ultra' },
          ],
          initial: 1,
        },
      ],
      { onCancel: () => process.exit(130) },
    );
    config.adapters = answers.adapters;
    config.enforcement = answers.enforcement;
    config.runtime = answers.runtime;
    config.gitHooks = answers.hooks;
    config.mode = answers.mode || 'both';
    config.tokenSaver = ['saver', 'both'].includes(config.mode);
    config.cavemanLevel = answers.cavemanLevel || 'full';
  } else {
    config.adapters = options.adapters || ['generic', 'claude-code', 'antigravity', 'opencode'];
    config.enforcement = options.enforcement || 'normal';
    config.runtime = options.runtime !== false;
    config.gitHooks = options.hooks === true;
    config.tokenSaver = true;
    config.cavemanLevel = 'full';
    config.mode = 'both'; // default: all features ON, user switches later
  }

  await saveConfig(repoRoot, config);
  console.log(pc.green('✓ config saved'));

  // Step 3 — Generate scripts.
  console.log(pc.dim('▸ writing runtime scripts...'));
  await writeRuntimeScripts(repoRoot, config);
  console.log(pc.green('✓ scripts installed to .agent-boost/scripts/'));

  // Step 4 — Build initial code map.
  console.log(pc.dim('▸ building initial code map...'));
  try {
    await buildCodeMap({ repoRoot, withRuntime: false });
    console.log(pc.green('✓ CODEMAP.md written'));
  } catch (e) {
    console.log(pc.yellow(`  codemap build skipped: ${e?.message || e}`));
  }

  // Step 5 — Write agent-facing files via adapters.
  console.log(pc.dim('▸ applying adapters...'));
  for (const adapter of config.adapters) {
    await applyAdapter(adapter, { repoRoot, config });
    console.log(pc.green(`✓ adapter: ${adapter}`));
  }

  // Step 6 — Seed the lessons file.
  const lessonsPath = path.join(repoRoot, 'LESSONS.md');
  if (!(await exists(lessonsPath))) {
    await writeText(lessonsPath, await readText(path.join(PKG_ROOT, 'templates/LESSONS-seed.md')));
    console.log(pc.green('✓ LESSONS.md seeded'));
  } else {
    console.log(pc.dim('  LESSONS.md already exists — leaving intact'));
  }

  // Step 7 — Hooks.
  if (config.gitHooks) {
    try {
      await installHooks(repoRoot);
      console.log(pc.green('✓ git hooks installed'));
    } catch (e) {
      console.log(pc.yellow(`  hook install skipped: ${e?.message || e}`));
    }
  }

  // Step 8 — Token Saver setup.
  if (config.tokenSaver) {
    console.log(pc.dim('▸ setting up token saver...'));
    try {
      await setLevel(repoRoot, config.cavemanLevel);
      // Seed empty ledger
      const ledgerPath = path.join(repoRoot, '.agent-boost', 'ledger.json');
      if (!(await exists(ledgerPath))) {
        await writeJson(ledgerPath, {
          lifetime: { savedTokens: 0, prompts: 0, escalations: 0, sessions: 0 },
          today: { date: '', savedTokens: 0, prompts: 0 },
        });
      }
      console.log(pc.green(`✓ token saver enabled (caveman: ${config.cavemanLevel})`));
    } catch (e) {
      console.log(pc.yellow(`  token saver setup skipped: ${e?.message || e}`));
    }
  }

  // Step 9 — Mode setup.
  console.log(pc.dim(`▸ setting operating mode to ${config.mode}...`));
  try {
    await setMode(repoRoot, config.mode);
    // Overwrite AGENT.md with mode-specific template
    const templateName = `AGENT-${config.mode}.md`;
    const templatePath = path.join(PKG_ROOT, 'templates', templateName);
    const agentPath = path.join(repoRoot, 'AGENT.md');
    if (await exists(templatePath)) {
      await writeText(agentPath, await readText(templatePath));
      console.log(pc.green(`✓ mode set to ${MODES[config.mode].label} — AGENT.md updated`));
    } else {
      console.log(pc.green(`✓ mode set to ${MODES[config.mode].label}`));
    }
  } catch (e) {
    console.log(pc.yellow(`  mode setup skipped: ${e?.message || e}`));
  }

  // Step 10 — Model auto-detection (Strategy E).
  try {
    const detected = await detectAndSaveModel(repoRoot);
    if (detected) {
      const tier = classifyModel(detected.normalisedModel);
      const tierLabel = { weak: '🚀 BOOST tier (quality enhancement ON)', strong: '💰 SAVER tier (token saving ULTRA)', unknown: '⚡ BALANCED tier' }[tier] || '';
      console.log(`  ${pc.cyan('model')} detected: ${pc.bold(detected.normalisedModel)} from ${detected.source} → ${tierLabel}`);
    }
  } catch { /* skip if detector fails */ }

  // Step 11 — Summary.
  console.log('');
  console.log(pc.bold('done.'));
  console.log(`  wrote ${pc.cyan('.agent-boost/')} ${pc.dim('(config, scripts, tasks dir)')}`);
  console.log(`  wrote ${pc.cyan('CODEMAP.md')} ${pc.cyan('LESSONS.md')} ${pc.dim('at repo root')}`);
  console.log(`  wrote adapter files for: ${config.adapters.map((a) => pc.cyan(a)).join(', ')}`);
  console.log(`  ${pc.cyan('mode')} set to ${pc.bold(MODES[config.mode].label)} — ${pc.dim(MODES[config.mode].description)}`);
  if (config.tokenSaver) {
    console.log(`  ${pc.cyan('token saver')} enabled — caveman level: ${pc.cyan(config.cavemanLevel)}`);
  }
  console.log('');
  console.log(pc.bold('next:'));
  console.log(`  1. Run ${pc.cyan('token-flux detect-model')} to auto-detect your AI model.`);
  console.log(`  2. Run ${pc.cyan('token-flux session-start')} and paste the output into your AI.`);
  console.log(`  3. Tell your agent to read ${pc.cyan('AGENT.md')} before its next task.`);
  console.log(`  4. Boost a prompt:   ${pc.cyan('token-flux boost "your task"')}`);
  console.log(`  5. Score a response: ${pc.cyan('token-flux score "AI response"')}`);
  console.log(`  6. Switch mode:      ${pc.cyan('token-flux mode set boost|saver|both')}`);
  if (config.tokenSaver) {
    console.log(`  7. Wrap commands:    ${pc.cyan('token-flux proxy "npm test"')}`);
    console.log(`  8. View savings:     ${pc.cyan('token-flux token-status')}`);
  }
}

async function writeRuntimeScripts(repoRoot, config) {
  const destDir = path.join(repoRoot, '.agent-boost', 'scripts');
  await ensureDir(destDir);
  await ensureDir(path.join(repoRoot, '.agent-boost', 'tasks'));

  const scripts = [
    'verify.mjs',
    'build-codemap.mjs',
    'pack-context.mjs',
    'blast-radius.mjs',
    'pre-edit.mjs',
    'retrieve-lessons.mjs',
    'extract-lesson.mjs',
    'self-review.mjs',
    'prune-lessons.mjs',
    '_load.mjs',
  ];

  for (const name of scripts) {
    const src = path.join(PKG_ROOT, 'src', 'scripts', name);
    const dst = path.join(destDir, name);
    await fs.copyFile(src, dst);
  }

  // Write a small config snapshot the scripts will read at runtime.
  // pkgRoot lets the installed scripts locate the token-flux source even when not on npm path.
  const snapshot = {
    version: 1,
    commands: config.commands,
    enforcement: config.enforcement,
    runtime: config.runtime,
    languages: config.languages,
    pkgRoot: PKG_ROOT,
  };
  await writeText(
    path.join(destDir, 'config.snapshot.json'),
    JSON.stringify(snapshot, null, 2) + '\n',
  );
}
