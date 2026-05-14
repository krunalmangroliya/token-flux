# Skill: consult-codemap

**When to invoke:** At the start of every task, before reading any source file.

**What this skill does:** The code map is the curated, runtime-annotated index of the repo. It is cheaper to consume than source, and it contains signal (coverage, call counts, callers) that source alone does not surface.

## Procedure

1. Open `CODEMAP.md`. If the repo uses a two-level map, start at the root map and drill into per-directory maps.
2. Search for every noun in the task. If the task says "update the login flow to support remember-me", search for `login`, `session`, `remember`, `auth`, `token`.
3. For each match, note:
   - the file path
   - the function signature
   - annotations: coverage, call count, callers, exceptions thrown

4. Write the hits to `./.agent-boost/tasks/<task-id>/read-log` — one file path per line. The pre-edit gate checks this log before allowing writes.
5. If a file you expect to touch is not in the code map, run `node ./.agent-boost/scripts/build-codemap.mjs` before proceeding — the map may be stale.

## How to read the annotations

- **`coverage: 94%`** — high coverage means existing tests will catch your regressions. Low coverage means you must add tests.
- **`called 0× in tests`** — the function is untested. Writing tests is part of your task, not optional.
- **`no callers found`** — possibly dead code. Confirm with the user before extending it.
- **`throws: InvalidCredentials, RateLimitExceeded`** — known error paths. Do not swallow these in a try/catch without thought.
- **`args observed: email (string, ~20 chars)`** — runtime shape of real inputs. Use this to write realistic tests.

## Anti-patterns

- Reading source files before reading the code map. You are guessing at structure the map already gives you.
- Editing a file whose entry in the map you did not read. The pre-edit gate will catch this; do not rely on it.
- Trusting the map without a last-modified check. If the repo has commits since the map was generated, regenerate.
