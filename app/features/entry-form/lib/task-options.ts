import type { TaskOption, TaskOptionGroups } from '../model/types'
// Builds the task picker's options from data that is already loaded. Never fetches.

export function buildTaskOptions(
  recentIds: readonly number[],
  catalog: readonly TaskOption[],
  nameOf: (id: number) => string | undefined,
): TaskOptionGroups {
  const byId = new Map(catalog.map(o => [o.id, o]))
  const recent = recentIds.map(id => byId.get(id) ?? { id, label: nameOf(id) ?? `Task #${id}` })
  const recentSet = new Set(recentIds)
  return { recent, catalog: catalog.filter(o => !recentSet.has(o.id)) }
}
