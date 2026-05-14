# Agent Operating Rules — 🚀 BOOST Mode

> Mode: **BOOST** — Optimised for weak/low-cost models. Output quality is the priority.
> Switch mode: `token-flux mode set saver`

You are coding in a repository that uses the token-flux pipeline. These rules are absolute.

## Before any code change

1. Run `token-flux context "<task>"` if available. Otherwise read `CODEMAP.md` or `.agent-boost/anatomy.md` - identify files involved in the task.
2. Run `token-flux lessons retrieve "<task description>"` if available - inject relevant lessons.
3. Run `token-flux boost "<task description>"` if you are using a weak model - get an expert-enhanced prompt.
4. Open the actual source files required for correctness. Do not rely on maps alone.
5. Run `token-flux blast-radius <file>` for risky or shared files you plan to edit.

## While writing code

1. For risky or multi-file tasks, write a short spec and plan in `./.agent-boost/tasks/<task-id>/`.
2. Write or update tests before implementation when behavior changes.
3. Match existing patterns in this repo - do not invent new ones. When in doubt, grep for three similar usages.
4. Complete the whole workflow: backend, frontend, config, tests, and docs when touched.

## Quality Standards (BOOST Mode)

- **Private checklist first**: Check root cause, files, route/API contract, security, edge cases, and verification before coding.
- **Self-critique before submitting**: Run `token-flux score "<response>"` - if score is not GOOD, retry.
- **Verify steps explicitly**: State what you ran and what passed or failed.
- **Explain decisions briefly**: Include the why only where it affects correctness.
- **Full responses**: Do not truncate output. Write complete, correct implementations. No `// ...` or TODOs.
- **Security gate**: Preserve auth, permissions, 2FA/MFA, CSRF, sessions, cookies, rate limits, and secrets.
- **Route gate**: Verify actual registered routes, methods, request/response shapes, and callers.
- **Frontend gate**: Complete loading, disabled, validation, empty, error, and success states.
- **No avoidable stalls**: Ask only when a missing requirement cannot be discovered from the repo.

## Before declaring the task done

1. Run `token-flux verify` — must exit 0. No exceptions.
2. Run `token-flux score "<your response>"` - must be GOOD. If WEAK/BAD, run `token-flux retry`.
3. Append a lesson: `token-flux lessons retrieve "<task>"` then add to `LESSONS.md`.

## Hard prohibitions

- Do not edit `CODEMAP.md` by hand. Regenerate with `token-flux codemap`.
- Do not mark a task complete with failing tests.
- Do not commit `.agent-boost/tasks/*` — it is local scratch space.
- Do not skip reading `LESSONS.md`, even if the task looks trivial.
- Do not use the AI without first running `token-flux boost "<prompt>"`.

## Skills

Short playbooks for common moves live in `./.agent-boost/skills/`. Consult them by name when a task matches:

- `spec-first` — turn a vague ask into a written spec
- `plan-then-code` — produce a numbered plan before any edit
- `test-driven` — write failing tests before implementation
- `consult-codemap` — the discipline for reading CODEMAP before touching code
- `check-blast-radius` — what to look at before editing a hot file
- `self-review` — how to critique your own diff
- `extract-lesson` — how to write a lesson worth keeping
