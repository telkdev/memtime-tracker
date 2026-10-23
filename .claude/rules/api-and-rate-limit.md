---
paths:
  - "server/**"
  - "shared/**"
  - "app/composables/**"
  - "scripts/**"
---

# Upstream API, key handling and rate limit

## Upstream facts (from the brief; confirm details in docs/API_NOTES.md)

- Base URL: `https://interview-api.memtime-demo.deno.net/api/v1`
  (config: `NUXT_MEMTIME_BASE_URL`, default above)
- Auth: `Authorization: Bearer <key>` on every request
- Rate limit: **15 requests / 60 s**. The window type (fixed or sliding) and the headers are not yet
  verified, so check the probe output.
- Endpoints: `GET /clients`, `GET /clients/:id/projects`, `GET /projects/:id/tasks`,
  `GET /time-entries`, `POST /time-entries`, `PUT /time-entries/:id`
- Pagination: `limit`, `offset` query params
- Write body: `{ taskId, comment, start, end }`. `start` and `end` are ISO 8601.
- Documented errors to handle: 400 (invalid JSON or body), 404 (entry not found), 429 (rate limit),
  401/403 (bad key, which is a server misconfiguration and not the user's fault)

If `API_V1_DOCUMENTATION.md` is in the repo root, it wins over this list. Update this file and
`docs/API_NOTES.md` when they disagree.

## The key

- Only `server/utils/memtime.ts` reads `useRuntimeConfig(event).memtimeApiKey`.
- On startup (a Nitro plugin), fail loudly if the key is missing. Don't fail later with a confusing
  401.
- Never log request headers. Redact `authorization` if you log requests at all.
- Don't echo upstream error bodies verbatim to the client without checking that they can't contain
  the key.

## Rate limiter design (`server/utils/rate-limiter.ts`)

- Token bucket with **capacity 15, refill 15 per 60 s**. Configurable through runtimeConfig so tests
  can shrink it.
- **Priority queue** with three lanes, highest first:
  1. `write`: POST/PUT time entries. A save must never wait behind prefetching.
  2. `interactive`: a user expanded a node, changed page or opened edit.
  3. `background`: prefetch and cache warming. Runs only when tokens > `reserve` (default 3).
- When the server gets a 429: read `Retry-After` (in seconds, or as an HTTP date). If it's missing,
  back off exponentially with jitter (1s, 2s, 4s, max 3 retries). Drain the bucket so other callers
  wait too.
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

- Clamp `limit` to [1, 100]. The default is decided per endpoint after the probe.
- If the API doesn't return a total, request `limit + 1` and use the extra item only to decide
  `hasMore`. Don't show it.
- To fetch "all" projects or tasks of one node, loop pages through the limiter at `interactive`
  priority, with a hard cap (for example 10 pages) and a visible "load more" past the cap.

## BFF routes

- Thin: validate input with Zod → call `memtime.ts` → validate output with Zod → return.
- Normalise every error to the shared `ApiError` shape:
  `{ error: { status, code, message, fields?, retryAfter? } }`
- Map upstream 400 field complaints onto `fields` whenever you can identify the field, so the form
  can show the error next to it.
- Upstream 401/403 → BFF 502, `code: "UPSTREAM_AUTH"`, a generic message, and a log line for the
  operator.
- Set `Cache-Control: no-store` on time-entry responses.
