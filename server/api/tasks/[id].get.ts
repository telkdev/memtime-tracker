import { idParamsSchema } from '#shared/schemas/catalog-query'

const lookupTask = createTaskLookup({ client: useMemtime, cache: useServerCache })

/** Single-task lookup for names in the entries list (background lane, 404s remembered for 30 s). */
export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  return lookupTask(id)
})
