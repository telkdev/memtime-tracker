import { z } from 'zod'

/** Positive integer id, accepted from route params / query strings. */
export const idSchema = z.coerce.number().int().positive()

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
