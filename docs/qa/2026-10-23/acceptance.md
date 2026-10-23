# Acceptance criteria and their evidence (2026-10-23)

Every acceptance criterion from the three task plans, and what proves it on main after all the QA
fixes. "Test" names are the exact `it(...)` titles, findable in [tests.log](tests.log); "smoke"
names are checks in [smoke.log](smoke.log). Status is one of:

- **Met**: a test or smoke check proves it.
- **Built, not proven**: the code is there, but nothing here can prove it (no real browser, no
  real upstream). Said plainly instead of ticked.

## Task 1: client → project → task tree

| Criterion | Status | Evidence |
|---|---|---|
| First load makes 1 upstream call; expand → 1; collapse and re-expand → 0 | Met | `ClientTree.test.ts` "loads only clients on mount, then one level per expand, and nothing on re-expand" |
| 20 rapid expands: no error toasts; nodes past the budget count down and fill in by themselves | Met | `ClientTree.test.ts` "shows a waiting countdown on 429 and retries by itself"; `rate-limiter.test.ts` "never runs more than the budget in any window, with 50 callers across all lanes"; smoke "burst: every reply is data or 429 with retryAfter", "upstream never answered 429" |
| Tree usable by keyboard alone; screen reader gets level and expanded state | Met (keyboard, ARIA) / Built, not proven (real screen reader) | "supports full keyboard navigation and Enter on a task emits log", "keeps keyboard focus when the loading row it sits on resolves", `tree-rows.test.ts` "sets aria positions within each sibling group". No screen reader was run. |
| Every node has loading, waiting, error (with Retry), empty and "load more" states | Met | `tree-rows.test.ts` "shows per-node status rows: loading, waiting, error, empty and load more", "offers Retry on an error row, except when the server key was rejected" |
| Invalid key shows "Server is misconfigured"; key in no response, log or bundle | Met | "shows no Retry for a misconfigured server key…", "never leaks the key through upstream error messages or logs"; smoke "client bundle has no API key or key config name", "server log never contains the key"; key grep over git history and these logs: 0 hits |
| `npm run check` passes; CI green | Met (check) / Not run (CI) | [check.log](check.log). The repo is not pushed to GitHub yet, so CI has not run. |

## Task 2: time entries list

| Criterion | Status | Evidence |
|---|---|---|
| `?page=3&size=25` survives reload and back/forward; invalid values corrected | Met | "requests the page and size from the URL", "follows back and forward through pages via the URL", `entries.test.ts` "flags URLs that need correcting" |
| Local times match UTC (fixed TZ, DST day, midnight crossing) | Met | `time.test.ts` "converts a summer/winter local time to UTC", "groups by the local day, not the UTC day", "detects an entry that crosses local midnight" (TZ Europe/Berlin) |
| Opening the list: 1 upstream call; a page seen within 15 s: 0 | Met | "sends one request per page change, not one per watcher", "shows an already-seen page again without asking the server (within the cache TTL)" |
| Task names from the tree with no extra calls; unknown tasks ≤ 1 background call each, never block paging | Met | "takes task names from the loaded tree without asking the server", `task-lookup.test.ts` (background lane, 30 s memo of a 404), "caps background work at half the window, so user actions never wait behind name lookups" |
| The list never fetches the catalog on its own | Met, weakly tested | The list reads names only from the tree's existing state (`useState('catalog:nodes')`) and `/api/tasks/:id`; `EntriesPanel.test.ts` registers no catalog endpoint. No test asserts zero catalog calls directly. |
| No BFF response contains `userId` or the key | Met | "never returns the API key or a userId field"; smoke "time entries have no userId field", "GET /api/time-entries/:id returns the entry without userId or key" |
| Every row opens edit by click and keyboard; empty, past-the-end, loading, waiting, error states | Met | "links every row to its edit page with an accessible Edit button", "shows the empty state with a call to action on page 1" |
| `npm run check` passes | Met | [check.log](check.log) |

## Task 3: create and edit form

| Criterion | Status | Evidence |
|---|---|---|
| Keyboard only: recent task, `1h30`, comment, save, under 10 s | Built, not proven | Focus path task → duration → comment → Ctrl+Enter is in `EntryForm.vue`; not timed in a real browser |
| End before Start can't happen; End ≤ Start rolls to the next day with a badge | Met | "moves an end at or before the start to the next day (23:00 to 01:00)", "never puts End before Start…", "keeps End and duration in sync both ways", "updates the duration field when End is edited, and End when the duration is" |
| 23:00 + 2h on 2026-10-22 saves `21:00Z` → `23:00Z` | Met | "sends UTC timestamps derived from local start and duration", "saves 23:00 to 01:00 as two hours ending the next day" |
| 02:30 on 2026-03-29 shows the gap hint and can't be saved | Met | "reports a time inside the spring-forward gap instead of shifting it", "blocks saving a start time inside the DST gap and offers the fix" |
| 02:30 on 2026-10-25 offers first/second; they save as different instants | Met | "offers both occurrences of a time repeated when clocks fall back", "keeps an end in the repeated hour on the same night when the start is the second occurrence" |
| A 404 on update offers "Create as new entry" with all values kept | Met | "offers create-as-new after a 404 on update, keeping every value" |
| A 400 field error shows by its field; `Invalid JSON body` shows the summary | Met | "puts a server field error next to that field", "attaches an upstream 400 that names a field to that field"; smoke "POST invalid JSON → 400 BFF shape" |
| Double-click Save sends one request; the BFF coalesces duplicates | Met | "sends exactly one request when save is clicked twice", "sends one upstream request for a double-submitted create" |
| A POST network failure is not retried and says it may not be saved | Met | "does not retry a create after a network failure, because it might have been saved" |
| Invalid input costs 0 upstream calls | Met | "shows field errors only after the first save attempt, and sends nothing"; smoke "invalid POST costs no upstream call", "oversized page costs no upstream call" |
| `npm run check` passes | Met | [check.log](check.log) |

## Not proven here, on purpose

- Real-browser checks: keyboard timing, visible focus, contrast, screen-reader output. There is no
  browser test in this repo yet (Playwright is the next step in the README).
- Real upstream behaviour. The sandbox can't reach the Memtime API; smoke runs against a local
  mock with a random key.
- CI. Nothing is pushed to GitHub yet.
