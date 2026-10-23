import { taskSchema, type Task } from '#shared/schemas/catalog'
import type { Cache } from './cache'
import { ApiException } from './errors'
import type { MemtimeClient } from './memtime-client'
import { CATALOG_CACHE_PREFIX } from './catalog'
import { CATALOG_STALE_MS, CATALOG_TTL_MS } from './memtime'

/** A missing task is remembered briefly so every list page doesn't ask for it again. */
export const MISSING_TASK_TTL_MS = 30_000

/**
 * Single-task lookup for names in the entries list. Background lane: it must never delay paging
 * or saves. Pure factory so the lane and the 404 memo can be tested with a fake client.
 */
export function createTaskLookup(deps: { client: () => MemtimeClient, cache: () => Cache, now?: () => number }) {
  const now = deps.now ?? Date.now
  const missingUntil = new Map<number, number>()

  return async function lookupTask(id: number): Promise<Task> {
    const notFound = () => new ApiException(404, 'NOT_FOUND', `Task #${id} not found.`)

    if ((missingUntil.get(id) ?? 0) > now()) throw notFound()
    missingUntil.delete(id)

    try {
      return await deps.cache().cached(
        `${CATALOG_CACHE_PREFIX}/tasks/${id}`,
        () => deps.client().request({ path: `/tasks/${id}`, schema: taskSchema, lane: 'background' }),
        { ttlMs: CATALOG_TTL_MS, staleMs: CATALOG_STALE_MS },
      )
    }
    catch (err) {
      if (err instanceof ApiException && err.body.code === 'NOT_FOUND') {
        missingUntil.set(id, now() + MISSING_TASK_TTL_MS)
        throw notFound()
      }
      throw err
    }
  }
}
