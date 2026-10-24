---
name: feature-structure
description: Where frontend code goes in app/ and how features may import each other. Use when adding or moving a component, composable, type, API call or helper under app/, or adding a new feature.
---

# Feature structure

Full rules and the reasons: `app/features/README.md`. This is the short version to follow.

## Where a file goes

1. Pick the owner: `app/features/<name>/` if one feature uses it, `app/common/` if any feature
   may use it and it knows nothing about a feature. Pages in `app/pages/` stay thin.
2. Pick the folder inside it. Create a folder only when the first file goes in.

| It is...                                              | Folder         |
|-------------------------------------------------------|----------------|
| a `.vue` component (renders, emits, no requests)      | `ui/`          |
| a `useX()` with reactive state or lifecycle           | `composables/` |
| a type, constant or domain rule (pure, no Vue)        | `model/`       |
| a `$fetch` call to the BFF                            | `api/`         |
| a pure helper that shapes data for the screen         | `lib/`         |

model vs lib: "would this rule hold in a CLI or Electron app?" Yes → `model/`.

API shapes come from the zod schemas in the root `shared/` (`#shared/schemas/...`). Re-export or
derive them in `model/types.ts`; never redeclare `TimeEntry`, `Task` and so on.

## Imports

- Our own code is not auto-imported (`components: []`, `imports.scan: false`). Write the import.
  Vue, Nuxt and Nuxt UI (`ref`, `useState`, `UButton`) are still auto-imported.
- Another feature: `import { X } from '~/features/<name>'`. Common: `from '~/common'`.
- Inside the same feature: relative paths (`../composables/useX`).
- Never a deep path into another feature, never `../../` out of a feature, and `common/` never
  imports a feature. ESLint blocks all of these; don't silence the rule. If you need something,
  export it from that feature's `index.ts`.
- Export from `index.ts` only what a page or another feature uses. Tests may import files directly.
- Keep the dependency graph one-way: `entry-form → time-entries → catalog`, everything → `common`.
  If a change would make two features import each other, stop and ask.

## Requests

`$fetch` only in an `api/` file, one thin function per BFF route, always with `retry: 0`.
Composables call those functions. Tests mock `$fetch` with `mockNuxtImport`, which still works.

## Adding a feature

1. `app/features/<name>/index.ts` plus only the folders you need.
2. Add it to the layout table and dependency graph in `app/features/README.md` and the structure
   block in `CLAUDE.md`.
3. Use it from a page through `~/features/<name>`.

## Before you say it's done

Run `npm run check`. `tests/unit/feature-boundaries.test.ts` fails if the boundary rules stop
working. Run `npm run smoke` too if you touched `api/`, `nuxt.config.ts` or the schemas.
