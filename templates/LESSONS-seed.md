# Lessons

Append-only log of mistakes and the rules they taught. Retrieval is tag-based — tag aggressively.

## Format

```markdown
## L-NNN  —  YYYY-MM-DD  —  tags: file/path.ts, concept, other-concept

**Task:** one-sentence summary of what was being done.

**Initial mistake:** what the agent did first that was wrong.

**Correct pattern:** what should have been done instead.

**Rule:** one-line actionable rule, imperative mood.
```

## Tagging rules

- Every file path touched in the task.
- Every domain concept named in the spec (e.g. `session`, `auth`, `rate-limit`).
- No generic tags (`bug`, `test`) — those are implied.

## When to write a lesson

Only when the task had a non-trivial initial mistake. A clean task produces no lesson. Noise hurts more than silence.

---

<!-- lessons below this line -->
