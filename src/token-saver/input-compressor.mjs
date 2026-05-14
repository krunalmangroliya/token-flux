// Input prompt compression — strips filler, trims history, deduplicates code blocks.
// Ported from token-shield's compression layer, adapted to ESM for token-flux.

const FILLER_PATTERNS = [
  /\b(please|kindly|could you|would you|can you|i was wondering if you could|i need you to|i want you to)\b/gi,
  /\b(help me (understand|with|figure out|fix|debug))\b/gi,
  /\b(as an ai|as a language model|as your assistant)\b/gi,
  /\b(i've been stuck on this|i'm having trouble|i'm struggling with)\b/gi,
  /\b(hey|hi|hello|greetings),?\s*/gi,
  /\b(thank you|thanks|thx|thank u)\b/gi,
  /\b(sure|certainly|of course|absolutely|great question)\b/gi,
  /\b(i hope you (can|could|are able to))\b/gi,
];

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function transformOutsideCodeBlocks(text, transform) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map(part => part.startsWith('```') ? part : transform(part))
    .join('');
}

function removeFiller(text) {
  let result = text;
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.replace(/  +/g, ' ').replace(/^ +/gm, '');
}

function trimHistory(text, keepLastN = 3) {
  const turnPatterns = [
    /^(human|user|you):/gim,
    /^(assistant|ai|claude|gemini):/gim,
  ];

  const hasTurns = turnPatterns.some(p => p.test(text));
  if (!hasTurns) return text;

  const lines = text.split('\n');
  const turnStarts = [];

  lines.forEach((line, idx) => {
    if (/^(human|user|you|assistant|ai|claude|gemini):/i.test(line)) {
      turnStarts.push(idx);
    }
  });

  if (turnStarts.length <= keepLastN * 2) return text;

  const keepFrom = turnStarts[turnStarts.length - (keepLastN * 2)];
  const trimmed = lines.slice(keepFrom).join('\n');
  const removed = turnStarts.length - keepLastN * 2;

  return `[${removed} earlier exchanges trimmed by token-flux]\n\n${trimmed}`;
}

function pruneCodeComments(text) {
  return text
    .replace(/\/\/ (TODO|FIXME|HACK|NOTE): .*$/gm, '')
    .replace(/^\s*\/\/ $/gm, '')
    .replace(/\/\/ (This|The|We|It|Here) \w+ .{0,40}$/gm, '');
}

function deduplicateContext(text) {
  const blocks = {};
  return text.replace(/```[\s\S]*?```/g, (block) => {
    if (blocks[block]) {
      return '[duplicate code block removed by token-flux]';
    }
    blocks[block] = true;
    return block;
  });
}

export function countTokens(text) {
  return Math.ceil(text.length / 4);
}

export function compress(text, options = {}) {
  const { keepHistory = 3 } = options;

  const originalTokens = countTokens(text);

  let result = text;
  result = normalizeWhitespace(result);
  result = transformOutsideCodeBlocks(result, removeFiller);
  result = trimHistory(result, keepHistory);
  result = transformOutsideCodeBlocks(result, pruneCodeComments);
  result = deduplicateContext(result);
  result = normalizeWhitespace(result);

  const compressedTokens = countTokens(result);
  const saved = originalTokens - compressedTokens;
  const pct = originalTokens > 0 ? Math.round((saved / originalTokens) * 100) : 0;

  return {
    original: text,
    compressed: result,
    originalTokens,
    compressedTokens,
    savedTokens: saved,
    savedPercent: pct,
  };
}
