# QA run 5: the fixes for QA run 4

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only, fresh context
- Scope: commits `d5875fb..2f7061c` (15 commits, `a4edc6d` → `2f7061c`), the fixes for [QA run 4](qa-run-4.md)
- Verdict: **PASS WITH NOTES**. 13 of 15 earlier findings resolved, 2 partial. 9 new findings
  (2 major, 7 minor), all fixed afterwards in `1abdf2e`…`72b9513` (see the [findings table](findings.md))
  and checked in [QA run 6](qa-run-6.md).

Checks: `check --no-fix` ✓ (`✓ lint (4.3s)` · `✓ typecheck (9.2s)` · `✓ test (13.5s)`) · smoke ✓
(`29 of 29 smoke checks passed or skipped`, none skipped). Flake check: `npx vitest run` three
times, each `Test Files 23 passed (23)`, `Tests 229 passed (229)`, no unhandled errors.

Finding 2 was true at the time of the review: `docs/qa/` was written but not yet committed. It is
committed now, which is the fix.

The report below is as the subagent returned it, trimmed: line numbers and repeated detail removed.

---

1. **[major] After a Date change clears the End error, the End input keeps showing the rejected
   time, which is not the time that gets saved.** `endInput` in EntryTimeFields is only re-synced
   by `watch(f.endTime)`. `setDate` leaves the wall-clock end string unchanged, so the watcher never
   fires. Start 08:00, duration 1h30, End 08:00 (refused), then change Date: the error goes away,
   End still reads 08:00, and Save sends 08:00 to 09:30. Worked out from the code, not run in a
   browser.
   Fix: re-sync `endInput` when Date, Start or duration change; add a component test.
2. **[major] The README links QA evidence that is not in the repo.** `docs/qa/` isn't tracked.
   Fix: commit `docs/qa/`.
3. [minor] task-3-form.md still says a PUT 404 maps to `ENTRY_NOT_FOUND` (it is `NOT_FOUND`), "id
   must be a positive int" (0 is accepted on purpose), the client uses `refreshNuxtData` (it uses
   `invalidate()` plus `clearNuxtData`), and "End ≤ Start rolls to the next day" (End = Start is
   now refused), the last one in a ticked acceptance criterion.
4. [minor] `tests/fixtures/errors.json` says its bodies are "as documented", but API_NOTES has no
   429 or 500 body text. `rateLimited` and `entryNotFoundPut` are unused.
   Fix: mark those bodies as assumed; use the two fixtures in tests.
5. [minor] The "Log as a new entry" heading after a 404 has no test, and the browser tab still
   says "Edit entry".
6. [minor] After a create, or an update that moves Start, the highlighted row may not be on the
   page the list opens (the list is sorted by `start`, so a backdated create isn't on page 1). The
   toast still confirms the save.
   Fix: accept it and say so, or show a hint.
7. [minor] The End == Start check compares wall-clock text, so it refuses a valid one-hour entry
   in the repeated fall-back hour (Start 02:15 first occurrence, End 02:15 on 25 Oct 2026).
8. [minor] The useEntrySources docblock says "nothing here triggers a request", but it starts
   background `/api/tasks/:id` lookups.
9. [minor] The smoke check "invalid POST costs no upstream call" compares the limiter's
   `remaining`; if the 60 s window resets between the two reads, it passes even if a call was
   spent. "oversized page costs no upstream call" has the same weakness.
   Fix: count upstream requests instead.

Not checked: the fixes in a real browser (no Playwright here); finding 1 is from reading the code.
The test teardown fix (`afterEach` 20 ms delay) is a timing heuristic: 3 clean runs, not tried
under CPU load.

## Previous findings (QA run 4)

1. RESOLVED: `setDate`/`setStartTime` clear the End error. The End box display goes stale (new #1).
2. RESOLVED: the list position is remembered and returned to. Backdated creates are left over (new #6).
3. RESOLVED: "Task ID" and "Created At" headers; `#id` shown next to the name.
4. RESOLVED: smoke covers invalid POST at zero cost, GET by id, successful PUT and GET 404; the
   edit-mode network copy, a FetchError-shaped failure and the deep-link 404 are tested. The
   zero-cost check is weak (new #9).
5. RESOLVED: plan checkboxes ticked, keyboard criterion left open with a reason. One ticked
   criterion's wording is wrong (new #3).
6. RESOLVED: second occurrence picked when it falls after the start.
7. RESOLVED: button tested; the heading isn't (new #5).
8. RESOLVED: deep-linked task name looked up once.
9. RESOLVED: `0x10`, `1e2`, `1.0`, ` 5`, `-1` all rejected.
10. RESOLVED: the snapshot is taken before the await.
11. RESOLVED: no `toISOString` or `getTimezoneOffset` outside time.ts.
12. RESOLVED: EntryForm 127 lines; `utcTimestampSchema` used; Date has its own error.
13. PARTIAL: four task-3-form.md statements remain (new #3); README links uncommitted docs (new #2).
14. PARTIAL: two fixtures unused, two bodies undocumented (new #4).
15. RESOLVED: the task-404 mapping is marked as an unverified fallback.
