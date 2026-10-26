# API facts (from API_V1_DOCUMENTATION.md)

Source: the API v1 documentation the user shared on 2026-10-23
(https://lustrous-beijinho-54fcf1.netlify.app/api_v1_documentation.html). Items marked
**verify** are not documented or the docs are ambiguous. Confirm them with
`scripts/probe-api.sh` and update this file.

## Verified against the real API (2026-10-23)

These were checked with real requests and **override anything below that disagrees**.

- **Rate-limit headers exist** on every response: `ratelimit-limit: 15`,
  `ratelimit-policy: 15;w=60`, `ratelimit-remaining: N`, `ratelimit-reset: <seconds>`. No
  `Retry-After` was seen. The BFF syncs its limiter from `ratelimit-remaining` (keeping one spare)
  and uses `ratelimit-reset` both to end its own window when the upstream's ends and as the pause
  after a 429. The budget is per key, so curl or a second app instance spends it too.
  (2026-10-24: a burst of 20 gave 13 answers, 7 BFF 429s and zero upstream 429s;
  `resetsInMs` matched `ratelimit-reset`. See docs/qa/2026-10-24/real-api-check.md.)
- **New entries are not kept (2026-10-24, seen twice).** `POST /time-entries` answers 201 with a
  new id (#11 both times), but about a minute later `GET`, `PUT` and `DELETE` on that id return
  404 and the list never shows it. Seeded entries (#0, #2, #4, #6, #8) stay. The app can't fix
  this; after a save the list says when the saved entry isn't on the page.
- **A bad key gives `401` with a plain-text body `Unauthorized`**, not `404 Unknown user`.
- **Tasks have `projectId` and no `parent`.** Our schema ignores `parent`.
- **IDs start at 0.** Time entry `#0` exists, so id params are validated as non-negative.
- Invalid write body → `400 Invalid request body` (not `Invalid JSON body`).
  404 messages: `Time entry not found` (GET), `Time entry #N not found` (PUT).
- Status values seen: `in-progress`, `pending`, `completed`. There are exactly 100 clients.
- JSON responses are compact. Timestamps are ISO 8601 with `Z`.

## Basics

- Base URL `https://interview-api.memtime-demo.deno.net/api/v1`. The doc examples use
  `api.example.com`; ignore that.
- Auth: `Authorization: Bearer <key>` on every `/api/v1` request.
- Responses are pretty-printed JSON (per the docs; not relied on).
- `GET /health` → `200 "I'm alive!"`. **verify**: it may sit outside `/api/v1`, may need no auth,
  and may not count against the rate limit.

## Rate limit

- 15 requests per 60-second window, per API key. Over the limit → `429`.
- *Superseded by the verified section above: the real API sends `ratelimit-remaining` and
  `ratelimit-reset`.* **No rate-limit headers and no `Retry-After` are documented.** The limiter must track its own
  budget. On a 429, assume the whole window is spent and wait up to 60 s (exponential backoff with
  jitter, capped at 60 s). **verify**: whether the window is fixed or sliding, and whether headers
  exist anyway.

## Entities

| Entity | Fields |
|---|---|
| Client | `id: number`, `name`, `description`, `status` (e.g. `"active"`), `createdAt`, `updatedAt` |
| Project | `id: number`, `clientId: number`, `name`, `status`, `createdAt`, `updatedAt` |
| Task | `id: number`, `parent: number` (0 in examples), `name`, `status`, `createdAt`, `updatedAt` |
| TimeEntry | `id: number`, `taskId: number`, `userId`, `comment`, `start`, `end`, `createdAt`, `updatedAt` |

- *Superseded: the real API returns `projectId` and no `parent`.* **A Task has no `projectId`.** `parent` looks like a parent-task id (0 means top level). You can
  only get from a task to its project and client through the tree you've already loaded. **verify**
  what `parent` means.
- **`TimeEntry.userId` contains the raw API key.** The BFF must strip it from every response
  before it reaches the browser. This is a hard rule.
- Timestamps are ISO 8601. **verify**: whether they come back with `Z` and with milliseconds.
- Use the `status` field to show or hide archived and inactive items. **verify** what values it can
  take.

## Lists: pagination and sorting

- Query: `limit` (default **10**, no max documented), `offset` (default 0), `sortBy` (any valid
  field), `order` (`asc` default | `desc`).
- **The response is a bare JSON array with no total count.** To know whether there's a next page,
  request `limit + 1`. Page numbers can't be shown, only Prev/Next.
- No filtering beyond pagination and sorting. Showing "entries for one task" therefore happens on
  the client, over loaded pages.

## Endpoints

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/clients` | 200 array | |
| GET | `/clients/:id` | 200 | 404 `Client not found` |
| GET | `/clients/:id/projects` | 200 array | |
| GET | `/projects/:id` | 200 | 404 `Project not found` |
| GET | `/projects/:id/tasks` | 200 array | |
| GET | `/tasks/:id` | 200 | 404 `Task not found` |
| GET | `/time-entries` | 200 array (own entries only) | 404 `Unknown user` (bad or missing key!) |
| GET | `/time-entries/:id` | 200 | 404 `Time entry not found` (also returned for another user's entry) |
| POST | `/time-entries` | **201** | 400 `Invalid JSON body` / missing fields |
| PUT | `/time-entries/:id` | 200 | 400 missing id / invalid JSON; 404 `Time entry #<id> not found` |
| DELETE | `/time-entries/:id` | 200 `Time entry deleted successfully` | 404 |

Body for POST and PUT: `{ taskId: number, comment: string, start: ISO, end: ISO }`, all required.
PUT replaces the whole entry (all four fields are required), so the form always sends the full
entry.

## Errors

- Shape: `{ "error": "<message>" }`. A **single string, with no field-level details or codes.**
  Documented statuses: 200, 201, 400, 404, 429, 500.
- Consequences:
  - Field-level errors come from **our own** Zod validation (shared schema in the BFF and the
    form). Upstream 400s are a fallback summary. Map well-known messages to fields with a small
    lookup table, and don't build anything cleverer.
  - *Superseded: a bad key is a plain-text `401 Unauthorized` on the real API. We map both.*
    A bad key shows up as `404 Unknown user` on `/time-entries`, **not as 401.** Treat it as
    `UPSTREAM_AUTH` (502) on that route.

## Not documented: we validate ourselves (in both the BFF and the form)

- `end` must be after `start`. The API doesn't promise to check this.
- No comment length limit is documented. Cap it at 500 chars on our side and **verify** whether the
  API has its own limit.
- No overlap detection on the server.
- No max `limit`. Cap it at 100 ourselves.
