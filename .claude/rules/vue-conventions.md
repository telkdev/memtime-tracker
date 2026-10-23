---
paths:
  - "app/**/*.vue"
  - "app/**/*.ts"
---

# Vue and Nuxt conventions

- `<script setup lang="ts">` only. Type props and emits with `defineProps<...>()` and
  `defineEmits<...>()`. Use `defineModel` for v-model.
- Components render and emit. Data fetching and state live in composables (`useCatalog`,
  `useTimeEntries`). Components never call `$fetch` themselves.
- Use `useFetch` / `useAsyncData` for reads tied to a page, with explicit `key`s. Use `$fetch` inside
  composable actions for writes.
- Share state across components with `useState` keyed by a constant. Don't use module-level `ref`s,
  because they leak between SSR requests.
- Map API errors through one helper (`useApiError` / `app/utils/errors.ts`) that turns the BFF
  `ApiError` into `{ summary, fields, retryAfter }`.
- Use Nuxt UI components before writing custom ones. Style with Tailwind utility classes. Use no
  inline styles except for computed values.
- Don't use `v-html`.
- Keep components under about 200 lines. Split by responsibility, not by size alone.
- Every async view handles all four states: loading, error, empty and data.
- Imports: use Nuxt auto-imports for Vue and Nuxt APIs and for `shared/` utils. Import explicitly
  from third-party packages.
