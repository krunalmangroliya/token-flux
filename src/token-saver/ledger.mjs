// Token savings ledger — tracks compression stats (today + lifetime).
import { promises as fs } from 'node:fs';
import path from 'node:path';

function getBoostDir(repoRoot) {
  return path.join(repoRoot, '.agent-boost');
}

function emptyLedger() {
  return {
    lifetime: { savedTokens: 0, prompts: 0, escalations: 0, sessions: 0 },
    today: { date: '', savedTokens: 0, prompts: 0 },
  };
}

export async function loadLedger(repoRoot) {
  const ledgerPath = path.join(getBoostDir(repoRoot), 'ledger.json');
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return emptyLedger();
  }
}

export async function saveLedger(repoRoot, ledger) {
  const dir = getBoostDir(repoRoot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger, null, 2));
}

export async function logCompression(repoRoot, { savedTokens, escalated = false }) {
  const ledger = await loadLedger(repoRoot);
  const today = new Date().toISOString().slice(0, 10);

  if (ledger.today.date !== today) {
    ledger.today = { date: today, savedTokens: 0, prompts: 0 };
  }

  ledger.today.savedTokens += savedTokens;
  ledger.today.prompts += 1;
  ledger.lifetime.savedTokens += savedTokens;
  ledger.lifetime.prompts += 1;
  if (escalated) ledger.lifetime.escalations += 1;

  await saveLedger(repoRoot, ledger);
  return ledger;
}

export function estimateDollarSavings(tokens) {
  // $3 per 1M tokens — realistic mid-tier rate (Claude Sonnet / Gemini 1.5 Pro)
  return ((tokens / 1_000_000) * 3).toFixed(4);
}
