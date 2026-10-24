import { fetchTimeEntry } from '../api/time-entries'
import { useTimeEntryCache } from './useTimeEntries'

/**
 * One entry for the edit page. Opened from the list, the entry is already in memory, so this
 * costs no request; otherwise it's one GET through the BFF.
 */
export function useTimeEntry(id: number | undefined) {
  const { getCached } = useTimeEntryCache()
  const cached = id === undefined ? undefined : getCached(id)
  return useAsyncData(
    `time-entry:${id}`,
    () => cached ? Promise.resolve({ entry: cached }) : fetchTimeEntry(id!),
    { immediate: id !== undefined },
  )
}
