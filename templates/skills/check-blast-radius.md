# Skill: check-blast-radius

**When to invoke:** Before editing any file. No exceptions — even a "one-line fix" deserves a two-second blast-radius check.

**What this skill does:** Tells you who imports the file you are about to edit, who co-changes with it historically, and a single risk score. Weak models routinely edit hot files without realizing they are hot.

## Procedure

1. For each file in your plan's "Files to change" list, run:

   ```
   node ./.agent-boost/scripts/blast-radius.mjs <file>
   ```

2. Read the output. Pay attention to:
   - **Direct importers** — every one of these is a caller whose behavior may change.
   - **Co-change history** — files that change together are coupled even if they do not import each other.
   - **Risk score** — a crude 0–10 heuristic. Anything ≥ 7 deserves a second look.

3. Append `<file>` to `./.agent-boost/tasks/<task-id>/blast-radius-reviewed`. The pre-edit gate checks this before allowing writes.

4. If the risk score is ≥ 7:
   - Add a "Risks" bullet to `plan.md` summarizing why.
   - Consider splitting your change into smaller commits.
   - Confirm the change with the user if the file is part of a public API.

## Reading co-change history

If `src/auth/login.ts` and `src/auth/session.ts` have changed together 14 times, and your plan only touches `login.ts`, you are almost certainly missing a change in `session.ts`. Open it. Read it. Decide consciously.

## Anti-patterns

- Running blast-radius, seeing a risk score of 8, and ignoring it because your change is "small". The score does not care about your intentions.
- Editing a file not in the code map at all — the tool cannot measure blast radius for something it does not know about. Regenerate the map first.
- Treating co-change as gossip rather than signal. It is signal.
