# Task 1: Clients → Projects → Tasks tree

The goal is a tree you can browse quickly and completely with the keyboard, that never goes over
the 15 requests/60s limit, and that stays understandable when it has to wait. This plan includes
only the scaffold and server pieces Task 1 needs. Write-specific parts (write lane, POST/PUT
schemas) come with Task 3.

## Request budget: the numbers that drive the design

| Action | Upstream calls |
|---|---|
| Open the page | **1** (`GET /clients?limit=101`) |
| Expand a client | **1** (`GET /clients/:id/projects?limit=101`) |
| Expand a project | **1** (`GET /projects/:id/tasks?limit=101`) |
| Collapse and expand again, or reload within 5 min | **0** (cache) |
| Node with more than 100 children | +1 per "Load more" click |

We ask for `limit=101`: if 101 items come back, there are more, and the API gives no total. The
upstream default is 10, which would multiply calls by 10, so we never rely on it.

Example: 5 clients × 4 projects means exploring the whole tree costs 1 + 5 + 20 = 26 calls, about
two windows. Normal use (open one client and one project) costs 3. That's why there's **no
"expand all"** and no eager prefetch in v1.

## Build steps (each step is one commit)

### 1. Scaffold (≈1 h)
- Nuxt 4 + `@nuxt/ui`, `@nuxt/eslint`, `@nuxt/test-utils`, `vitest`, `happy-dom`, `zod`.
- npm scripts, including `check`. `vitest.config.ts` with `TZ=Europe/Berlin`. A CI workflow that
  runs `npm run check`.
- `nuxt.config.ts`: `runtimeConfig.memtimeApiKey` and `memtimeBaseUrl` (private), plus limiter
  settings (`rateLimit: { budget: 14, windowMs: 60_000, maxWaitMs: 8_000 }`).
- `server/plugins/check-config.ts`: stop at startup with a clear message if the key is missing.
- App shell: header, main area, toast container.

### 2. Shared schemas (≈20 min)
`shared/schemas/catalog.ts`:
- `Client { id: number, name, description, status, createdAt, updatedAt }`
- `Project { id, clientId, name, status, createdAt, updatedAt }`
- `Task { id, parent: number, name, status, createdAt, updatedAt }`
- `Page<T> { items: T[], hasMore: boolean, nextOffset: number | null }`. This is **our** envelope.
  The upstream returns a bare array.
- `ApiError { error: { status, code, message, retryAfter? } }`

Use plain `z.object` (it strips unknown keys by default; don't use `.passthrough()` or
`.strict()`). Unknown upstream fields are dropped, not forwarded, and don't cause errors. This is the same habit that later protects us from `userId` (the field that contains the
API key).

### 3. Rate limiter (≈1.5 h): the core piece, test-first
`server/utils/rate-limiter.ts`, a pure module with an injected clock:
- Fixed window, budget 14 (the upstream allows 15; 1 is kept spare for clock skew).
- Lanes: `interactive` > `background`. The `write` lane is added in Task 3; the API leaves room for
  it.
- `schedule(lane, fn)` → waits for a slot. If the wait would exceed `maxWaitMs`, it rejects with
  `RateLimited { retryAfterMs }` instead of hanging the HTTP request.
- `penalize()` on an upstream 429: marks the window as spent until it ends. Retry 2 s, then 5 s,
  then 15 s with jitter (max 3). If a `Retry-After` header ever appears, use it.
- `snapshot()` → `{ remaining, resetsInMs, queued }`, used by the UI.

### 4. Cache + upstream client (≈1 h)
- `server/utils/cache.ts`: TTL map + **in-flight coalescing** (the same key shares one promise).
  Catalog TTL is 5 min, stale-while-revalidate. Errors are never cached.
- `server/utils/memtime.ts`, `memtimeGet(path, query, { lane, schema })`: adds the Bearer header,
  goes through the limiter, parses with Zod, and maps errors:
  - `{ error: string }` 404 → `NOT_FOUND`; 429 → retry, then `RATE_LIMITED`; 5xx or network →
    `UPSTREAM_UNAVAILABLE`; schema mismatch → `UPSTREAM_INVALID` (502).
  - 401/403, or `404 Unknown user` → `UPSTREAM_AUTH` (502). The key never appears in logs or
    messages.
- `listPage(path, offset)`: requests `limit=101`, returns `Page<T>` with the first 100 items.

### 5. BFF routes (≈30 min)
- `GET /api/clients?offset=`
- `GET /api/clients/:id/projects?offset=`
- `GET /api/projects/:id/tasks?offset=`
- `GET /api/_meta/rate-limit` → limiter snapshot (no upstream call)

IDs are validated as positive integers with Zod. A bad ID returns 400 locally and costs no budget.

### 6. `useCatalog()` composable (≈1 h)
State shared via `useState` (SSR-safe):
- `nodes: Map<key, { status: 'idle'|'loading'|'waiting'|'error'|'loaded', children, hasMore, nextOffset, error?, retryAt? }>`
- `expand(node)`: fetches only when the status is `idle` or `error`. Loading the same node again
  is free.
- `loadMore(node)` and `retry(node)`.
- **Waiting state**: a BFF 429 sets `waiting` with `retryAt`. The composable retries by itself
  when the time is up, and the UI shows a countdown. Nothing ever surfaces as a raw error.
- `taskIndex: Map<taskId, { task, project, client }>` is filled as tasks load. Task 2 (names in
  the list) and Task 3 (the picker) reuse it.
- `refresh()`: clears client state and asks the BFF to bypass its cache for the next call.

**`Task.parent`**: if it's non-zero and points to a task in the same list, nest the task under it.
Otherwise show it at the top level. This is cheap and handles both meanings. Confirm with the
probe what `parent` actually means.

### 7. Tree UI (≈2 h)
- Spend 15 min checking Nuxt UI's `UTree`. If it supports async children plus our per-node states
  (waiting, error, load more), use it. Otherwise build `ClientTree.vue` + `TreeNode.vue` on the
  WAI-ARIA tree pattern. My guess is we'll build our own.
- Each row shows an icon, name, child count once loaded (`100+` if there are more), and a
  non-active `status` badge (archived and so on).
- Per-node states: skeleton rows while loading; "Waiting for rate limit · 12s" countdown;
  inline error with Retry; "No projects" / "No tasks"; "Load more" button.
- Keyboard (WAI-ARIA tree, roving tabindex): ↑/↓ move, → expands or goes to the first child,
  ← collapses or goes to the parent, Home/End, type-ahead on the first letter. Enter on a task emits
  `select(task)`. In Task 3 that opens "Log time".
- `role="tree"`, `treeitem`, `aria-expanded`, `aria-level`, `aria-busy` on loading nodes. Focus
  stays visible.
- Toolbar: a "Filter loaded items" text box (labelled honestly, because it can't search what isn't
  loaded), a Refresh button, and a small budget indicator ("9/14 requests left · resets in 23s").

### 8. Tests (written alongside, not after)
- Limiter (fake timers): never more than 14 calls in any window with 50 concurrent callers;
  interactive goes before background; past `maxWaitMs` it rejects with `retryAfterMs`; `penalize()`
  blocks until the window resets.
- Cache: 2 concurrent identical calls → 1 upstream call; TTL expiry; errors aren't cached.
- `memtime.ts`: error mapping for each status, including `Unknown user` → `UPSTREAM_AUTH`; a 101-item
  response → 100 items and `hasMore: true`; schema mismatch → 502.
- `useCatalog`: expanding twice → one fetch; 429 → `waiting`, then auto-retry; nesting by `parent`.
- `TreeNode`: keyboard navigation and ARIA attributes; every state renders its text.

## Acceptance criteria

- [ ] First page load makes exactly 1 upstream call. Expand → 1, collapse and re-expand → 0.
- [ ] Rapidly expanding 20 nodes: no error toasts; the nodes past the budget show a countdown and
      then fill in without any action from the user.
- [ ] The whole tree can be used with the keyboard alone, and a screen reader announces level and
      expanded state.
- [ ] Every node has visible loading, waiting, error (with working Retry), empty and "load more"
      states.
- [ ] An invalid key shows "Server is misconfigured" (not "not found"). The key is not in any
      response, log or bundle.
- [ ] `npm run check` passes, and CI is green.

## Out of scope for Task 1 (on purpose)

- Expand all / prefetch: costs budget for data the user may never look at. Revisit with a
  background lane once Task 3's picker needs it.
- Keeping expanded nodes across reloads: easy later, and cheap because of the server cache.
- Multi-instance limiter (Redis): documented in the README as the scale path.

## Estimate

About 7 to 8 hours, including tests. Most of it is steps 3, 4 and 7. Steps 3 and 4 are reused
unchanged by Tasks 2 and 3, so later tasks get faster.
