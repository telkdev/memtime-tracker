import { idParamsSchema } from '#shared/schemas/catalog-query'

export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { entry: await getTimeEntry(id) }
})
