# QA run 3: the fixes for QA run 2

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only, fresh context
- Scope: commits `a2cdd98..8268dac` (`6b43185`, `8268dac`), the fixes for [QA run 2](qa-run-2.md)
- Verdict: **PASS WITH NOTES**. 3 of 4 earlier findings resolved, 1 partial (a missing test). It raised 5 new minors. All were addressed in `d5875fb`; see the [findings table](findings.md).

Environment note: the reviewer's first smoke run saw a POST route that wasn't in scope and failed
one check. That was the main session briefly checking out the task-3 merge in the same working
tree while the reviewer ran, not a problem in the scope. The reviewer's rerun on the clean tree
passed 21/21. The failing check itself ("POST invalid JSON → 400") was real on the task-3 code,
and was fixed in `383f144` after the merge.

The report is as the subagent returned it, lightly trimmed (line numbers and repeated detail removed).

---

QA: commits `a2cdd98..HEAD` on main (6b43185, 8268dac) — PASS WITH NOTES

Checks: check --no-fix ✓ (`✓ lint (3.6s)` · `✓ typecheck (9.4s)` · `✓ test (10.6s)`) · smoke ✓ (`21 of 21 smoke checks passed or skipped`: 20 passed, 1 skipped, "POST /api/time-entries checks (route not implemented yet)")

1. [minor] The fix for finding 3 has no test that would fail without it. The ClientTree test clears the alert by clicking Refresh again, which `refreshError.value = null` at the start of `refresh()` already did. The new watcher on the root status only matters when the root reloads another way (a Retry on a root in `error` or `waiting`). Deleting the watcher would keep the suite green.
   Fix: add a case where the root failed, Refresh fails, then a root Retry succeeds; assert the alert is gone.
2. [minor] The doc comment for `force` in server/utils/cache.ts says it "still coalesces with an in-flight fetch". A `force` caller no longer joins an in-flight revalidation.
   Fix: "still coalesces with an in-flight cold load; never joins a background revalidation".
3. [minor] A superseded revalidation still spends its upstream request, and its result is dropped even when the load that replaced it fails. Bounded at one background request per supersede. Unverified at runtime.
   Fix: optional; otherwise note the trade-off in the comment.
4. [minor] `clear()` leaves `inflight` populated, unlike `invalidate` and `invalidatePrefix`. Tests that call `clear()` between cases can leak a pending load into the next one.
   Fix: call `inflight.clear()` in `clear()`.
5. [minor] No tests for coalescing during a pending revalidation, or for `force` during one.
   Fix: "two cold callers during a pending revalidation → cold loader called once", and the same with `force: true`.

Not checked: none of the cache races were reproduced in a running app; the analysis covered a superseded load overwriting a newer value, invalidation during a load, errors, and a revalidating caller joining a cold load, and found nothing beyond 3–5. Pre-existing and out of scope: a synchronously throwing loader would reject the stale path; `useCatalog.refresh()` cancels retry timers before the POST, so a failed POST leaves a `waiting` root countdown that never fires (a manual Retry works). Task 3's planned POST dedupe must keep its keys off the `time-entries:` prefix, since `invalidatePrefix` now drops in-flight entries. Key grep clean; no new `fetch(` in `server/`.

## Previous findings (QA run 2)

1. RESOLVED — a waiting caller, cold or `force`, only joins a pending load that is not a revalidation; `invalidate`/`invalidatePrefix` drop in-flight keys; a superseded or invalidated load neither overwrites the entry nor deletes the newer in-flight entry. Tests: cache.test.ts "never makes a waiting caller join a quiet revalidation that is still queued" and "after invalidation, a new call neither reuses nor is overwritten by the old in-flight load". Plain coalescing still passes.
2. RESOLVED — only `name === 'FetchError'` maps to UPSTREAM_UNAVAILABLE; a bare TypeError is INTERNAL (api-error.test.ts).
3. PARTIAL — the unreachable 429 copy is gone and a watcher clears the message when the root loads, but no test proves the watcher (new finding 1).
4. RESOLVED — the highlight test uses fake timers and runs in 138 ms (was about 4.2 s); it still fails if unmount stops clearing the timer.
