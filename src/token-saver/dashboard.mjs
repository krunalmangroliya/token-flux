// Web dashboard — serves a live-refreshing HTML page showing token savings, model status, and caveman level.
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';
import { loadLedger, estimateDollarSavings } from './ledger.mjs';
import { decide, getDefaultQuota, formatTimeLeft, loadQuota } from './model-router.mjs';
import { getCurrentLevel } from './output-compressor.mjs';

const PORT = 4243; // Different from token-shield's 4242 to avoid conflicts

export async function startDashboard(repoRoot) {
  const server = http.createServer(async (req, res) => {
    const ledger  = await loadLedger(repoRoot);
    const today   = ledger.today.date === new Date().toISOString().slice(0,10) ? ledger.today : { savedTokens: 0, prompts: 0 };
    const level   = await getCurrentLevel(repoRoot);
    const quota   = await loadQuota(repoRoot);
    const route   = decide(quota);
    const now     = Date.now();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>token-flux — Token Saver Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.8rem; font-weight: 700; background: linear-gradient(135deg, #06b6d4, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.25rem; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #111827; border: 1px solid #1e293b; border-radius: 16px; padding: 1.5rem; }
    .card h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 1rem; }
    .big-num { font-size: 2.5rem; font-weight: 800; color: #06b6d4; line-height: 1; }
    .sub { font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; }
    .bar-wrap { background: #1e293b; border-radius: 8px; height: 12px; margin: 0.75rem 0; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #06b6d4, #3b82f6); transition: width 0.5s; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .badge-green  { background: #052e16; color: #4ade80; border: 1px solid #166534; }
    .badge-yellow { background: #422006; color: #fbbf24; border: 1px solid #92400e; }
    .badge-red    { background: #450a0a; color: #f87171; border: 1px solid #991b1b; }
    .model-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1e293b; }
    .model-row:last-child { border-bottom: none; }
    .refresh { color: #334155; font-size: 0.75rem; margin-top: 2rem; text-align: center; }
    .caveman-badge { font-size: 1.25rem; font-weight: 800; color: #06b6d4; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <h1>⚡ token-flux — Token Saver</h1>
  <p class="subtitle">Auto-refreshes every 10 seconds · Project: ${path.basename(repoRoot)}</p>

  <div class="grid">
    <div class="card">
      <h2>💰 Saved Today</h2>
      <div class="big-num">${today.savedTokens.toLocaleString()}</div>
      <div class="sub">tokens · ≈ $${estimateDollarSavings(today.savedTokens)}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.min((today.savedTokens/20000)*100,100)}%"></div></div>
      <div class="sub">Lifetime: ${ledger.lifetime.savedTokens.toLocaleString()} tokens · $${estimateDollarSavings(ledger.lifetime.savedTokens)}</div>
    </div>

    <div class="card">
      <h2>🤖 Model Status</h2>
      <div class="model-row">
        <span>⚡ Flash (free)</span>
        <span class="badge ${quota.flash.remaining > 10 ? 'badge-green' : 'badge-red'}">${quota.flash.remaining > 10 ? '✅ Active' : '❌ Low'}</span>
      </div>
      <div class="model-row">
        <span style="color:#64748b;font-size:0.8rem">Resets in ${formatTimeLeft(quota.flash.resetAt - now)}</span>
      </div>
      <div class="model-row" style="margin-top:0.5rem">
        <span>🧠 Claude</span>
        <span class="badge ${quota.claude.remaining > 5 ? 'badge-yellow' : 'badge-red'}">${quota.claude.remaining > 5 ? '⚠️ Low' : '❌ Empty'}</span>
      </div>
      <div class="model-row">
        <span style="color:#64748b;font-size:0.8rem">Resets in ${formatTimeLeft(quota.claude.resetAt - now)}</span>
      </div>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #1e293b">
        <span style="color:#64748b;font-size:0.8rem">Routing → </span>
        <strong>${route.model || 'none'}</strong>
      </div>
    </div>

    <div class="card">
      <h2>🪨 Caveman Mode</h2>
      <div class="caveman-badge">${level.toUpperCase()}</div>
      <div class="sub" style="margin-top:0.75rem">${level === 'lite' ? '40% output reduction' : level === 'full' ? '65% output reduction' : '75% output reduction'}</div>
    </div>

    <div class="card">
      <h2>📊 Session Stats</h2>
      <div class="model-row"><span>Prompts compressed</span><strong>${ledger.lifetime.prompts}</strong></div>
      <div class="model-row"><span>Escalations</span><strong>${ledger.lifetime.escalations}</strong></div>
    </div>
  </div>

  <p class="refresh">Refreshing automatically · <a href="/" style="color:#06b6d4">Refresh now</a></p>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  server.listen(PORT, () => {
    console.log(`\n⚡ token-flux Token Saver Dashboard running at http://localhost:${PORT}\n`);
    const cmd = process.platform === 'win32' ? `start http://localhost:${PORT}`
              : process.platform === 'darwin' ? `open http://localhost:${PORT}`
              : `xdg-open http://localhost:${PORT}`;
    exec(cmd, () => {});
    console.log('Press Ctrl+C to stop.\n');
  });
}
