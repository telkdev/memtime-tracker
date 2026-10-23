import type { TimeEntry } from '#shared/schemas/timeEntry'
import { buildTaskOptions, type TaskOption, type TaskOptionGroups } from '~/utils/task-options'
import { recentTaskIds } from '~/utils/entry-form'

/**
 * Everything the entry form reads from the rest of the app, in one place: loaded entries
 * (recent tasks, smart start, overlaps), the loaded catalog (picker) and task names.
 * All of it is data that's already in memory; nothing here triggers a request.
 */
export function useEntrySources() {
  // Wired to useTimeEntries().loadedEntries / getCached and useCatalog().taskIndex once they land.
  const loadedEntries = computed<readonly TimeEntry[]>(() => [])
  const catalog = computed<readonly TaskOption[]>(() => [])
  const nameOf = (_id: number): string | undefined => undefined
  const getCached = (_id: number): TimeEntry | undefined => undefined

  function taskGroups(include?: number | null): TaskOptionGroups {
    const ids = recentTaskIds(loadedEntries.value)
    if (include && !ids.includes(include) && !catalog.value.some(o => o.id === include)) ids.unshift(include)
    return buildTaskOptions(ids, catalog.value, nameOf)
  }

  return { loadedEntries, getCached, taskGroups }
}
