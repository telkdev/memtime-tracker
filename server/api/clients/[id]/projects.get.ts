import { projectSchema } from '#shared/schemas/catalog'
import { catalogQuerySchema, idParamsSchema } from '#shared/schemas/catalog-query'

export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  const { offset, refresh } = parseQuery(event, catalogQuerySchema)
  return catalogPage(`/clients/${id}/projects`, projectSchema, offset, refresh === '1')
})
