import { clientSchema } from '#shared/schemas/catalog'
import { catalogQuerySchema } from '#shared/schemas/catalog-query'

export default defineApiHandler(async (event) => {
  const { offset, refresh } = parseQuery(event, catalogQuerySchema)
  return catalogPage('/clients', clientSchema, offset, refresh === '1')
})
