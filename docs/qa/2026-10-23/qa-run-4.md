# QA run 4: the whole app, after merging the form (Task 3)

- Date: 2026-10-23
- Reviewer: the `qa` subagent (`.claude/agents/qa.md`), read-only, fresh context
- Scope: the whole app on main at `d5875fb`, Task 3 reviewed most closely (it had never been QA'd)
- Verdict: **PASS WITH NOTES**. Key safety, rate limit and error shape: nothing found. 4 major and
  11 minor findings, all fixed afterwards in `a4edc6d`…`2f7061c` (see the [findings table](findings.md))
  and checked in [QA run 5](qa-run-5.md).

Checks: `check --no-fix` ✓ (`✓ lint (4.4s)` · `✓ typecheck (11.1s)` · `✓ test (13.4s)`) · smoke ✓
(`25 of 25 smoke checks passed or skipped`, none skipped). Also checked: the built server started
with an empty key exits 1 with `[config] NUXT_MEMTIME_API_KEY is not set. Copy .env.example to .env
and add your API key.`

The reviewer's acceptance-criteria table at this point is superseded by
[acceptance.md](acceptance.md), which shows the state after the fixes.

The report below is as the subagent returned it, trimmed: line numbers and repeated detail removed.

---

1. **[major] A stale End error blocks saving after Start or Date changes.** `setDate`/`setStartTime`
   never clear `endError`. Probe: start 09:00, duration 1h, End 09:00 ("End must be after the start
   time."), then Start 08:00: End shows a valid 09:00, but `isValid` is false and the error stays.
   Same for an End-in-DST-gap error after changing Date.
   Fix: clear `endError` in `setDate`, `setStartTime` and `fixStartGap`, with a test.
2. **[major] After a save the list always opens at page 1 with the default size.** `useEntrySaved`
   navigates to `{ path: '/', query: { highlight } }`, dropping `page`/`size`, and the panel only
   highlights rows it loaded. Editing an older entry from page 3 loses the user's place.
   Fix: carry or remember the list position and return to it.
3. **[major] Two of the brief's columns don't appear as named: Task ID and Created At.** Once the
   task name is known the id is only in a `title` tooltip (unreachable for keyboard, touch and
   screen readers); the header reads "Created".
   Fix: show `#id` visibly and rename the header to "Created At" (cards likewise).
4. **[major] Risky Task 3 paths have no test.** No BFF test that invalid input costs 0 upstream
   calls (smoke only checks `?limit=1000`); no smoke GET by id or successful PUT; untested
   edit-mode network/5xx copy and deep-link 404 state; no component-level double-submit test; the
   "may not have been saved" test throws a plain `Error`, not an ofetch `FetchError`.
5. [minor] PLAN.md Phase 5 (8 boxes) and the task-3 plan's 11 ACs are all unticked though nearly
   all is built; Phase 3 "Enter / Log time → form" and Phase 6 "Security headers" are unticked but
   implemented.
6. [minor] DST: an End in the repeated fall-back hour after a "second occurrence" Start resolves to
   the next day (start 02:15 second, End 02:45 → 24h 30m, then blocked by the 24 h rule).
7. [minor] On the edit page, after "Create as new entry", "Save & log another" behaves like plain
   Save, and the heading still says "Edit entry #N".
8. [minor] On a deep-linked edit the task name is never looked up: the picker shows "Task #N"
   indefinitely and the toast has no task name.
9. [minor] Id params accept hex and exponent forms: `PUT /api/time-entries/0x10` overwrites #16,
   `/entries/1e2/edit` opens #100. Only crafted URLs can do this.
10. [minor] Edits typed while a save is in flight are marked as saved (the snapshot is taken after
    the response), and the leave guard is off while saving.
11. [minor] Some time conversion happens outside `app/utils/time.ts` (`toISOString()` in
    useEntryForm, local midnight via `new Date(y, m, d)` in entry-form.ts). Behaviour correct; the
    rule says only time.ts.
12. [minor] EntryForm.vue is 251 lines; `timeEntryInput.ts` defines its own `utcIso` instead of
    `utcTimestampSchema`; an invalid date is reported under Start.
13. [minor] Docs drift: CLAUDE.md still says "Task 3 adds …"; task-3-form.md mentions
    `UPSTREAM_REJECTED`, a PUT retry on 5xx and an "Open list in new tab" action that don't exist;
    smoke.mjs says write checks are skipped; the committed README has no architecture or
    trade-offs section.
14. [minor] Fixtures: only `clients.json` and `time-entries.json`; the 400/404/429 bodies are
    inline in tests.
15. [minor] Unverified: the "task not found → field error on Task" write mapping has no basis in
    API_NOTES (hard rule 7). Harmless as a fallback.

**Key safety, rate limit and error shape: nothing found.** The key grep finds only a test
assertion and docs prose. Every time-entry response goes through `timeEntrySchema`. Upstream error
text is redacted. All upstream calls go through `useMemtime()`; every client `$fetch` passes
`retry: 0`. A POST is never retried after a network error or 5xx; identical POSTs are coalesced
for 5 s. Lanes are correct. Malformed JSON gets a 400.

Not checked: keyboard-only "under 10 s", visible focus, contrast and screen-reader output in a real
browser (no browser, no Playwright); real upstream behaviour (not allowed); how Nuxt UI wires
`aria-describedby` into TaskPicker/DurationInput (tested only for the comment field).
