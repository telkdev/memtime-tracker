# Code review by area (2026-10-24)

The code was reviewed in six parts, one `/code-review` run (high effort) per area, instead of one big pass.
Each run gave up to 10 raw findings (60 in total). Every finding was then checked by hand against the
code (and, for the body-parsing ones, against the h3 1.15 source in `node_modules`).

Verdicts:

- **Real**: the failure scenario happens with the code as it is.
- **Real, minor**: it happens, but it is rare, cosmetic, or a code-quality point.
- **Noise**: the scenario doesn't happen, or something else already handles it.

Severity is about a paying user next week: **High** = wrong data or a stuck/looping app; **Medium** = a
visible bug in a normal flow; **Low** = edge case, a11y/perf polish, or tooling.

## Summary

| Area | Real | Real, minor | Noise | Fixed now |
|---|---|---|---|---|
| 1. Upstream client, limiter, cache | 3 | 6 | 1 | 0 |
| 2. API routes, errors, validation | 3 | 3 | 1 (+3 duplicates of area 1) | 0 |
| 3. Tree UI and catalog | 5 | 4 | 1 | 0 |
| 4. Entries list | 3 | 6 | 1 | 2 |
| 5. Entry form and time utils | 7 | 2 | 1 | 1 |
| 6. Harness, scripts, CI, tests | 3 | 7 | 0 | 1 |

Fixed in this commit (each with a test that fails before the fix): 4.1, 4.2, 5.6 and 6.1.
Everything else is listed below with a suggested fix, waiting for your call.

## Top 6 to fix before anyone uses it

1. **3.1 Task-name lookups loop forever on a temporary error** (High). In the form, the
   `watchEffect` in `useEntrySources` re-queues an id as soon as `forget(id)` drops it, so with the
   network down or the upstream failing it keeps calling `/api/tasks/:id`, two at a time, with no
   pause. Fix: remember failed ids with a "retry after" time (for example 30 s) instead of
   forgetting them.
2. **2.1 Any website can create entries through a local BFF** (Medium, security). `readBody`
   parses a body without a `Content-Type` as JSON, and that kind of request needs no CORS
   preflight. Fix: `readJsonBody` refuses anything that isn't `application/json` (415) and parses
   strictly. This also fixes 2.2.
3. **5.3 "End now" on an older entry** (Medium). It only passes the clock time, so on Wednesday
   "End now" on Monday's entry sets Monday 14:00, and with a start later in the day it becomes a
   23 h entry. Fix: duration = now − start, and refuse when now is before the start.
4. **3.4 Retrying a failed "Load more" throws away the loaded pages** (Medium). `retry()` loads
   offset 0 with `append: false`, so 200 loaded tasks shrink to 100. Fix: retry with
   `append: true` when the node already has items.
5. **5.2 The form sometimes guesses the wrong anchor** (Medium). If today's last entry ended on a
   quarter hour (14:00) and you open the form at 14:10, the page thinks it is "now" mode, so typing
   30m moves the start to 13:40 and overlaps the last entry. Fix: `defaultStart` returns which
   branch it took.
6. **5.9 Saving an edit silently moves the times** (Medium, data). The start is loaded as HH:mm
   and seconds are dropped, but the duration stays exact. Fixing only the comment of an entry made
   elsewhere at 09:00:42 saves it as 09:00:00. Fix: keep the seconds of the original start when the
   start field wasn't touched.

## 1. Server: upstream client, rate limiter, cache

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 1.1 | A queued job's deadline is never enforced on time. The timer only fires when the next slot opens, so after a 429 pause a request can hang for up to 60 s and is then rejected right when it could run (`rate-limiter.ts:140`). | Real | Medium |
| 1.2 | `sync()` raises `used` but never lines our window up with the upstream reset. When our window rolls first, the pump can send a whole queue into an upstream window that is nearly spent (`rate-limiter.ts:209`). Fix: move `windowStart` to `t + resetMs - windowMs`. | Real | Medium |
| 1.3 | Penalties go up once per 429 even when 4 requests from one burst all fail together, so one event jumps to the 60 s step. Only when there is no reset header (the real API sends one). | Real, minor | Low |
| 1.4 | `ratelimit-reset: 0` gives a 0 ms pause, so the 3 retries go out back to back. | Real, minor | Low |
| 1.5 | The 30 s "task not found" memory sits outside the cache, so the Refresh button doesn't clear it (`task-lookup.ts:22`). Same as 2.7. | Real | Low |
| 1.6 | Background lookups have no deadline, so under budget pressure `/api/tasks/:id` can stay open for a long time. The client caps itself at 2 parallel lookups, which limits the damage. | Real, minor | Low |
| 1.7 | The cache never evicts expired entries; each new `offset` or task id stays in memory for the life of the process. Same as 2.6. | Real, minor | Low |
| 1.8 | The localhost exception needs a `/` after the port, so `http://localhost:4010` (no path) fails in a production build. Same as 2.10. | Real, minor | Low |
| 1.9 | The pause code is duplicated in `penalize` and `sync`. | Real, minor | Nit |
| 1.10 | A timeout on POST says "Couldn't reach… try again" and could make a duplicate. | **Noise**: the form already replaces it with "may not have been saved. Check the list before trying again." | – |

## 2. Server: API routes, errors, validation

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 2.1 | No `Content-Type` check: a cross-site `fetch(..., {mode:'no-cors', body: new Blob([json])})` creates a real entry with your key, and `/api/catalog/refresh` can be hit the same way (`api-handler.ts:32`). | Real | Medium |
| 2.2 | The "body isn't valid JSON" 400 only fires for exactly `application/json`. With `; charset=utf-8` bad JSON becomes a string, and the answer is a VALIDATION error on field `_`. Our own client never sends that; a reviewer with curl might. | Real | Low |
| 2.3 | `FIELD_HINTS` uses `/end/i` and `/start/i`, so "extended" or "pending" in an upstream message lands under the End field (`time-entries.ts:41`). Fix: anchor them to whole words. | Real | Low |
| 2.4 | The `RateLimitedError` branch in `toApiError` can't run (the client already converts it) and has no `max(1, …)`. | Real, minor | Nit |
| 2.5 | `toPublicTimeEntry` parses again with nearly the same schema; its docstring describes a different flow. | Real, minor | Nit |
| 2.6 / 2.7 / 2.10 | Duplicates of 1.7, 1.5, 1.8. | Dup | – |
| 2.8 | `(err as Error).message` in `check-config.ts` breaks the "narrow `unknown`" rule in CLAUDE.md. | Real, minor | Nit |
| 2.9 | An internal ZodError would be reported as the user's VALIDATION error. | **Noise**: the only internal parse runs on data that already passed the stricter upstream schema, so it can't fail. | – |

## 3. Tree UI, catalog, task names

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 3.1 | Task-name retry loop (see top list) (`useTaskNames.ts:70`, `useEntrySources.ts:20`). The list itself is safe: it uses a plain `watch`. | Real | **High** |
| 3.2 | A load that started before Refresh can write its old result into the reset tree (no generation counter). | Real | Low |
| 3.3 | If the refresh POST fails, nodes that were "waiting" have lost their timers and never retry. | Real | Low |
| 3.4 | Retrying a failed "Load more" reloads from offset 0 (see top list) (`ClientTree.vue:98`). | Real | Medium |
| 3.5 | With a filter on, expand/collapse does nothing visible, and ArrowLeft on an open row doesn't move to the parent. Keyboard users get stuck. | Real | Low |
| 3.6 | With a filter on, the root's loading/error rows are hidden, so a failed load reads as "Nothing loaded matches". | Real, minor | Low |
| 3.7 | Task rows are built for collapsed projects too on every recompute. | Real, minor | Nit (perf) |
| 3.8 | Every node load also fetches `/api/_meta/rate-limit` (BFF only, no upstream cost). | Real, minor | Nit |
| 3.9 | `focusKey` builds a second map; `lastParents` is never pruned. | Real, minor | Nit |
| 3.10 | Clicking a "waiting" row retries early and "spends a request". | **Noise**: the BFF limiter refuses it locally at no upstream cost; retrying early on click is a reasonable choice. | – |

## 4. Entries list

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 4.1 | **Fixed.** Going back to a page that is still fresh in the cache didn't cancel the request for the other page, so its late answer replaced the screen (URL page 1, page 2 shown). | Real | Medium |
| 4.2 | **Fixed.** A 429 that arrived after leaving the list still scheduled a retry, and that retry kept spending the shared budget. | Real | Medium |
| 4.3 | A proxy's 502/503/504 HTML page becomes INTERNAL, not "outcome unknown", so a create may show "Something went wrong. Please try again" after it succeeded → a duplicate. Only behind a proxy. Fix: treat 502–504 without our body as a connection error. | Real | Low |
| 4.4 | A response that fails our schema (status 0) is reported as "Couldn't reach the server". The advice (check the list) is still safe. | Real, minor | Low |
| 4.5 | If the very first load is rate-limited, you get an empty table header under the "waiting" banner instead of a skeleton. | Real, minor | Low |
| 4.6 | `?highlight=` stays in the URL when the saved entry isn't on the page you returned to. | Real, minor | Low |
| 4.7 | The card link's `aria-label` replaces its whole content, so screen readers only hear "Edit entry #101". | Real, minor | Low (a11y) |
| 4.8 | Table and cards are both rendered, one hidden by CSS. | Real, minor | Nit (perf) |
| 4.9 | Clicking Refresh during the skeleton fires several upstream requests. | **Noise**: `force` joins the request already in flight, so only one goes upstream. | – |
| 4.10 | The rate-limit snapshot type is imported from server code and not validated by a shared schema. | Real, minor | Nit |

## 5. Entry form and time utilities

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 5.1 | Switching the DST "first/second time" radio doesn't clear a stale End error, so a valid entry can't be saved. DST nights only. | Real | Low |
| 5.2 | Wrong anchor guess when the last entry ended on a quarter hour (see top list) (`new.vue:22`). | Real | Medium |
| 5.3 | "End now" uses the start's date (see top list) (`useEntryForm.ts:135`). | Real | Medium |
| 5.4 | Typing `0`/`0m` gives an ISO-format error under End instead of "must be longer than 0". | Real | Low |
| 5.5 | Clearing the End box leaves it empty while the form still saves the old end. | Real | Low |
| 5.6 | **Fixed.** After a 429, the automatic retry of "Save & log another" went back to the list instead of a fresh form. | Real | Medium |
| 5.7 | Server field errors stay under a field you already corrected until the next save. | Real, minor | Low |
| 5.8 | Changing only the DST radio doesn't mark the form dirty, so the leave guard doesn't ask. | Real, minor | Low |
| 5.9 | Seconds dropped on edit (see top list). | Real | Medium |
| 5.10 | The summary hides when server fields don't map to a form field, so an error shows nowhere. | **Noise** for our client: the client validates the same schema first, so the server's `_` error only reaches curl users (covered by 2.2). | – |

## 6. Harness, scripts, CI, tests

| # | Finding | Verdict | Sev |
|---|---|---|---|
| 6.1 | **Fixed.** The Stop hook missed new files in new folders (porcelain shows only `dir/`). Now uses `--untracked-files=all`. | Real | Low |
| 6.2 | A quoted value in `.env` (`KEY="…"`) makes the secret guard and the smoke's bundle scan look for the quotes, so a real leak isn't caught. | Real | Low |
| 6.3 | `check.mjs` hides spawn errors; on Windows `spawnSync('npx')` fails and every step prints "✗" with no reason. Matters if a reviewer runs it on Windows. | Real | Low |
| 6.4 | `probe-api.sh` puts the key into a sed pattern unescaped. The current key is alphanumeric, so it works today. | Real, minor | Nit |
| 6.5 | The `runtimeConfig.public` guard only checks the edited fragment and stops at the first `}`. ESLint and the smoke's bundle scan are the real safety nets. | Real, minor | Low |
| 6.6 | The mock API crashes on a JSON `null` body. | Real, minor | Nit |
| 6.7 | `freePort()` can hand out the same port twice → rare smoke flake. | Real, minor | Low |
| 6.8 | The smoke reads the new id two different ways. | Real, minor | Nit |
| 6.9 | The ESLint URL/key rules miss template literals and `config['memtimeApiKey']`. | Real, minor | Low |
| 6.10 | Two tests don't check what their names say: the malformed-id test never checks that no request was made, and the highlight test only checks the "after unmount" half. | Real, minor | Low |

## How the fixes were checked

- New tests: `EntriesPanel.test.ts` (late answer for another page; 429 after unmount) and
  `entry-form.test.ts` (Save & log another across a 429 retry). All three fail on the old code and
  pass on the new.
- `npm run check -- --no-fix`: lint, typecheck and tests pass.
- `npm run smoke`: 29 of 29 pass.
