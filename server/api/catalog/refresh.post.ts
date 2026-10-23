// Drops cached catalog data so the next reads hit the upstream. Costs no upstream request itself.
export default defineApiHandler(async () => {
  useServerCache().invalidatePrefix(CATALOG_CACHE_PREFIX)
  return { ok: true }
})
