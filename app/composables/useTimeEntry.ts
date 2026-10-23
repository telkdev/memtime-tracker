import type { TimeEntry } from '#shared/schemas/timeEntry'

/**
 * One entry for the edit page. Opened from the list, the entry is already in memory, so this
 * costs no request; otherwise it's one GET through the BFF.
 */
export function useTimeEntry(id: number | undefined) {
  const { getCached } = useTimeEntryCache()
  const cached = id === undefined ? undefined : getCached(id)
  return useAsyncData(
    `time-entry:${id}`,
    () => cached ? Promise.resolve({ entry: cached }) : $fetch<{ entry: TimeEntry }>(`/api/time-entries/${id}`, { retry: 0 }),
    { immediate: id !== undefined },
  )
}
