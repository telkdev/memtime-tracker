// Local budget snapshot for the UI. Costs no upstream request.
export default defineApiHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return useRateLimiter().snapshot()
})
