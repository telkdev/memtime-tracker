import type { z } from 'zod'
import type { Page } from '#shared/schemas/common'
import { CATALOG_STALE_MS, CATALOG_TTL_MS, useMemtime, useServerCache } from './memtime'

export const CATALOG_CACHE_PREFIX = 'catalog:'

/** Cached, coalesced page of a catalog list endpoint. */
export function catalogPage<T>(path: string, itemSchema: z.ZodType<T>, offset: number): Promise<Page<T>> {
  return useServerCache().cached(
    `${CATALOG_CACHE_PREFIX}${path}?offset=${offset}`,
    () => useMemtime().list({ path, itemSchema, offset }),
    { ttlMs: CATALOG_TTL_MS, staleMs: CATALOG_STALE_MS },
  )
}
