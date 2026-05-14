# /feature — add a new feature

Use this command to add new user-visible behavior to the repo.

## Flow

1. Invoke skill `spec-first`. Write `./.agent-boost/tasks/<task-id>/spec.md`.
2. Run `node ./.agent-boost/scripts/retrieve-lessons.mjs "<task description>"`. Read the `RELEVANT_LESSONS` block.
3. Invoke skill `consult-codemap`. Log reads to `read-log`.
4. Invoke skill `plan-then-code`. Write `plan.md`.
5. Invoke skill `check-blast-radius` for every file in the plan.
6. Invoke skill `test-driven`. Failing tests first, implementation second.
7. Run `node ./.agent-boost/scripts/verify.mjs`. Must exit 0.
8. Invoke skill `self-review`. Apply the result.
9. Invoke skill `extract-lesson`. Append to `LESSONS.md` if anything went wrong on the first attempt.
10. Summarize the change for the user in one paragraph.

## Usage

```
/feature Add a "remember me" checkbox to the login page that extends the session to 30 days.
```

The task id is derived from the first line of the request, kebab-cased and truncated to 40 characters.
