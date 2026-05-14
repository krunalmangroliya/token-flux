# Agent Operating Rules — ⚡ Both Mode (Adaptive)

> Mode: **BOTH** — Auto-detects your model and applies the right strategy automatically.
> Switch mode: `token-flux mode set boost` or `token-flux mode set saver`

You are coding in a repository that uses the token-flux adaptive pipeline.
Run `token-flux token-status` to see what is currently active.

---

## How Adaptive Mode Works

```
token-flux detect-model   → detects your IDE model automatically
token-flux token-status   → shows active tier + features
```

| Detected Model Tier | Active Strategy |
|---------------------|----------------|
| **Weak model** (Haiku, Flash, GPT-4o-mini, Llama-3, Mistral, Phi, Qwen...) | 🚀 BOOST — quality enhancement ON, answer compression OFF |
| **Strong model** (Sonnet, Opus, GPT-4o, Gemini Pro, DeepSeek V3...) | 💰 SAVER — token saving ULTRA, quality scaffold OFF |
| **Unknown model** | ⚡ BALANCED — quality ON, moderate token saving |

---

## 🚀 BOOST Tier Rules (Weak Model Detected)

*These apply when a weak/low-cost model is active.*

### Before any code change
1. Run `token-flux context "<task>"` if available; otherwise read `CODEMAP.md` or `.agent-boost/anatomy.md` to identify files involved.
2. Run `token-flux boost "<task>"` - get expert-enhanced prompt when using a weak model.
3. Run `token-flux lessons retrieve "<task>"` if available - inject relevant past lessons.
4. Open exact source files needed for correctness. Maps are triage, not truth.

### While writing code
1. Use a private checklist before code: root cause, route/API contract, security, edge cases, verification.
2. Write a short spec for risky or multi-file tasks.
3. Write or update tests before implementation when behavior changes.
4. Match existing patterns - grep for 3 similar usages before inventing a new one.

### Quality Standards (Boost Tier)
- Never truncate. Write COMPLETE implementations. No `// ...` or `# TODO`.
- Always add try/catch or null checks — no silent failures.
- Preserve auth, permissions, 2FA/MFA, CSRF, sessions, cookies, rate limits, and secrets.
- Verify routes/API contracts against actual registered paths and callers.
- Complete frontend loading, disabled, validation, empty, error, and success states when UI is touched.
- After getting AI response, run `token-flux score "<response>"`.
  - GOOD -> proceed.
  - WEAK/BAD -> run `token-flux retry` and try again.

### Token Rules (Lite — Weak Model)
- CLI proxy: use `token-flux proxy "<command>"` for noisy terminal commands when available.
- Minimal context: run `token-flux context "<task>"` first, then open relevant source files.
- Filler: No "certainly", "great question", "I'd be happy to".
- **Do NOT compress input** — weak models need full context to produce good output.

---

## 💰 SAVER Tier Rules (Strong Model Detected)

*These apply when a strong/high-cost model is active.*

### Before any code change
1. Run `token-flux context "<task>"` — start from the smallest risk-aware file set.
2. Check `.agent-boost/cerebrum.md` — do not repeat known mistakes.
3. Run `token-flux budget <file1> <file2>` before opening large file sets.
4. Open the exact source files needed for correctness.

### Response Style (Ultra Caveman — Strong Model)
RESPONSE STYLE: Ultra-compressed prose, not ultra-compressed reasoning. Fragments OK. No filler ever.
Format: root cause -> fix -> verification -> result. Keep routes, API contracts, auth/security checks, tests, errors, file paths, and commands exact.

### Token Rules (Ultra — Strong Model)
1. **CLI Proxy**: Use `token-flux proxy "<cmd>"` for noisy commands when available. If unavailable, run normally and summarize.
2. **Input Compress**: Use `token-flux compress "<prompt>"` before long prompts. Keep requirements, code, routes, errors, and security details intact.
3. **Minimal Context First**: Run `token-flux context "<task>"`; use anatomy only for broader navigation, not to replace implementation inspection.
4. **Cerebrum**: Read `.agent-boost/cerebrum.md` before any fix.
5. No quality scaffolding needed — strong model doesn't need expert persona injection.

---

## ⚡ BALANCED Tier Rules (Unknown Model)

*These apply when model cannot be detected.*

Run `token-flux detect-model` to detect your model and unlock the correct tier.
Until then, apply both sets of rules at moderate intensity:
- Use `token-flux boost "<task>"` for quality enhancement.
- Use `token-flux proxy "<cmd>"` for all terminal commands.
- Use `token-flux context "<task>"` before broad source reads.
- Caveman mode: `full` (not ultra).

---

## Before Declaring Task Done (All Tiers)

1. Run `token-flux verify` — must exit 0.
2. Run `token-flux score "<your response>"` — aim for GOOD.
3. Run `token-flux token-status` — check savings logged.
4. Append lesson if something non-obvious was learned.

## Hard Prohibitions (All Tiers)

- Do not edit `CODEMAP.md` by hand → `token-flux codemap`
- Do not mark task complete with failing tests.
- Do not bypass proxy for noisy terminal commands when proxy is available.
- Do not rely on anatomy alone for files whose implementation affects the fix.
- Do not skip `token-flux boost` when on a weak model.
