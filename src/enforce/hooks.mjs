// Git hooks installer. Wires:
//   pre-commit  -> node .agent-boost/scripts/verify.mjs
//   post-merge  -> node .agent-boost/scripts/build-codemap.mjs
// Non-destructive: if a hook already exists, appends a single-line invocation guarded by a marker.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exists, writeText, readText } from '../utils.mjs';

const MARKER = '# --- token-flux hook ---';

export async function installHooks(repoRoot) {
  const hooksDir = path.join(repoRoot, '.git', 'hooks');
  if (!(await exists(path.join(repoRoot, '.git')))) {
    throw new Error('not a git repository — skip hooks or run inside a git repo');
  }
  await fs.mkdir(hooksDir, { recursive: true });

  await appendHook(hooksDir, 'pre-commit', 'node ./.agent-boost/scripts/verify.mjs');
  await appendHook(hooksDir, 'post-merge', 'node ./.agent-boost/scripts/build-codemap.mjs');
}

async function appendHook(hooksDir, name, cmd) {
  const p = path.join(hooksDir, name);
  const line = `${MARKER}\n${cmd}\n`;
  let content = '';
  if (await exists(p)) {
    content = await readText(p);
    if (content.includes(MARKER)) return; // already installed
    content = content.trimEnd() + '\n\n' + line;
  } else {
    content = `#!/bin/sh\n${line}`;
  }
  await writeText(p, content);
  try { await fs.chmod(p, 0o755); } catch { /* windows may fail; ignore */ }
}

export async function uninstallHooks(repoRoot) {
  const hooks = ['pre-commit', 'post-merge'];
  for (const hook of hooks) {
    const p = path.join(repoRoot, '.git', 'hooks', hook);
    if (await exists(p)) {
      let content = await readText(p);
      if (content.includes('token-flux')) {
        await fs.unlink(p);
        console.log(`✓ removed ${hook} hook`);
      }
    }
  }
}
