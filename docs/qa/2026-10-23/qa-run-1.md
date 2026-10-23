# QA run 1: the whole app on main

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only
- Scope: the whole app on main, run while the QA harness was added (`4682d28`, `2129a1b`)
- Verdict: **PASS WITH NOTES**. No blockers. The 9 open findings below were each fixed in their own
  commit; see the [findings table](findings.md).

This is the triaged list as it was handed over for fixing.


Verdict: PASS WITH NOTES. No blockers. `check --no-fix` and `smoke` are green.
Fixed in the two harness commits: docs drift, PLAN ticks, `retry: 0`, ESLint destructuring gap,
verify-on-stop now also triggers on `.mjs`.

Not fixed yet (owned by the tree, list or form work, or a design call):

1. [major] Background task-name lookups (useTaskNames, `background` lane) can take about 11 of the
   14 tokens per window, because the reserve is only 3. Expands and paging then wait past
   maxWaitMs and get 429 countdowns. This contradicts the task-2 plan ("never delay a page change").
   Fix: run background only while remaining > budget/2, or cap lookups per page view, plus a limiter test.
2. [major] Phase 4 ACs are ticked without tests: paging back costs 0 upstream calls, the URL
   survives back/forward, tasks/[id] uses the background lane with a 30 s 404 memo, and an oversized
   page is rejected before any upstream call (the current test only parses the schema).
3. [major] The limiter tests are weaker than their names. The "never more than budget" test uses
   only the background lane. The "gives up on persistent 429" test doesn't assert the fetch count (it
   exits through maxWait, not maxRetries). There's no Retry-After: 3 end-to-end test.
4. [minor] useTimeEntries: two watchers both call load() on a page change, so the BFF gets 2
   requests (upstream gets 1, thanks to coalescing). Not reproduced at runtime.
5. [minor] A failed catalog refresh shows no message (useCatalog.refresh and ClientTree have no catch).
6. [minor] ClientTree.vue is 242 lines and EntriesTable.vue is 214 (the guideline is about 200).
7. [minor] TreeRow shows Retry for UPSTREAM_AUTH. api-error.ts maps a client Zod failure to
   "Couldn't reach the server". The EntriesPanel highlight timeout is never cleared. The ticking `now`
   re-renders every TreeRow.
8. [minor] The SWR catalog refresh runs in the interactive lane (server/utils/catalog.ts:11).
9. [minor] isoTimestampSchema in shared/schemas/timeEntry.ts accepts strings with no offset. Task 3
   must not reuse it for input (hard rule 4).

Rejected: "POST is auto-retried after 429". A 429 means the upstream didn't apply the write, so a
retry is safe. The README and qa.md now say "no retry after a network error or 5xx" instead.
