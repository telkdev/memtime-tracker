---
description: Run the QA subagent on a change and triage what it finds
argument-hint: "[scope: commit range, branch, 'phase 5', or empty for current changes]"
---

Use the `qa` subagent to review this scope: $ARGUMENTS

If no scope was given, the subagent reviews the uncommitted changes plus this branch's commits
that aren't on `main`.

When its report comes back:

1. Show me the report as it is. Don't soften or reorder it.
2. For each blocker and major finding, check it yourself against the code before acting on it.
   The subagent can be wrong; say so when it is.
3. Fix the confirmed blockers and majors, each with a test where the finding is about behaviour.
   Then run `npm run check` and `npm run smoke`.
4. List the minor findings and ask me which ones to fix. Don't fix them unasked.
