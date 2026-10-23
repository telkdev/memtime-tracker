# Implementation plan

The goal is a time tracker I'd put my name on: correct under a 15 requests/60s limit, never
leaking the key, and quick to log time in without mistakes. The plan has seven phases, each with
acceptance criteria (AC). A phase is done when every AC is ticked and `npm run check` passes.

Estimated total: about 1.5 to 2 focused days. The order puts the risky parts (API contract, rate
limiter) first, so surprises show up early.

---

## Phase 0: Confirm the API contract (≈1 h)

Why first: the plan below assumes things about response shapes, pagination and errors. Getting one
of them wrong means rework in every later layer.

- [x] Read the docs → `docs/API_NOTES.md` written, and the rules updated to match.
- [ ] Run `./scripts/probe-api.sh` once, by hand, to settle the **verify** items: window type,
      whether any rate-limit headers exist, timestamp format, what `Task.parent` means, `status`
      values, whether `/health` counts against the limit.

**AC**
- Every **verify** item in `docs/API_NOTES.md` is resolved or kept as a stated assumption.
- Fixtures for each endpoint, plus 400/404/429 error bodies, are saved in `tests/fixtures/` with no
  key in them.

## Phase 1: Scaffold and tooling (≈1.5 h)

- [ ] `npx nuxi@latest init` (Nuxt 4), add `@nuxt/ui`, `@nuxt/eslint`, `@nuxt/test-utils`, `zod`,
      `vitest`, `@vue/test-utils`, `happy-dom`.
- [ ] Add npm scripts: `dev`, `build`, `preview`, `lint`, `lint:fix`, `typecheck`, `test`,
      `test:watch`, and `"check": "node scripts/check.mjs"`.
- [ ] `nuxt.config.ts`: `runtimeConfig.memtimeApiKey` (private) and `memtimeBaseUrl`, with nothing
      under `public`.
- [ ] Nitro plugin that fails startup with a clear message if the key is missing.
- [ ] Vitest config with `TZ=Europe/Berlin` (it has DST, so the DST tests mean something).
- [ ] App shell: header (app name, the user's time zone), main layout, toasts.
- [ ] GitHub Actions: install → `npm run check`. CI gets no key.

**AC**
- `npm run dev` starts. Without the key it fails at startup with an actionable message.
- Lint, typecheck and an empty test suite pass locally and in CI.
- `grep -r memtimeApiKey app/` returns nothing, and the client bundle in `.output/public` contains no
  key.

## Phase 2: BFF core: upstream client, limiter, cache, errors (≈3 h). The part reviewers look at most

- [ ] `shared/schemas/*`: zod for Client, Project, Task, TimeEntry, TimeEntryInput, ApiError, and a
      generic Page<T>, all based on Phase 0 findings.
- [ ] `server/utils/rate-limiter.ts`: token bucket (15/60s, configurable), three priority lanes
      (write > interactive > background), background reserve, max wait → 429, injectable clock.
- [ ] `server/utils/cache.ts`: TTL + SWR, in-flight coalescing, prefix invalidation.
- [ ] `server/utils/memtime.ts`: the only upstream caller. It adds auth, goes through the limiter
      (budget 14 per 60 s window), retries on 429 with backoff (no Retry-After is documented),
      parses with zod, and maps `{ error: string }` to `ApiError`.
- [ ] Time-entry output schema **without `userId`** (the upstream puts the raw API key there).
- [ ] `server/utils/errors.ts`: upstream status → `{ status, code, message, fields?, retryAfter? }`.
- [ ] `GET /api/_meta/rate-limit`: local token snapshot, so the UI can show the budget (costs no
      upstream call).

**AC**
- Unit tests prove the limiter never allows more than 15 upstream calls in any 60 s window, even with
  50 concurrent callers.
- A write queued behind 10 background requests runs first.
- Two concurrent identical GETs → exactly one upstream call.
- A mocked upstream 429 with `Retry-After: 3` → waits 3 s and retries, and other callers wait too.
- An upstream 401, or `404 Unknown user` → BFF 502 `UPSTREAM_AUTH`.
- **No BFF response body contains the API key.** Tested with a fixture whose `userId` is the key.
- An upstream payload that doesn't match the schema → 502 with a clear message, not a crash.

## Phase 3: Task 1, the client → project → task tree (≈2.5 h)

- [ ] Routes: `GET /api/clients`, `/api/clients/:id/projects`, `/api/projects/:id/tasks`, with
      catalog caching and pagination loops capped at 10 pages.
- [ ] `useCatalog()`: per-node state (idle/loading/error/empty/loaded), lazy `expand(node)`, and a
      lookup map `taskId → { task, project, client }` for the picker and list.
- [ ] `ClientTree.vue` / `TreeNode.vue`: skeletons, inline retry, "Load more" past the cap,
      keyboard navigation, ARIA tree roles.
- [ ] Enter or the "Log time" action on a task → new entry form with the task prefilled.
- [ ] Optional: low-priority background prefetch of the first few clients' projects, only while the
      bucket has spare tokens.

**AC**
- First load makes **1** upstream call (clients). Expanding a client makes 1 (more if it has many
  pages). Expanding it again makes 0.
- Quickly expanding 20 nodes never produces a raw error. Nodes past the budget show
  "Waiting for rate limit… Ns" and then fill in.
- The whole tree can be used with the keyboard alone.
- Every node shows its empty state and an error state with a working retry.

## Phase 4: Task 2, time entries list (≈2 h)

- [x] `GET /api/time-entries?limit&offset`, sent upstream as `limit+1`,
      `sortBy=start&order=desc`, with a short cache that's invalidated on write.
- [x] `useTimeEntries()`: page and size from the URL query, `hasMore` via limit+1 (there's no total),
      refresh.
- [x] Task-name lookup for unknown IDs: `GET /api/tasks/:id`, background priority, cached.
- [x] `EntriesTable.vue`: ID, Task (name when known, ID otherwise), Comment, Start, End, Duration,
      Created At, shown in local time with the zone in the header.
- [x] Prev/next plus a page-size selector. Clicking a row and an explicit Edit button both open the
      edit form.
- [x] Skeleton, empty state with a "Log time" call to action, and error state with retry.

**AC**
- `?page=3&size=25` survives a reload and back/forward.
- Times show in local time and match the UTC values (checked in a test with a fixed TZ).
- Task names fill in as the catalog loads. The list never triggers catalog fetches on its own.
- Paging back to an already-seen page within the cache TTL makes 0 upstream calls.

## Phase 5: Task 3, create and update form (≈4 h). The core of the UX grade

- [ ] `app/utils/time.ts`: local date+time ↔ UTC ISO, duration parse/format, DST gap and overlap
      detection.
- [ ] `TaskPicker.vue`: combobox over recent tasks + loaded catalog, showing
      `Client › Project › Task`, with a "Browse tree" fallback.
- [ ] `DurationInput.vue`: accepts `1h 30m`, `1:30`, `90m`, `1.5h` and stays in sync with End.
- [ ] `EntryForm.vue`: smart defaults (start = end of the last entry today, or now rounded to
      15 min), shared zod validation, field-level errors, warnings (over 12 h, in the future,
      overlap), double-submit guard, warning on leaving with unsaved changes.
- [ ] Routes: `POST /api/time-entries` (upstream 201), `PUT /api/time-entries/:id`,
      `GET /api/time-entries/:id`. Validate the body with the shared schema (end > start, comment
      1 to 500 chars, numeric taskId) **before** spending budget. Use write priority and
      invalidate the list cache.
- [ ] Pages: `/entries/new` (optional `?taskId=`), `/entries/:id/edit` (prefilled from the list
      cache, otherwise `GET /time-entries/:id`, so deep links work).
- [ ] Results: toast "Entry #123 created" / "updated", redirect with the row highlighted.
- [ ] Errors: 400 → field errors or a readable summary. 404 → "This entry no longer exists" plus
      "Create as new". 429 → countdown and auto-retry. Network or 5xx → values kept and a Retry
      button.

**AC**
- A user can log a 1 h 30 m entry on a recent task with the keyboard only, in under 10 seconds.
- Typing end before start shows an error under End, and the form can't be submitted.
- An entry from 23:00 to 01:00 is saved with the correct UTC dates.
- A DST-gap time (for example 02:30 on the spring-forward day) shows a hint and doesn't save
  silently.
- A mocked 404 on update offers "Create as new" with all values kept.
- A mocked 400 with a field error shows it next to that field.
- Double-clicking Save sends exactly one request.

## Phase 6: Hardening, polish and write-up (≈2 h)

- [ ] Accessibility pass: labels, focus order, `aria-describedby` on errors, contrast, visible
      focus.
- [ ] Rate-limit banner, driven by BFF 429s and `/api/_meta/rate-limit`.
- [ ] Security headers in the Nitro route rules (CSP, `X-Content-Type-Options`, `Referrer-Policy`).
- [ ] Optional: Playwright smoke test (expand → pick task → create → see it in the list) against a
      mocked BFF.
- [ ] README: setup, architecture diagram, the rate-limit strategy, trade-offs, known limits, and
      what I'd do next (below).
- [ ] Final check: no secrets in git history (`git log -p | grep -i bearer`), CI green.

**AC**
- A new reviewer can clone, `cp .env.example .env`, add the key, `npm i && npm run dev`, and have
  it working in under 3 minutes.
- The README explains *why* for each non-obvious decision.

---

## Known trade-offs to state honestly in the README

- **Single-tenant.** One API key means one user. Real multi-user needs per-user auth (OAuth or a
  session) and a key or token per user.
- **In-memory limiter and cache.** Correct for one server instance. With several instances, the
  budget must move to Redis or Upstash (or a Deno KV equivalent).
- **Overlap detection is advisory.** The client only sees the entries it has loaded. Enforcing it
  properly belongs on the server.
- **Search covers only loaded data.** Searching the whole catalog would cost N+M requests. With a
  real API I'd ask for a `GET /tasks?search=` endpoint.

## What I'd do next (README section)

1. Timer mode (start/stop) with a persisted running timer. This is what most users actually want.
2. Offline queue for writes (IndexedDB), replayed under the rate limiter. This fits Electron
   directly.
3. Electron shell reusing the same Vue UI, with the BFF becoming the main process. The key would
   live in the OS keychain.
4. Week view / calendar with drag-to-resize entries, and spotting gaps in the day.
5. Server-side: overlap validation, a search endpoint, `ETag`/`If-Match` on PUT for safe
   concurrent edits.
6. Observability: structured logs, upstream latency and 429-rate metrics.

## Settled by the docs

- Lists are bare arrays with no total → limit+1 and Prev/Next.
- `GET /time-entries/:id` exists → deep-link edit works.
- No filtering → "entries for this task" is a client-side highlight or filter over loaded pages.
- IDs are numbers.
- Errors are a single string → field-level errors come from our own validation.
- `userId` leaks the key → stripped in the BFF.

## Stretch (only if time is left)

- Delete with confirmation, using `DELETE /time-entries/:id` (documented, not required).
  Undo isn't possible without re-creating the entry, so a confirm dialog is the honest UX.

## Still open (probe)

- Fixed or sliding window. Any rate-limit headers at all.
- What `Task.parent` means. Does `/health` count against the limit?
