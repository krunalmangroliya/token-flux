# Skill: test-driven

**When to invoke:** Any task that changes behavior. (Pure refactors with no behavior change may skip.)

**What this skill does:** Enforces the order: failing test → implementation → green test. Weak models that write implementation first produce code that "looks right" but passes no real check.

## Procedure

1. Open the closest existing test file to the code you will change. Match its style — same framework, same assertion library, same fixture conventions.
2. Write a test that fails for the **current** code. Run it. Confirm it fails for the right reason (not an import error, not a typo — a real behavior gap).
3. Commit the failing test to your working tree (do not push yet — just save). This is your ground truth.
4. Write the minimum implementation to make the test pass.
5. Run the whole test suite (`node ./.agent-boost/scripts/verify.mjs`). A new green test that breaks three existing tests is not progress.
6. Refactor if needed. Tests stay green through refactor.

## When to write multiple tests

Write one failing test per acceptance criterion in the spec. If the spec has five criteria, you have five tests. Each should be able to fail independently.

## Anti-patterns

- Writing the implementation, then writing a test that just mirrors the implementation. The test validates nothing the compiler did not already.
- Tests with no assertions. `expect(result).toBeDefined()` is almost never a real test.
- Tests that mock the thing under test. If you mock the thing you are testing, you are testing the mock.
- Snapshot tests as a substitute for thought. Snapshots are fine for stable output shapes; they are not a substitute for asserting behavior.
