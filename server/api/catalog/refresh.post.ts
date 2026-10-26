// Drops cached catalog data so the next reads hit the upstream. Costs no upstream request itself.
// Takes no body, but like every write it only answers JSON requests (server/middleware/json-writes.ts).
export default defineApiHandler(async () => {
  useServerCache().invalidatePrefix(CATALOG_CACHE_PREFIX)
  return { ok: true }
})
