# Skill: extract-lesson

**When to invoke:** After a task is shipped (verify green, review applied). Run this before closing the task directory.

**What this skill does:** Turns a task transcript into a single durable rule in `LESSONS.md`. The lessons layer is the compounding component of token-flux — each kept lesson makes the next task cheaper.

## Procedure

1. Run `node ./.agent-boost/scripts/extract-lesson.mjs <task-id>`. This writes a prompt to `./.agent-boost/tasks/<task-id>/lesson-prompt.md` containing the spec, plan, diff, and verify transcript.
2. Read the prompt. Ask yourself: **what did I get wrong on the first attempt, and what is the one-line rule that would have prevented it?**
3. If the honest answer is "nothing went wrong", do not write a lesson. Noise hurts more than silence. Exit.
4. Otherwise, append a lesson to `LESSONS.md` using this format:

   ```markdown
   ## L-<next-id>  —  <YYYY-MM-DD>  —  tags: <comma-separated>

   **Task:** <one-sentence summary>

   **Initial mistake:** <what you did first that was wrong>

   **Correct pattern:** <what you should have done>

   **Rule:** <one-line actionable rule, imperative mood>
   ```

5. Tag the lesson with every file path touched and every domain concept named in the spec. Tags are the retrieval index; miss a tag and the lesson is invisible next time.

## What makes a good lesson

- **Specific.** "When editing session TTL, also update REFRESH_TOKEN_TTL in session.ts" is better than "be careful with sessions."
- **Imperative.** "Grep for X before touching Y" beats "X and Y are coupled."
- **Testable.** If the rule had been followed, the initial mistake would not have happened. If it would have happened anyway, the rule is not the right rule.

## What to leave out

- Anything already enforced by a lint rule or the type checker. The tool catches those; the lesson does not need to.
- Style preferences. LESSONS.md is for mistakes, not opinions.
- Lessons that duplicate existing ones. Open LESSONS.md first. If a lesson with the same rule exists, do not write a new one — optionally update the old one with a date bump.

## Anti-patterns

- Writing a lesson for every task. Most tasks should not produce lessons.
- Vague lessons like "test more" or "read the code first". The agent already has skills telling it that.
- Lessons that reference files by git hash or line number. Both drift. Reference by file path and symbol name instead.
