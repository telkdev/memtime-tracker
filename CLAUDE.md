# Memtime Time Tracker

Take-home for a Senior Full-Stack JS role. A Nuxt app over the Memtime demo API that shows the
client → project → task tree, lists the user's time entries, and creates and updates entries.
The brief says to build it as if paying customers use it next week, so correctness, UX and
robustness count more than the number of features.

The phased plan and acceptance criteria are in `PLAN.md`. Read it before starting a phase and tick
items off there as you finish them.

## Stack

- **Nuxt 4** (Vue 3, `<script setup lang="ts">`, Nitro server). Nuxt 3 is out of support, and
  Nuxt 4 uses the same mental model with an `app/` source directory.
- **TypeScript strict** everywhere. No `any`. Use `unknown` and narrow it.
- **Nuxt UI** (Tailwind v4, Reka UI primitives) for accessible inputs, tree, table and toasts.
  Don't add a second component library.
- **Zod** schemas in `shared/` are the single source of truth for API shapes. Both client and
  server import them.
- **Vitest** with `@nuxt/test-utils` for unit and component tests. **Playwright** is optional, for
  one end-to-end smoke test against a mocked BFF.
- **ESLint** via `@nuxt/eslint` (flat config). No Prettier: ESLint stylistic rules handle formatting.
- Package manager: **npm**. Node 22+.
- No Pinia unless shared state outgrows composables built on `useState`. Explain why if you add it.

## Commands

```bash
npm install
cp .env.example .env          # then put the real key in .env (gitignored)
npm run dev                   # http://localhost:3000
npm run lint                  # eslint .
npm run lint:fix
npm run typecheck             # nuxi typecheck
npm run test                  # vitest run
npm run test:watch
npm run check                 # lint --fix + typecheck + test, quiet output (scripts/check.mjs)
npm run check -- lint         # run one step: lint | typecheck | test
npm run check -- --no-fix     # report lint errors without fixing (CI does this automatically)
npm run smoke                 # build, then run the app against the mock API (no real calls)
npm run build && npm run preview
npm run mock:api              # local mock API on :4010 (set NUXT_MEMTIME_BASE_URL to use it)
./scripts/probe-api.sh        # MANUAL ONLY: hits the real API, spends rate-limit budget
```

Before you say a task is done, run `npm run check` and make sure it passes. It prints one line per
passing step and only the tail of a failure, so use it instead of running the three tools
separately. ESLint is deliberately not a per-edit hook: half-finished edits produce noisy errors
that cost tokens. Run `npm run smoke` too when you touched a BFF route, the schemas or the config.

## QA

`.claude/agents/qa.md` is a read-only QA subagent: it runs `check --no-fix` and `smoke`, then
reviews the change against the hard rules, the path rules and the plan's acceptance criteria and
returns ranked findings. Run it with `/qa [scope]` after finishing a plan phase or before a
commit that changes behaviour. Verify a finding yourself before acting on it.

## Architecture: the BFF pattern

```
Browser (Vue)  ──/api/*──▶  Nitro server (BFF)  ──Bearer key──▶  Memtime API
                            • holds the API key
                            • rate limiter (shared budget)
                            • cache + in-flight dedupe
                            • error normalisation
```

The browser **never** calls the Memtime API directly and never sees the key. Every upstream call
goes through `server/utils/memtime.ts`.

```
app/
  pages/                index.vue (tree + entries); Task 3 adds entries/new.vue, entries/[id]/edit.vue
  components/
    tree/               ClientTree.vue, TreeRow.vue, TreeToolbar.vue (rows built by utils/tree-rows.ts)
    entries/            EntriesPanel.vue, EntriesTable.vue, EntriesCards.vue, EntriesPager.vue, EntriesStatus.vue,
                        EntriesTaskCell.vue; Task 3 adds EntryForm, TaskPicker, DurationInput
    common/             RateLimitIndicator.vue
  composables/          useCatalog, useTimeEntries, useTaskNames, useRateLimitState, useNow
  utils/                time.ts (local↔UTC, duration), api-error.ts (parseApiError), catalog.ts,
                        entries.ts, tree-rows.ts
server/
  api/
    clients/index.get.ts, clients/[id]/projects.get.ts, projects/[id]/tasks.get.ts
    tasks/[id].get.ts              # name lookup for the entries list (background lane)
    catalog/refresh.post.ts        # drop the catalog cache
    time-entries/index.get.ts      # Task 3 adds index.post.ts, [id].get.ts, [id].put.ts
    _meta/rate-limit.get.ts        # local budget snapshot, costs no upstream call
    [...].ts                       # unknown /api/* → BFF 404 shape
  plugins/check-config.ts          # fail at startup without a key
  utils/
    memtime.ts            # singletons: the ONLY place that reads the key
    memtime-client.ts     # the ONLY upstream caller: auth, limiter, 429 retry, zod, redaction
    rate-limiter.ts       # fixed window + priority lanes (pure, unit-tested)
    cache.ts              # TTL + SWR cache, in-flight coalescing
    errors.ts             # ApiException, anything thrown → ApiError body
    api-handler.ts        # defineApiHandler, parseParams, parseQuery
    catalog.ts, time-entries.ts
shared/
  schemas/                # zod + inferred types: catalog, timeEntry, common (ApiError, Page)
tests/
  unit/  server/  components/  fixtures/
scripts/
  check.mjs  smoke.mjs  mock-api.mjs  probe-api.sh
docs/
  API_NOTES.md            # verified facts about the real API (shapes, headers, quirks)
  plans/                  # per-task plans with request budgets and acceptance criteria
```

Details are in `.claude/rules/`. Each file loads when you work on matching paths:

- `api-and-rate-limit.md`: upstream calls, the key, the queue, caching, errors
- `time-and-ux.md`: time zones, ISO 8601, the form, validation, UX standards
- `vue-conventions.md`: component, composable and styling rules
- `testing.md`: what to test, how to mock, and never hitting the real API from tests

## Hard rules (non-negotiable)

1. **The API key never leaves the server.** It lives in `.env` as `NUXT_MEMTIME_API_KEY` and is
   read through `useRuntimeConfig().memtimeApiKey` (private, not under `public`). Never put it
   in `app/`, in `runtimeConfig.public`, in logs, in error messages, in tests, fixtures, docs or
   commits. A PreToolUse hook (`.claude/hooks/guard-secrets.mjs`) blocks obvious leaks and ESLint
   blocks reading the key outside `server/utils/memtime.ts`, but don't rely on either.
2. **Respect the rate limit: 15 requests per 60s, shared by the whole app.** Every upstream call goes
   through `useMemtime()` (`server/utils/memtime.ts`), and so through the limiter. Never `fetch` the
   upstream anywhere else.
   Never fetch the whole tree on page load. Load it lazily on expand.
3. **Tests and CI never call the real API.** Mock at the `memtime.ts` boundary or with fixtures.
   `scripts/probe-api.sh` is the only thing that touches the real API, and a human runs it.
4. **All timestamps sent upstream are UTC ISO 8601 with `Z`.** The UI shows and edits local time.
   Conversion happens only in `app/utils/time.ts`.
5. **Validate at both edges.** Zod-parse request bodies in BFF routes and upstream responses in
   `memtime.ts`. If an upstream shape doesn't match, log it and return a 502 with a clear message.
   Don't pass garbage through.
6. **Strip `userId` from every time entry.** The upstream fills it with the raw API key. BFF
   output schemas leave it out, and a test checks for it.
7. **Don't invent API behaviour.** If something isn't in `docs/API_NOTES.md` (which links the
   official docs), ask a human to run the probe script, or ask. Record verified facts in
   `docs/API_NOTES.md`.

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small and focused.
- Error shape returned by the BFF (always):
  `{ error: { status, code, message, fields?: Record<string,string>, retryAfter?: number } }`
- Components are auto-imported by file name only (`pathPrefix: false`): `components/tree/ClientTree.vue`
  is `<ClientTree>`. Keep file names unique.
- Client `$fetch` calls to the BFF pass `retry: 0`. ofetch otherwise retries 429/5xx immediately,
  which only burns rate-limit budget. Retrying is handled deliberately (waiting state + countdown).
- Names: components in PascalCase, composables as `useX`, server utils in camelCase. Files under
  `server/api` follow Nitro method suffixes (`.get.ts`, `.post.ts`, `.put.ts`).
- Comments explain *why*, not *what*. Leave out commented-out code.
- User-facing copy is short, plain and actionable. Say what happened and what to do next.

## Things to keep in mind

- The API key represents one user. This app is effectively single-tenant. Say so in the README.
  Don't build fake login.
- The in-memory limiter and cache assume a single server instance. Say so in the README and name
  Redis/Upstash as the scale path.
- The README is part of the deliverable: setup, architecture, trade-offs, what I'd do next.
