import { taskSchema } from '#shared/schemas/catalog'
import { catalogQuerySchema, idParamsSchema } from '#shared/schemas/catalog-query'

export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  const { offset } = parseQuery(event, catalogQuerySchema)
  return catalogPage(`/projects/${id}/tasks`, taskSchema, offset)
})
