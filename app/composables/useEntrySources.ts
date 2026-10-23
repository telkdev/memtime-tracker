import { buildTaskOptions, type TaskOption, type TaskOptionGroups } from '~/utils/task-options'
import { recentTaskIds } from '~/utils/entry-form'

/**
 * Everything the entry form reads from the rest of the app, in one place: loaded entries
 * (recent tasks, smart start, overlaps), the loaded catalog (picker) and task names.
 * All of it is data that's already in memory; nothing here triggers a request.
 */
export function useEntrySources() {
  const { taskIndex } = useCatalog()
  const { loadedEntries, getCached, invalidate } = useTimeEntryCache()
  const taskNames = useTaskNames()
  const catalog = computed<readonly TaskOption[]>(() =>
    [...taskIndex.value.values()].map(({ task, project, client }) => ({ id: task.id, label: task.name, path: `${client.name} › ${project.name}` })),
  )
  const nameOf = (id: number): string | undefined => taskNames.label(id)?.name

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

  return { loadedEntries, getCached, invalidate, taskGroups, watchTaskName }
}
