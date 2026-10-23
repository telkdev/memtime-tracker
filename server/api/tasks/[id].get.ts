import { taskSchema } from '#shared/schemas/catalog'
import { idParamsSchema } from '#shared/schemas/catalog-query'

/** A missing task is remembered briefly so every list page doesn't ask for it again. */
const MISSING_TASK_TTL_MS = 30_000
const missingUntil = new Map<number, number>()

/** Single-task lookup for names in the entries list. Background lane: it must never delay paging or saves. */
export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  const notFound = () => new ApiException(404, 'NOT_FOUND', `Task #${id} not found.`)

  if ((missingUntil.get(id) ?? 0) > Date.now()) throw notFound()
  missingUntil.delete(id)

  try {
    return await useServerCache().cached(
      `${CATALOG_CACHE_PREFIX}/tasks/${id}`,
      () => useMemtime().request({ path: `/tasks/${id}`, schema: taskSchema, lane: 'background' }),
      { ttlMs: CATALOG_TTL_MS, staleMs: CATALOG_STALE_MS },
    )
  }
  catch (err) {
    if (err instanceof ApiException && err.body.code === 'NOT_FOUND') {
      missingUntil.set(id, Date.now() + MISSING_TASK_TTL_MS)
      throw notFound()
    }
    throw err
  }
})
