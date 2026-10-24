import { ZodError } from 'zod'
import { apiErrorSchema, type ApiErrorBody } from '#shared/schemas/common'

/** Turns anything thrown by $fetch (or by parsing its result) into the shared ApiErrorBody shape. */
export function parseApiError(err: unknown): ApiErrorBody {
  // The request worked but the BFF's answer didn't match our schema: not a connection problem.
  if (err instanceof ZodError) {
    return { status: 0, code: 'UPSTREAM_INVALID', message: 'The server sent data we didn\'t understand. Reload the page to get the latest version.' }
  }

  const data = (err as { data?: unknown } | null)?.data
  const parsed = apiErrorSchema.safeParse(data)
  if (parsed.success) return parsed.data.error

  const status = (err as { statusCode?: number } | null)?.statusCode
  if (status) return { status, code: 'INTERNAL', message: 'Something went wrong. Please try again.' }

  // ofetch's FetchError without a status: the request never got an answer. A bare TypeError is
  // a bug in our own code, not the network, so it falls through to the generic message.
  if ((err as { name?: unknown } | null)?.name === 'FetchError') {
    return { status: 0, code: 'UPSTREAM_UNAVAILABLE', message: 'Couldn\'t reach the server. Check your connection and try again.' }
  }
  return { status: 0, code: 'INTERNAL', message: 'Something went wrong. Please try again.' }
}

export function retryAfterMs(error: ApiErrorBody): number {
  return Math.max(1, error.retryAfter ?? 5) * 1000
}
