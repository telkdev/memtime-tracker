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

None of these touched the real API: the cloud sandbox can't reach it, and the real key was never
in it (it lives in `.env` on the developer's machine). The smoke test uses a random throwaway
key. Before committing, every file here was scanned for that smoke key, for `Bearer` tokens, and
for an `NUXT_MEMTIME_API_KEY=` with a value; see the scan line at the end of `smoke.log`.

| Date | Rounds | Result |
|---|---|---|
| [2026-10-23](2026-10-23/findings.md) | 6 QA runs; 50 findings (47 from QA, 3 while merging): 48 fixed, 2 kept on purpose with the reason written down | [findings](2026-10-23/findings.md), [acceptance criteria](2026-10-23/acceptance.md) |
