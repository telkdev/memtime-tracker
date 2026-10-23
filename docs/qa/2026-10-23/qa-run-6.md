# QA run 6: the fixes for QA run 5

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only, fresh context
- Scope: commits `2f7061c..fcebc04` (`1abdf2e`, `9e74c5c`, `feed5d1`, `69ec446`, `d0598c0`,
  `72b9513`, `fcebc04`), the fixes for [QA run 5](qa-run-5.md), plus the committed `docs/qa/` files
- Verdict: **PASS WITH NOTES**. 8 of 9 earlier findings resolved, 1 partial. 5 new minor findings
  (one app edge case, four wording or test-strength issues), all fixed afterwards in `b7a2331`,
  `7f09d1d` and the commit that added the logs (see the [findings table](findings.md)). The final
  logs in this folder were produced after those fixes.

Checks: `check --no-fix` ✓ (`✓ lint (4.4s)` · `✓ typecheck (10.0s)` · `✓ test (13.2s)`) · smoke ✓
(`29 of 29 smoke checks passed or skipped`, none skipped). Flake check: `npx vitest run` three
times, each `Test Files 23 passed (23)`, `Tests 232 passed (232)`, no unhandled errors.
`git status` clean afterwards.

The report below is as the subagent returned it, trimmed: line numbers and repeated detail removed.

---

1. [minor] The End box can still show a refused time that won't be saved, the same class as run-5
   #1 but reached through Duration. `setDurationText` always clears the End error, even when the
   duration doesn't change, and the re-sync watcher only fires on a change. Start 09:00, duration
   1h, End 09:00 (refused), then click the "1h" chip again: the error clears, End still reads
   09:00, Save sends 09:00 to 10:00. Reasoned from the code, not run.
   Fix: clear the End error only when End actually moves, or re-sync whenever it clears.
2. [minor] acceptance.md Task 3 still claims "End ≤ Start rolls to the next day with a badge"; the
   plan now says End < Start rolls and End = Start is refused. The cited test covers the time
   helper, not the form.
3. [minor] docs/qa claims that say more than the evidence shows: the README totals assumed run 6
   had no findings; findings.md says "two" found outside a QA run but lists three; the run-5 #5
   row says the test fails without the fix, but the `@mode` handler already existed, so it is a
   missing test, not a bug fix; acceptance.md cites the summer/winter tests in the wrong file; the
   run-5 #2 row doesn't name its commit (`fcebc04`); the key-scan claims describe logs that don't
   exist yet.
4. [minor] The new fall-back test's `errors.end` assertion always passes before a submit (errors
   are empty until the first attempt). The test still fails without the fix via the duration.
   Fix: assert `isValid`.
5. [minor] The tab title says "Log new entry" while the heading says "Log as a new entry".

Not checked: nothing in a real browser. Possible smoke flake in the safe direction: a background
request in flight between the two `/__requests` reads would fail a zero-cost check (didn't happen,
not stressed). `.env` was not read; the grep for `memtimeApiKey|Bearer ` over app, shared, tests
and docs finds only the fake test key and docs prose.

## Previous findings (QA run 5)

1. PARTIAL: Date, Start, occurrence and duration changes re-sync End; the new component test fails
   without the fix. A duration entry that doesn't change the duration still left a stale End (new #1).
2. RESOLVED: `docs/qa` is committed (`fcebc04`).
3. RESOLVED: task-3-form.md says `NOT_FOUND`, "decimal integer (0 allowed…)", `invalidate()` +
   `clearNuxtData`, and "End < Start … End = Start is refused". acceptance.md lagged (new #2).
4. RESOLVED: assumed bodies marked; `rateLimited` and `entryNotFoundPut` are used.
5. RESOLVED: the heading switch is tested; the tab title follows `mode` but isn't asserted, and
   findings.md overstated the proof (new #3).
6. RESOLVED (accepted): written down in the plan's "Known limits" and the `listReturnQuery` docblock.
7. RESOLVED: End = Start is allowed only when the second occurrence is after Start; its error
   assertion is weak (new #4).
8. RESOLVED: the useEntrySources docblock names the background lookups.
9. RESOLVED: the mock counts requests; smoke checks the count is unchanged.
