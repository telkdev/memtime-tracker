import { timeEntryInputSchema } from '#shared/schemas/timeEntryInput'

export default defineApiHandler(async (event) => {
  // Validated before the limiter: invalid input costs no upstream budget.
  const input = timeEntryInputSchema.parse(await readBody(event))
  const entry = await createTimeEntry(input)
  setResponseStatus(event, 201)
  return { entry }
})
