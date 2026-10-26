import { requireJsonContentType, sendApiError } from '../utils/api-handler'

// Every API write must say `application/json`, with or without a body. A form post or a `no-cors`
// fetch from another site can't send that header without a CORS preflight, so no web page can
// create entries or drop the catalog cache through a running BFF. One place, so a new route can't
// forget it. (readJsonBody checks again, for code that reads a body outside these routes.)
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!WRITE_METHODS.has(event.method) || !event.path.startsWith('/api/')) return
  try {
    requireJsonContentType(event)
  }
  catch (err) {
    return sendApiError(event, err)
  }
})
