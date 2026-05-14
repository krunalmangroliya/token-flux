// Small shared helpers. Keep dependency-light.
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
export const PKG_ROOT = path.resolve(path.dirname(__filename), '..');

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export async function readText(p) {
  return fs.readFile(p, 'utf8');
}

export async function writeText(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function copyTemplate(templateRelPath, destAbsPath) {
  const src = path.join(PKG_ROOT, 'templates', templateRelPath);
  const content = await readText(src);
  await writeText(destAbsPath, content);
}

export function kebab(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function listFiles(root, extensions) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
      if (e.name.startsWith('.agent-boost')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (!extensions || extensions.includes(ext)) out.push(p);
      }
    }
  }
  await walk(root);
  return out;
}
