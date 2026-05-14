// Project detection. Examines a repo root and returns languages + real commands.
import path from 'node:path';
import { readJson, readText, exists } from './utils.mjs';

/**
 * @typedef {Object} Detected
 * @property {string[]} languages
 * @property {Object} commands
 */

export async function detect(repoRoot) {
  const languages = [];
  const commands = {};

  const pkgJsonPath = path.join(repoRoot, 'package.json');
  if (await exists(pkgJsonPath)) {
    const pkg = await readJson(pkgJsonPath);
    const tsconfig = path.join(repoRoot, 'tsconfig.json');
    if (await exists(tsconfig)) {
      languages.push('typescript');
    } else {
      languages.push('javascript');
    }

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const scripts = pkg.scripts || {};
    const pm = await detectPackageManager(repoRoot);

    if (scripts.test) commands.test = `${pm} test`;
    else if (deps.jest) commands.test = `${pm} exec jest`;
    else if (deps.vitest) commands.test = `${pm} exec vitest run`;
    else if (deps.mocha) commands.test = `${pm} exec mocha`;

    if (scripts.lint) commands.lint = `${pm} run lint`;
    else if (deps.eslint) commands.lint = `${pm} exec eslint .`;

    if (scripts.typecheck) commands.typecheck = `${pm} run typecheck`;
    else if (deps.typescript || languages.includes('typescript')) commands.typecheck = `${pm} exec tsc --noEmit`;

    if (scripts.format) commands.format = `${pm} run format`;
    else if (deps.prettier) commands.format = `${pm} exec prettier --check .`;

    if (scripts.build) commands.build = `${pm} run build`;

    if (scripts.coverage) commands.coverage = `${pm} run coverage`;
    else if (deps.vitest) commands.coverage = `${pm} exec vitest run --coverage`;
    else if (deps.jest) commands.coverage = `${pm} exec jest --coverage`;

    if (scripts.fix) commands.autofix = `${pm} run fix`;
    else if (scripts['lint:fix']) commands.autofix = `${pm} run lint:fix`;
    else if (deps.eslint && deps.prettier) commands.autofix = `${pm} exec prettier --write . && ${pm} exec eslint --fix .`;
    else if (deps.eslint) commands.autofix = `${pm} exec eslint --fix .`;
    else if (deps.prettier) commands.autofix = `${pm} exec prettier --write .`;
  }

  if ((await exists(path.join(repoRoot, 'pyproject.toml'))) || (await exists(path.join(repoRoot, 'requirements.txt')))) {
    languages.push('python');
    const py = await detectPythonRunner(repoRoot);
    commands.test = commands.test || `${py} -m pytest`;
    commands.lint = commands.lint || `${py} -m ruff check .`;
    commands.typecheck = commands.typecheck || `${py} -m mypy .`;
    commands.format = commands.format || `${py} -m ruff format --check .`;
    commands.coverage = commands.coverage || `${py} -m pytest --cov`;
    commands.autofix = commands.autofix || `${py} -m ruff check --fix . && ${py} -m ruff format .`;
  }

  if (await exists(path.join(repoRoot, 'go.mod'))) {
    languages.push('go');
    commands.test = commands.test || 'go test ./...';
    commands.lint = commands.lint || 'go vet ./...';
    commands.typecheck = commands.typecheck || 'go build ./...';
    commands.format = commands.format || 'gofmt -l .';
    commands.build = commands.build || 'go build ./...';
    commands.coverage = commands.coverage || 'go test -cover ./...';
  }

  if (await exists(path.join(repoRoot, 'Cargo.toml'))) {
    languages.push('rust');
    commands.test = commands.test || 'cargo test';
    commands.lint = commands.lint || 'cargo clippy -- -D warnings';
    commands.typecheck = commands.typecheck || 'cargo check';
    commands.format = commands.format || 'cargo fmt --check';
    commands.build = commands.build || 'cargo build';
    commands.autofix = commands.autofix || 'cargo clippy --fix --allow-dirty --allow-no-vcs && cargo fmt';
  }

  // .NET (any .sln or .csproj)
  const hasSln = (await directoryGlob(repoRoot, /\.sln$/)) || (await directoryGlob(repoRoot, /\.csproj$/));
  if (hasSln) {
    languages.push('dotnet');
    commands.test = commands.test || 'dotnet test';
    commands.build = commands.build || 'dotnet build';
    commands.format = commands.format || 'dotnet format --verify-no-changes';
  }

  // secrets scanner — if installed globally or via repo, prefer it. Otherwise skip silently.
  if (await exists(path.join(repoRoot, '.gitleaks.toml'))) {
    commands.secrets = 'gitleaks detect --no-git';
  }

  return { languages, commands };
}

async function detectPackageManager(repoRoot) {
  if (await exists(path.join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(repoRoot, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(repoRoot, 'bun.lockb'))) return 'bun';
  return 'npm';
}

async function detectPythonRunner(repoRoot) {
  if (await exists(path.join(repoRoot, 'poetry.lock'))) return 'poetry run python';
  if (await exists(path.join(repoRoot, 'uv.lock'))) return 'uv run python';
  if (await exists(path.join(repoRoot, '.venv'))) return process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python';
  return 'python';
}

async function directoryGlob(repoRoot, regex) {
  try {
    const { promises: fsp } = await import('node:fs');
    const entries = await fsp.readdir(repoRoot);
    return entries.some((e) => regex.test(e));
  } catch {
    return false;
  }
}
