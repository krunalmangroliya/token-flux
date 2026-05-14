// Shared loader used by the scripts dropped into user repos (.agent-boost/scripts/*).
// Resolves the token-flux package regardless of install mode.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function loadAgentBoost() {
  const repoRoot = process.cwd();
  const snapshotPath = path.join(repoRoot, '.agent-boost', 'scripts', 'config.snapshot.json');

  // Try require-style resolution first (npm-installed, global or local).
  try {
    const mod = await import('token-flux');
    return { ab: mod, repoRoot };
  } catch {
    /* fall through */
  }

  // Fall back to the pkgRoot recorded at init.
  try {
    const snap = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
    if (snap.pkgRoot) {
      const mainPath = path.join(snap.pkgRoot, 'src', 'index.mjs');
      const url = pathToFileURL(mainPath).href;
      const mod = await import(url);
      return { ab: mod, repoRoot };
    }
  } catch (e) {
    throw new Error(
      'token-flux could not be located. Install globally (`npm i -g token-flux`), ' +
      'in this repo (`npm i --save-dev token-flux`), or re-run `token-flux init` ' +
      'to refresh the path snapshot.\n\nUnderlying error: ' + (e?.message || e),
    );
  }
  throw new Error('token-flux not resolvable');
}
