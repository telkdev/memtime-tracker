import { z } from 'zod'

/**
 * A non-negative whole number from a route param or query string. Plain digits only: z.coerce
 * would also read "0x10" as 16 and "1e2" as 100, so a crafted URL could address another entry.
 */
export const decimalIntSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d{1,15}$/, 'Expected a whole number').transform(Number),
])

/** Integer id from route params / query strings. The upstream really uses 0 (time entry #0). */
export const idSchema = decimalIntSchema

/** Our pagination envelope. The upstream returns bare arrays without totals. */
export interface Page<T> {
  items: T[]
  hasMore: boolean
  nextOffset: number | null
}

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    hasMore: z.boolean(),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
}

export const apiErrorCodes = [
  'BAD_REQUEST',
  'VALIDATION',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_AUTH',
  'UPSTREAM_INVALID',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof apiErrorCodes)[number]

/** Errors that prove the upstream did not apply a write. Any other failure may follow a saved write. */
export const WRITE_NOT_APPLIED_CODES: ReadonlySet<ApiErrorCode> = new Set(['BAD_REQUEST', 'VALIDATION', 'NOT_FOUND', 'RATE_LIMITED', 'UPSTREAM_AUTH'])

export const apiErrorBodySchema = z.object({
  status: z.number().int(),
  code: z.enum(apiErrorCodes),
  message: z.string(),
  /** Field name → message, for form validation errors. */
  fields: z.record(z.string(), z.string()).optional(),
  /** Seconds until a retry makes sense (RATE_LIMITED). */
  retryAfter: z.number().nonnegative().optional(),
})

/** Every BFF error response has this shape. */
export const apiErrorSchema = z.object({ error: apiErrorBodySchema })

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
export type ApiError = z.infer<typeof apiErrorSchema>
