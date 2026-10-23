import { z } from 'zod'

/** ISO 8601 timestamp. Lenient on precision and offset style until the probe pins the exact format. */
export const isoTimestampSchema = z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Expected an ISO 8601 timestamp')

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
