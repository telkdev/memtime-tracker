import { apiErrorSchema, type ApiErrorBody } from '#shared/schemas/common'

/** Turns anything thrown by $fetch into the shared ApiErrorBody shape. */
export function parseApiError(err: unknown): ApiErrorBody {
  const data = (err as { data?: unknown } | null)?.data
  const parsed = apiErrorSchema.safeParse(data)
  if (parsed.success) return parsed.data.error

  const status = (err as { statusCode?: number } | null)?.statusCode
  if (!status) {
    return { status: 0, code: 'UPSTREAM_UNAVAILABLE', message: 'Couldn\'t reach the server. Check your connection and try again.' }
  }
  return { status, code: 'INTERNAL', message: 'Something went wrong. Please try again.' }
}

export function retryAfterMs(error: ApiErrorBody): number {
  return Math.max(1, error.retryAfter ?? 5) * 1000
}
