# Agent-Boost: Package Specification

**Goal:** A drop-in package that, once initialized in a repository, makes weak-model coding agents (running in Cursor, VS Code, OpenCode, Cline, Aider, Claude Code, etc.) produce output that rivals or beats strong-model runs — by forcing a disciplined pipeline backed by a runtime-informed code map, a learning layer, and hard enforcement.

This document is the build spec. It is self-contained. You (or an agent) should be able to build the package from this alone.

---

## 1. Positioning

This package is **not** another indexer competing with Aider's repo-map or Cursor's embeddings. Those tools optimize for *speed with strong models*. This one optimizes for *quality with weak models*. The target user is someone running Haiku, small local models (Qwen, DeepSeek small, Llama-3.1-8B), or anyone who wants reliability over raw velocity.

Everything in this spec is in service of one measurable claim: *the same weak model, on the same task, on the same repo, produces better code with this package installed than without.* If a design decision doesn't move that metric, cut it.

---

## 2. Core Design Principles

**Enforce, don't suggest.** Weak models skim prose. They respect exit codes. Every rule that matters must be backed by a script that blocks progress when violated.

**Ground truth over generated truth.** Facts extracted from AST parsing, test runs, type checkers, and coverage reports beat anything the model writes in a comment. The package's job is to feed ground truth to the agent, not to let the agent imagine it.

**Cheap to consume, expensive to build.** The agent should hit a single short file (`CODEMAP.md`, `LESSONS.md`) before reading source. Generation happens offline or on-demand — consumption is always a small read.

**Compound over time.** Each task should leave the repo smarter. Lessons, traces, and patterns accumulate. The 100th task is easier than the 10th.

**IDE-agnostic, agent-agnostic.** The package writes plain files (Markdown, JSON, shell scripts) that any agent runtime can consume. It ships adapters for major agents but the core is portable.

---

## 3. Package Layout

```
agent-boost/
├── package.json                    # npm entry; exposes `agent-boost` CLI
├── README.md
├── bin/
│   └── agent-boost                 # CLI dispatcher
├── src/
│   ├── init.ts                     # project detection + scaffolding
│   ├── codemap/
│   │   ├── static.ts               # tree-sitter based extraction
│   │   ├── runtime.ts              # trace ingestion
│   │   ├── constraints.ts          # invariant mining from tests/types
│   │   └── blast-radius.ts         # dependency + risk graph
│   ├── lessons/
│   │   ├── extract.ts              # turn task transcripts into lessons
│   │   ├── retrieve.ts             # fetch relevant lessons for a task
│   │   └── judge.ts                # LLM-based lesson validation
│   ├── enforce/
│   │   ├── wrapper.ts              # pre-edit gate
│   │   └── verify.ts               # test/lint/type runner
│   └── adapters/
│       ├── claude-code.ts          # writes CLAUDE.md + .claude/skills
│       ├── cursor.ts               # writes .cursor/rules
│       ├── cline.ts                # writes .clinerules
│       ├── opencode.ts             # writes opencode config
│       └── generic.ts              # writes AGENT.md (universal)
├── templates/
│   ├── AGENT.md                    # the constitution
│   ├── skills/
│   │   ├── spec-first.md
│   │   ├── plan-then-code.md
│   │   ├── test-driven.md
│   │   ├── consult-codemap.md
│   │   ├── check-blast-radius.md
│   │   ├── self-review.md
│   │   └── extract-lesson.md
│   ├── commands/
│   │   ├── feature.md
│   │   ├── fix.md
│   │   ├── refactor.md
│   │   └── review.md
│   └── scripts/
│       ├── verify.sh.tmpl
│       ├── build-codemap.sh.tmpl
│       ├── pack-context.sh.tmpl
│       └── pre-edit.sh.tmpl
└── test/
    └── evals/                      # weak-model benchmark suite
```

Users install with `npm i -g agent-boost` (or `npx agent-boost init`). The CLI is the only entry point they touch.

---

## 4. The Init Flow

When a user runs `agent-boost init` inside a repo, the following happens in order. Each step is observable in the terminal; each can be re-run idempotently.

**Step 1 — Detect.** Read the repo for signals: `package.json` → Node; `pyproject.toml` / `requirements.txt` → Python; `go.mod` → Go; `Cargo.toml` → Rust; `.sln` → .NET. Detect test framework (Jest, Pytest, Go test, Cargo test). Detect linter/formatter (ESLint/Prettier, Ruff/Black, golangci-lint, Clippy). Detect type checker (tsc, mypy/pyright). Store results in `.agent-boost/config.json`.

**Step 2 — Ask.** Interactive prompts for anything detection couldn't resolve: *which IDE/agent will you use?*, *which LLM?*, *should I install a git pre-commit hook?*, *do you want runtime tracing enabled?* Defaults are aggressive — trace on, enforce on — because the tool's value is in doing the annoying things automatically.

**Step 3 — Generate scripts.** Write the four shell scripts into `./.agent-boost/scripts/`, filled in with project-specific commands (`npm test`, `pytest`, `go test ./...`, etc.). These are the workhorses — everything else is text.

**Step 4 — Build the initial code map.** Run `build-codemap.sh` once. This parses the codebase with tree-sitter, writes `CODEMAP.md` at the repo root and `.agent-boost/codemap.json` (machine-readable). First run can be slow on large repos; subsequent runs are incremental.

**Step 5 — Write agent-facing files.** Based on the chosen adapter, lay down:
- `AGENT.md` (or `CLAUDE.md`, `.cursor/rules/agent-boost.mdc`, `.clinerules`, etc.) — the constitution, short and imperative.
- A skills or rules directory with the seven skill files.
- A commands directory where the agent supports slash commands.

**Step 6 — Seed the lessons file.** Create an empty `LESSONS.md` with the schema explained at the top so future writes are consistent.

**Step 7 — Install hooks (if opted in).** Git `pre-commit` runs `verify.sh`. Git `post-merge` regenerates the code map. Optional: a file-watcher that re-maps on change.

**Step 8 — Print next steps.** The CLI ends with a three-line summary: what was created, the one command the user should run next (usually `agent-boost test` to confirm the verifier works), and a link to the skill the agent should invoke first.

---

## 5. The Constitution (AGENT.md)

Short. Imperative. Under 80 lines. No hedging words like *try*, *consider*, *when appropriate*. Weak models treat softness as permission to skip.

Template contents:

```markdown
# Agent Operating Rules

You are coding in a repository that uses the agent-boost pipeline. These rules are absolute.

## Before any code change
1. Read `CODEMAP.md`. Identify the files involved in the task.
2. Read `LESSONS.md`. Check for lessons tagged with any file or pattern in your task.
3. Run `./.agent-boost/scripts/pack-context.sh <topic>` to pull related source.
4. Run `./.agent-boost/scripts/blast-radius.sh <file>` for every file you plan to edit.

## While writing code
1. Write the spec first. Save to `./.agent-boost/tasks/<task-id>/spec.md`.
2. Write the plan second. Save to `./.agent-boost/tasks/<task-id>/plan.md`.
3. Write failing tests before implementation.
4. Match existing patterns in this repo — do not invent new ones. When in doubt, grep for three similar usages.

## Before declaring the task done
1. Run `./.agent-boost/scripts/verify.sh`. It must exit 0. No exceptions.
2. Run `./.agent-boost/scripts/self-review.sh` and apply its output.
3. Append a lesson to `LESSONS.md` describing one thing learned.

## Hard prohibitions
- Do not edit `CODEMAP.md` by hand. Regenerate with `build-codemap.sh`.
- Do not mark a task complete with failing tests.
- Do not commit `.agent-boost/tasks/*` — it is local scratch space.
- Do not skip reading `LESSONS.md`, even if the task looks trivial.
```

The adapter layer rewrites this file for each target agent's expected location and syntax, but the content is identical.

---

## 6. The Code Map

### 6.1 Static extraction

Use `tree-sitter` with per-language grammars. For each source file, extract:

- File path, one-line purpose (first doc comment or inferred from exported names).
- Exports: every top-level function, class, constant, type. Include full signature.
- Imports: every external and internal dependency.
- Side-effect markers: any call to `fs.*`, `fetch`, `db.*`, `exec`, known I/O libraries. Heuristic, not perfect, but useful.
- Line count, cyclomatic complexity (via `radon` / `complexity-report` equivalent).

Output two formats:

`CODEMAP.md` — human/agent readable, grouped by directory, trimmed to signatures only. Target under 2000 lines for mid-size repos. For repos above that, generate a two-level map: top-level `CODEMAP.md` lists modules; per-module `CODEMAP.md` files sit in each directory.

`.agent-boost/codemap.json` — full structured data. Consumed by other scripts (blast-radius, pack-context).

### 6.2 Runtime enrichment

Once a test suite exists, `build-codemap.sh --with-runtime` additionally:

- Runs the test suite with coverage. Records per-function hit counts.
- Optionally instruments a dev session (Node `--inspect`, Python `sys.settrace`, Go `-cover`). Captures call graph, exception types thrown, argument type shapes.
- Merges results into `codemap.json`. Fields added: `call_count`, `test_coverage`, `callers`, `exceptions_thrown`, `typical_arg_shapes`.

The agent sees annotations like:

```
src/auth/login.ts  —  User login flow
  login(email: string, pw: string) -> Promise<Session>
    called 847× in tests, 12× from src/api/routes.ts
    coverage: 94%
    throws: InvalidCredentials, RateLimitExceeded
    args observed: email (string, ~20 chars), pw (string, ~12 chars)
  validateToken(token: string) -> boolean
    called 0× in tests [WARNING: untested]
    no callers found [WARNING: possibly dead code]
```

This is the information that closes most of the weak-model quality gap. A weak model told "this function is untested and never called" will behave very differently from one that isn't told.

### 6.3 Constraint mining

A separate pass reads the test files and extracts invariants:

- Every `expect(x).toBe(...)` / `assert x == ...` becomes a known input-output pair.
- Every `expect(...).toThrow(...)` becomes a known error condition.
- Every type guard / early return (`if (!user) throw`) becomes a precondition.
- Every `@param` / docstring contract becomes a documented invariant.

These attach to the function entry in the code map. The agent reads signature *plus* preconditions *plus* observed edge cases — not just the name.

### 6.4 Blast radius

`blast-radius.sh <file>` outputs:

```
Editing src/auth/login.ts will affect:

  Direct importers (3):
    src/api/routes.ts
    src/web/pages/login.tsx
    src/tests/auth.test.ts

  Transitive (7):
    src/api/middleware.ts  (via routes.ts)
    ...

  Co-change history (from git):
    src/auth/session.ts     — changed together 14 times
    src/auth/logout.ts      — changed together 9 times

  Risk score: 7.2 / 10
    reasons: high co-change, public API, cross-layer usage
```

Built from: import graph (static) + `git log --name-only` co-change analysis + a simple scoring function. Risk score is crude but surfaces "don't touch this lightly" signals weak models otherwise miss.

---

## 7. The Lessons Layer

`LESSONS.md` is an append-only, retrieval-indexed log of mistakes and patterns. It is the compounding component of the package — the thing that makes task #100 easier than task #10.

### 7.1 Lesson format

```markdown
## L-042  —  2026-04-15  —  tags: auth, session, login.ts

**Task:** Add "remember me" checkbox to login flow.

**Initial mistake:** Set session expiry to 30 days but didn't update the refresh-token TTL in `src/auth/session.ts`, causing silent logouts after 7 days.

**Correct pattern:** Session expiry and refresh-token TTL must be changed together. They live in different files but are coupled.

**Rule:** When editing session duration, grep for `REFRESH_TOKEN_TTL` and update both.
```

The format is intentionally verbose at creation time and compact when retrieved — the retrieval layer extracts only the rule when pulling into agent context.

### 7.2 Extraction

After each task the agent runs `extract-lesson.sh <task-id>`. This passes the task's spec, plan, diff, and verify output to an LLM prompt that asks: *"What did the agent get wrong initially? What's the one-line rule?"* If the task went cleanly with no corrections, no lesson is added (noise hurts more than it helps).

For weak-model pipelines, the extraction itself should use a stronger model (Haiku for coding, Sonnet for lessons) — this is cheap because it happens once per task, not per token.

### 7.3 Retrieval

When a new task starts, the pre-task hook runs `retrieve-lessons.sh <task-description>`. It does:

1. Extract tags from the task (file paths mentioned, concepts named).
2. Match tags against lesson tags.
3. If under 5 matches, fall back to semantic search over lesson bodies.
4. Inject top 3 rules into the agent's context as a `RELEVANT_LESSONS` block at the top of the task.

The agent sees exactly the past mistakes relevant to what it's doing now.

### 7.4 Pruning

Lessons go stale. A quarterly maintenance command (`agent-boost lessons prune`) re-validates each lesson against current code — does the referenced file still exist, does the referenced pattern still apply? Stale lessons are archived, not deleted.

---

## 8. Enforcement

This is where the package gets its teeth. Everything above is just files the agent *can* read. Enforcement makes them files the agent *must* read.

### 8.1 The pre-edit wrapper

Agents that support tool hooks (Claude Code, Cline) get a `pre-edit.sh` registered on the file-write tool. Before any write:

```bash
# .agent-boost/scripts/pre-edit.sh
FILE=$1
TASK_DIR=".agent-boost/tasks/current"

# Check: has the agent read CODEMAP for this file's module?
if ! grep -q "$FILE" "$TASK_DIR/read-log"; then
  echo "BLOCKED: You have not consulted CODEMAP.md for $FILE."
  echo "Run: cat CODEMAP.md | grep -A 20 '$(dirname $FILE)'"
  exit 1
fi

# Check: does a plan exist for this task?
if [ ! -f "$TASK_DIR/plan.md" ]; then
  echo "BLOCKED: No plan found. Write $TASK_DIR/plan.md first."
  exit 1
fi

# Check: blast radius reviewed?
if ! grep -q "$FILE" "$TASK_DIR/blast-radius-reviewed"; then
  echo "BLOCKED: Run ./.agent-boost/scripts/blast-radius.sh $FILE first."
  exit 1
fi

exit 0
```

For agents without hook support (Cursor, vanilla VS Code), the enforcement is softer — the constitution tells the agent to run these scripts manually, and the verify step at the end catches violations. Not ideal. Over time, more runtimes will add hook support; the package adopts them as they appear.

### 8.2 The verifier

`verify.sh` is the single most important script. It must:

1. Run the formatter (Prettier, Black, gofmt). Fail on diffs.
2. Run the linter. Fail on errors; warnings logged but don't block.
3. Run the type checker. Fail on any error.
4. Run the test suite. Fail on any failure.
5. Run the build. Fail on any error.
6. Check for secrets (ripsecrets / gitleaks if available).

Each step prints a clear pass/fail line. The script exits with the first failing step's code.

The constitution says: *task is not done until verify.sh exits 0.* The agent treats this as gospel because it's a deterministic, repeatable check — not a judgment call.

### 8.3 Self-review

`self-review.sh` runs the agent's own output back through the model with a reviewer prompt: *"Act as a senior reviewer. Here is the diff, the spec, and the plan. List bugs, missing edge cases, and anti-patterns."* Output goes to the task directory. The agent is required to address each item before declaring complete.

For weak-model setups, the reviewer pass should ideally use a slightly stronger model than the coder — even Haiku reviewing Haiku catches things, but Sonnet reviewing Haiku catches more. The package supports a `REVIEW_MODEL` env var for exactly this.

---

## 9. Adapter Layer

Each supported agent runtime gets an adapter that translates the universal package files into the agent's native format.

**Claude Code** — writes `CLAUDE.md` at repo root, skills to `.claude/skills/`, commands to `.claude/commands/`. Registers `pre-edit.sh` as a tool hook via `.claude/settings.json`.

**Cursor** — writes rules to `.cursor/rules/agent-boost.mdc` with frontmatter for auto-attachment. Commands go in cursor's docs format. No native hook support yet, so enforcement is verifier-based only.

**Cline** — writes `.clinerules` at repo root. Supports tool hooks via its MCP integration.

**OpenCode** — writes `opencode.json` config and `AGENT.md` at root.

**Aider** — writes `.aider.conf.yml` with `read` directives pointing to `CODEMAP.md` and `LESSONS.md` so they auto-load into every session.

**VS Code (plain, with Copilot or similar)** — writes `AGENT.md` and registers a VS Code task for `verify.sh`. Weakest enforcement tier since there's no real agent layer to gate.

**Generic** — writes just `AGENT.md` and the scripts. Any tool that reads repo-level instructions works.

The adapter API is simple — each exports a `write(config)` function that takes the resolved project config and lays down files. Adding a new adapter is under 100 lines.

---

## 10. The Evaluation Harness

Without evals, every claim in this spec is vibes. The package includes `agent-boost eval` which runs a fixed task suite against a configured agent and reports pass rate.

The eval suite should cover:

- **Add feature** (5 tasks): add a small feature to a sample repo. Measured: tests pass, no regressions, matches repo style.
- **Fix bug** (5 tasks): fix a seeded bug. Measured: bug fixed, no new bugs introduced.
- **Refactor** (3 tasks): rename a function across files. Measured: all usages updated, tests pass.
- **Add test** (2 tasks): write tests for an untested function. Measured: coverage increases, tests are meaningful.

Each task has a known-good reference solution. Scoring is automated via the verifier plus a diff similarity check.

Run the suite three times per configuration to measure variance. Report: *"Haiku + agent-boost: 14/15 passed, 2 attempts avg. Haiku baseline: 7/15 passed, 4 attempts avg."* If the delta isn't decisive, the package isn't doing its job and you iterate on whichever layer is underperforming.

---

## 11. Build Order (Milestones)

Don't build everything at once. This order prioritizes shipping something useful fast and layering value.

**Milestone 1 — Skeleton (week 1-2):** CLI scaffolding, `init` command, project detection, verifier script generation, generic `AGENT.md` adapter. At end: `agent-boost init` works; a weak model running any agent gets a constitution and a working verifier. This alone produces measurable lift.

**Milestone 2 — Static code map (week 3-4):** Tree-sitter integration for at least TypeScript and Python. Generate `CODEMAP.md` and `codemap.json`. Add the `consult-codemap` skill. Adapter for Claude Code and Cursor. At end: agents see repo structure without reading every file.

**Milestone 3 — Lessons layer (week 5-6):** `LESSONS.md` format, extraction script, retrieval script, pre-task hook. This is the compounding layer — the longer a repo uses the tool, the more it diverges from baseline.

**Milestone 4 — Blast radius + constraints (week 7-8):** Import graph, co-change analysis, constraint mining from tests. Add the `check-blast-radius` skill. At end: agents know what they're about to break before they break it.

**Milestone 5 — Runtime enrichment (week 9-11):** Coverage ingestion, call count annotation, optional tracing. Hardest layer — per-language instrumentation is fiddly. Ship for TypeScript first, then Python, then Go.

**Milestone 6 — Full enforcement (week 12):** Pre-edit hooks for agents that support them. Polish, docs, publish v1.0.

Eval harness should be built alongside Milestone 1 and run continuously. Never ship a milestone that doesn't improve eval scores over the previous one.

---

## 12. Anticipated Pitfalls

**The code map goes stale and misleads more than it helps.** Mitigation: git post-merge hook regenerates; CI check fails if map is out of sync.

**Lessons accumulate noise and bloat context.** Mitigation: quarterly prune command; retrieval limited to top-3; LLM judge validates lessons before write.

**Enforcement is too strict and users disable it.** Mitigation: ship with enforcement tunable (`strict`, `normal`, `advisory`) and default to `normal`. Power users can go lower; cautious users can go higher.

**Only works on small repos.** Mitigation: two-level code map; per-module lesson files; lazy loading.

**Agent runtimes change their formats and break adapters.** Mitigation: adapters are intentionally thin and versioned; a broken adapter doesn't break the core.

**People don't install it because the value isn't obvious.** Mitigation: the README leads with eval numbers, not architecture. *"Haiku + agent-boost beat Sonnet baseline on our eval suite"* — if that sentence is true, the package sells itself. If it isn't, go back and fix the package.

---

## 13. Out of Scope (Explicitly)

To prevent scope creep:

- Not an LLM router. Users bring their own model.
- Not an IDE. Works inside existing IDEs.
- Not a replacement for code review. Augments it.
- Not a vector database. Retrieval is tag-based with optional lightweight semantic fallback (e.g., a local embedding model, not a hosted service).
- Not a CI system. Integrates with existing CI via the verifier script.
- Not a multi-agent orchestrator. One agent, one repo, one task at a time.

---

## 14. First Deliverables Checklist

By end of Milestone 1, you should have:

- A working `npm i -g agent-boost` install.
- `agent-boost init` that detects a Node or Python project and scaffolds files.
- `.agent-boost/scripts/verify.sh` that runs the project's real test/lint/type commands.
- `AGENT.md` at repo root with the constitution.
- Three skill files: `spec-first.md`, `plan-then-code.md`, `self-review.md`.
- An eval harness with at least five tasks, automated scoring, and a CSV output.
- A README with a one-command install and a one-paragraph pitch backed by eval numbers.

If that much exists and the eval numbers are positive, every further milestone is optional polish. Ship Milestone 1. Measure. Decide.

---

## 15. Success Metric (The Only One That Matters)

On the eval suite, averaged over three runs:

> *Weak model + agent-boost ≥ weak model alone + 40%, measured as fraction of tasks passing verify.sh on first attempt.*

If that holds, the package is real. If it doesn't, no amount of elegant architecture matters. Build the eval harness first. Keep it honest. Let it drive every decision.
