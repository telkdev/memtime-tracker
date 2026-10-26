// Drops cached catalog data so the next reads hit the upstream. Costs no upstream request itself.
// Takes no body, but still only answers JSON requests (see requireJsonContentType).
export default defineApiHandler(async (event) => {
  requireJsonContentType(event)
  useServerCache().invalidatePrefix(CATALOG_CACHE_PREFIX)
  return { ok: true }
})
