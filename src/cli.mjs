// CLI dispatcher for token-flux.
import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { init } from './init.mjs';
import { buildCodeMap } from './codemap/index.mjs';
import { runVerify } from './enforce/verify.mjs';
import { pruneLessons } from './lessons/prune.mjs';
import { retrieveLessons } from './lessons/retrieve.mjs';
import { runEvals } from './eval/runner.mjs';
import { readText } from './utils.mjs';
import { fileURLToPath } from 'node:url';

// Token-saver imports
import { compress, countTokens } from './token-saver/input-compressor.mjs';
import { enhance, detectTaskType, evaluateAndRetry } from './enforce/flash-enhancer.mjs';
import { buildCavemanInstruction, CAVEMAN_LEVELS } from './token-saver/output-compressor.mjs';
import { decide, getDefaultQuota, loadQuota, scoreComplexity, getRoutingSummary, configureQuota } from './token-saver/model-router.mjs';
import { logCompression, loadLedger, estimateDollarSavings } from './token-saver/ledger.mjs';
import { runProxy, detectCommandType } from './token-saver/cli-proxy.mjs';
import { startDashboard } from './token-saver/dashboard.mjs';
import { install as installHooks, generateAliases } from './token-saver/install.mjs';
import { scan as scanProject } from './token-saver/project-scanner.mjs';
import { getMinimalContext, printContext } from './token-saver/context.mjs';
import { serveMcp, writeMcpConfig } from './token-saver/mcp-server.mjs';
import { uninstallHooks } from './enforce/hooks.mjs';
import { promises as fs } from 'node:fs';
import { exists as existsCheck } from './utils.mjs';
// Mode system
import { MODES, getMode, setMode, getModeInfo } from './mode.mjs';
// New strategies
import { printSessionHeader } from './token-saver/session.mjs';
import { filterAndReport, filterFromStdin, registerClaudeResponseHook } from './token-saver/response-filter.mjs';
import { checkBudget, printBudget } from './token-saver/budget.mjs';
// Boost mode strategies
import { runBoost, printBoostResult } from './token-saver/boost-command.mjs';
import { scoreResponse, buildRetryPrompt, detectDomain as detectDom, buildThinkingScaffold } from './enforce/flash-enhancer.mjs';
import { detectModel, detectAndSaveModel, normaliseModelName, getCachedModel } from './token-saver/model-detector.mjs';
import { resolveActiveConfig, printAdaptiveStatus, classifyModel } from './smart-mode.mjs';





const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function run(argv) {
  const program = new Command();
  program
    .name('token-flux')
    .description('Make weak-model coding agents produce strong-model output.')
    .version(await loadVersion());

  program
    .command('init')
    .description('Scaffold token-flux into the current repo')
    .option('-y, --yes', 'accept defaults, no prompts')
    .option('-a, --adapters <list>', 'comma-separated adapter list')
    .option('-e, --enforcement <level>', 'strict | normal | advisory', 'normal')
    .option('--no-runtime', 'disable runtime enrichment')
    .option('--hooks', 'install git hooks (non-interactive)')
    .action(async (opts) => {
      await init({
        repoRoot: process.cwd(),
        yes: opts.yes,
        adapters: opts.adapters ? opts.adapters.split(',').map((s) => s.trim()) : undefined,
        enforcement: opts.enforcement,
        runtime: opts.runtime,
        hooks: opts.hooks,
      });
    });

  program
    .command('codemap')
    .description('Rebuild CODEMAP.md and codemap.json')
    .option('--with-runtime', 'also ingest coverage for annotations')
    .action(async (opts) => {
      await buildCodeMap({ repoRoot: process.cwd(), withRuntime: !!opts.withRuntime });
      console.log(pc.green('✓ codemap rebuilt'));
    });

  program
    .command('verify')
    .description('Run the verifier (format, lint, typecheck, test, build, secrets)')
    .action(async () => {
      const code = await runVerify({ repoRoot: process.cwd() });
      process.exit(code);
    });

  program
    .command('test')
    .description('Alias for verify — confirms the generated verifier works on this repo')
    .action(async () => {
      const code = await runVerify({ repoRoot: process.cwd() });
      process.exit(code);
    });

  const lessons = program.command('lessons').description('Manage the lessons layer');
  lessons
    .command('retrieve')
    .argument('<query>', 'task description or tag list')
    .description('Fetch the top relevant lessons for a task')
    .action(async (query) => {
      const out = await retrieveLessons({ repoRoot: process.cwd(), query });
      console.log(out);
    });
  lessons
    .command('prune')
    .description('Archive lessons whose referenced files no longer exist')
    .action(async () => {
      const result = await pruneLessons({ repoRoot: process.cwd() });
      console.log(pc.green(`✓ archived ${result.archived} stale lesson(s)`));
    });

  program
    .command('eval')
    .description('Run the evaluation harness against a configured agent adapter')
    .option('-r, --runs <n>', 'number of runs per task', '1')
    .option('-t, --tasks <path>', 'override tasks directory')
    .action(async (opts) => {
      const result = await runEvals({
        pkgRoot: path.resolve(__dirname, '..'),
        runs: parseInt(opts.runs, 10),
        tasksDir: opts.tasks,
      });
      process.exit(result.failed > 0 ? 1 : 0);
    });

  // ─── Mode commands ─────────────────────────────────────────────────────────

  const modeCmd = program
    .command('mode')
    .description('Manage operating mode (boost | saver)');

  modeCmd
    .command('set <mode>')
    .description('Switch operating mode: boost (quality) | saver (token saving) | both (all features)')
    .action(async (mode) => {
      const repoRoot = process.cwd();
      if (!MODES[mode]) {
        console.error(pc.red(`Invalid mode "${mode}". Choose: boost | saver | both`));
        process.exit(1);
      }
      await setMode(repoRoot, mode);

      // Re-apply adapters to update all IDE-specific instruction files
      const { loadConfig } = await import('./config.mjs');
      const { applyAdapter } = await import('./adapters/index.mjs');
      const config = await loadConfig(repoRoot) || { adapters: ['generic'], mode };
      config.mode = mode; // ensure current mode is set

      if (config.adapters && config.adapters.length > 0) {
        for (const adapter of config.adapters) {
          try {
            await applyAdapter(adapter, { repoRoot, config });
          } catch (e) {
            console.log(pc.yellow(`  failed to update adapter ${adapter}: ${e.message}`));
          }
        }
        console.log(pc.green(`✓ IDE instruction files updated for ${MODES[mode].label}`));
      } else {
        console.log(pc.yellow('  no adapters configured — skipped IDE files update'));
      }

      console.log('');
      console.log(pc.bold(pc.green(`✅ Mode switched to ${MODES[mode].label}`)));
      console.log(pc.dim(MODES[mode].description));
      console.log('');
      const features = MODES[mode].features;
      console.log('  Flash Enhancer  : ' + (features.flashEnhancer ? pc.green('ON') : pc.dim('off')));
      console.log('  Input Compress  : ' + (features.inputCompressor ? pc.green('ON') : pc.dim('off')));
      console.log('  Output Compress : ' + (features.outputCompressor ? pc.green('ON') : pc.dim('off')));
      console.log('  Model Router    : ' + (features.modelRouter ? pc.green('ON') : pc.dim('off')));
      console.log('  CLI Proxy       : ' + (features.cliProxy ? pc.green('ON') : pc.dim('off')));
      console.log('');

      // Auto-run scan + install when switching to saver or both mode
      if (mode === 'saver' || mode === 'both') {
        console.log(pc.dim('── Auto-configuring token saving ──'));

        // Scan project → anatomy.md + cerebrum.md
        console.log(pc.dim('  📂 Scanning project for file intelligence...'));
        const scanResult = await scanProject(repoRoot);
        console.log(`  ✅ Indexed ${scanResult.files} files (~${scanResult.totalTokens.toLocaleString()} tokens) → .agent-boost/anatomy.md`);

        // Install hooks into AI tools
        console.log(pc.dim('  🔗 Injecting compression hooks into AI tools...'));
        const { results } = await installHooks(repoRoot);
        for (const r of results) {
          console.log(r.message);
        }
        try {
          const mcpPath = await writeMcpConfig(repoRoot);
          console.log(`  âœ… mcp: Registered token-flux MCP tools â†’ ${path.relative(repoRoot, mcpPath)}`);
        } catch (e) {
          console.log(pc.yellow(`  mcp: skipped (${e.message})`));
        }
        console.log('');
      }
    });

  modeCmd
    .command('status')
    .description('Show current operating mode and active features (adaptive in both mode)')
    .action(async () => {
      const repoRoot = process.cwd();
      const activeCfg = await resolveActiveConfig(repoRoot);
      const f = activeCfg.features;
      const on = (v) => v ? pc.green('✅ ON') : pc.red('❌ off');

      console.log(`\n${pc.bold(pc.cyan('⚡ token-flux — Mode Status'))}\n`);
      console.log(`  Mode     : ${pc.bold(activeCfg.mode.toUpperCase())}${activeCfg.adaptive ? pc.dim(' (adaptive)') : ''}`);

      if (activeCfg.adaptive) {
        // Both mode — show adaptive tier
        const tierColour = { weak: pc.yellow, strong: pc.green, unknown: pc.cyan }[activeCfg.tier] || pc.white;
        console.log(`  Tier     : ${tierColour(activeCfg.tier.toUpperCase())} — ${activeCfg.label}`);
        if (activeCfg.modelId) {
          console.log(`  Model    : ${pc.bold(activeCfg.modelId)}${activeCfg.source ? pc.dim(` [from ${activeCfg.source}]`) : ''}`);
        } else {
          console.log(`  Model    : ${pc.dim('not detected — run: token-flux detect-model')}`);
        }
      } else {
        const info = { boost: '🚀 Quality enhancement ON, token saving OFF', saver: '💰 Token saving ULTRA, quality scaffold OFF' }[activeCfg.mode] || '';
        console.log(`  Strategy : ${pc.dim(info)}`);
      }

      console.log('');
      console.log(`  ${pc.dim('Features:')}`)
      console.log(`  Flash Enhancer  : ${on(f.flashEnhancer)}   — boost quality for weak models`);
      console.log(`  Input Compress  : ${on(f.inputCompressor)}   — compress prompts before sending`);
      console.log(`  Output Compress : ${on(f.outputCompressor)}   — caveman mode: ${f.cavemanLevel || (f.outputCompressor ? 'full' : 'off')}`);
      console.log(`  Model Router    : ${on(f.modelRouter)}   — auto-route to best available model`);
      console.log(`  CLI Proxy       : ${on(f.cliProxy)}   — compress terminal output`);
      console.log('');
      console.log(pc.dim(`  Switch: token-flux mode set boost | saver | both`));
      if (activeCfg.adaptive && !activeCfg.modelId) {
        console.log(pc.dim(`  Tip:    run token-flux detect-model to unlock adaptive tier`));
      }
      console.log('');
    });


  // ─── Token Saver commands ───────────────────────────────────────────────────

  program
    .command('compress')
    .description('Compress a prompt — strips filler, trims history, deduplicates code blocks')
    .argument('[prompt...]', 'The prompt text to compress')
    .option('-l, --level <level>', 'caveman level: lite, full, ultra', 'full')
    .option('--flash', 'also apply Flash enhancer to the compressed prompt')
    .option('--json', 'output as JSON')
    .action(async (promptParts, opts) => {
      const projectRoot = process.cwd();
      const mode = await getMode(projectRoot);
      const modeInfo = getModeInfo(mode);

      // compress is a token-saver feature — only available in saver mode
      if (!modeInfo.features.inputCompressor) {
        console.log(pc.yellow(`⚠️  Input compression is disabled in ${modeInfo.label}.`));
        console.log(pc.dim('   Switch to saver mode: token-flux mode set saver'));
        process.exit(0);
      }

      let promptText = promptParts.join(' ');

      // Read from stdin if no argument given
      if (!promptText && !process.stdin.isTTY) {
        promptText = await new Promise((resolve) => {
          let data = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', chunk => { data += chunk; });
          process.stdin.on('end', () => resolve(data.trim()));
        });
      }

      if (!promptText) {
        console.error(pc.red('Error: Provide a prompt as argument or pipe via stdin'));
        console.error('  token-flux compress "your prompt here"');
        console.error('  echo "your prompt" | token-flux compress');
        process.exit(1);
      }

      const compressed = compress(promptText, { keepHistory: 3 });
      const quota = await loadQuota(projectRoot);
      const complexityResult = scoreComplexity(promptText);
      const route = decide(quota, { prompt: promptText, complexity: complexityResult.complexity });
      const taskType = detectTaskType(promptText);

      // Strategy A: read auto-detected model to inject model-specific rules
      const cachedModel = await getCachedModel(projectRoot);

      // flash enhancer only runs in boost mode
      let flashResult = null;
      if (modeInfo.features.flashEnhancer && (opts.flash || route.tier === 'free')) {
        flashResult = enhance(compressed.compressed, {
          taskType: taskType.type,
          model: cachedModel || '',
        });
      } else if (opts.flash && !modeInfo.features.flashEnhancer) {
        console.log(pc.yellow('⚠️  Flash enhancer is disabled in SAVER mode (token saving takes priority).'));
      }

      const level = CAVEMAN_LEVELS[opts.level] ? opts.level : 'full';
      const cavemanInstruction = buildCavemanInstruction(level);

      await logCompression(projectRoot, { savedTokens: compressed.savedTokens });

      if (opts.json) {
        console.log(JSON.stringify({ compressed, route, flashResult, cavemanInstruction, taskType, complexity: complexityResult }, null, 2));
        return;
      }

      console.log('\n⚡ token-flux — Prompt Compressed\n');
      console.log('─'.repeat(50));
      console.log(compressed.compressed || '[All filler removed — prompt was empty after compression]');
      console.log('─'.repeat(50));
      console.log('\n📊 Stats:');
      console.log('   Before : ' + compressed.originalTokens + ' tokens');
      console.log('   After  : ' + compressed.compressedTokens + ' tokens');
      console.log('   Saved  : ' + compressed.savedTokens + ' tokens (' + compressed.savedPercent + '%)');

      // Task intelligence
      console.log('\n🎯 Task Detection:');
      console.log('   Type       : ' + taskType.type.toUpperCase());
      console.log('   Complexity : ' + (complexityResult.complexity * 100).toFixed(0) + '% ' + (complexityResult.factors.length > 0 ? '(' + complexityResult.factors.join(', ') + ')' : '(simple)'));

      if (modeInfo.features.modelRouter) {
        if (route.model) {
          const tierIcon = route.tier === 'free' ? '⚡' : route.tier === 'mid' ? '🧠' : '💎';
          console.log('\n🤖 Routing: ' + tierIcon + ' ' + route.model + ' [' + route.tier + ']');
          console.log('   Reason: ' + route.reason);
          console.log('   Flash resets in : ' + route.flashTimeLeft);
          console.log('   Claude resets in: ' + route.claudeTimeLeft);
        } else {
          console.log('\n⚠️  All quotas exhausted. Wait for ' + (route.waitTime || route.waitFor) + ' to reset');
        }
      }

      console.log('\n🪨 Caveman Mode [' + level.toUpperCase() + '] — add to your AI system prompt:');
      console.log('   "' + cavemanInstruction + '"');

      if (flashResult) {
        console.log('\n⚡ Flash-Enhanced Prompt:');
        console.log('─'.repeat(50));
        console.log(flashResult.enhanced);
        console.log('─'.repeat(50));
        console.log('   Domain    : ' + flashResult.domain);
        console.log('   Task type : ' + (flashResult.taskType || 'general'));
        if (flashResult.secondary && flashResult.secondary.length > 0) {
          console.log('   Secondary : ' + flashResult.secondary.join(', '));
        }
      }

      console.log('');
    });

  program
    .command('proxy')
    .description('Wrap a shell command and compress its output to save terminal tokens')
    .argument('<command...>', 'The command to wrap (e.g. "npm run test")')
    .action(async (cmdParts) => {
      const projectRoot = process.cwd();
      const mode = await getMode(projectRoot);
      const modeInfo = getModeInfo(mode);

      if (!modeInfo.features.cliProxy) {
        console.log(pc.yellow(`⚠️  CLI proxy is disabled in ${modeInfo.label}.`));
        console.log(pc.dim('   Switch to saver mode: token-flux mode set saver'));
        process.exit(0);
      }

      const fullCommand = cmdParts.join(' ');
      if (!fullCommand) {
        console.error(pc.red('[token-flux] Usage: token-flux proxy "npm run test"'));
        process.exit(1);
      }

      const result = await runProxy(fullCommand);

      if (result.savedTokens > 0) {
        await logCompression(projectRoot, { savedTokens: result.savedTokens, escalated: false });
        console.log(`\n\n[⚡ token-flux proxy: Suppressed ${result.savedTokens} noise tokens from terminal output.]`);
      }

      process.exit(result.code);
    });

  program
    .command('dashboard')
    .description('Open a live web dashboard showing token savings and model status')
    .action(async () => {
      await startDashboard(process.cwd());
    });

  program
    .command('token-status')
    .description('Show token savings summary, model routing, and caveman mode')
    .action(async () => {
      const projectRoot = process.cwd();
      const mode = await getMode(projectRoot);
      const modeInfo = getModeInfo(mode);

      if (!modeInfo.features.modelRouter) {
        console.log(pc.yellow(`⚠️  Token status is disabled in ${modeInfo.label}.`));
        console.log(pc.dim('   Switch to saver mode: token-flux mode set saver'));
        console.log(pc.dim(`   Current mode: ${modeInfo.label} — ${modeInfo.description}`));
        process.exit(0);
      }

      const { getCurrentLevel } = await import('./token-saver/output-compressor.mjs');
      const { formatTimeLeft } = await import('./token-saver/model-router.mjs');

      const ledger = await loadLedger(projectRoot);
      const today = ledger.today.date === new Date().toISOString().slice(0, 10) ? ledger.today : { savedTokens: 0, prompts: 0 };
      const level = await getCurrentLevel(projectRoot);
      const levelInfo = CAVEMAN_LEVELS[level];
      const quota = await loadQuota(projectRoot);
      const summary = getRoutingSummary(quota);
      const route = decide(quota);

      const bar = (value, max) => {
        const pct = Math.min(value / max, 1);
        const filled = Math.round(pct * 14);
        return '█'.repeat(filled) + '░'.repeat(14 - filled);
      };

      console.log(`\n${pc.bold(pc.cyan('⚡ token-flux — Token Saver Status'))}\n`);

      // Savings section
      console.log(pc.dim('── 💰 Savings ──'));
      console.log(`  Today    : ${bar(today.savedTokens, 20000)} ${pc.bold(today.savedTokens.toLocaleString())} tokens ≈ $${estimateDollarSavings(today.savedTokens)}`);
      console.log(`  Lifetime : ${pc.bold(ledger.lifetime.savedTokens.toLocaleString())} tokens ≈ $${estimateDollarSavings(ledger.lifetime.savedTokens)}`);
      console.log(`  Prompts  : ${ledger.lifetime.prompts}  |  Escalations: ${ledger.lifetime.escalations}`);
      console.log('');

      // Model routing section
      console.log(pc.dim('── 🤖 Model Routing ──'));
      for (const slot of summary.slots) {
        const icon = slot.remaining > 0 ? pc.green('✅') : pc.red('❌');
        const pctBar = bar(slot.remaining, slot.limit);
        const cost = slot.costPer1K > 0 ? `$${slot.costPer1K}/1K` : 'FREE';
        console.log(`  ${icon} ${slot.name.padEnd(8)} ${pctBar} ${String(slot.remaining).padStart(4)}/${slot.limit} ${pc.dim(`[resets ${slot.timeLeft}] [${cost}]`)}`);
      }
      console.log(`  Active   : ${pc.bold(summary.activeModel || 'none')} [${summary.tier || 'n/a'}]`);
      if (route.reason) console.log(`  Reason   : ${pc.dim(route.reason)}`);
      console.log('');

      // Caveman mode section
      console.log(pc.dim('── 🪨 Caveman Mode ──'));
      console.log(`  Level    : ${pc.bold(levelInfo.name)} (${levelInfo.savingPct}% output reduction)`);
      console.log('');

      // ── Adaptive smart-mode section ──────────────────────────────────────────
      const activeCfg = await resolveActiveConfig(projectRoot);
      console.log(pc.dim('── ⚡ Smart Mode ──'));
      console.log(`  Mode     : ${pc.bold(activeCfg.mode.toUpperCase())}${activeCfg.adaptive ? ' (adaptive)' : ''}`);
      if (activeCfg.adaptive) {
        const tierColour = { weak: pc.yellow, strong: pc.green, unknown: pc.cyan }[activeCfg.tier] || pc.white;
        console.log(`  Tier     : ${tierColour(activeCfg.tier.toUpperCase())} — ${activeCfg.label}`);
        if (activeCfg.modelId) {
          console.log(`  Model    : ${pc.bold(activeCfg.modelId)}${activeCfg.source ? ` [${activeCfg.source}]` : ''}`);
        } else {
          console.log(`  Model    : ${pc.dim('not detected — run: token-flux detect-model')}`);
        }
        const f = activeCfg.features;
        const on = (v) => v ? pc.green('ON') : pc.red('OFF');
        console.log(`  Boost    : ${on(f.flashEnhancer)}  | Compress: ${on(f.inputCompressor)}  | Caveman: ${f.cavemanLevel || 'off'}`);
      }
      console.log('');
    });

  program
    .command('install')
    .description('Auto-detect AI tools and inject token-saving hooks (compression + proxy rules)')
    .option('--tool <tool>', 'Target a specific tool (claude-code, cursor, windsurf, antigravity, cline, opencode, generic)')
    .action(async (opts) => {
      const projectRoot = process.cwd();
      console.log('\n⚡ token-flux — Installing token-saving hooks into AI tools...\n');

      // First scan the project to generate intelligence files
      console.log(pc.dim('  📂 Scanning project...'));
      const scanResult = await scanProject(projectRoot);
      console.log(`  ✅ Scanned ${scanResult.files} files (~${scanResult.totalTokens.toLocaleString()} tokens)`);
      console.log(`  ✅ Generated .agent-boost/anatomy.md (with signatures + DO NOT READ rules)`);
      console.log(`  ✅ Generated .agent-boost/cerebrum.md`);
      console.log('');

      // Install hooks into AI tools
      const { tools, results } = await installHooks(projectRoot, opts.tool || null);
      if (!opts.tool) {
        console.log(`  🔍 Detected tools: ${tools.join(', ')}\n`);
      }
      for (const r of results) {
        console.log(r.message);
      }

      try {
        const mcpPath = await writeMcpConfig(projectRoot);
        console.log(`  âœ… mcp: Registered token-flux MCP tools â†’ ${path.relative(projectRoot, mcpPath)}`);
      } catch (e) {
        console.log(pc.yellow(`  mcp: skipped (${e.message})`));
      }

      // Register Claude Code response filter hook
      try {
        const hookMsg = await registerClaudeResponseHook(projectRoot);
        console.log(hookMsg);
      } catch { /* claude not present, skip */ }

      // Auto-detect IDE model
      try {
        const detected = await detectAndSaveModel(projectRoot);
        if (detected) {
          console.log(`  ✅ model: Detected ${pc.bold(detected.normalisedModel)} (${detected.model}) from ${detected.source}`);
          console.log(`         Saved to .agent-boost/config.json — boost will use it automatically`);
        } else {
          console.log(`  ℹ️  model: Not detected — use: token-flux detect-model`);
        }
      } catch { /* skip */ }

      console.log(`
┌─────────────────────────────────────────────────────────────┐
│  ✅ Token-saving hooks installed!                           │
│                                                             │
│  What's active:                                             │
│  • anatomy.md — file index with signatures (DO NOT READ)    │
│  • AGENTS.md  — mandatory proxy + caveman rules             │
│  • activate.sh — shell aliases for auto proxy wrapping      │
│  • Response filter hook (Claude Code)                       │
│                                                             │
│  Next steps:                                                │
│  1. source .agent-boost/scripts/activate.sh                 │
│  2. token-flux session-start                           │
│  3. token-flux token-status                            │
└─────────────────────────────────────────────────────────────┘
`);
    });


  program
    .command('scan')
    .description('Refresh .agent-boost/anatomy.md — re-scan project files for token index')
    .action(async () => {
      const projectRoot = process.cwd();
      console.log(pc.dim('  📂 Scanning project (extracting signatures + DO NOT READ rules)...'));
      const result = await scanProject(projectRoot);
      console.log(pc.green(`  ✅ Scanned ${result.files} files (~${result.totalTokens.toLocaleString()} tokens)`));
      console.log(pc.green(`  ✅ Updated .agent-boost/anatomy.md with signatures`));
    });

  // ─── Strategy 2: Session Start ─────────────────────────────────────────────

  program
    .command('context')
    .description('Return minimal risk-aware context for a task before opening files')
    .argument('[task...]', 'Task description')
    .option('-d, --detail <level>', 'minimal | standard | full', 'minimal')
    .option('--changed <files>', 'Comma-separated changed files to seed context')
    .option('--base <ref>', 'Git base ref for changed-file detection', 'HEAD~1')
    .option('--json', 'Output as JSON')
    .action(async (taskParts, opts) => {
      const projectRoot = process.cwd();
      let task = taskParts.join(' ').trim();
      if (!task && !process.stdin.isTTY) {
        task = await new Promise(resolve => {
          let d = ''; process.stdin.setEncoding('utf8');
          process.stdin.on('data', c => { d += c; });
          process.stdin.on('end', () => resolve(d.trim()));
        });
      }
      const changedFiles = opts.changed
        ? opts.changed.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const result = await getMinimalContext(projectRoot, task, {
        detailLevel: opts.detail,
        changedFiles,
        base: opts.base,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printContext(result, pc);
    });

  const mcpCmd = program.command('mcp').description('MCP integration for token-flux context tools');

  mcpCmd
    .command('serve')
    .description('Run the token-flux MCP stdio server')
    .action(async () => {
      await serveMcp({ repoRoot: process.cwd() });
    });

  mcpCmd
    .command('install')
    .description('Write .mcp.json entry for token-flux MCP tools')
    .option('--command <command>', 'Command used by MCP clients', 'token-flux')
    .action(async (opts) => {
      const mcpPath = await writeMcpConfig(process.cwd(), { command: opts.command, args: ['mcp', 'serve'] });
      console.log(pc.green(`  âœ… MCP config updated: ${path.relative(process.cwd(), mcpPath)}`));
      console.log(pc.dim('  Tools: get_minimal_context, check_budget, compress_prompt'));
    });

  program
    .command('session-start')
    .description('Print caveman compression instruction to paste into your AI system prompt')
    .option('-l, --level <level>', 'Caveman level: lite | full | ultra', 'ultra')
    .action(async (opts) => {
      const projectRoot = process.cwd();
      await printSessionHeader(projectRoot, { level: opts.level });
    });

  // ─── Strategy 4: Response Filter ───────────────────────────────────────────

  program
    .command('response-filter')
    .description('Strip filler from AI response text to save context window tokens')
    .argument('[text...]', 'AI response text (or pipe via stdin)')
    .option('--auto', 'Auto mode: read from stdin, write filtered to stdout (for hooks)')
    .action(async (textParts, opts) => {
      const projectRoot = process.cwd();

      if (opts.auto || (!process.stdin.isTTY && textParts.length === 0)) {
        // Hook mode: stdin → stdout (used by Claude Code PostToolUse hook)
        await filterFromStdin(projectRoot);
        return;
      }

      let text = textParts.join(' ');
      if (!text) {
        console.error(pc.red('Error: Provide text as argument or pipe via stdin'));
        console.error('  token-flux response-filter "Sure! I would be happy to help..."');
        console.error('  echo "Sure! Certainly!" | token-flux response-filter');
        process.exit(1);
      }

      await filterAndReport(text, projectRoot);
    });

  // ─── Strategy 6: Budget Command ────────────────────────────────────────────

  program
    .command('budget')
    .description('Estimate token cost of opening specific files vs your context budget')
    .argument('[files...]', 'Files to check (relative paths or basenames)')
    .option('-b, --budget <n>', 'Context budget in tokens', '20000')
    .option('--json', 'Output as JSON')
    .action(async (files, opts) => {
      const projectRoot = process.cwd();
      const budget = parseInt(opts.budget, 10);
      const result = await checkBudget(projectRoot, files, { budget });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printBudget(result);
    });

  program
    .command('detect-model')
    .description('Auto-detect the AI model from IDE config files and save to .agent-boost/config.json')
    .option('--json', 'Output as JSON')
    .option('--save', 'Save detected model to config (default: true)')
    .action(async (opts) => {
      const projectRoot = process.cwd();
      const result = await detectModel(projectRoot);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n🤖 token-flux — Model Auto-Detection\n`);

      if (!result) {
        console.log(`  ${pc.yellow('⚠️  No model detected in any IDE config file.')}`);
        console.log(`  Checked: Claude Code, Cursor, Aider, OpenCode, Cline, Continue, Windsurf, Copilot`);
        console.log(`\n  Set manually: token-flux boost --model <name>`);
        console.log(`  List models : token-flux boost --list-models\n`);
        return;
      }

      const { MODEL_PROFILES, getModelProfile } = await import('./enforce/flash-enhancer.mjs');
      const profile = getModelProfile(result.normalisedModel);

      console.log(`  ${pc.green('✅ Model detected!')}`);
      console.log(`  Source      : ${pc.bold(result.source)} (${result.configFile})`);
      console.log(`  Raw name    : ${result.model}`);
      console.log(`  Normalised  : ${pc.bold(result.normalisedModel)}`);
      console.log(`  Profile     : ${profile.id}`);
      console.log(`  Weaknesses  : ${profile.weaknesses.join(', ')}`);
      console.log(`  Fix rules   : ${profile.fixes.length} targeted rules injected on boost`);

      // Always save unless --no-save
      if (opts.save !== false) {
        await detectAndSaveModel(projectRoot);
        console.log(`\n  ${pc.dim('✅ Saved to .agent-boost/config.json')}`);
        console.log(`  ${pc.dim('boost will now use this model automatically.')}`);
      }
      console.log('');
    });

  // ─── Strategy 1+4: boost command ─────────────────────────────────────────────

  program
    .command('boost')
    .description('Build an expert-enhanced prompt for your AI — injects role, task protocol, CODEMAP + LESSONS context')
    .argument('[prompt...]', 'Your task description (or pipe via stdin)')
    .option('-d, --domain <domain>', 'Force a specific domain (react, python, sql, etc.)')
    .option('-t, --task-type <type>', 'Force task type (debug, security, feature, refactor, test, review)')
    .option('-m, --model <name>', 'Your AI model (haiku, gpt-4o-mini, llama-3, mistral, deepseek, qwen, phi-3, etc.)')
    .option('--no-codemap', 'Skip CODEMAP injection')
    .option('--no-lessons', 'Skip LESSONS injection')
    .option('--json', 'Output as JSON')
    .option('--list-models', 'List all supported model profiles')
    .action(async (promptParts, opts) => {
      const projectRoot = process.cwd();

      // --list-models: show all model profiles
      if (opts.listModels) {
        const { MODEL_PROFILES } = await import('./enforce/flash-enhancer.mjs');
        console.log('\n🤖 token-flux — Supported Model Profiles\n');
        for (const [id, profile] of Object.entries(MODEL_PROFILES)) {
          console.log(`  ${pc.bold(id)}`);
          console.log(`    aliases    : ${profile.aliases.join(', ') || '(none)'}`);
          console.log(`    weaknesses : ${profile.weaknesses.join(', ')}`);
          console.log(`    fixes      : ${profile.fixes.length} targeted rules`);
          console.log('');
        }
        console.log(`  Usage: token-flux boost --model haiku "fix the bug"\n`);
        return;
      }

      const mode = await getMode(projectRoot);
      const modeInfo = getModeInfo(mode);

      if (!modeInfo.features.flashEnhancer) {
        console.log(pc.yellow(`⚠️  Flash enhancer is disabled in ${modeInfo.label}.`));
        console.log(pc.dim('   Switch to boost mode: token-flux mode set boost'));
        process.exit(0);
      }

      let prompt = promptParts.join(' ');
      if (!prompt && !process.stdin.isTTY) {
        prompt = await new Promise(resolve => {
          let d = ''; process.stdin.setEncoding('utf8');
          process.stdin.on('data', c => { d += c; });
          process.stdin.on('end', () => resolve(d.trim()));
        });
      }
      if (!prompt) {
        console.error(pc.red('Error: Provide a prompt as argument or pipe via stdin'));
        console.error('  token-flux boost "fix the login bug in src/auth/login.mjs"');
        console.error('  token-flux boost --model haiku "add pagination to /users"');
        process.exit(1);
      }

      const result = await runBoost(prompt, projectRoot, {
        domain: opts.domain,
        taskType: opts.taskType,
        model: opts.model || '',
        noCodemap: !opts.codemap,
        noLessons: !opts.lessons,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printBoostResult(result, pc);
    });


  // ─── Strategy 2: score command ───────────────────────────────────────────────

  program
    .command('score')
    .description('Score an AI response for quality — tells you if it needs a retry')
    .argument('[response...]', 'AI response text (or pipe via stdin)')
    .option('--json', 'Output as JSON')
    .action(async (parts, opts) => {
      const projectRoot = process.cwd();

      let text = parts.join(' ');
      if (!text && !process.stdin.isTTY) {
        text = await new Promise(resolve => {
          let d = ''; process.stdin.setEncoding('utf8');
          process.stdin.on('data', c => { d += c; });
          process.stdin.on('end', () => resolve(d.trim()));
        });
      }
      if (!text) {
        console.error(pc.red('Error: Provide AI response text as argument or pipe via stdin'));
        process.exit(1);
      }

      const result = scoreResponse(text, { isCodeTask: true, promptLength: text.length });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const verdictIcon = result.verdict === 'good' ? pc.green('✅ GOOD') : result.verdict === 'weak' ? pc.yellow('⚠️  WEAK') : pc.red('❌ BAD');
      console.log(`\n🚀 token-flux — Response Score\n`);
      console.log(`  Score   : ${pc.bold((result.score * 100).toFixed(0) + '%')} — ${verdictIcon}`);
      if (result.details.length > 0) {
        console.log(`  Issues  :`);
        for (const d of result.details) console.log(`    • ${d}`);
      } else {
        console.log(`  Issues  : ${pc.green('None detected')}`);
      }

      if (result.verdict !== 'good') {
        console.log(`\n  ${pc.yellow('Run: token-flux retry --original "<prompt>" --response "<response>"')}`);
      }
      console.log('');
    });

  // ─── Strategy 3: retry command ───────────────────────────────────────────────

  program
    .command('retry')
    .description('Build a targeted retry prompt when the AI response was weak or bad')
    .requiredOption('--original <text>', 'The original task prompt you sent to the AI')
    .requiredOption('--response <text>', 'The AI response that scored poorly')
    .option('--attempt <n>', 'Attempt number (default: 2)', '2')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const result = scoreResponse(opts.response, { isCodeTask: true, promptLength: opts.original.length, originalPrompt: opts.original });
      const retryPrompt = buildRetryPrompt(opts.original, opts.response, {
        attempt: parseInt(opts.attempt, 10),
        signals: result.signals,
        details: result.details,
      });

      if (opts.json) {
        console.log(JSON.stringify({ score: result.score, verdict: result.verdict, retryPrompt }, null, 2));
        return;
      }

      const verdictIcon = result.verdict === 'good' ? pc.green('✅ GOOD') : result.verdict === 'weak' ? pc.yellow('⚠️ WEAK') : pc.red('❌ BAD');
      console.log(`\n🚀 token-flux — Retry Prompt\n`);
      console.log(`  Original score : ${(result.score * 100).toFixed(0)}% (${verdictIcon})`);
      if (result.details.length > 0) {
        console.log(`  Issues fixed   : ${result.details.join(', ')}`);
      }
      console.log(`\n${pc.dim('─── PASTE THIS INTO YOUR AI ─'.padEnd(60, '─'))}\n`);
      console.log(retryPrompt);
      console.log(`\n${pc.dim('─'.repeat(60))}\n`);
    });

  program
    .command('uninstall')
    .description('Remove all token-flux files and configs from this repository')
    .action(async () => {
      const repoRoot = process.cwd();
      const pc = (await import('picocolors')).default;

      console.log(pc.dim('▸ uninstalling token-flux...'));

      const filesToRemove = [
        '.agent-boost',
        'AGENT.md',
        'CLAUDE.md',
        'CODEMAP.md',
        'LESSONS.md',
        'GEMINI.md',
        'opencode.json',
        '.clinerules',
        '.claude/skills',
        '.claude/commands',
        '.claude/skills/settings.json',
        '.cursor/rules/token-flux.mdc',
        '.cursor/skills',
      ];

      for (const file of filesToRemove) {
        const p = path.join(repoRoot, file);
        if (await existsCheck(p)) {
          const stats = await fs.stat(p);
          if (stats.isDirectory()) {
            await fs.rm(p, { recursive: true, force: true });
          } else {
            // Only remove if it contains our markers or was created by us
            const content = await fs.readFile(p, 'utf8');
            const markers = [
              'token-flux',
              'Caveman mode',
              'CODEMAP.md',
              'LESSONS.md',
              'AGENT.md',
              'Managed by token-flux',
              'Initial mistake',
              'Append-only log',
              'lessons below this line'
            ];
            if (markers.some(m => content.includes(m))) {
              await fs.unlink(p);
            }
          }
        }
      }

      // --- Surgical Cleanup of Shared Config Files ---

      // 1. Aider
      const aiderPath = path.join(repoRoot, '.aider.conf.yml');
      if (await existsCheck(aiderPath)) {
        let content = await fs.readFile(aiderPath, 'utf8');
        if (content.includes('token-flux')) {
          content = content.replace(/# Generated by token-flux[\s\S]*?- LESSONS\.md\n/g, '');
          if (content.trim() === '') await fs.unlink(aiderPath);
          else await fs.writeFile(aiderPath, content);
        }
      }

      // 2. VS Code
      const vscodePath = path.join(repoRoot, '.vscode', 'tasks.json');
      if (await existsCheck(vscodePath)) {
        try {
          let current = JSON.parse(await fs.readFile(vscodePath, 'utf8'));
          if (current.tasks) {
            current.tasks = current.tasks.filter(t => !t.label.includes('token-flux'));
            if (current.tasks.length === 0 && Object.keys(current).length <= 2) {
              await fs.unlink(vscodePath);
            } else {
              await fs.writeFile(vscodePath, JSON.stringify(current, null, 2));
            }
          }
        } catch { }
      }

      // 3. Claude Code Settings
      const claudeSettingsPath = path.join(repoRoot, '.claude', 'settings.json');
      if (await existsCheck(claudeSettingsPath)) {
        try {
          let current = JSON.parse(await fs.readFile(claudeSettingsPath, 'utf8'));
          if (current.hooks && current.hooks.PreToolUse) {
            current.hooks.PreToolUse = current.hooks.PreToolUse.filter(h => !JSON.stringify(h).includes('token-flux'));
            await fs.writeFile(claudeSettingsPath, JSON.stringify(current, null, 2));
          }
        } catch { }
      }

      // 4. Claude Code Skills
      const claudeSkillsDir = path.join(repoRoot, '.claude', 'skills');
      if (await existsCheck(claudeSkillsDir)) {
        try {
          const skills = await fs.readdir(claudeSkillsDir);
          for (const s of skills) {
            const skillPath = path.join(claudeSkillsDir, s, 'SKILL.md');
            if (await existsCheck(skillPath)) {
              const content = await fs.readFile(skillPath, 'utf8');
              if (content.includes('token-flux')) {
                await fs.rm(path.join(claudeSkillsDir, s), { recursive: true, force: true });
              }
            }
          }
        } catch { }
      }

      // 5. Claude Code Commands
      const claudeCmdsDir = path.join(repoRoot, '.claude', 'commands');
      if (await existsCheck(claudeCmdsDir)) {
        try {
          const cmds = await fs.readdir(claudeCmdsDir);
          for (const c of cmds) {
            const cmdPath = path.join(claudeCmdsDir, c);
            if (await existsCheck(cmdPath)) {
              const content = await fs.readFile(cmdPath, 'utf8');
              if (content.includes('token-flux')) {
                await fs.unlink(cmdPath);
              }
            }
          }
        } catch { }
      }

      // 6. MCP config
      const mcpPath = path.join(repoRoot, '.mcp.json');
      if (await existsCheck(mcpPath)) {
        try {
          const current = JSON.parse(await fs.readFile(mcpPath, 'utf8'));
          if (current.mcpServers?.['token-flux']) {
            delete current.mcpServers['token-flux'];
            if (Object.keys(current.mcpServers).length === 0) delete current.mcpServers;
            if (Object.keys(current).length === 0) {
              await fs.unlink(mcpPath);
            } else {
              await fs.writeFile(mcpPath, JSON.stringify(current, null, 2) + '\n');
            }
          }
        } catch { /* leave user-owned config alone */ }
      }

      // 7. Clean up empty IDE directories
      const removeEmptyDir = async (dirPath) => {
        if (await existsCheck(dirPath)) {
          try {
            const files = await fs.readdir(dirPath);
            if (files.length === 0) await fs.rmdir(dirPath);
          } catch { }
        }
      };

      await removeEmptyDir(path.join(repoRoot, '.vscode'));
      await removeEmptyDir(path.join(repoRoot, '.cursor', 'rules'));
      await removeEmptyDir(path.join(repoRoot, '.cursor'));
      await removeEmptyDir(path.join(repoRoot, '.claude', 'skills'));
      await removeEmptyDir(path.join(repoRoot, '.claude', 'commands'));
      await removeEmptyDir(path.join(repoRoot, '.claude'));

      await uninstallHooks(repoRoot);

      console.log(pc.green('✓ All token-flux files and hooks removed.'));
      console.log(pc.bold('\nNote: To completely uninstall the CLI tool locally, run:'));
      console.log(pc.cyan('  npm uninstall -g token-flux'));
      console.log(pc.cyan('  npm unlink (if you used npm link)'));
    });

  await program.parseAsync(argv, { from: 'user' });
}

async function loadVersion() {
  try {
    const pkg = JSON.parse(await readText(path.resolve(__dirname, '..', 'package.json')));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
