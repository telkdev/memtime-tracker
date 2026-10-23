# QA evidence

Each dated folder holds the full record of one QA round, committed so reviewers can see what was
checked, not only that it was:

- `qa-run-N.md`: the report of the read-only `qa` subagent (`.claude/agents/qa.md`, run with
  `/qa`), which reviews a change in a fresh context against the hard rules and the plan.
- `findings.md`: every finding, the commit that fixed it, and the test or check that proves it.
- `acceptance.md`: every acceptance criterion from the plans, with the test or smoke check that
  proves it, and what could not be proven here.
- `check.log`: full output of `npm run check -- --no-fix` (lint without autofix, typecheck, tests).
- `tests.log`: every test by name (`vitest --reporter=verbose`).
- `smoke.log`: `npm run smoke`, the built app against the local mock API.

None of these touched the real API. The smoke test uses a random throwaway key, and every log
was scanned for the real key before it was committed.

| Date | Rounds | Result |
|---|---|---|
| [2026-10-23](2026-10-23/findings.md) | 6 QA runs, 45 findings (43 fixed, 2 accepted with a reason) | all fixed or accepted; [acceptance criteria](2026-10-23/acceptance.md) |
