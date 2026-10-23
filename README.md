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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run preview` | Production build and local preview |
| `npm run check` | Lint (with autofix), typecheck and tests in one go. Prints one line per passing step and only the tail of a failure. Run it before every commit. |
| `npm run check -- lint` | Run a single step: `lint`, `typecheck` or `test` |
| `npm run lint` / `npm run lint:fix` | ESLint only |
| `npm run typecheck` | `nuxi typecheck` only |
| `npm run test` / `npm run test:watch` | Vitest only |
| `./scripts/probe-api.sh` | Manual check of the real API contract. It spends about 6 requests of the 15/min budget, so never run it in CI. |

## Working with Claude Code

The repo includes a Claude Code setup:

- `CLAUDE.md`: stack, architecture and hard rules (the key stays on the server, every API call
  goes through one rate limiter, tests never call the real API).
- `.claude/rules/*.md`: rules for API usage, time and UX, Vue conventions and testing. Each one
  loads when Claude edits matching paths.
- `.claude/settings.json`: permissions plus two hooks.
  - `guard-secrets.mjs` (before edits): blocks writes that would leak the API key.
  - `verify-on-stop.mjs` (when Claude finishes): runs typecheck and tests if source files
    changed.

Linting isn't a hook on every edit. Half-finished edits produce noisy lint errors that waste
tokens, so lint runs through `npm run check`.
