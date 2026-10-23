---
paths:
  - "server/**"
  - "shared/**"
  - "app/composables/**"
  - "scripts/**"
---

# Upstream API, key handling and rate limit

## Upstream facts

`docs/API_NOTES.md` is the full reference, taken from the official docs. The key points:

- Base URL: `https://interview-api.memtime-demo.deno.net/api/v1`
  (config: `NUXT_MEMTIME_BASE_URL`, default above)
- Auth: `Authorization: Bearer <key>` on every request
- Rate limit: **15 requests per 60 s window**, per key. The real API sends `ratelimit-remaining`
  and `ratelimit-reset` (seconds), but no `Retry-After`. We track the budget ourselves and sync it
  down from `ratelimit-remaining` (`limiter.sync`), since other clients of the key share it.
- Endpoints we use: `GET /clients`, `GET /clients/:id/projects`, `GET /projects/:id/tasks`,
  `GET /tasks/:id`, `GET /time-entries`, `GET /time-entries/:id`, `POST /time-entries` (201),
  `PUT /time-entries/:id`. `DELETE /time-entries/:id` exists but is out of scope (stretch goal).
- Lists: `limit` (default 10), `offset`, `sortBy`, `order=asc|desc`. **The response is a bare array
  with no total.**
- IDs are numbers. Write body: `{ taskId: number, comment, start, end }`, all required. PUT replaces
  the whole entry.
- Errors are `{ "error": "<string>" }` only, with no field details. Statuses: 400, 404, 429, 500.
- **A bad key gives `401` with a plain-text `Unauthorized` body** (verified; the docs say 404).
- Tasks carry `projectId` and no `parent`. IDs can be 0.

## ⚠ `TimeEntry.userId` is the raw API key

The upstream returns the key in every time entry's `userId`. The BFF **must** remove `userId`
from every time-entry response before sending it to the browser. Do this with an explicit Zod
output schema that leaves the field out, so it can't slip through by accident. A server test
asserts that no BFF response body contains the key.

If the official docs disagree with this list, the docs win. Update this file and
`docs/API_NOTES.md` when they disagree.

## The key

- Only `server/utils/memtime.ts` reads `useRuntimeConfig(event).memtimeApiKey`.
- On startup (a Nitro plugin), fail loudly if the key is missing. Don't fail later with a confusing
  401.
- Never log request headers. Redact `authorization` if you log requests at all.
- Don't echo upstream error bodies verbatim to the client without checking that they can't contain
  the key.

## Rate limiter design (`server/utils/rate-limiter.ts`)

- A budget of **14 requests per 60 s window** (the upstream allows 15), configurable through
  runtimeConfig so tests can shrink it.
- **Priority queue** with three lanes, highest first:
  1. `write`: POST/PUT time entries. A save must never wait behind prefetching.
  2. `interactive`: a user expanded a node, changed page or opened edit.
  3. `background`: prefetch and cache warming. Runs only when tokens > `reserve` (default 3).
- The window is assumed to be fixed. The 1-request margin absorbs clock skew between us and the
  server.
- When the server gets a 429: pause every lane for `Retry-After`, else `ratelimit-reset`, else the
  escalating backoff (2 s, 5 s, 15 s, 60 s), then retry (max 3 retries).
- **Max queue wait** for interactive requests is about 8 s. Past that, the BFF returns `429` with
  `retryAfter` instead of holding the HTTP request open. The client composable then shows a
  countdown and retries by itself.
- Keep the limiter pure (inject the clock) so you can test it with fake timers.

## Cache (`server/utils/cache.ts`)

| Data | TTL | Notes |
|---|---|---|
| clients, projects, tasks | 5 min, stale-while-revalidate | the catalog rarely changes |
| time-entries list pages | ≤ 15 s | invalidate every page on any POST/PUT |
| single time entry | none, or seed from the list cache | |

- **Coalesce in-flight requests.** Two callers asking for the same key share one upstream promise.
- The cache key includes the path and the normalised query (sorted params, defaulted limit/offset).
- Never cache error responses, except 404 on catalog nodes for a short time (30 s).

## Pagination

- Clamp `limit` to [1, 100]. The upstream default is 10, which is too small. For catalog lists
  (clients, projects, tasks), always request `limit=100`, so a node usually costs one request
  instead of several.
- There's no total, so request `limit + 1` and use the extra item only to decide `hasMore`. Don't
  show it. The UI shows Prev/Next, not page numbers.
- Time entries: always send `sortBy=start&order=desc`. Most recent first is what users expect.
- To fetch "all" projects or tasks of one node, loop pages through the limiter at `interactive`
  priority, with a hard cap (for example 10 pages) and a visible "load more" past the cap.

## BFF routes

- Thin: validate input with Zod → call `memtime.ts` → validate output with Zod → return.
- Normalise every error to the shared `ApiError` shape:
  `{ error: { status, code, message, fields?, retryAfter? } }`
- Field errors come from **our** Zod validation in the BFF, which runs before any upstream call
  and so also saves budget. The upstream only returns a string. Map the few known messages
  (`Invalid request body`, `Time entry #N not found`) with a lookup table, and show anything else as a
  summary.
- Upstream 401/403 (or the documented `404 Unknown user`) → BFF 502, `code: "UPSTREAM_AUTH"`,
  a generic message, and a log line for the operator.
- Set `Cache-Control: no-store` on time-entry responses.
