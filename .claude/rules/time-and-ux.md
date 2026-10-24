---
paths:
  - "app/**"
  - "shared/**"
---

# Time handling and UX standards

## Time zones

- The user thinks in **local time**. The API speaks **UTC ISO 8601**. Convert only in
  `app/common/lib/time.ts`.
- Send `new Date(...).toISOString()` (always ends in `Z`, with milliseconds). Never send a string
  without an offset.
- Display dates with `Intl.DateTimeFormat` in the browser's zone. Show the zone name once, in the
  page header or a tooltip, not on every cell.
- To build a Date from a local date (`YYYY-MM-DD`) and time (`HH:mm`), use the
  `new Date(y, m - 1, d, hh, mm)` constructor. Never parse `"YYYY-MM-DDTHH:mm"` strings by hand with
  offset maths.
- DST: a local time that doesn't exist (spring forward) or happens twice (fall back) must not
  silently corrupt data. Detect it and show a hint. Unit-test both transitions with a fixed TZ (for
  example `TZ=Europe/Berlin`).
- Entries crossing midnight are valid. The end date can differ from the start date.

## Entry form (create and update)

Users should be able to log time quickly and get it right the first time.

- **Task picker**: searchable combobox showing `Client › Project › Task`. It searches:
  1. recently used tasks (taken from the user's time entries),
  2. any part of the catalog already loaded or cached,
  3. otherwise it offers to browse the tree.
  Don't fetch the whole catalog to power search. That breaks the rate limit.
- **Start**: date + time inputs. Default to now rounded down to 15 min, or to the end of the user's
  last entry if that was today.
- **End or duration**: both can be edited and they stay in sync. Duration accepts `1h 30m`, `1:30`,
  `90m`, `1.5h`. The parser lives in `time.ts` and is unit-tested.
- **Comment**: required. Trim it. Show a character counter if the API has a limit.
- **Validation** (shared Zod schema plus UI rules):
  - end must be after start → field error on End
  - duration > 12 h → warning (not a block): "That's a long entry, double-check it"
  - start in the future → warning
  - overlap with a loaded entry → warning with a link to the other entry. Detection only covers
    loaded entries, so it's a warning and not a block.
- Show errors **next to the field**, linked with `aria-describedby`. Show one summary at the top only
  for errors that aren't about a field.
- Submit: disable the button while pending, prevent double submits, keep the form's values if the
  request fails.
- Success:
  - create → toast "Entry #123 created", then go to the list with the new row highlighted
  - update → toast "Entry #123 updated", show the updated values, highlight the row
- Errors:
  - 400 → our own validation should catch it first. If the upstream still rejects it, show
    "The server rejected this entry: <reason>"
  - 404 on update → "This entry no longer exists." Offer "Create as new entry" with the form
    prefilled.
  - 429 → banner "Too many requests, retrying in Ns" with a countdown. Retry automatically once.
  - network / 5xx → "Couldn't reach the server. Your entry is not saved." plus a Retry button
- Warn about unsaved changes before leaving a dirty form.

## Tree

- Load clients on mount. Load projects and tasks on expand. Cache them in the composable so
  collapsing and expanding again costs nothing.
- Each node has its own states: idle, loading (skeleton rows), error (inline retry), empty
  ("No projects").
- Keyboard: arrow keys move, Right/Left expand and collapse, Enter on a task starts a new entry
  prefilled with that task. Use `role="tree"` and `treeitem` with `aria-expanded`.
- Selecting a task filters or highlights its entries in the list. That's a cheap win.

## Entries list

- Columns: ID, Task (name if known, ID as fallback and in a tooltip), Comment, Start, End, Duration,
  Created At.
- The page and page size live in the URL query (`?page=2&size=25`), so back/forward and reload work.
  The API returns no total, so the UI shows Prev/Next and "Page N", not "of M".
- Sort newest first (`sortBy=start&order=desc`).
- Task names: use the catalog cache first. For unknown IDs, look up `GET /tasks/:id` at background
  priority (cached), and show `#id` until it arrives. A task carries `projectId`, but turning that into
  project and client names would cost more calls, so the `Client › Project` path is only shown for
  tasks already in the loaded tree.
- Clicking a row opens edit. Every row also has an explicit Edit button, for accessibility.
- Loading → skeleton rows. Empty → "No time entries yet" with a "Log time" button.

## General UX bar

- Everything works with the keyboard and has visible focus. Labels are real `<label>`s.
- No layout shift when data arrives. Reserve space with skeletons.
- Colour is never the only way to show a state. Text contrast meets AA.
- Copy says what happened and what to do next. No raw error codes without an explanation.
