import { idParamsSchema } from '#shared/schemas/catalog-query'
import { timeEntryInputSchema } from '#shared/schemas/timeEntryInput'

export default defineApiHandler(async (event) => {
  const { id } = parseParams(event, idParamsSchema)
  const input = timeEntryInputSchema.parse(await readJsonBody(event))
  return { entry: await updateTimeEntry(id, input) }
})
