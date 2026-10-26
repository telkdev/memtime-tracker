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

  /** Takes the current values of `keys` as saved and leaves the others alone (a default that moved, not an edit). */
  function markSavedOnly(keys: readonly (keyof F & string)[]) {
    const current = new Map(JSON.parse(snapshot()) as [string, unknown][])
    const base = (JSON.parse(saved.value) as [string, unknown][]).map(([key, value]) => [key, keys.includes(key) ? current.get(key) : value])
    saved.value = JSON.stringify(base)
  }

  return { isDirty, snapshot, markSaved, markSavedOnly }
}
