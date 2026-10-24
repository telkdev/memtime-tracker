// Catalog: the client → project → task tree, loaded lazily, and task names for other features.
export { default as ClientTree } from './ui/ClientTree.vue'
export { useCatalog } from './composables/useCatalog'
export { useTaskNames } from './composables/useTaskNames'
export * from './model/types'
