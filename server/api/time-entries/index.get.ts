import { timeEntryListQuerySchema } from '#shared/schemas/timeEntry'

export default defineApiHandler(async (event) => {
  const { limit, offset, refresh } = parseQuery(event, timeEntryListQuerySchema)
  // Browser caching of a list that changes on every save would show stale rows after a write.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return timeEntriesPage(limit, offset, refresh === '1')
})
