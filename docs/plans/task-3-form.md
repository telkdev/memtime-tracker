# Task 3: Create and update time entry form

The goal is a form where logging a normal entry takes under 10 seconds with the keyboard, where
the common mistakes (end before start, wrong day after midnight, DST, double submit) can't slip
through silently, and where every failure keeps the user's values and says what to do next. This
plan builds on the scaffold, limiter, cache and `memtime.ts` from Task 1, and on `useTimeEntries`
and the entries list from Task 2. It reuses them and changes them only where noted.

## Request budget

| Action | Upstream calls |
|---|---|
| Open "Log time" (`/entries/new`) | **0** (defaults come from data already loaded) |
| Open edit from a list row | **0** (prefilled from the list cache) |
| Open edit from a deep link or reload | **1** (`GET /time-entries/:id`), +1 background task lookup if the task isn't in the catalog |
| Save (create or update) | **1** (write lane), then the list cache is invalidated: +1 when the list is shown again |
| Validation error caught locally | **0**. The BFF validates before spending budget. |

So a create costs 2 calls end to end, and an edit started from the list costs 2.

## Form model

The user edits **local wall-clock values**; UTC exists only at the edge.

```
date: 'YYYY-MM-DD'   startTime: 'HH:mm'   durationMs: number   comment: string   taskId: number | null
```

`end` is **derived**: `start + duration`. The End time field is shown and editable, with a `+1 day`
badge when it falls on a later date. This one choice removes the midnight bug class: typing
23:00 → 01:00 means "2 hours", never "−22 hours" or "ends yesterday".

Sync rules (the same ones Toggl and Harvest use, so they feel familiar):
- Change **Start** → duration stays, End moves.
- Change **Duration** → End moves.
- Change **End time** → duration is recomputed. If End ≤ Start on the same date, it rolls to the
  next day (shown by the badge). End is never before Start by construction.
- "Until now" button next to End sets End = now (rounded to the minute).

Why not separate end date input: in practice it's the field people forget to change, which
produces zero-length or negative entries. Entries over 24 h are blocked (see validation), so a
`+1 day` badge covers every valid case.

## `app/utils/time.ts` (pure, test-first)

- `toUtcIso(date, time): { iso, issue?: 'gap' | 'ambiguous', alternatives? }`
  Builds the instant with `new Date(y, m - 1, d, hh, mm)` (per the rules, no offset maths).
  - **DST gap** (spring forward, e.g. 02:30 on 29 Mar 2026 in Berlin): the constructed Date reads
    back a different local hour. Return `issue: 'gap'` → the form shows "02:30 doesn't exist on
    29 March, clocks jump to 03:00. Use 03:30?" with a one-click fix. **Saving is blocked** until
    the user accepts or changes it.
  - **DST overlap** (fall back, e.g. 02:30 on 25 Oct 2026, today's weekend): the same wall time
    exists twice. Detect by checking whether `instant ± 1h` reads back the same wall time. Default
    to the first occurrence and show a small choice: "02:30 happens twice tonight: first (CEST) /
    second (CET)". Not blocking, because the default is almost always what people mean.
- `fromUtcIso(iso): { date, time }` for prefilling edits.
- `parseDuration(text): number | null` (milliseconds, to match Task 2's `formatDuration(ms)`). Accepts `1h 30m`, `1h30`, `1:30`, `90m`,
  `1.5h`, `1,5h` (comma decimals, since the app is likely used in Germany), and bare numbers
  (see below).
- `formatDuration` is Task 2's (`ms` → `1h 30m`); reused, not duplicated.
- `roundDown(date, 15)`.

**Bare numbers** (`2`, `1.5`, `90`): a decimal or a whole number up to 12 means hours, anything
larger means minutes. So `2` is 2h and `90` is 1h 30m. The input **always shows the parsed value
next to it** ("= 1h 30m") before it's committed. The live preview matters more than the exact rule, because it makes any guess visible.
Junk input keeps the last valid value and shows "Try 1h 30m, 1:30 or 90m".

Tests (fixed `TZ=Europe/Berlin`): round trip for normal times; 23:00 + 2h → next day in UTC;
gap at 02:30 on 2026-03-29; overlap at 02:30 on 2026-10-25 (both occurrences produce different
UTC instants 1 h apart); every duration format plus junk.

## Shared schema: `shared/schemas/timeEntry.ts`

Adds `TimeEntryInput` next to Task 2's `TimeEntry` output schema (it doesn't replace it):

```ts
TimeEntryInput = z.object({
  taskId: z.number().int().positive(),
  comment: z.string().trim().min(1, 'Add a short comment').max(500),
  start: z.iso.datetime(),  // UTC with Z
  end: z.iso.datetime(),
}).superRefine(...)  // end > start → path ['end']; end - start ≤ 24 h → path ['end']
```

The form and the BFF use the same schema, so a field error message is identical in both places.
The 500-char cap and 24 h cap are **our** rules (the API documents neither); the README says so.

## Server (BFF)

### Limiter: add the `write` lane
`rate-limiter.ts` gets a third lane, ordered `write > interactive > background`, as Task 1's
design left room for. A save queued behind ten tree expansions goes first. This is the only change
to a shared piece; it comes with its own limiter test.

### Routes
- `POST /api/time-entries` → validate with `TimeEntryInput` **before** the limiter (400 with
  `fields`, 0 budget) → upstream `POST` (expects 201) → strip `userId` → 201 `{ entry }`.
- `PUT /api/time-entries/:id` → same validation, id must be a positive int → upstream `PUT` → 200.
- `GET /api/time-entries/:id` → for deep links. May already exist from Task 2; reuse if so.
- On any successful write: invalidate the `time-entries` cache prefix.

### Retry policy for writes (different from reads, on purpose)
- **429** → retry is safe (the request wasn't processed). Same backoff as reads.
- **PUT** on 5xx or network error → safe to retry once (PUT is idempotent).
- **POST** on 5xx, timeout or connection reset → **never retried automatically**. The upstream has
  no idempotency key, so a retry could create a duplicate entry. The error says so (below).
- **Duplicate-submit guard**: the BFF coalesces identical POST bodies that arrive within 5 s into
  one upstream call (the cache's in-flight map, keyed by a body hash). This catches double clicks
  and a second tab, on top of the client-side guard.

### Error mapping (adds to `server/utils/errors.ts`)
| Upstream | BFF | User sees |
|---|---|---|
| our Zod failure | 400 `VALIDATION`, `fields` | message under each field |
| 400 `Invalid JSON body` | 400 `UPSTREAM_REJECTED` | "The server rejected this entry. Nothing was saved." (and log it: from our UI this means a bug in the BFF) |
| 400 other text | 400 `UPSTREAM_REJECTED`, `fields` via a small lookup (`taskId`, `start`, `end`, `comment` mentioned in the text) | field message, or the summary with the server's reason |
| 404 `Time entry #N not found` | 404 `ENTRY_NOT_FOUND` | see the 404 flow below |
| 404 `Unknown user` | 502 `UPSTREAM_AUTH` | "Server is misconfigured" (from Task 1) |
| 429 after retries | 429 `RATE_LIMITED`, `retryAfter` | countdown, auto-retry once |
| 5xx / network | 502 `UPSTREAM_UNAVAILABLE` | see below |

## UI

### Components
- **`TaskPicker.vue`** (Nuxt UI `UInputMenu`, combobox ARIA for free). Groups, in order:
  1. **Recent**: distinct task ids from the loaded entries, newest first, up to 8. No request.
  2. **Catalog**: everything in `useCatalog().taskIndex`, labelled `Client › Project › Task`,
     filtered by any part of the path.
  3. **"Browse all clients…"**: opens a `USlideover` with the Task 1 tree in select mode. Picking
     a task there closes it and fills the picker.

  A task that isn't in the catalog (for example on a deep-linked edit) shows its name from Task 2's
  `useTaskNames()`, or `Task #123` while that loads. A task has no `projectId`, so its path is only shown
  once the tree has loaded it. That's an API limitation and the README states it.
  The picker never triggers catalog fetches by itself.
- **`DurationInput.vue`**: text input + live "= 1h 30m" preview + quick chips (15m, 30m, 1h, 2h).
- **`EntryForm.vue`** (`mode: 'create' | 'edit'`): layout and field wiring only. State and
  submission live in a `useEntryForm()` composable, which keeps the component under 200 lines and
  makes the logic testable without mounting.

### Defaults (create)
- Task: `?taskId=` from the tree's "Log time", otherwise empty with the picker focused.
- Date: today. Start: the end of the user's **last loaded entry if it ended today**, otherwise now
  rounded down to 15 min. No extra request: if the list hasn't loaded, use the rounded time.
- Duration: empty. Comment: empty.

- **"Work just ended"**: when there's no earlier entry today, typing a duration keeps End at now
  and moves Start back, until the user touches Date or Start. Without this, the default
  (start = now) made every after-the-fact entry end in the future.

### Keyboard path for the 10-second AC
Picker focused → type 2–3 letters → Enter (focus jumps to Duration) → `1h30` → Enter (focus jumps
to Comment) → type → **Ctrl/Cmd+Enter** saves from any field. Found in browser testing: native
date and time inputs have one Tab stop per segment, so plain Tab from the picker lands in Date and
typing `1h30` there corrupts the year. The Enter jumps avoid that.

### Rendering
`/entries/**` is client-rendered (`routeRules: { ssr: false }`). The server doesn't know the user's
time zone, so SSR computed defaults in UTC and caused hydration mismatches.

### Warnings (shown, never blocking)
- Duration over 12 h: "That's a long entry. Double-check the times."
- End more than 5 min in the future: "This entry ends in the future."
- Overlaps a loaded entry: "Overlaps #118 (09:00–10:00)" with a link. Only loaded entries are
  checked, so it's a hint.

### Submit
- Button disabled and labelled "Saving…" while pending; a second submit is ignored.
- Errors go under their fields, linked with `aria-describedby`, and focus moves to the first
  invalid field. A summary at the top only for non-field errors.
- Values are never cleared on failure.
- Unsaved changes: `onBeforeRouteLeave` confirm + `beforeunload` while dirty.

### Success
- **Create** → toast "Entry #123 created · 1h 30m on Design review" → list with
  `?highlight=123` (row highlighted, scrolled into view). A secondary **"Save & log another"**
  keeps the task and sets the next start to this entry's end, which is how people fill in a day.
- **Update** → toast "Entry #123 updated · 09:00–10:30, 1h 30m on Design review" (the updated
  entry, as the brief asks) → list with the row highlighted.

### 404 on update
Banner: "This entry no longer exists. It may have been deleted." Actions: **"Create as new entry"**
(switches the form to create mode, all values kept, one click to save) and "Back to list".
A deep link to a missing id (`GET` 404) shows a page-level empty state with "Log new entry".

### Network or 5xx
- PUT: "Couldn't reach the server. Your changes aren't saved." + Retry.
- POST: "Couldn't reach the server. The entry may not have been saved. Check the list before
  trying again." + "Open list in new tab" + Retry. Honest, because we can't know.

## Pages
- `/entries/new` (`?taskId=` optional)
- `/entries/:id/edit`: prefill from Task 2's list cache, otherwise `GET /api/time-entries/:id`.

## Coordination
- **Task 1**: tree `select(task)` → `navigateTo('/entries/new?taskId=…')`; the tree also gets a
  select mode for the picker's slideover. Write lane added to the limiter.
- **Task 2**: row click and the Edit button go to `/entries/:id/edit`. I need from
  `useTimeEntries` one small addition: `getCached(id)` that looks through pages already in the
  `useFetch` cache, plus read access to the loaded entries (for recent tasks, smart start,
  overlap). Server-side invalidation is `cache.invalidatePrefix('time-entries:')`, as their plan
  says; on the client I call `refreshNuxtData` for the `entries:` keys after a save. The list reads `?highlight=<id>` to highlight the saved row. Display
  formatting in `time.ts` is Task 2's; the parsing and DST functions above are mine.

## Build steps (each one commit)
1. `time.ts` parse/convert/DST + tests (≈1 h)
2. `TimeEntryInput` schema + tests (≈20 min)
3. Write lane + POST/PUT/GET-by-id routes + error mapping + POST coalescing + tests (≈1.5 h)
4. `useEntryForm` composable + tests (≈1 h)
5. `DurationInput`, `TaskPicker`, `EntryForm`, pages (≈2 h)
6. Component tests for the ACs below, then `npm run check` (≈45 min)

## Acceptance criteria
- [ ] Keyboard only: pick a recent task, enter `1h30`, a comment, save, in under 10 seconds.
- [ ] End before start can't be produced; End ≤ Start rolls to the next day with a visible badge.
- [ ] 23:00 + 2h on 2026-10-22 saves `2026-10-22T21:00:00.000Z` → `2026-10-22T23:00:00.000Z`
      (Berlin, CEST).
- [ ] 02:30 on 2026-03-29 shows the gap hint and can't be saved until fixed.
- [ ] 02:30 on 2026-10-25 offers first/second occurrence; the two save as different UTC instants.
- [ ] A mocked 404 on update offers "Create as new entry" with all values kept.
- [ ] A mocked 400 with a field error shows it next to that field; `Invalid JSON body` shows the
      summary.
- [ ] Double-clicking Save sends exactly one request (client) and the BFF coalesces duplicates.
- [ ] A POST network failure is not retried automatically and says the entry may not be saved.
- [ ] Invalid input costs 0 upstream calls.
- [ ] `npm run check` passes.

## Out of scope (on purpose)
- Timer mode (start/stop): the most useful next feature, listed in the README.
- Concurrent edit protection: the API has no ETag, so last write wins. README states it.
- Delete: stretch goal in PLAN.md.
