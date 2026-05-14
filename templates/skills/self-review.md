# Skill: self-review

**When to invoke:** After `verify.mjs` exits 0 and before you tell the user the task is done.

**What this skill does:** A green verifier proves your code does not break known contracts. Self-review catches the things the verifier cannot — missed edge cases, smell, over-engineering, silent behavior changes.

## Procedure

1. Run `node ./.agent-boost/scripts/self-review.mjs <task-id>`. This writes a review prompt to `./.agent-boost/tasks/<task-id>/review-prompt.md` containing the spec, plan, diff, and verify output.
2. Read the review prompt in full. Then answer it yourself, in a new chat turn, as if you were a senior reviewer seeing this for the first time. Write your answer to `./.agent-boost/tasks/<task-id>/review.md`.
3. Structure your review:

   ```markdown
   # Review: <task title>

   ## Bugs
   - <file:line> — <what is wrong, what breaks>

   ## Missing edge cases
   - <specific input that is not handled>

   ## Anti-patterns
   - <pattern that conflicts with the rest of the repo>

   ## Over-engineering
   - <abstraction introduced without a second caller>

   ## Verdict
   - ship / revise / scrap
   ```

4. If the verdict is "revise" or "scrap", apply the fixes and re-run verify + self-review. Do not ship with known bugs listed in your own review.

## How to be a useful reviewer to yourself

- Assume the coder (you, an hour ago) was tired and cut corners. Look specifically for corners cut.
- Compare the diff against the plan. Anything in the diff that is not in the plan is suspect. Anything in the plan that is not in the diff is suspect.
- Re-read the spec's acceptance criteria one by one. For each, point at the line of code or test that satisfies it.

## Anti-patterns

- Writing "LGTM" in a review you conducted on yourself. If you cannot name three things to consider, you did not review.
- Reviewing only the lines you added. The lines you deleted and the lines you did not touch are also fair game.
- Treating self-review as paperwork. It is the last cheap chance to catch bugs before they reach the user.
