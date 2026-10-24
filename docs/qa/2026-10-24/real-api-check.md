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
