# QA run 2: the fixes for QA run 1

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only, in a fresh context. It did not write the code.
- Scope: commits `2129a1b..a2cdd98` (the 9 fix commits for [QA run 1](qa-run-1.md))
- Verdict: **PASS WITH NOTES**. All 9 earlier findings were resolved. It raised 1 new major and 3 new minors, all fixed afterwards in `6b43185` and `8268dac` and checked in [QA run 3](qa-run-3.md).

The report is as the subagent returned it, lightly trimmed: its line numbers pointed into its own
concatenated diff view, so they were removed, along with some repeated detail.

---

QA: commits `2129a1b..HEAD` on main (9 commits, a2cdd98…60856da) — PASS WITH NOTES

Checks: check --no-fix ✓ (`✓ lint (4.0s)` · `✓ typecheck (10.5s)` · `✓ test (13.3s)`) · smoke ✓ (`21 of 21 smoke checks passed or skipped`: 20 passed, 1 skipped, "POST /api/time-entries checks (route not implemented yet)"). The working tree was still clean after both runs.

1. [major] A user's cold catalog load or Refresh can join a background-lane SWR refresh that has no deadline. The request then stays open with no 429 and no countdown.
   server/utils/catalog.ts now runs the stale refresh in `background`. server/utils/rate-limiter.ts gives background jobs `maxWait = Infinity`. server/utils/cache.ts hands any later caller the pending promise, including a non-revalidating one and a `force` one. `invalidatePrefix` removes entries but not `inflight`. So after `POST /api/catalog/refresh`, `GET /api/clients` gets the queued background promise back. That promise can sit behind the 7-per-window background cap and the reserve until the window resets, which can take up to 60 s or longer. The same thing happens to an expand once an entry passes `staleUntil` while its refresh is still queued. Before this change the refresh ran in the interactive lane, where the 8 s maxWait turned this into a 429 with a countdown. I traced this in the code but did not reproduce it at runtime, and no test covers it.
   Why it matters: Refresh is most likely to be clicked when the data is stale, and that is exactly when it can now hang silently for up to a minute. This breaks the rule in `api-and-rate-limit.md`: "Past that, the BFF returns 429 with retryAfter instead of holding the HTTP request open."
   Fix: in `cache.load`, keep the in-flight revalidation apart from cold loads, so a non-revalidating or `force` caller starts its own interactive load instead of joining it. Also make `invalidate`/`invalidatePrefix` drop matching `inflight` keys. Add a cache test where a cold or forced call arrives while a revalidation is pending.
2. [minor] `parseApiError` treats any `TypeError` as "Couldn't reach the server".
   app/utils/api-error.ts — `if (name === 'FetchError' || err instanceof TypeError)`. ofetch wraps network failures in `FetchError`. A raw `TypeError` that reaches this point is almost always a bug in our own code. That brings back the kind of misreport that finding 7 asked to remove.
   Fix: drop the `instanceof TypeError` branch. Update tests/unit/api-error.test.ts accordingly.
3. [minor] The error message on a failed Refresh is stale and partly unreachable.
   app/components/tree/TreeToolbar.vue. The `RATE_LIMITED` branch can't happen in practice: `refresh.post.ts` makes no upstream call, and `useCatalog.load` catches its own errors. "Try again in 12s" is fixed text that never counts down. The message also stays visible until the next Refresh click, even after the tree has loaded successfully.
   Fix: clear `refreshError` once the tree loads, and either remove the 429 copy or use `RetryCountdown`.
4. [minor] The new highlight test waits on real time.
   tests/components/EntriesPanel.test.ts uses `await new Promise(r => setTimeout(r, 4200))`. That adds about 4 s to every test run.
   Fix: use fake timers with `advanceTimersByTime(HIGHLIGHT_MS)`.

Not checked: finding 1 was not reproduced in a running app. The PLAN AC "`?page=3&size=25` survives a reload" has no dedicated test; only back/forward is tested. The key grep is clean: the only hit is the fake `KEY` in the existing memtime-client test. Every time-entry route still goes through `timeEntrySchema`. There is no new `fetch(` in `server/`, and the client `$fetch` calls keep `retry: 0`.

## Previous findings (QA run 1)

1. RESOLVED — `backgroundCap = min(budget−reserve, floor(budget·0.5))` (7 of 14), tracked by `backgroundUsed`. Test: rate-limiter.test.ts "caps background work at half the window…" (7 background calls run, then 7 interactive start immediately) and "lets background use less than its share when the upstream says the budget is low". Under the old reserve-only rule the first test would see 11 calls, not 7.
2. RESOLVED — EntriesPanel.test.ts "shows an already-seen page again without asking the server" and "follows back and forward through pages via the URL". task-lookup.test.ts covers the background lane and the 30 s 404 memo. The oversized page is proven end to end by smoke ("oversized page costs no upstream call"). Small gap: the reload half of the URL AC.
3. RESOLVED — the budget test spreads 50 jobs over all lanes with a sliding-window check; "gives up after maxRetries" asserts 4 fetches; a new test asserts 3 fetches with `retryAfter: 15` when the wait limit ends the loop; "waits exactly Retry-After" covers `retry-after: 3`.
4. RESOLVED — the invalidation watcher reloads only if the page on screen was dropped. Tests: "sends one request per page change" and "reloads the page on screen once when a write clears the cache".
5. RESOLVED — TreeToolbar.vue catches the error and shows a `role="alert"` message, and the tree keeps what it had.
6. RESOLVED — ClientTree.vue 189 lines, EntriesTable.vue 167. Code moved into TreeToolbar.vue, EntriesCards.vue and tested helpers in app/utils/entries.ts.
7. RESOLVED — Retry hidden for UPSTREAM_AUTH (button and Enter); ZodError → UPSTREAM_INVALID; highlight timer cleared on re-run and unmount; each waiting row ticks its own clock through RetryCountdown.vue.
8. RESOLVED — `lane: revalidating ? 'background' : 'interactive'`. Tests: catalog-lanes.test.ts and cache.test.ts. (New major finding 1 covers a regression this introduced.)
9. RESOLVED — `z.iso.datetime({ offset: true })` rejects timestamps without an offset; new `utcTimestampSchema` (Z only) for Task 3 input. Test: timestamp-schema.test.ts.
