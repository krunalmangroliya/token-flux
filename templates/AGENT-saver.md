# Agent Operating Rules — 💰 SAVER Mode

> Mode: **SAVER** — Optimised for strong/high models. Token saving is the priority.
> Switch mode: `token-flux mode set boost`

You are coding in a repository that uses the token-flux pipeline. These rules are absolute.

## Before any code change

1. Run `token-flux context "<task>"` if available. Otherwise read `.agent-boost/anatomy.md` or `CODEMAP.md`. Use it to choose the smallest useful file set.
2. Read `.agent-boost/cerebrum.md` and `LESSONS.md` if present. Do not repeat known mistakes.
3. Open the exact source files needed for correctness. Summaries are triage, not truth.

## While writing code

1. Think step-by-step. Keep the plan in your context. No need for separate task files.
2. Write failing tests before implementation.
3. Match existing patterns in this repo — do not invent new ones. When in doubt, grep for three similar usages.

## RESPONSE STYLE (SAVER Mode — Token Rules)

RESPONSE STYLE: Compact but complete. Skip filler. Use short sentences. No pleasantries.
Format: root cause -> fix -> verification -> result.
Never say: "certainly", "great question", "I'd be happy to", "I hope this helps", "let me know".
No preamble. No summary unless asked. Every word must carry information.
Keep ALL technical accuracy. Never compress away routes, API contracts, auth/security checks, tests, errors, file paths, or commands.

## Before declaring the task done

1. Verify the fix works. Run tests if applicable.

## Hard prohibitions

- Do not edit `CODEMAP.md` by hand. Regenerate with `node ./.agent-boost/scripts/build-codemap.mjs`.
- Do not mark a task complete with failing tests.
- Do not skip reading `LESSONS.md`, even if the task looks trivial.

## Token Saver — MANDATORY Rules (ALWAYS follow)

1. **Terminal Compression:** Wrap noisy commands with the proxy when available. Example: `token-flux proxy "npm test"`. If unavailable, run the command normally and summarize output.
2. **Prompt Compression:** Use `token-flux compress "your prompt"` for long prompts. Do not remove requirements, code, routes, errors, or security details.
3. **Minimal Context:** Start with `token-flux context "<task>"`; use `.agent-boost/anatomy.md` only when you need a broader map. Then inspect relevant source for implementation details. Avoid re-reading large files unless they changed.
4. **Mistake Memory:** Read `.agent-boost/cerebrum.md` before any fix — contains known mistakes and preferences to avoid repeating. When user reports a mistake, append it to `.agent-boost/cerebrum.md`.
5. **Autonomous Proxy Usage:** You ARE authorized to run terminal commands autonomously. However, for all noisy commands (tests, git, build, etc.), you MUST prepend `token-flux proxy` to the command. Example: `token-flux proxy "npm test"`. Never run these without the proxy.
6. **View Savings:** Check token savings with `token-flux token-status`.
7. **MCP:** If MCP tools are available, call `get_minimal_context` first and use `detailLevel="minimal"` until risk requires more.

## Skills

- `test-driven` — write failing tests before implementation
- `consult-codemap` — the discipline for reading CODEMAP before touching code
