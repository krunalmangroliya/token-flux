# Agent Operating Rules

You are coding in a repository that uses the token-flux pipeline. These rules are absolute.

## Before any code change

1. Run `token-flux context "<task>"` if available. Otherwise read `CODEMAP.md` or `.agent-boost/anatomy.md`. Identify the files involved in the task.
2. Read `LESSONS.md` and `.agent-boost/cerebrum.md` if present. Do not repeat known mistakes.
3. Run `node ./.agent-boost/scripts/pack-context.mjs <topic>` when it helps pull related source.
4. Open the exact implementation files needed for correctness.
5. Run `node ./.agent-boost/scripts/blast-radius.mjs <file>` for risky or shared files you plan to edit.

## While writing code

1. Write a short spec and plan for risky or multi-file tasks.
2. Write or update tests before implementation when behavior changes.
3. Match existing patterns in this repo - do not invent new ones. When in doubt, grep for three similar usages.
4. Preserve route/API contracts, auth/security behavior, and frontend states when touched.

## Before declaring the task done

1. Run `node ./.agent-boost/scripts/verify.mjs`. It must exit 0. No exceptions.
2. Run `node ./.agent-boost/scripts/self-review.mjs <task-id>` and apply its output.
3. Append a lesson to `LESSONS.md` using `node ./.agent-boost/scripts/extract-lesson.mjs <task-id>`.

## Hard prohibitions

- Do not edit `CODEMAP.md` by hand. Regenerate with `node ./.agent-boost/scripts/build-codemap.mjs`.
- Do not mark a task complete with failing tests.
- Do not commit `.agent-boost/tasks/*` — it is local scratch space.
- Do not skip reading `LESSONS.md`, even if the task looks trivial.
- Do not bypass the pre-edit gate by writing via shell redirection instead of your edit tool.

## Skills

Short playbooks for common moves live in `./.agent-boost/skills/`. Consult them by name when a task matches:

- `spec-first` — turn a vague ask into a written spec
- `plan-then-code` — produce a numbered plan before any edit
- `test-driven` — write failing tests before implementation
- `consult-codemap` — the discipline for reading CODEMAP before touching code
- `check-blast-radius` — what to look at before editing a hot file
- `self-review` — how to critique your own diff
- `extract-lesson` — how to write a lesson worth keeping
