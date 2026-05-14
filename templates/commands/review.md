# /review — review a diff without editing

Use this command to review someone else's diff (PR, branch, working tree) without making changes.

## Flow

1. Get the diff. `git diff <base>...<head>` or the PR diff URL.
2. Run `node ./.agent-boost/scripts/retrieve-lessons.mjs "<files touched>"` — past lessons often flag the exact class of mistake you are reviewing for.
3. Read `CODEMAP.md` for the files in the diff. Compare: did the diff change coverage? Call count? Introduce new exceptions?
4. Read the diff file by file. For each hunk, ask:
   - Does this match the spec (if given)?
   - Does this match existing patterns in the file and neighbors?
   - Is anything tested? Is coverage preserved or improved?
   - Are there new dependencies, new I/O, new error paths?
   - Is the blast radius of each changed file acknowledged?
5. Write the review. Structure:

   ```markdown
   # Review: <pr title / branch name>

   ## Blockers
   - <things that must change before merge>

   ## Suggestions
   - <things worth considering>

   ## Nits
   - <style / preference>

   ## Lessons applicable
   - L-042: <one-line hook> — relevant because <reason>
   ```

6. Do not mark as approved unless blockers is empty. "Approve with comments" is a pattern that hides blockers in comment noise.

## Usage

```
/review pr 1234
/review diff origin/main...HEAD
```
