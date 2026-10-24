import type { Page } from '#shared/schemas/common'
import type { NodeKey } from '../model/types'

function endpointFor(key: NodeKey): string {
  if (key === 'root') return '/api/clients'
  const [kind, id] = key.split(':')
  return kind === 'client' ? `/api/clients/${id}/projects` : `/api/projects/${id}/tasks`
}

/** One page of clients, of a client's projects, or of a project's tasks. */
export function fetchCatalogPage(key: NodeKey, offset: number, signal?: AbortSignal) {
  return $fetch<Page<unknown>>(endpointFor(key), { query: { offset }, retry: 0, signal })
}

/** Drops the BFF's catalog cache. */
export function refreshCatalog() {
  return $fetch('/api/catalog/refresh', { method: 'POST', retry: 0 })
}

/** One task by id, for a name the loaded catalog doesn't have. Unparsed; the caller validates it. */
export function fetchTask(id: number): Promise<unknown> {
  return $fetch(`/api/tasks/${id}`, { retry: 0 })
}
