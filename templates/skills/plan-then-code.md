# Skill: plan-then-code

**When to invoke:** After `spec-first` is complete and before any file is edited.

**What this skill does:** Forces a numbered, file-level plan before you write code. Weak models that skip this step drift, invent patterns, or miss obvious places that need updating.

## Procedure

1. Read `CODEMAP.md` and filter to files relevant to the task.
2. Run `node ./.agent-boost/scripts/blast-radius.mjs <file>` for each file you expect to edit.
3. Write `./.agent-boost/tasks/<task-id>/plan.md` with this structure:

   ```markdown
   # Plan: <task title>

   ## Files to change
   - `path/to/file.ts` — what changes and why
   - `path/to/other.ts` — what changes and why

   ## New files
   - `path/to/new.ts` — one-sentence purpose

   ## Tests to add or update
   - `path/to/file.test.ts::describes new case X`

   ## Order of operations
   1. Add failing test for X
   2. Change file A to satisfy X
   3. Change file B to keep existing test Y passing
   4. Run verify.mjs

   ## Risks
   - Blast-radius warnings from step 2
   - Any coupling noted in LESSONS.md
   ```

4. Re-read the plan once. Every item in "Files to change" must have a corresponding entry in "Order of operations". If not, your plan is lying.

## Hard rule

Do not call an edit tool until `plan.md` exists for the current task. The pre-edit gate will block you.

## Anti-patterns

- Plan that says "refactor as needed" — not a plan, it is a wish.
- Plan with more files than the spec's acceptance criteria justify — scope creep.
- Plan that adds a new abstraction "for flexibility" without a second caller in the spec — YAGNI.
