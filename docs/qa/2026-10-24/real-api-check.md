# Real-API check of the feature structure

- Date: 2026-10-24
- Branch: `feature-structure`, commit `62f2d16` (the code under test; this report is committed on top)
- Setup: `npm ci`, `npm run build`, then `node --env-file=.env .output/server/index.mjs` on port 3000
  against the real Memtime API. Browser: Playwright (Chromium), headless. Time zone shown by the
  app: Europe/Warsaw.
- Requests were spread out with pauses so the app never went over 15 requests per 60 s. No 429 was seen.

## Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `npm run check` (lint, typecheck, unit tests) | Pass | `real-api-check.log` |
| 2 | `npm run smoke` (mock API) | Pass, 29 of 29 | `smoke.log` |
| 3 | `npm run build` | Pass | built in about 5 s |
| 4a | Tree: clients load, expand a client and a project | Pass | 100 clients listed. "Client 1" → "Project 1 for Client 1", "Project 2 for Client 1". "Project 1" → "Task 1 for Project 101" with a "Log time" button. One request per expand (`/api/clients/1/projects`, `/api/projects/101/tasks`). |
| 4b | Entries list | Pass, one page | 5 rows (#0, #2, #4, #6, #8) with task names. Only one page exists: "Newer" and "Older" are both disabled, "Page 1". |
| 4c | Create entry, 30m | Pass in the UI, but the API does not keep it (see Problem 1) | `POST /api/time-entries` → toast "Entry #11 created 14:33–15:03, 30m on Task 2 for Project 106", redirect to `/?highlight=11`. Body sent in UTC with `Z`. |
| 4d | Edit that entry | Could not run as planned (see Problem 1) | `/entries/11/edit` shows "This entry doesn't exist". `PUT /api/time-entries/11` → BFF 404 `NOT_FOUND`. The edit form for an existing entry (#8) loads with correct values (comment, date 2025-11-26, start 12:38, 30m, end 13:08, task "Task 1 for Project 341"). It was not saved, so seed data is unchanged. |
| 4e | Duration "0m" | Pass | "Enter a duration longer than 0 minutes." under Duration. No "ISO 8601" text on the page. No POST sent. |
| 4f | 404 | Pass | `/entries/999999/edit` → "This entry doesn't exist. It may have been deleted, or the link is wrong." with "Log new entry" and "Back to list". `curl /api/time-entries/999999` → `404 {"error":{"status":404,"code":"NOT_FOUND","message":"This entry doesn't exist, or it was deleted."}}` |
| 4g | API key not in the browser | Pass, not found | 318 responses seen by the browser (HTML, JS, CSS, JSON) and `.output/public`: key not found. Server log: key not found. No JSON response contains `userId` (only the schema field name appears in one JS chunk). |
| 5 | Delete the created entry | Not needed | Upstream `DELETE /time-entries/11` → 404. The BFF `GET /api/time-entries/11` → 404. Nothing was left behind. |

Created id: **#11**. Deleted: not needed, because the API never kept it.

## Problems found

1. **The demo API does not keep created entries.** `POST /time-entries` returned id 11, but a
   `GET /time-entries/11` a minute later returned `404 Time entry not found`, `PUT` returned
   `404 Time entry #11 not found`, `DELETE` returned 404, and the list still shows only #0–#8.
   This is upstream behaviour, not an app bug, but it affects the user. After "Save", the app
   goes to `/?highlight=11` and the new row is not there. If you open it to edit, you get "This entry doesn't exist".
   Worth a line in `docs/API_NOTES.md` and in the README. A possible UX fix: if the highlighted id
   is not in the list, show "Saved as #11, but the server doesn't list it yet."
   Steps: open `/`, click "Log time", pick "Task 2 for Project 106", duration 30m, any comment,
   "Save entry", then open `/entries/<new id>/edit`.
2. **Task picker is empty when `/entries/new` is opened directly.** "Recent" is built from the
   loaded entries, and a direct load (or reload) of `/entries/new` doesn't load them. The list shows
   only "No loaded task matches. Use 'Browse'…". From the home page "Log time" link the Recent
   group is filled. Small fix: load the first entries page on the form if it isn't cached.
3. **Small copy issues.**
   - Tree aria label says "1 items" (for example "Project 1 for Client 1 in-progress 1 items").
   - The BFF 404 message is different for GET ("This entry doesn't exist, or it was deleted.") and
     PUT ("This entry no longer exists. It may have been deleted."). Pick one.

## Structure docs

The structure README (`app/features/README.md`) and the Claude skill
(`.claude/skills/feature-structure/SKILL.md`, linked from `CLAUDE.md`) are already on this branch.
The folders they describe match the real `app/features/*` and `app/common/*` folders.

## Re-check after fixes (commit 05a2871)

- Fixes under test: the limiter window follows the upstream reset (`ratelimit-reset`), an upstream 400
  is mapped to the field it names, and the entries list no longer caches an answer that started before a save.
- Setup: `npm ci`, `npm run build`, then the built server on port 3000 with `.env`, against the real
  Memtime API. Browser: Playwright (Chromium), headless. No entries were created or changed.
- Log: `recheck.log` (check, smoke and build output, the server log and the burst replies).

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `npm run check` (lint, typecheck, unit tests) | Pass | `recheck.log` |
| 2 | `npm run smoke` (mock API) | Pass, 29 of 29 | includes "upstream never answered 429" |
| 3 | `npm run build` | Pass | `recheck.log` |
| 4a | Tree: load, expand a client and a project | Pass | 100 clients. "Client 1" → "Project 1 for Client 1", "Project 2 for Client 1". "Project 1" → "Task 1 for Project 101". |
| 4b | Entries list | Pass | 5 rows (#0, #2, #4, #6, #8) with task names, under the "Wed, 26 Nov 2025 · 2h 30m" day header. |
| 4c | Duration "0m" | Pass | "Enter a duration longer than 0 minutes." shown. No POST or PUT sent. |
| 4d | `/entries/999999/edit` | Pass | "This entry doesn't exist" page. Server log: upstream `GET /time-entries/999999 → 404`. |
| 4e | API key not exposed | Pass, not found | 90 browser responses, `.output/public`, the server log and `recheck.log`: key not found. |
| 5 | Limiter burst against the real API | Pass | 20 parallel BFF requests: 13 got data, 7 got a BFF 429 with `retryAfter: 49`. Upstream 429s: **0**. |
| 6 | Recovery after the reset | Pass | After waiting about 47 s, `GET /api/projects/114/tasks` (one of the requests that got a 429) → 200. |
| 7 | `resetsInMs` vs. upstream reset | Pass, matches | BFF snapshot `resetsInMs: 51293` right before a direct upstream call that answered `ratelimit-reset: 52`, `ratelimit-remaining: 13`. The BFF's `remaining` also agreed (13 before that call). |

### Burst numbers

- Requests: 20 × `GET /api/projects/{102..121}/tasks` in parallel (all uncached), at 15:12:05.
  Budget before the burst: `remaining: 13` of 14.
- 13 × 200 (about 0.2–0.3 s each). 7 × BFF 429 `RATE_LIMITED` in about 4 ms, with `retryAfter: 49`.
  No upstream call was made for these.
- `/api/_meta/rate-limit` polled during and after the burst: `remaining: 0`, `resetsInMs` counting
  down 48768 → 47738 → 46701 → 45548, `queued: 0`, `blockedForMs: 0`.
- Server log: no `→ 429` line. The upstream never answered 429.
- After the reset, the local window re-synced to the upstream one: `resetsInMs` went from 53682 (the
  local grid) to 59975 after the first upstream answer.

### Notes

- `ratelimit-reset` is not written to the server log, so the comparison in row 7 used one direct
  upstream request (one request; no write).
- Problems 1–3 above were not re-tested in this pass. Entry creation was skipped on purpose,
  because the demo API doesn't keep created entries.
