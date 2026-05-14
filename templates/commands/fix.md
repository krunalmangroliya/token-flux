# /fix — fix a bug

Use this command when the user reports a bug or a test fails unexpectedly.

## Flow

1. Reproduce first. Write a failing test that captures the bug. Save it. Do not skip this step — a fix without a repro test is a wish, not a fix.
2. Invoke skill `spec-first` — but the spec is short: intent is "fix bug X", acceptance is "the failing test from step 1 passes, no existing tests break".
3. Run `node ./.agent-boost/scripts/retrieve-lessons.mjs "<bug description>"`. Lessons frequently encode past fixes to related code.
4. Invoke skill `consult-codemap`. The code map's `callers` and `coverage` annotations are especially valuable for bug triage.
5. Invoke skill `plan-then-code`. A bug fix plan is usually 1–3 files; if yours is larger, you are refactoring, not fixing.
6. Invoke skill `check-blast-radius` for the buggy file. High risk score + bug fix = small commits.
7. Implement. Run `verify.mjs`. Green.
8. Invoke skill `self-review`. Pay special attention to: did you fix the symptom or the cause?
9. Invoke skill `extract-lesson`. Bug fixes are the single richest source of lessons — capture one unless the bug was trivial.
10. Summarize: what was broken, what you changed, how to verify.

## Usage

```
/fix Users on Safari sometimes see a blank page after login — the session cookie is set without SameSite=None.
```
