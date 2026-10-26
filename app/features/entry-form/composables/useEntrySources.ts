import { buildTaskOptions } from '../lib/task-options'
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
  const { loadedEntries, getCached, ensureNewest, invalidate } = useTimeEntryCache()
  const taskNames = useTaskNames()
  const catalog = computed<readonly TaskOption[]>(() =>
    [...taskIndex.value.values()].map(({ task, project, client }) => ({ id: task.id, label: task.name, path: `${client.name} › ${project.name}` })),
  )
  const nameOf = (id: number): string | undefined => taskNames.label(id)?.name

  // Opened by a link or a reload, nothing is loaded: one request fills Recent, Smart start and the
  // overlap warnings. `newestLoaded` resolves when it is in (at once if entries were loaded).
  const newestLoaded = import.meta.client ? ensureNewest() : Promise.resolve()

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

  return { loadedEntries, newestLoaded, getCached, invalidate, taskGroups, watchTaskName }
}
