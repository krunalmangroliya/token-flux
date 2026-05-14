# Skill: spec-first

**When to invoke:** Any task whose description is one sentence or less, or any task where the acceptance criteria are ambiguous.

**What this skill does:** Turns a vague ask into a written spec before any code is written. A spec is the contract between you and the user; if you skip it, you will build the wrong thing.

## Procedure

1. Create `./.agent-boost/tasks/<task-id>/` if it does not exist. Use a short kebab-case id derived from the task (e.g. `add-remember-me-login`).
2. Write `./.agent-boost/tasks/<task-id>/spec.md` with these sections — no more, no less:

   ```markdown
   # Spec: <task title>

   ## Intent
   One paragraph. What is the user-observable change?

   ## Inputs
   What triggers this? UI event, API call, CLI flag, scheduled job?

   ## Outputs
   What changes in the system? Data written, UI rendered, response returned?

   ## Acceptance criteria
   Bulleted list. Each item must be independently testable.

   ## Out of scope
   Bulleted list. What you will explicitly NOT do in this task.

   ## Open questions
   Numbered list. Things you cannot answer from the codebase alone.
   ```

3. If the **Open questions** section is non-empty, stop and ask the user. Do not proceed to `plan-then-code` with open questions.
4. If the task is genuinely trivial (fix a typo, rename a single local variable), write a one-line spec and skip to planning. Do not skip entirely.

## Anti-patterns

- Spec that restates the task verbatim — you added no value.
- Spec with "TBD" in acceptance criteria — that means you have open questions you did not surface.
- Spec longer than one screen — you are designing instead of specifying. Split the task.
