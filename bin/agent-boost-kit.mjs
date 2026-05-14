#!/usr/bin/env node
// token-flux CLI entry point.
// Thin shim that delegates to src/cli.mjs. Kept small so users can inspect it.
import { run } from '../src/cli.mjs';

run(process.argv.slice(2)).catch((err) => {
  console.error('token-flux: unexpected error');
  console.error(err?.stack || err);
  process.exit(1);
});
