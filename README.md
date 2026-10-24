# Memtime Time Tracker

A Nuxt 4 app over the Memtime demo API. It shows the client → project → task tree, lists your
time entries, and creates and updates them. A Nitro backend-for-frontend holds the API key and
keeps every request within the API's limit of 15 requests per 60 seconds.

- **Tree** (Task 1): clients load on page open, projects and tasks only when you expand a node.
  Fully keyboard-driven (arrows, Home/End, type-ahead), with "Load more" for big nodes.
- **Entries** (Task 2): your entries newest first, grouped by local day with day totals, with
  Prev/Next and a page size, all kept in the URL. ID, Task ID (plus the task's name), Comment,
  Start, End, Duration and Created At. Click a row to edit it.
- **Form** (Task 3): pick a task, type a duration (`1h30`, `90m`, `1:30`) or an End time, add a
  comment, save. Start, Duration and End stay in sync, an end past midnight shows `+1 day`, and DST
  gaps and repeated hours are caught instead of silently shifting. Errors sit next to their field.

## Setup

```bash
npm install
cp .env.example .env     # put your key in NUXT_MEMTIME_API_KEY (the file is gitignored)
npm run dev              # http://localhost:3000
```

### Without an API key (mock API)

`npm run mock:api` starts a local stand-in for the Memtime API on port 4010. It follows the
documented behaviour: bare-array lists, `{ error }` bodies, the 15 requests/60 s limit, and
`userId` echoing the key. Point the app at it:

```bash
npm run mock:api                       # terminal 1
# .env: NUXT_MEMTIME_API_KEY=anything  NUXT_MEMTIME_BASE_URL=http://localhost:4010/api/v1
npm run dev                            # terminal 2
```

Its data includes an archived client, a client with no projects, and a project with
130 tasks so you can see "Load more". To watch the rate-limit handling, expand every client and
project quickly. Nodes past the budget show a countdown and fill in on their own.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run preview` | Production build and local preview |
| `npm run check` | Lint (with autofix), typecheck and tests in one go. Prints one line per passing step and only the tail of a failure. Run it before every commit. |
| `npm run check -- lint` | Run a single step: `lint`, `typecheck` or `test` |
| `npm run check -- --no-fix` | Report lint errors without fixing them (automatic when `CI` is set) |
| `npm run smoke` | Build, then run the real server against the mock API: key never reaches the browser, error shapes, and a 20-request burst never causes an upstream 429. Runs in CI. |
| `npm run lint` / `npm run lint:fix` | ESLint only |
| `npm run typecheck` | `nuxi typecheck` only |
| `npm run test` / `npm run test:watch` | Vitest only |
| `npm run mock:api` | Local mock of the Memtime API (port 4010) |
| `./scripts/probe-api.sh` | Manual check of the real API contract. It spends 7 requests of the 15/min budget, so never run it in CI. |

## How it works

```
Browser (Vue)  ──/api/*──▶  Nitro server (BFF)  ──Bearer key──▶  Memtime API
                            • holds the API key (never sent to the browser)
                            • one rate limiter for the whole app (14 of 15 req/60 s)
                            • cache + in-flight coalescing
                            • Zod validation both ways, one error shape
```

- **The key stays on the server.** It's private runtime config, read in exactly one file
  (`server/utils/memtime.ts`, enforced by ESLint). The upstream echoes the key back as `userId` on
  every time entry, so the BFF strips that field; a unit test and the smoke test check it.
- **The rate limit is a server concern.** All upstream calls go through one queue with three
  priority lanes: writes, then user actions (expand, page change, open edit), then background work
  (task-name lookups, cache refreshes). Background work may use at most half of each window and
  never the last 3 requests, so a click always has budget. When a request would wait more than
  8 s, the BFF answers 429 with `retryAfter` instead of holding the connection, and the UI shows a
  countdown and continues by itself. The limiter also syncs from the API's `ratelimit-remaining`
  header, so another client of the same key (curl, a second app) can't push us into a 429.
- **Cheap by design.** Opening the page costs 1 request; each expand 1; re-expanding or paging back
  within the cache TTL 0. Lists ask for `limit+1` to learn whether there is a next page, because
  the API returns no totals. Editing from the list costs no read; a save costs the write plus one
  list refresh. The per-action numbers are in `docs/plans/`.
- **Times.** The UI shows and edits local time; everything sent upstream is UTC ISO 8601 with `Z`.
  Conversion lives only in `app/common/lib/time.ts`, tested under a fixed `Europe/Berlin` zone across
  both DST changes and midnight.
- **Writes are honest about failure.** A 429 is retried (the upstream didn't apply it). A create
  that fails on the network is never retried automatically, because there's no idempotency key and
  the first attempt may have been saved; the form says so and keeps your values. A 404 on update
  offers "Create as new entry".

### Frontend structure

The Vue app is split by feature (`app/features/catalog`, `time-entries`, `entry-form`) plus
`app/common`. Each feature has `ui/`, `composables/`, `model/`, `api/` and `lib/` folders as needed
and one public `index.ts`. Feature internals are not auto-imported, and ESLint blocks deep imports
into another feature, so the index really is the only way in. Rules, the model-vs-lib split and
the dependency graph: [app/features/README.md](app/features/README.md).

## Trade-offs and known limits

- **The demo API doesn't keep new entries.** A create succeeds and returns an id, but the entry is
  gone about a minute later (checked twice on the real API, see `docs/API_NOTES.md`). The list
  then says the saved entry isn't on the page instead of failing silently.
- **Single-tenant.** One API key means one user, so there's no login. Real multi-user use needs
  per-user auth and a token per user.
- **In-memory limiter and cache.** Correct for one server instance. With several instances the
  budget and cache move to Redis/Upstash (or Deno KV).
- **Overlap warnings are advisory.** The client only knows the entries it has loaded. Enforcing
  this belongs on the server.
- **The tree filter searches loaded data only.** Searching the whole catalog would cost a request
  per node; a real API would get a `GET /tasks?search=` endpoint.
- **No Content-Security-Policy yet.** The other security headers are set; CSP needs a nonce setup
  for Nuxt's inline hydration script.
- **End is derived from Start + Duration**, with an editable End field kept in sync and no
  separate end date. An End equal to Start is refused; an earlier End means the next day. Entries
  longer than 24 h are refused (our rule; the API documents none).

## What I'd do next

1. Timer mode (start/stop) with a persisted running timer, which is what most people want.
2. An offline queue for writes (IndexedDB), replayed under the rate limiter. This fits Electron.
3. An Electron shell reusing the same Vue UI, with the BFF as the main process and the key in the
   OS keychain.
4. A week view with drag-to-resize entries and gaps in the day highlighted.
5. Server side: overlap validation, task search, `ETag`/`If-Match` on PUT for concurrent edits.
6. A Playwright test of the full flow (expand → pick task → create → see it in the list) and a
   browser accessibility pass (contrast, screen-reader output).

## AI-assisted workflow

I built this with Claude Code and kept the setup in the repo on purpose, so you can see how the
AI was steered and checked, not only what it produced. The idea: write the constraints down once,
make the important ones mechanical, and have a separate reviewer check the output.

**1. Context, written down once**

- `CLAUDE.md`: the stack, the BFF architecture and seven hard rules (the key stays on the server,
  every upstream call goes through one rate limiter, tests never call the real API, UTC only at
  the edge, validate at both edges, strip `userId`, don't invent API behaviour).
- `.claude/rules/*.md`: deeper rules that load only when matching paths are edited: API and rate
  limit (`server/**`), time and UX (`app/**`), Vue conventions, testing. This keeps each session's
  context small and on topic.
- `PLAN.md` and `docs/plans/*`: phases with acceptance criteria and a request budget per user
  action. The agent works one phase at a time and ticks criteria off.
- `docs/API_NOTES.md`: what the real API actually does, checked by hand with
  `scripts/probe-api.sh` where it differs from the docs (rate-limit headers, a 401 for a bad key,
  ids starting at 0, `userId` echoing the key).

**2. Guardrails that don't depend on the model remembering**

| Guardrail | Where | What it stops |
|---|---|---|
| ESLint `no-restricted-syntax` | `eslint.config.mjs` | Reading the key outside `server/utils/memtime.ts`, hard-coding the upstream URL, `$fetch` in components and pages |
| `guard-secrets` hook | `.claude/hooks/` (before every edit) | Writing the real key (read from `.env`), a literal bearer token, or key references into `app/` |
| `verify-on-stop` hook | `.claude/hooks/` (when the agent finishes) | Ending a turn with failing typecheck or tests |
| Permissions | `.claude/settings.json` | Reading `.env`, force-pushing; the probe script and `git push` always ask |
| `npm run smoke` | `scripts/smoke.mjs`, CI | Key leaks, wrong error shapes, rate-limit regressions, end to end |

Lint is not a per-edit hook. Half-finished edits produce noisy errors that cost tokens, so lint
runs once through `npm run check`, which prints one line per passing step.

**3. An independent QA pass**

`.claude/agents/qa.md` is a reviewer subagent that didn't write the code. It has no edit tools
and is told never to change files. It runs `check --no-fix` and `smoke`, then goes through a
checklist built from the hard rules (key safety, rate-limit fan-out, DST and midnight cases, error
paths, accessibility, docs drift) and returns findings ranked blocker / major / minor with
`file:line` evidence. Run it with `/qa [scope]` (`.claude/commands/qa.md`), which also tells the
main agent to verify each finding before fixing it, since a reviewer model can be wrong too.

The QA rounds themselves are committed in [`docs/qa/`](docs/qa/README.md): each reviewer report,
the full `check`, test and smoke logs, and a [findings table](docs/qa/2026-10-23/findings.md)
linking every finding to its fix commit and the test that proves it.

**What stayed with me:** the stack, the UX trade-offs in `docs/plans/` (end time derived from
start + duration, how DST gaps and overlaps behave, no automatic retry of a POST after a network
error or 5xx, where it may already have been saved), and the call on every QA finding. `.claude/settings.local.json` is the only gitignored Claude file.
