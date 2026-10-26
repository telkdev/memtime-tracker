import type { Ref } from 'vue'

type Fields = Record<string, Ref<unknown>>

/**
 * "Are there unsaved changes?" for a set of fields. It snapshots the whole `fields` object, so a
 * field added there is tracked without touching this file.
 */
export function useDirtyGuard<F extends Fields>(fields: F, normalize: { [K in keyof F]?: (value: F[K]['value']) => unknown } = {}) {
  const snapshot = () => JSON.stringify(Object.keys(fields).sort().map((key) => {
    const value = fields[key]!.value
    const fn = normalize[key] as ((v: unknown) => unknown) | undefined
    return [key, fn ? fn(value) : value]
  }))
  const saved = ref(snapshot())
  const isDirty = computed(() => snapshot() !== saved.value)

  /** Marks the current values, or a snapshot taken earlier (what a request sent), as saved. */
  function markSaved(sent = snapshot()) {
    saved.value = sent
  }

  return { isDirty, snapshot, markSaved }
}
