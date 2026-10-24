# Frontend structure

The app is split by **feature**, not by file type. Everything about one feature lives in one
folder, and other code may use it only through that folder's `index.ts`.

```
app/
  pages/                  thin: read the route, put feature components on the page
  features/
    catalog/              client → project → task tree, task names
    time-entries/         the paged list, entry cache, time-entry API calls
    entry-form/           create and edit one entry
  common/                 code any feature may use (time, errors, small generic composables)
```

Inside a feature (a folder exists only when it has files):

| Folder         | What goes in                                                             | Example                                  |
|----------------|--------------------------------------------------------------------------|------------------------------------------|
| `ui/`          | Vue components. Render and emit, no requests.                            | `EntryForm.vue`, `ClientTree.vue`        |
| `composables/` | `useX()` functions: reactive state and actions, Vue lifecycle.           | `useEntryForm`, `useCatalog`             |
| `model/`       | The feature's main types and its domain rules. Pure, no Vue.             | `types.ts`, `rules.ts` (overlap, defaults) |
| `api/`         | The only place that calls `$fetch`. Thin functions, one per BFF route.   | `createTimeEntry`, `fetchCatalogPage`    |
| `lib/`         | Pure helpers for this feature that aren't domain rules.                  | `tree-rows.ts`, `task-options.ts`        |
| `index.ts`     | The public API. Only what other features and pages need.                 |                                          |

**model vs lib.** `model/` says *what the feature's data is and which rules it follows*: types,
constants, domain rules such as "an entry over 12 h gets a warning" or "which message a field
shows". `lib/` is *how we shape data for the screen*: building tree rows, grouping options. If
you're unsure, ask "would this rule still hold in a CLI or an Electron app?" Yes → `model/`.

**API types are not redeclared.** Shapes that the client and the server share are zod schemas in
the root `shared/` (`#shared/schemas/...`). A feature's `model/types.ts` re-exports or derives
from them; it never writes its own copy of `TimeEntry`.

## The rules, and what enforces them

| Rule                                                         | Enforced by                                 |
|--------------------------------------------------------------|---------------------------------------------|
| Another feature is imported only as `~/features/<name>`      | ESLint `no-restricted-imports`              |
| `common/` is imported only as `~/common`                     | ESLint `no-restricted-imports`              |
| No `../../` out of a feature into another one                | ESLint `no-restricted-imports`              |
| `common/` never imports a feature (no cycles)                | ESLint `no-restricted-imports`              |
| Only `api/` files call `$fetch`                              | ESLint `no-restricted-syntax`               |
| Our own code isn't auto-imported, so the index can't be skipped | `nuxt.config.ts`: `components: []`, `imports.scan: false` |

`tests/unit/feature-boundaries.test.ts` lints small probe files and checks that each rule still
fires, so a config change can't switch them off quietly.

Vue (`ref`, `computed`), Nuxt (`useState`, `useToast`, `$fetch`) and Nuxt UI (`UButton`) are still
auto-imported. Only our own code is imported explicitly, which also makes "where does this come
from?" a one-click answer in the editor.

## Dependencies between features

```
entry-form ──▶ time-entries ──▶ catalog
     └──────────────────────────────▲
all of them ──▶ common
```

Arrows point one way. `catalog` doesn't know about entries; `time-entries` uses catalog only for
task names; `entry-form` uses both. Strict Feature-Sliced Design would move `catalog` and the
entry cache into an `entities/` layer so features never import each other. With three features
that's more folders than it's worth; if a cycle ever appears, that's the moment to add the layer.

## Adding a feature

1. `app/features/<name>/` with only the folders you need, and an `index.ts`.
2. Export from `index.ts` only what a page or another feature uses.
3. Import it from pages as `import { X } from '~/features/<name>'`.
