import { ZodError } from 'zod'
import type { ApiErrorBody, ApiErrorCode } from '#shared/schemas/common'
import { RateLimitedError } from './rate-limiter'

/** An error that is already in the shape the browser receives. */
export class ApiException extends Error {
  readonly body: ApiErrorBody

  constructor(status: number, code: ApiErrorCode, message: string, extra: Pick<ApiErrorBody, 'fields' | 'retryAfter'> = {}) {
    super(message)
    this.name = 'ApiException'
    this.body = { status, code, message, ...extra }
  }
}

/** Zod issues → { "field.path": "message" }, first message per field. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  return fields
}

export function toApiError(err: unknown): ApiErrorBody {
  if (err instanceof ApiException) return err.body
  if (err instanceof RateLimitedError) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests to the time tracking service. Retrying shortly.',
      retryAfter: Math.ceil(err.retryAfterMs / 1000),
    }
  }
  if (err instanceof ZodError) {
    return { status: 400, code: 'VALIDATION', message: 'Some fields are invalid.', fields: zodFieldErrors(err) }
  }
  console.error('[api] unexpected error', err instanceof Error ? err.message : err)
  return { status: 500, code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' }
}
