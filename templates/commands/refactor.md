# /refactor — restructure without behavior change

Use this command for renames, extractions, moves, and dependency upgrades that should not change observable behavior.

## Flow

1. Invoke skill `spec-first`. The spec for a refactor is unusual:
   - **Intent:** what structural property will be better after?
   - **Acceptance:** every existing test still passes, and a named concrete improvement is measurable (fewer lines, fewer cycles, fewer dependencies, etc.).
   - **Out of scope:** any behavior change. If you find yourself wanting to change behavior, stop and open a separate `/feature` or `/fix` task.
2. Invoke skill `consult-codemap`. For refactors, the call graph is your map. Every caller will feel the refactor.
3. Invoke skill `plan-then-code`. Refactor plans touch many files; list every one.
4. Invoke skill `check-blast-radius` for each file. Refactors that touch high-risk files must be split.
5. Skip `test-driven` — you are not adding behavior. But before starting, confirm the existing tests actually cover the area you are restructuring. If they do not, add tests FIRST, then refactor.
6. Refactor in small steps. Run `verify.mjs` between steps. A refactor that breaks tests in the middle and fixes them at the end is indistinguishable from a bug until the end.
7. Invoke skill `self-review`. Specifically ask: did I change behavior anywhere without meaning to?
8. Lesson extraction is usually skipped for clean refactors. Extract only if the refactor exposed a coupling you did not know about.

## Usage

```
/refactor Rename `getCwd` to `getCurrentWorkingDirectory` across the codebase.
```
