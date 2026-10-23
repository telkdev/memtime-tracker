# QA findings and how each was fixed (2026-10-23)

Every finding from the six QA runs, the commit that fixed it, and how the fix was verified.
"Fails without the fix" means the test was run against the old code and seen to fail.

| Run | Scope | Verdict | Findings |
|---|---|---|---|
| [1](qa-run-1.md) | whole app on main (Tasks 1–2) | PASS WITH NOTES | 3 major, 6 minor |
| [2](qa-run-2.md) | the fixes for run 1 | PASS WITH NOTES | 1 major, 3 minor |
| [3](qa-run-3.md) | the fixes for run 2 | PASS WITH NOTES | 5 minor |
| [4](qa-run-4.md) | whole app after merging the form (Task 3) | PASS WITH NOTES | 4 major, 11 minor |
| [5](qa-run-5.md) | the fixes for run 4 | PASS WITH NOTES | 2 major, 7 minor |
| [6](qa-run-6.md) | the fixes for run 5 | see report | see report |

Plus two found outside a QA run: the End-field review point (below) and a 500 on malformed JSON
that `npm run smoke` caught right after the merge.

## Run 1

| # | Sev. | Finding | Fix commit | Verified by |
|---|---|---|---|---|
| 1 | major | Background task-name lookups could use about 11 of the 14 requests per window, so expands and paging hit 429 countdowns | `60856da` cap background lookups at half the window | `rate-limiter.test.ts` "caps background work at half the window…" (20 lookups queued, 7 run, then 7 user actions start at once; under the old rule 11 would run) and "lets background use less than its share when the upstream says the budget is low". Run 2: RESOLVED |
| 2 | major | Phase 4 acceptance criteria ticked without tests | `fd36524` cover the Phase 4 acceptance criteria | `EntriesPanel.test.ts` "shows an already-seen page again without asking the server", "follows back and forward through pages via the URL"; `task-lookup.test.ts` (background lane, 30 s 404 memo); smoke "oversized page costs no upstream call". Run 2: RESOLVED |
| 3 | major | Limiter tests weaker than their names | `ab9fe45` make the limiter tests prove what their names say | All-lanes budget test; maxRetries exit (4 fetches) vs wait-limit exit (3 fetches); `Retry-After: 3` test. Run 2: RESOLVED |
| 4 | minor | A page change sent 2 BFF requests | `09dbc9e` send one request per page change | "sends one request per page change" (fails without the fix: offsets `0, 25, 25`); "reloads the page on screen once when a write clears the cache". Run 2: RESOLVED |
| 5 | minor | A failed catalog refresh showed no message | `61d463a` tell the user when a catalog refresh fails | `ClientTree.test.ts` "says why a failed refresh changed nothing, keeps the tree, and clears once it works". Run 2: RESOLVED |
| 6 | minor | ClientTree.vue (242) and EntriesTable.vue (214) over ~200 lines | `c78c259` split ClientTree and EntriesTable | 191 / 167 lines; helpers tested in `entries-row.test.ts`. Run 2: RESOLVED |
| 7 | minor | Retry for UPSTREAM_AUTH; Zod failure as "Couldn't reach the server"; highlight timer never cleared; every TreeRow re-rendered each second | `943d6cd` four small tree and entries-list issues | `tree-rows.test.ts`, `ClientTree.test.ts` "shows no Retry for a misconfigured server key…", `api-error.test.ts`, highlight test (fails without the fix), `RetryCountdown.test.ts`. Run 2: RESOLVED |
| 8 | minor | SWR catalog refresh ran in the interactive lane | `a43bd90` run stale-while-revalidate refreshes in the background lane | `catalog-lanes.test.ts`, `cache.test.ts`. Run 2: RESOLVED (and found the regression in run 2 #1) |
| 9 | minor | `isoTimestampSchema` accepted timestamps with no offset | `a2cdd98` require a time zone; add a UTC-only input schema | `timestamp-schema.test.ts`. Run 2: RESOLVED |

## Run 2

| # | Sev. | Finding | Fix commit | Verified by |
|---|---|---|---|---|
| 1 | major | A cold load or Refresh could join a queued background refresh with no deadline and hang up to a minute | `6b43185` never make a waiting caller join a queued background refresh | `cache.test.ts` "never makes a waiting caller join a quiet revalidation that is still queued", "after invalidation, a new call neither reuses nor is overwritten by the old in-flight load". Run 3: RESOLVED |
| 2 | minor | Any `TypeError` reported as a connection problem | `8268dac` | `api-error.test.ts`. Run 3: RESOLVED |
| 3 | minor | Refresh error: unreachable 429 copy, never cleared | `8268dac`, test in `d5875fb` | "clears the refresh error once the clients load again through a Retry" (fails without the watcher). Run 3: PARTIAL → fixed in `d5875fb` |
| 4 | minor | Highlight test waited 4.2 s of real time | `8268dac` | Fake timers; still fails with the `clearTimeout` removed. Run 3: RESOLVED |

## Run 3

| # | Sev. | Finding | Fix commit | Verified by |
|---|---|---|---|---|
| 1 | minor | The refresh-error watcher had no test | `d5875fb` | New ClientTree test, fails without the watcher |
| 2 | minor | `force` doc comment out of date | `d5875fb` | Comment now matches the coalescing rule |
| 3 | minor | A superseded revalidation still spends its request | `d5875fb` | Kept on purpose (at most one background request per supersede); trade-off written in the comment |
| 4 | minor | `clear()` left in-flight loads | `d5875fb` | `cache.test.ts` "clear() also forgets in-flight loads" |
| 5 | minor | No tests for coalescing during a pending revalidation | `d5875fb` | `cache.test.ts` "coalesces cold and forced callers that arrive during a pending revalidation into one load" |

## Found while merging the form

| Finding | Fix commit | Verified by |
|---|---|---|
| Lint failed after the merge: the edit page called `$fetch` (banned in pages) | `31e0673` move the fetch into `useTimeEntry` | `npm run check` lint ✓ |
| A malformed JSON body on POST/PUT returned 500 instead of 400 (smoke caught it) | `383f144` answer a malformed JSON body with 400 | smoke "POST invalid JSON → 400 BFF shape" |
| Review point: the brief requires `end`; the form must have an editable End kept in sync with duration, never before Start | `cd1649e` prove End and duration stay in sync; refuse End equal to Start | `use-entry-form.test.ts` "keeps End and duration in sync both ways", "never puts End before Start…", "refuses an End equal to Start…" (fails without the fix); `entry-form.test.ts` "updates the duration field when End is edited, and End when the duration is" |

## Run 4

| # | Sev. | Finding | Fix commit | Verified by |
|---|---|---|---|---|
| 1 | major | A stale End error blocked saving after Start or Date changes | `a4edc6d` | `use-entry-form.test.ts` "drops a stale End error when Start or Date changes…" |
| 2 | major | After a save the list always opened at page 1, default size | `065430b` return to the list page the user came from | `entries-row.test.ts` "listReturnQuery" (update → same page + highlight, create → page 1 at same size, cancel → same page); `EntriesPanel.test.ts` "remembers the page on screen…" |
| 3 | major | Task ID and Created At columns not visible as named | `32b0695` | `EntriesPanel.test.ts` "shows the brief's columns, and the task id even once the name is known" |
| 4 | major | Risky Task 3 paths untested | `1d137aa` | smoke: "invalid POST costs no upstream call", "GET /api/time-entries/:id returns the entry without userId or key", "PUT existing entry → 200 with the updated entry", "GET unknown entry → 404 NOT_FOUND" (29 checks); `use-entry-form.test.ts` "on an update the server can't answer…", FetchError-shaped create failure; `edit-page.test.ts` (missing and malformed id) |
| 5 | minor | Plan checkboxes out of date | `0bc3e0f` | Ticked where code and tests show it; left open with a reason where not (see [acceptance.md](acceptance.md)) |
| 6 | minor | End in the repeated fall-back hour jumped to the next day | `7882c24` | `time-input.test.ts` "keeps an end in the repeated hour on the same night when the start is the second occurrence" |
| 7 | minor | "Save & log another" after "Create as new" acted like Save; heading said Edit | `1d137aa` | `entry-form.test.ts` "offers 'Save & log another' only on a form that was opened to create" |
| 8 | minor | Deep-linked edit never looked up the task name | `dbcb167` | `entry-sources.test.ts` "looks up the name of a deep-linked task that nothing else has loaded" |
| 9 | minor | Id params accepted `0x10` and `1e2` | `55760f0` | `id-schema.test.ts` |
| 10 | minor | Edits typed during a save were marked saved | `acbf6b3` | `use-entry-form.test.ts` "keeps edits typed while a save is in flight marked as unsaved" |
| 11 | minor | Time conversion outside `time.ts` | `a613c7b` | `time.test.ts` "instant helpers" |
| 12 | minor | EntryForm 251 lines; own `utcIso`; Date error under Start | `837183f` | EntryForm 127 lines (EntryTimeFields, FormWarnings); `use-entry-form.test.ts` "reports an impossible date under Date, not under Start" |
| 13 | minor | Docs drift (CLAUDE.md, task-3 plan, smoke header, README) | `0bc3e0f`, `1d137aa`, `2f7061c` | README now has How it works, Trade-offs and known limits, What I'd do next |
| 14 | minor | No 400/404/429 fixtures | `72e7730` | `tests/fixtures/errors.json`, used by the error-mapping test |
| 15 | minor | Unverified task-404 write mapping | `0feea90` | Marked as an unverified fallback in the code |
| – | – | Not a QA finding: a 1-in-5 test teardown warning in `entry-form.test.ts` | `fbd2519` | 8 of 8 full runs clean afterwards |

## Run 5

| # | Sev. | Finding | Fix commit | Verified by |
|---|---|---|---|---|
| 1 | major | After a Date change cleared a refused End, the End box still showed the refused time, not the one saved | `1abdf2e` | `entry-form.test.ts` "shows the End that will be saved once a Date change clears a refused End" (fails without the fix: `expected '09:00' to be '10:30'`) |
| 2 | major | README linked `docs/qa/`, which wasn't committed yet | the docs/qa commit | `git ls-files docs/qa` |
| 3 | minor | task-3-form.md: `ENTRY_NOT_FOUND`, "positive int", `refreshNuxtData`, "End ≤ Start rolls" | `72b9513` | Plan now matches the code |
| 4 | minor | Fixtures claimed undocumented 429/500 bodies; two fixtures unused | `69ec446` | `_source` marks them assumed; `memtime-client.test.ts` uses `rateLimited`, `time-entry-writes.test.ts` uses `entryNotFoundPut` |
| 5 | minor | "Log as a new entry" heading untested; tab title stayed "Edit entry" | `feed5d1` | `edit-page.test.ts` "turns the heading into a create after a 404 on save…" (fails without the `mode` event); the tab title follows `mode` (not asserted) |
| 6 | minor | A backdated create or a moved edit may land off the page the list opens, so no highlight | `72b9513` | Accepted and written down: task-3-form.md "Known limits", `listReturnQuery` docblock. The toast confirms the save. |
| 7 | minor | End = Start refused in the repeated fall-back hour, where it means one hour | `9e74c5c` | `use-entry-form.test.ts` "accepts an End equal to Start in the repeated fall-back hour as one hour later" (fails without the fix: 1h30 stays) |
| 8 | minor | useEntrySources docblock said it never makes requests | `72b9513` | Docblock names the background task-name lookups |
| 9 | minor | Zero-cost smoke checks compared `remaining`, which a window reset can fool | `d0598c0` | The mock counts requests (`/__requests`); smoke asserts the count is unchanged |

## Rejected

- "POST is auto-retried after 429" (run 1): a 429 means the upstream did not apply the write, so a
  retry is safe. Only network errors and 5xx must not be retried, and they aren't.
