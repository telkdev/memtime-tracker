# Final code review (2026-10-26)

One `/code-review` run (high effort) over `app/`, `server/` and `shared/` on `05bb3be`, focused on the
merged create/edit `EntryEditor.vue`. Items from the [2026-10-24 review](../2026-10-24/code-review.md)
that were already fixed or kept on purpose are left out. Each finding was checked against the code.
After the fixes, four more `/code-review` runs looked only at the diff, until they found nothing
that mattered for a user.

## Fixed

| # | Finding | Sev | Fix | Test |
|---|---|---|---|---|
| 1 | After "Save & log another" the loaded entries were dropped and never loaded again, so the next entries got no Recent tasks and no overlap warning, not even against the entry just saved. | Medium | The form keeps its own copy of the entries it has seen plus the ones it saved (`useEntrySources`). The list cache is still dropped on every write. No extra request. | `entry-editor.test.ts`, browser check |
| 2 | Opened by a link or a reload, the form worked out its start before the entries arrived, so smart start always gave "now". | Medium | Once the entries are in, the start continues after today's last one, unless the user has set a time (a task or comment typed first doesn't count). | `entry-editor.test.ts`, `use-entry-form.test.ts`, browser check |
| 3 | A failed update that may have been applied left the list caches (server and client) as they were. | Low | Same rule as a create: unless the error proves nothing was applied, both caches are dropped. The codes live once in `shared/schemas/common.ts`. | `time-entry-writes.test.ts`, `use-entry-form.test.ts` |
| 4 | `POST /api/catalog/refresh` has no body, so it skipped the JSON-only check, and any site could trigger it. | Low (security) | `server/middleware/json-writes.ts` requires `application/json` on every API write. | `read-json-body.test.ts`, smoke, browser check |
| 5 | `ratelimit-remaining: 0` with `ratelimit-reset: 0` meant no pause, so queued calls went into the spent window. | Low | At least 1 s pause. | `rate-limiter.test.ts` |
| 6 | `CLAUDE.md` still named the removed `EditEntry`. | Docs | Names `EntryEditor`. | – |
| 7 | The task `parent` field was parsed and sent to the browser, but nothing read it. | Nit | Removed; task rows always carry project and client. | typecheck |

Found by the reviews of the fix itself, and fixed: a half-typed date or time is never overwritten
by the late start; after "Create as new entry" the form no longer warns about overlapping the
deleted entry it replaces; a rejected PUT no longer clears the create double-click guard.

## Kept

| Finding | Why |
|---|---|
| `sync()` keeps `used = max(...)` when it moves our window to the upstream's | It errs on the safe side (fewer requests, never a 429). It only shows up when another client spends the same key. |
| The server cache never evicts | Already in README → Known issues. |
| An update 404 without "time entry" in the message reads "Not found." | Not reachable: the real API says `Time entry #N not found`, and the form picks its text from the error code. |
| A write to an unknown `/api/` route without JSON gets 415, not 404 | The request is refused either way, and our own client always sends JSON. |

## How it was checked

- `npm run check -- --no-fix`: lint, typecheck and tests pass ([check.log](check.log), [tests.log](tests.log)).
- `npm run smoke`: 31 of 31 pass, including the two new catalog-refresh checks ([smoke.log](smoke.log)).
- New tests fail on `05bb3be` and pass now (7 regression tests, plus guard tests).
- Browser check (Playwright against the mock API, production build): direct `/entries/new`
  continues after today's last entry; "Save & log another" starts where the saved entry ended and
  warns about overlaps with it and with older entries; refresh answers 200 to JSON and 415 to a
  form post. 7 of 7 pass on the fix; on `05bb3be` 5 of 7 fail.
- Not checked: the real API (only reachable from the author's machine).
