// CLI proxy — wraps shell commands and compresses noisy output (test results, diffs, listings).
// Now with: 20+ command patterns, smart error extraction, structured compression,
// build output handling, log filtering, and configurable verbosity.
// Saves ~90% terminal output tokens that would otherwise bloat AI context.
import { spawn } from 'node:child_process';

// ─── Command Pattern Registry ────────────────────────────────────────────────

const COMMAND_PATTERNS = [
  // Test runners
  { match: /\b(npm\s+test|npm\s+run\s+test|npx\s+jest|jest|vitest|npx\s+vitest)\b/i,           type: 'test',  label: 'JS Test' },
  { match: /\b(pytest|python\s+-m\s+(unittest|pytest)|py\.test)\b/i,                               type: 'test',  label: 'Python Test' },
  { match: /\b(go\s+test|go\s+test\s+\.\/\.\.\.)\b/i,                                             type: 'test',  label: 'Go Test' },
  { match: /\b(cargo\s+test)\b/i,                                                                  type: 'test',  label: 'Rust Test' },
  { match: /\b(dotnet\s+test|nunit|xunit)\b/i,                                                     type: 'test',  label: '.NET Test' },
  { match: /\b(mocha|ava|tap|node\s+--test)\b/i,                                                   type: 'test',  label: 'Node Test' },
  { match: /\b(phpunit|pest)\b/i,                                                                  type: 'test',  label: 'PHP Test' },
  { match: /\b(rspec|rake\s+test|rails\s+test|minitest)\b/i,                                       type: 'test',  label: 'Ruby Test' },
  { match: /\b(gradle\s+test|mvn\s+test|maven)\b/i,                                                type: 'test',  label: 'Java Test' },

  // Linters & formatters
  { match: /\b(eslint|npx\s+eslint)\b/i,                                                           type: 'lint',  label: 'ESLint' },
  { match: /\b(prettier|npx\s+prettier)\b/i,                                                       type: 'lint',  label: 'Prettier' },
  { match: /\b(ruff|flake8|pylint|black|isort)\b/i,                                                type: 'lint',  label: 'Python Lint' },
  { match: /\b(golangci-lint|gofmt|go\s+vet|staticcheck)\b/i,                                      type: 'lint',  label: 'Go Lint' },
  { match: /\b(clippy|rustfmt|cargo\s+clippy|cargo\s+fmt)\b/i,                                     type: 'lint',  label: 'Rust Lint' },
  { match: /\b(biome|oxlint|deno\s+lint)\b/i,                                                      type: 'lint',  label: 'Lint' },

  // Type checkers
  { match: /\b(tsc|npx\s+tsc|typescript)\b(?!ript)/i,                                              type: 'typecheck', label: 'TypeScript' },
  { match: /\b(mypy|pyright|pytype)\b/i,                                                           type: 'typecheck', label: 'Python Typecheck' },

  // Build tools
  { match: /\b(npm\s+run\s+build|npx\s+vite\s+build|webpack|rollup|esbuild|turbopack|parcel)\b/i, type: 'build', label: 'JS Build' },
  { match: /\b(cargo\s+build|go\s+build|dotnet\s+build|make\s|cmake|gradle\s+build|mvn\s+package)\b/i, type: 'build', label: 'Build' },

  // Git commands
  { match: /\bgit\s+diff\b/i,                                                                      type: 'diff',  label: 'Git Diff' },
  { match: /\bgit\s+show\b/i,                                                                      type: 'diff',  label: 'Git Show' },
  { match: /\bgit\s+log\b/i,                                                                       type: 'log',   label: 'Git Log' },
  { match: /\bgit\s+status\b/i,                                                                    type: 'status', label: 'Git Status' },
  { match: /\bgit\s+blame\b/i,                                                                     type: 'log',   label: 'Git Blame' },

  // Directory/file listings
  { match: /(^|\s)(ls\b|find\s|tree\b|dir\s)/i,                                                    type: 'listing', label: 'Listing' },

  // Package managers
  { match: /\b(npm\s+install|npm\s+i\s|yarn\s+add|pnpm\s+add|pip\s+install|cargo\s+add)\b/i,     type: 'install', label: 'Package Install' },

  // Docker
  { match: /\b(docker\s+build|docker\s+compose|docker-compose)\b/i,                                type: 'build', label: 'Docker Build' },
];

// ─── Smart Compression Functions ─────────────────────────────────────────────

function compressTestOutput(output) {
  const lines = output.split('\n');
  const result = { errors: [], summary: [], warnings: [], timing: null };

  let isErrorBlock = false;
  let currentError = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const l = line.trim();

    // Error block detection (Jest, Vitest, Pytest, Go, Cargo, Mocha, Node test runner)
    if (/FAIL\s|FAILED|====\s*FAILURES|---\s*FAIL:|ERRORS|panicked at|not ok\s+\d|✗|✖|×/.test(l)) {
      isErrorBlock = true;
    }
    if (/PASS\s|PASSED|ok\s+\d|✓|✔/.test(l) && isErrorBlock && !/(FAIL|FAILED|Error)/.test(l)) {
      if (currentError.length > 0) {
        result.errors.push(currentError.join('\n'));
        currentError = [];
      }
      isErrorBlock = false;
    }

    // Collect error details
    if (isErrorBlock) {
      // Skip massive stack traces — keep only the first 8 lines
      if (/^\s+at\s/.test(l)) {
        if (currentError.filter(e => /^\s+at\s/.test(e.trim())).length < 8) {
          currentError.push(line);
        }
      } else {
        currentError.push(line);
      }
    }

    // Summary lines (pass/fail counts, durations)
    if (/\b(Tests?|Suites?|passed|failed|skipped|pending|todo|Duration|Time|Ran \d+ test)\b/i.test(l) &&
        /\d/.test(l)) {
      result.summary.push(l);
    }

    // Timing
    if (/^\s*(Time|Duration|Ran.*in|Finished in|real\s)/i.test(l)) {
      result.timing = l.trim();
    }

    // Deprecation/warning lines (keep only first 3)
    if (/\b(DeprecationWarning|Warning|WARN)\b/i.test(l) && result.warnings.length < 3) {
      result.warnings.push(l);
    }
  }

  // Flush last error block
  if (currentError.length > 0) result.errors.push(currentError.join('\n'));

  // Build compressed output
  const parts = [];

  if (result.errors.length === 0) {
    parts.push('[token-flux proxy] ✅ All tests passed.');
  } else {
    parts.push(`[token-flux proxy] ❌ ${result.errors.length} failure(s) detected.`);
    parts.push('');
    for (let i = 0; i < Math.min(result.errors.length, 5); i++) {
      parts.push(`── Error ${i + 1} ──`);
      // Trim each error to max 20 lines
      const errorLines = result.errors[i].split('\n');
      parts.push(errorLines.slice(0, 20).join('\n'));
      if (errorLines.length > 20) parts.push(`  ... (${errorLines.length - 20} more lines)`);
      parts.push('');
    }
    if (result.errors.length > 5) {
      parts.push(`... and ${result.errors.length - 5} more failures (run without proxy to see all)`);
    }
  }

  if (result.summary.length > 0) {
    parts.push('── Summary ──');
    // Deduplicate summary lines
    const uniqueSummary = [...new Set(result.summary)];
    parts.push(...uniqueSummary.slice(0, 6));
  }
  if (result.timing) parts.push(`⏱  ${result.timing}`);
  if (result.warnings.length > 0) {
    parts.push(`⚠️  ${result.warnings.length} warning(s): ${result.warnings[0]}`);
  }

  return parts.join('\n');
}

function compressLintOutput(output) {
  const lines = output.split('\n');
  const errors = [];
  const warnings = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    // ESLint, Biome, Ruff style: file:line:col error/warning message
    if (/\berror\b/i.test(l) && /:\d+/.test(l)) {
      errors.push(l);
      errorCount++;
    } else if (/\bwarn(ing)?\b/i.test(l) && /:\d+/.test(l)) {
      if (warnings.length < 5) warnings.push(l);
      warningCount++;
    }
    // Summary lines
    else if (/\d+\s+(error|warning|problem)/i.test(l)) {
      errors.push(l);
    }
  }

  if (errorCount === 0 && warningCount === 0) {
    return '[token-flux proxy] ✅ Lint passed — no errors or warnings.';
  }

  const parts = [];
  if (errorCount > 0) {
    parts.push(`[token-flux proxy] ❌ ${errorCount} lint error(s).`);
    parts.push('');
    parts.push(...errors.slice(0, 15));
    if (errors.length > 15) parts.push(`... and ${errors.length - 15} more errors`);
  }
  if (warningCount > 0) {
    parts.push(`\n⚠️  ${warningCount} warning(s)${warningCount > 5 ? ' (showing first 5)' : ''}:`);
    parts.push(...warnings);
  }

  return parts.join('\n');
}

function compressTypecheckOutput(output) {
  const lines = output.split('\n');
  const errors = [];
  let totalErrors = 0;

  for (const line of lines) {
    const l = line.trim();
    // TypeScript: file(line,col): error TS1234: message
    // Mypy/Pyright: file:line: error: message
    if (/\berror\b.*TS\d+/i.test(l) || /:\d+:\s*error:/i.test(l)) {
      if (errors.length < 20) errors.push(l);
      totalErrors++;
    }
    // Summary
    else if (/Found \d+ error/i.test(l)) {
      errors.push(l);
    }
  }

  if (totalErrors === 0) {
    return '[token-flux proxy] ✅ Type check passed — no errors.';
  }

  const parts = [`[token-flux proxy] ❌ ${totalErrors} type error(s).`, ''];
  parts.push(...errors);
  if (totalErrors > 20) parts.push(`... and ${totalErrors - 20} more type errors`);
  return parts.join('\n');
}

function compressBuildOutput(output) {
  const lines = output.split('\n');
  const errorLines = [];
  const warningLines = [];
  const resultLines = [];

  for (const line of lines) {
    const l = line.trim();
    if (/\berror\b/i.test(l) && l.length > 5) {
      errorLines.push(line);
    } else if (/\bwarn(ing)?\b/i.test(l)) {
      if (warningLines.length < 5) warningLines.push(line);
    } else if (/\b(built|compiled|bundled|generated|output|entry|chunk|asset|size|gzip)\b/i.test(l)) {
      resultLines.push(line);
    }
  }

  if (errorLines.length === 0) {
    const parts = ['[token-flux proxy] ✅ Build succeeded.'];
    if (resultLines.length > 0) {
      parts.push('');
      parts.push('── Output ──');
      parts.push(...resultLines.slice(0, 10));
    }
    if (warningLines.length > 0) {
      parts.push(`\n⚠️  ${warningLines.length} warning(s)`);
    }
    return parts.join('\n');
  }

  const parts = [`[token-flux proxy] ❌ Build failed.`, ''];
  parts.push(...errorLines.slice(0, 15));
  if (errorLines.length > 15) parts.push(`... and ${errorLines.length - 15} more errors`);
  return parts.join('\n');
}

function compressGitDiff(output) {
  const lines = output.split('\n');
  const compressed = [];
  let additions = 0;
  let deletions = 0;
  let filesChanged = 0;
  let skipContext = false;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      filesChanged++;
      compressed.push(line);
      skipContext = false;
    } else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
      compressed.push(line);
      skipContext = false;
    } else if (line.startsWith('+')) {
      additions++;
      compressed.push(line);
      skipContext = false;
    } else if (line.startsWith('-')) {
      deletions++;
      compressed.push(line);
      skipContext = false;
    } else if (line.startsWith('@@')) {
      compressed.push(line);
      skipContext = false;
    } else {
      if (!skipContext) {
        compressed.push('  ... [context hidden]');
        skipContext = true;
      }
    }
  }

  return `[token-flux proxy] Git Diff (${filesChanged} files, +${additions} -${deletions}):\n` + compressed.join('\n');
}

function compressGitLog(output) {
  const lines = output.split('\n');
  if (lines.length <= 30) return output;

  // Keep first 30 lines (usually 10 commits with --oneline or 5-6 with full format)
  return `[token-flux proxy] Git log (showing first 30 lines of ${lines.length}):\n` +
         lines.slice(0, 30).join('\n') +
         `\n... [${lines.length - 30} more lines hidden]`;
}

function compressDirectoryListing(output) {
  const lines = output.split('\n').filter(l => l.trim());
  if (lines.length <= 20) return output;

  // Group by directory depth for tree output
  return `[token-flux proxy] Listing: ${lines.length} items. Showing first 15:\n` +
         lines.slice(0, 15).join('\n') +
         `\n... [${lines.length - 15} more items]. Use a more specific path to narrow results.`;
}

function compressInstallOutput(output) {
  const lines = output.split('\n');
  const result = [];

  for (const line of lines) {
    const l = line.trim();
    // Keep: added/removed/updated packages summary, warnings, errors
    if (/\b(added|removed|updated|changed|packages|vulnerabilities)\b/i.test(l) && /\d/.test(l)) {
      result.push(l);
    } else if (/\b(warn|error|WARN|ERR!)\b/.test(l)) {
      result.push(l);
    } else if (/^(Successfully|Installed|Collecting|Requirement)/.test(l)) {
      result.push(l);
    }
  }

  if (result.length === 0) {
    return '[token-flux proxy] ✅ Package install completed.';
  }

  return `[token-flux proxy] Package install:\n` + result.slice(0, 10).join('\n');
}

function compressGenericLargeOutput(output) {
  const lines = output.split('\n');
  const errorLines = lines.filter(l => /\b(error|fatal|panic|exception|traceback|failed)\b/i.test(l));

  if (errorLines.length > 0) {
    return `[token-flux proxy] Output was ${lines.length} lines. Showing ${Math.min(errorLines.length, 15)} error line(s) + tail:\n` +
           errorLines.slice(0, 15).join('\n') +
           '\n\n── Last 10 lines ──\n' +
           lines.slice(-10).join('\n');
  }

  return `[token-flux proxy] Output was ${lines.length} lines. Showing last 30:\n` +
         lines.slice(-30).join('\n');
}

// ─── Main Filter ─────────────────────────────────────────────────────────────

/**
 * Detect command type and apply the appropriate compression.
 * @param {string} command - The shell command that was run
 * @param {string} output - The combined stdout+stderr output
 * @returns {string} Compressed output
 */
export function filterOutput(command, output) {
  if (!output || output.trim().length === 0) return output;

  // Match against pattern registry
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.match.test(command)) {
      switch (pattern.type) {
        case 'test':      return compressTestOutput(output);
        case 'lint':      return compressLintOutput(output);
        case 'typecheck': return compressTypecheckOutput(output);
        case 'build':     return compressBuildOutput(output);
        case 'diff':      return compressGitDiff(output);
        case 'log':       return compressGitLog(output);
        case 'listing':   return compressDirectoryListing(output);
        case 'install':   return compressInstallOutput(output);
        case 'status':    return output; // git status is already compact
      }
    }
  }

  // Fallback: only compress if output is large
  const lines = output.split('\n');
  if (lines.length > 100) {
    return compressGenericLargeOutput(output);
  }

  return output;
}

/**
 * Get the detected command type for a given command string.
 * Useful for debugging / display.
 * @param {string} command
 * @returns {{ type: string, label: string } | null}
 */
export function detectCommandType(command) {
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.match.test(command)) {
      return { type: pattern.type, label: pattern.label };
    }
  }
  return null;
}

// ─── Proxy Runner ────────────────────────────────────────────────────────────

export function runProxy(fullCommand) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellFlag = process.platform === 'win32' ? '/c' : '-c';

    const startTime = Date.now();
    const child = spawn(shell, [shellFlag, fullCommand], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => { stdoutData += data.toString(); });
    child.stderr.on('data', (data) => { stderrData += data.toString(); });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const rawOutput = (stdoutData + '\n' + stderrData).trim();

      if (!rawOutput) return resolve({ code, output: '', originalTokens: 0, compressedTokens: 0, savedTokens: 0, duration });

      const originalTokens = Math.ceil(rawOutput.length / 4);
      const compressedOutput = filterOutput(fullCommand, rawOutput);
      const compressedTokens = Math.ceil(compressedOutput.length / 4);
      const detected = detectCommandType(fullCommand);

      console.log(compressedOutput);

      // Add metadata footer
      if (originalTokens !== compressedTokens && detected) {
        console.log(`\n[⚡ ${detected.label} | ${duration}ms | saved ${originalTokens - compressedTokens} tokens]`);
      }

      resolve({
        code,
        output: compressedOutput,
        originalTokens,
        compressedTokens,
        savedTokens: Math.max(0, originalTokens - compressedTokens),
        duration,
        commandType: detected?.type || 'unknown',
      });
    });

    child.on('error', (err) => {
      console.error(`[token-flux proxy error] Failed to start command: ${err.message}`);
      resolve({ code: 1, output: err.message, originalTokens: 0, compressedTokens: 0, savedTokens: 0, duration: 0 });
    });
  });
}
