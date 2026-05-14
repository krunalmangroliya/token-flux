// Tiny MCP stdio server with no external SDK dependency.
// Exposes token-flux's smallest-context workflow to MCP-aware agents.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMinimalContext } from './context.mjs';
import { checkBudget } from './budget.mjs';
import { compress } from './input-compressor.mjs';

const TOOLS = [
  {
    name: 'get_minimal_context',
    description: 'Return an ultra-compact, risk-aware starting context for a coding task.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        detailLevel: { type: 'string', enum: ['minimal', 'standard', 'full'] },
        changedFiles: { type: 'array', items: { type: 'string' } },
        repoRoot: { type: 'string' },
        base: { type: 'string' },
      },
    },
  },
  {
    name: 'check_budget',
    description: 'Estimate token cost for opening specific files before reading them.',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
        budget: { type: 'number' },
        repoRoot: { type: 'string' },
      },
    },
  },
  {
    name: 'compress_prompt',
    description: 'Compress user prompt text while preserving code blocks and technical details.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        keepHistory: { type: 'number' },
      },
      required: ['text'],
    },
  },
];

export async function serveMcp({ repoRoot = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  let buffer = '';
  input.setEncoding('utf8');
  input.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      await handleLine(line, { repoRoot, output });
    }
  });
}

export async function writeMcpConfig(repoRoot, opts = {}) {
  const mcpPath = path.join(repoRoot, '.mcp.json');
  let config = {};
  try {
    config = JSON.parse(await fs.readFile(mcpPath, 'utf8'));
  } catch {
    config = {};
  }
  config.mcpServers = config.mcpServers || {};
  config.mcpServers['token-flux'] = {
    command: opts.command || 'token-flux',
    args: opts.args || ['mcp', 'serve'],
  };
  await fs.writeFile(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return mcpPath;
}

async function handleLine(line, ctx) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method?.startsWith('notifications/')) return;

  try {
    if (msg.method === 'initialize') {
      return send(ctx.output, msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'token-flux', version: '1.0.0' },
      });
    }

    if (msg.method === 'ping') return send(ctx.output, msg.id, {});
    if (msg.method === 'tools/list') return send(ctx.output, msg.id, { tools: TOOLS });

    if (msg.method === 'tools/call') {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      const result = await callTool(name, args, ctx.repoRoot);
      return send(ctx.output, msg.id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    }

    return sendError(ctx.output, msg.id, -32601, `Unknown method: ${msg.method}`);
  } catch (err) {
    return sendError(ctx.output, msg.id, -32000, err?.message || String(err));
  }
}

async function callTool(name, args, defaultRepoRoot) {
  const repoRoot = args.repoRoot || defaultRepoRoot;
  if (name === 'get_minimal_context') {
    return getMinimalContext(repoRoot, args.task || '', {
      detailLevel: args.detailLevel || 'minimal',
      changedFiles: args.changedFiles,
      base: args.base,
    });
  }
  if (name === 'check_budget') {
    return checkBudget(repoRoot, args.files || [], { budget: args.budget || 20_000 });
  }
  if (name === 'compress_prompt') {
    return compress(args.text || '', { keepHistory: args.keepHistory || 3 });
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(output, id, result) {
  output.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(output, id, code, message) {
  output.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}
