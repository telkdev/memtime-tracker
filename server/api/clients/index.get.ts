import { clientSchema } from '#shared/schemas/catalog'
import { catalogQuerySchema } from '#shared/schemas/catalog-query'

export default defineApiHandler(async (event) => {
  const { offset } = parseQuery(event, catalogQuerySchema)
  return catalogPage('/clients', clientSchema, offset)
})
