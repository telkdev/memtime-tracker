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
npm run build && npm run preview
./scripts/probe-api.sh        # MANUAL ONLY: hits the real API, spends rate-limit budget
```

Before you say a task is done, run `npm run check` and make sure it passes. It prints one line per
passing step and only the tail of a failure, so use it instead of running the three tools
separately. ESLint is deliberately not a per-edit hook: half-finished edits produce noisy errors
that cost tokens.

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
  pages/                index.vue (tree + entries), entries/new.vue, entries/[id]/edit.vue
  components/
    tree/               ClientTree.vue, TreeNode.vue
    entries/            EntriesTable.vue, EntryForm.vue, TaskPicker.vue, DurationInput.vue
    common/             RateLimitBanner.vue, ErrorState.vue, EmptyState.vue
  composables/          useCatalog.ts, useTimeEntries.ts, useApiError.ts, useRateLimitState.ts
  utils/                time.ts (local↔UTC, duration parse/format), errors.ts
server/
  api/
    clients/index.get.ts
    clients/[id]/projects.get.ts
    projects/[id]/tasks.get.ts
    time-entries/index.get.ts
    time-entries/index.post.ts
    time-entries/[id].put.ts
    time-entries/[id].get.ts       # only if the upstream supports it (check the docs)
    _meta/rate-limit.get.ts        # local budget snapshot, costs no upstream call
  utils/
    memtime.ts            # the ONLY upstream client: auth, queue, retry, error mapping
    rate-limiter.ts       # token bucket + priority queue (pure, unit-tested)
    cache.ts              # TTL cache + in-flight request coalescing
    errors.ts             # upstream error → ApiError
shared/
  schemas/                # zod: client, project, task, timeEntry, timeEntryInput, apiError, page
  types/                  # z.infer exports
tests/
  unit/  server/  components/  e2e/
docs/
  API_NOTES.md            # verified facts about the real API (shapes, headers, quirks)
```

Details are in `.claude/rules/`. Each file loads when you work on matching paths:

- `api-and-rate-limit.md`: upstream calls, the key, the queue, caching, errors
- `time-and-ux.md`: time zones, ISO 8601, the form, validation, UX standards
- `vue-conventions.md`: component, composable and styling rules
- `testing.md`: what to test, how to mock, and never hitting the real API from tests

## Hard rules (non-negotiable)

1. **The API key never leaves the server.** It lives in `.env` as `NUXT_MEMTIME_API_KEY` and is
   read through `useRuntimeConfig(event).memtimeApiKey` (private, not under `public`). Never put it
   in `app/`, in `runtimeConfig.public`, in logs, in error messages, in tests, fixtures, docs or
   commits. A PreToolUse hook (`.claude/hooks/guard-secrets.mjs`) blocks obvious leaks, but don't
   rely on it.
2. **Respect the rate limit: 15 requests per 60s, shared by the whole app.** Every upstream call goes
   through the limiter in `server/utils/memtime.ts`. Never `$fetch` the upstream anywhere else.
   Never fetch the whole tree on page load. Load it lazily on expand.
3. **Tests and CI never call the real API.** Mock at the `memtime.ts` boundary or with fixtures.
   `scripts/probe-api.sh` is the only thing that touches the real API, and a human runs it.
4. **All timestamps sent upstream are UTC ISO 8601 with `Z`.** The UI shows and edits local time.
   Conversion happens only in `app/utils/time.ts`.
5. **Validate at both edges.** Zod-parse request bodies in BFF routes and upstream responses in
   `memtime.ts`. If an upstream shape doesn't match, log it and return a 502 with a clear message.
   Don't pass garbage through.
6. **Don't invent API behaviour.** If something isn't in `docs/API_NOTES.md` or
   `API_V1_DOCUMENTATION.md`, check with the probe script or ask. Record verified facts in
   `docs/API_NOTES.md`.

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small and focused.
- Error shape returned by the BFF (always):
  `{ error: { status, code, message, fields?: Record<string,string>, retryAfter?: number } }`
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
