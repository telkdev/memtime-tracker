import type { Page } from '#shared/schemas/common'
import { timeEntrySchema, upstreamTimeEntrySchema, type TimeEntry } from '#shared/schemas/timeEntry'
import type { MemtimeClient } from './memtime-client'
import { useMemtime, useServerCache } from './memtime'

/** Every cached list page lives under this prefix; writes call invalidatePrefix() with it. */
export const TIME_ENTRIES_CACHE_PREFIX = 'time-entries:'
/** Short: entries change whenever the user logs time, possibly from another device. */
export const TIME_ENTRIES_TTL_MS = 15_000

/** Parses with the upstream schema, then re-parses with the public one so `userId` is dropped. */
export function toPublicTimeEntry(raw: unknown): TimeEntry {
  return timeEntrySchema.parse(raw)
}

/** One page of the user's entries, newest first, with `userId` stripped. */
export async function loadTimeEntriesPage(client: MemtimeClient, limit: number, offset: number): Promise<Page<TimeEntry>> {
  const page = await client.list({
    path: '/time-entries',
    itemSchema: upstreamTimeEntrySchema,
    limit,
    offset,
    query: { sortBy: 'start', order: 'desc' },
  })
  return { ...page, items: page.items.map(toPublicTimeEntry) }
}

/** Cached (briefly) and coalesced version of loadTimeEntriesPage for the BFF route. */
export function timeEntriesPage(limit: number, offset: number, refresh: boolean): Promise<Page<TimeEntry>> {
  return useServerCache().cached(
    `${TIME_ENTRIES_CACHE_PREFIX}list?limit=${limit}&offset=${offset}`,
    () => loadTimeEntriesPage(useMemtime(), limit, offset),
    { ttlMs: TIME_ENTRIES_TTL_MS, force: refresh },
  )
}
