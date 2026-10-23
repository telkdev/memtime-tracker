import { z } from 'zod'

/**
 * ISO 8601 timestamp from the upstream, with `Z` or an explicit offset. One without an offset
 * would be read as the server's (or browser's) local time, so it is rejected, not guessed at.
 */
export const isoTimestampSchema = z.iso.datetime({ offset: true, error: 'Expected an ISO 8601 timestamp with a time zone' })

/**
 * What we send upstream: UTC with `Z` only (hard rule 4). Task 3's input schema must use this,
 * not isoTimestampSchema, so a local or offset time can't reach the API.
 */
export const utcTimestampSchema = z.iso.datetime({ error: 'Expected a UTC ISO 8601 timestamp ending in Z' })

/**
 * The upstream shape. Server-only: `userId` holds the raw API key, so this schema must never be
 * used for anything that reaches the browser.
 */
export const upstreamTimeEntrySchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  userId: z.unknown(),
  comment: z.string(),
  start: isoTimestampSchema,
  end: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

/**
 * What the BFF returns. `userId` is left out on purpose; plain z.object strips it (and any other
 * unknown key) when parsing, so the key can't slip through.
 */
export const timeEntrySchema = upstreamTimeEntrySchema.omit({ userId: true })

export type TimeEntry = z.infer<typeof timeEntrySchema>

export const TIME_ENTRY_PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_TIME_ENTRY_PAGE_SIZE = 25

export const timeEntryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_TIME_ENTRY_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  /** `refresh=1` bypasses the server cache (the Refresh button). */
  refresh: z.enum(['1']).optional(),
})
