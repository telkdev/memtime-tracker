# Task 2: Time entries list

The goal is a list where users can see at a glance what they logged and when, page through it
cheaply, and jump straight into fixing an entry. It must stay within the 15 requests/60s budget it
shares with the tree and the form, and it must never let `userId` (the raw API key) reach the
browser.

This plan reuses Task 1's scaffold and server layer as they are: `rate-limiter.ts`, `cache.ts`,
`memtime.ts`, the `Page<T>` and `ApiError` schemas, and the 429 "waiting" pattern from
`useCatalog`. Changes to Task 1 files are additive only (a new schema file, a new cache prefix).

## Request budget

| Action | Upstream calls |
|---|---|
| Open the list (page 1) | **1** (`GET /time-entries?limit=26&offset=0&sortBy=start&order=desc`) |
| Next / Prev to a page not seen in the last 15 s | **1** |
| Back to a page seen within 15 s, or reload | **0** (cache) |
| Change page size | **1** (new cache key) |
| Resolve task names | **0** for tasks already in the tree; **1 per distinct unknown task**, background lane, cached 5 min |
| Any create/update (Task 3) | invalidates every cached list page; the next view costs 1 |

The task-name lookups are the only real risk. A page of 25 entries spread over 25 distinct tasks
the tree hasn't loaded would cost 25 calls, almost two windows. Three rules keep that in check:

1. Look up **distinct** task IDs only, and never one the client's `taskIndex` already knows.
2. Run them in the `background` lane. It may use at most half the window (7 of 14) and never the
   last 3 tokens, so at least 7 requests per window stay free for page changes, expands and
   saves. The rest of the lookups continue in the next window.
3. Show `Task #123` until the name arrives. The list is fully usable without names.

In practice a user logs time on a handful of tasks, so a page usually needs 0 to 3 lookups.

## Pagination: why Prev/Next, and how we know there's a next page

The upstream returns a bare array with no total. The BFF asks for `limit + 1`. If it gets
`limit + 1` items back, there's a next page, and it drops the extra item. The UI shows
"Page 3 · 25 per page" with Prev/Next, never "of N". This is honest about what the API can tell us.

Edge cases:
- `?page=99` past the end → an empty page. Show "Nothing on this page" with a "Back to page 1"
  button, not the "No time entries yet" empty state (that would lie).
- Invalid query (`?page=abc`, `size=1000`) → clamp to defaults (`page=1`, `size` in
  {10, 25, 50, 100}), and `replace` the URL so it doesn't keep the bad value.
- An entry created on another device shifts every later page by one. That's inherent to offset
  pagination without cursors. With a 15 s cache it's rarely visible, and the README says so.

## Build steps (each step is one commit)

### 1. Schema (≈15 min)
`shared/schemas/timeEntry.ts` (new file):
- `UpstreamTimeEntry`: `{ id, taskId, userId, comment, start, end, createdAt, updatedAt }`, used
  only inside `memtime.ts` to validate the upstream response.
- `TimeEntry`: the same **without `userId`**, built with `UpstreamTimeEntry.omit({ userId: true })`.
  Plain `z.object` strips unknown keys, so `userId` can't slip through even if someone forgets the
  omit. Belt and braces, because this is the one field that leaks the key.
- `TimeEntryListQuery`: `{ limit: 1..100 (default 25), offset: >= 0 (default 0) }`, coerced from
  strings.
- Timestamps: `z.string().datetime({ offset: true })`. If the probe shows a different format,
  loosen it there and note it in `docs/API_NOTES.md`.

### 2. BFF route (≈30 min)
`server/api/time-entries/index.get.ts`:
- Parse the query with `TimeEntryListQuery`. Bad input → 400 locally, no budget spent.
- Call `memtime.ts` with `limit + 1`, `offset`, `sortBy=start`, `order=desc`, lane `interactive`.
- Parse each item with `UpstreamTimeEntry`, map to `TimeEntry`, return
  `Page<TimeEntry> { items, hasMore, nextOffset }`.
- Cache 15 s under the prefix `time-entries:` (key includes limit and offset), with in-flight
  coalescing. Task 3 calls `cache.invalidatePrefix('time-entries:')` on every write.
- `Cache-Control: no-store` on the response, so the browser never keeps a stale page.
- `404 Unknown user` → `UPSTREAM_AUTH` (502), as Task 1 already maps it.

`server/api/tasks/[id].get.ts` (new): `GET /tasks/:id`, lane `background`, cache 5 min,
404 cached 30 s (a deleted task shouldn't be asked for again on every page).

### 3. `useTimeEntries()` composable (≈45 min)
- `page` and `size` come from `useRoute().query` and are written back with `router.push`, so reload
  and back/forward work. Size changes reset to page 1.
- `useFetch('/api/time-entries', { key: 'entries:<size>:<page>', query })`: SSR renders the first
  page, and the browser doesn't fetch it again.
- Exposes `entries`, `status`, `hasMore`, `hasPrev`, `next()`, `prev()`, `setSize()`, `refresh()`.
- For Task 3: `getCached(id)` returns an entry from any page already loaded, so opening edit from
  a row costs 0 calls; `loadedEntries` (read-only, deduped across loaded pages) feeds the picker's
  recent tasks, the default start time and the overlap warning.
- **Waiting state**: a BFF 429 sets `waiting` with `retryAt`. It retries by itself when the
  countdown ends, the same way `useCatalog` does. The previous page stays on screen (dimmed) during
  the wait instead of being replaced by a skeleton.

`useTaskNames()` (small, in the same file or next to it):
- Reads `taskIndex` from `useCatalog` first.
- For unknown IDs, fetches `/api/tasks/:id` once per ID, with results kept in `useState`.
- **It never triggers a catalog fetch** (no expanding the tree behind the user's back). It only
  reads what Task 1 has already loaded.

### 4. Time formatting (≈30 min)
Additions to `app/utils/time.ts` (shared with Task 3):
- `formatDate`, `formatTime`, `formatDuration(ms)` → `1h 30m`, all through `Intl.DateTimeFormat`
  in the browser's zone.
- The zone name shows once, in the table header ("Times in Europe/Berlin").
- An entry crossing midnight shows the end as `01:00 (+1 day)`, so nobody misreads it as a
  negative duration.
- `Created At` shows the date and time in local time, with the full ISO value in a `title` tooltip.

### 5. `EntriesTable.vue` (≈1.5 h)
- Columns: ID, Task, Comment, Date, Start, End, Duration, Created At. Date is split out of Start
  because people scan by day, and repeating the date in Start and End is noise.
- **Grouped by day**, newest first, with a day header and the day's total ("Thu 23 Oct · 6h 15m").
  If the day continues on the next page, the header says "6h 15m on this page". The brief asks for
  a list, but a time tracker user's first question is "did I log my 8 hours today?", and this
  answers it for free.
- Task cell: the task name when known, with `Client › Project` underneath when the tree has loaded
  it. Otherwise `Task #123` with a small skeleton while the lookup runs. The ID is always in the
  tooltip.
- Comment: one line, truncated with an ellipsis, full text in a tooltip.
- **Row click opens edit** (`/entries/:id/edit`). Every row also has an explicit Edit button,
  because a clickable `<tr>` isn't reachable by keyboard or screen reader. Middle-click and
  Ctrl-click open a new tab, because the row contains a real link.
- `?highlight=123` (set by Task 3 after a save) scrolls to that row and highlights it for a few
  seconds.
- When a task is selected in the tree, its entries on the current page are highlighted and a chip
  says "Showing entries for Design review · clear". It's a highlight, not a filter, because the API
  can't filter and pretending otherwise would hide entries on other pages.
- Narrow screens (< 640 px): rows turn into stacked cards (task, time range and duration, comment).
  The table doesn't scroll sideways.

### 6. States and pager (≈30 min)
- **Loading**: skeleton rows with the same height as real rows, so nothing jumps.
- **Empty** (page 1 with no items): "No time entries yet" with a "Log time" button →
  `/entries/new`.
- **Past the end**: see the pagination edge cases above.
- **Error**: an inline message that says what happened and a Retry button. `UPSTREAM_AUTH` shows
  "The server is misconfigured. Contact the administrator." and no Retry, because retrying won't
  help.
- **Waiting**: "Waiting for the rate limit · 12s", then it continues by itself.
- Pager: Prev / "Page 3" / Next, plus a page-size select (10, 25, 50, 100). Prev is disabled on page
  1, Next when `hasMore` is false. Keyboard shortcuts `[` and `]` for prev/next, only when focus
  isn't in an input.
- A Refresh button that bypasses the 15 s cache. This costs 1 call, and the button says so in its
  tooltip.

### 7. Page wiring (≈15 min)
`app/pages/index.vue`: tree on the left, entries on the right on wide screens, stacked on narrow
ones. The tree's `select(task)` sets the highlight; Enter or "Log time" on a task goes to Task 3's
form. This is the only small change to a Task 1 file.

### 8. Tests (written alongside, not after)
- **Key leak**: a fixture whose `userId` is a sentinel key string → the BFF response body doesn't
  contain it anywhere. This is the most important test in the task.
- BFF: 26 items back → 25 items and `hasMore: true`; 25 back → `hasMore: false`; the upstream query
  has `limit=26`, `sortBy=start`, `order=desc`; `size=1000` → 400 with no upstream call; two
  concurrent identical requests → 1 upstream call; the cache is cleared by `invalidatePrefix`.
- Tasks route: lane is `background`; a 404 is cached for 30 s.
- `time.ts`: format under `TZ=Europe/Berlin` (UTC `2026-03-29T00:30:00Z` → `01:30`, and
  `01:30Z` → `03:30` across the DST jump); midnight crossing shows `+1 day`; `formatDuration`.
- `useTimeEntries`: reads and writes `page`/`size` in the URL; invalid values are clamped and
  replaced; a 429 sets `waiting` and retries by itself; the previous data stays visible.
- `useTaskNames`: an ID in `taskIndex` → no fetch; two rows with the same unknown ID → one fetch.
- `EntriesTable`: renders every state's text; day grouping and totals; the Edit button and the row
  link both point to `/entries/:id/edit`; the highlight is applied.

## Acceptance criteria

- [x] `?page=3&size=25` survives reload and back/forward. Invalid values are corrected in the URL.
- [x] Times show in local time and match the UTC values (tested with a fixed TZ, including a DST
      day and a midnight crossing).
- [x] Opening the list makes exactly 1 upstream call. Going back to a page seen within 15 s makes 0.
- [x] Task names fill in from the tree with no extra calls. Unknown tasks cost at most one
      background call each and never block paging.
- [x] The list never triggers catalog (tree) fetches on its own.
- [x] No BFF response contains `userId` or the key (tested).
- [x] Every row opens edit by click and by keyboard (Edit button). Empty, past-the-end, loading,
      waiting and error states all render and make sense.
- [x] `npm run check` passes.

## Out of scope (on purpose)

- **Filtering by task or date range.** The API has no filters. Doing it client-side means loading
  every page, which breaks the budget. A highlight over the current page is the honest version.
  With a real API I'd ask for `?taskId=` and `?from=&to=`.
- **Week totals or a calendar view.** Needs all entries for a range, so it has the same problem.
  It's in the README's "what I'd do next".
- **Delete.** Stretch goal in `PLAN.md`; it belongs with the form in Task 3.
- **Infinite scroll.** Prev/Next with the page in the URL is easier to link, reload and reason
  about under a rate limit. Infinite scroll would also make "Page N" meaningless.

## Open questions (settled by the probe)

- The exact timestamp format (`Z` or offset, milliseconds or not). The schema accepts both for now.
- Whether `sortBy=start` is accepted, or the API wants a different field name. If it fails, fall
  back to the default order and sort the page on the BFF (correct within a page only, so note it).

## As built (differences from the plan above)

- **The list fetches in the browser only.** Times depend on the viewer's zone, which the server
  doesn't know, so SSR renders the skeleton instead of times that would be wrong and then change.
- **Every client `$fetch` passes `retry: 0`.** ofetch otherwise retries 429 and 5xx at once, which
  doubles calls under exactly the conditions where the budget is tight.
- **Task-name lookups run at most two at a time.** They can sit in the server's background lane for
  a while, and unlimited parallel requests would use up the browser's connections and delay paging.
- **Table or cards depends on the panel's width (container query), not the window's.** The panel
  sits next to the tree, so at 1440 px it's only about 700 px wide.
- **The Start, End and Created columns show time only.** The date is in the day header. Created shows
  "23 Oct, 18:52", with the full value in a tooltip. An end on a later day shows "+1d".
- **A missing task shows "Task #99 (unavailable)".** A 404 could mean deleted or not visible to us,
  so the label doesn't claim which.
- `useTimeEntryCache()` (`getCached`, `loadedEntries`, `invalidate`) is separate from
  `useTimeEntries()`, so the edit form can use the cache without starting a list fetch.

## Estimate

About 4 to 5 hours, including tests. Most of it is steps 5 and 8. Steps 1 to 3 are small because
Task 1's limiter, cache and upstream client do the heavy lifting.
