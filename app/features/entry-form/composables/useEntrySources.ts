import { buildTaskOptions } from '../lib/task-options'
import type { TimeEntry } from '#shared/schemas/timeEntry'
import type { TaskOption, TaskOptionGroups } from '../model/types'
import { recentTaskIds } from '../model/rules'
import { useCatalog, useTaskNames } from '~/features/catalog'
import { useTimeEntryCache } from '~/features/time-entries'

/**
 * Everything the entry form reads from the rest of the app, in one place: loaded entries
 * (recent tasks, smart start, overlaps), the loaded catalog (picker) and task names.
 * Almost all of it is already in memory. Requests: the newest entries page if none is loaded
 * (form opened directly), and cached background lookups for task names the tree hasn't loaded.
 */
export function useEntrySources() {
  const { taskIndex } = useCatalog()
  const cache = useTimeEntryCache()
  const { getCached, ensureNewest, invalidate } = cache

  // Every write drops the list cache, so the list refetches what it shows. The form keeps the last
  // entries it saw plus the ones it saved itself: after "Save & log another" (or a failed save) the
  // next entry still gets Recent tasks and overlap warnings, with no extra request.
  const seen = shallowRef<readonly TimeEntry[]>(cache.loadedEntries.value)
  watch(cache.loadedEntries, (entries) => {
    if (entries.length) seen.value = entries
  })
  const saved = shallowRef<readonly TimeEntry[]>([])
  const loadedEntries = computed<readonly TimeEntry[]>(() => {
    const ids = new Set(saved.value.map(e => e.id))
    return [...saved.value, ...seen.value.filter(e => !ids.has(e.id))]
  })

  /** The entry this form just saved, so the next one is checked against it. */
  function remember(entry: TimeEntry) {
    saved.value = [entry, ...saved.value.filter(e => e.id !== entry.id)]
  }
  // A save (or a failed one) drops the list cache, and with it the newest-entries load if it
  // hadn't answered yet. If the form has nothing yet, ask once more.
  watch(cache.requests.generation, () => {
    if (import.meta.client && !seen.value.length) void ensureNewest()
  })

  const taskNames = useTaskNames()
  const catalog = computed<readonly TaskOption[]>(() =>
    [...taskIndex.value.values()].map(({ task, project, client }) => ({ id: task.id, label: task.name, path: `${client.name} › ${project.name}` })),
  )
  const nameOf = (id: number): string | undefined => taskNames.label(id)?.name

  // Opened by a link or a reload, nothing is loaded: one request fills Recent, Smart start and the
  // overlap warnings.
  if (import.meta.client) void ensureNewest()

  // Names for recent tasks outside the loaded tree: one cached background lookup each.
  watchEffect(() => taskNames.resolve(recentTaskIds(loadedEntries.value).filter(id => !taskIndex.value.has(id))))

  /**
   * Keeps the name of the form's task known. On a deep link or reload no entries are loaded, so
   * the recent-task lookup above doesn't cover it: one cached background lookup instead.
   */
  function watchTaskName(taskId: () => number | null) {
    watch(taskId, (id) => {
      if (id != null && !taskIndex.value.has(id)) taskNames.resolve([id])
    }, { immediate: true })
  }

  function taskGroups(include?: number | null): TaskOptionGroups {
    const ids = recentTaskIds(loadedEntries.value)
    if (include != null && !ids.includes(include) && !catalog.value.some(o => o.id === include)) ids.unshift(include)
    return buildTaskOptions(ids, catalog.value, nameOf)
  }

  return { loadedEntries, getCached, invalidate, remember, taskGroups, watchTaskName }
}
