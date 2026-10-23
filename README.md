# Memtime Time Tracker

A Nuxt 4 app over the Memtime demo API. It shows the client → project → task tree, lists your
time entries, and creates and updates them. A Nitro backend-for-frontend holds the API key and
keeps every request within the API's limit of 15 requests per 60 seconds.

> Architecture, trade-offs and "what I'd do next" are added as the app is built. See `PLAN.md`.

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

**What stayed with me:** the stack, the UX trade-offs in `docs/plans/` (end time derived from
start + duration, how DST gaps and overlaps behave, no automatic retry of a POST after a network
error or 5xx, where it may already have been saved), and the call on every QA finding. `.claude/settings.local.json` is the only gitignored Claude file.
