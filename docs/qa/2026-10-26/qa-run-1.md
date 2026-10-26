# Final QA run before submitting

- Date: 2026-10-26
- Commit under review: `8ddc9e3` (main), focus on `bc43e88..8ddc9e3`
- Reviewer: the read-only `qa` subagent (`.claude/agents/qa.md`), fresh context
- Result: **PASS WITH NOTES**. No blocker, no major, 5 minor findings.
- Logs: [check.log](check.log), [tests.log](tests.log), [smoke.log](smoke.log)

Each finding was checked against the code by the main agent before being recorded here.

## Report

Checks: check --no-fix ✓ · smoke ✓ (29 passed, 0 skipped)

1. [minor] After a create that may have been saved, the browser's own list cache is not cleared.
   `server/utils/time-entries.ts` clears the server cache in `finally`, but the client drops its
   loaded pages (`useEntrySaved.ts`, `invalidate()`) only after a successful save, and
   `useTimeEntries.ts` serves a page from memory for up to 15 s. "Check the list" opens a new tab
   with empty state, so that path works; Cancel or "Back to list" in the same tab may not show the
   entry within those 15 s. Fix: invalidate the client list cache when a create fails.
2. [minor] Two create failures where the entry may have been saved still offer "Try again":
   502 `UPSTREAM_INVALID` (upstream answered 2xx, body didn't match the schema) and 500
   `INTERNAL`. Fix: for a create, treat every error except VALIDATION, BAD_REQUEST, RATE_LIMITED
   and NOT_FOUND as "may have been saved".
3. [minor] `docs/plans/task-3-form.md` (Network or 5xx) and `.claude/rules/time-and-ux.md` still
   describe "+ Retry" for a failed create and say the new-tab action was left out. The code now
   shows "Check the list" in a new tab and no Retry.
4. [minor] README "Opening the page costs 1 request" is out of date: the index page mounts the
   tree and the entries list, so it is 2 requests plus background task-name lookups.
5. [minor] `docs/qa/README.md` says none of the QA runs touched the real API, but
   `2026-10-24/real-api-check.md` is a deliberate real-API run; the table lists only 2026-10-23.

## Checked and fine

- Leave guard on a same-route param change: update guards run before NuxtPage re-keys the page;
  query-only changes skip it; unit tests cover confirm, cancel, query-only and not-dirty.
- Server list cache is cleared on success and failure of a create, with a test.
- README "Node.js 22 or newer" matches `engines` and CI.
- Known issues in the README match the code.
- Key safety: no key or `Bearer` token in app, shared, tests or docs except fake test keys and
  doc examples; smoke confirms bundle, responses and server log are free of the key.
- Hygiene: no personal paths, emails, TODO/FIXME in tracked files.
- README guardrail and permission claims match `.claude/settings.json` and `CLAUDE.md`.

## Not checked

The two small form edge cases in Known issues (taken from the README). "Check the list" opening
a new tab in a real browser (only the component text is tested). The real API.
