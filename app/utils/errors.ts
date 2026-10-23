import type { ApiErrorBody } from '#shared/schemas/common'
import { parseApiError, retryAfterMs } from './api-error'

/** What a form needs from a failed request: one summary line, per-field messages, and when to retry. */
export interface UiError {
  status: number
  code: ApiErrorBody['code']
  summary: string
  fields: Record<string, string>
  retryAfterMs?: number
}

export function toUiError(err: unknown): UiError {
  const body = parseApiError(err)
  return {
    status: body.status,
    code: body.code,
    summary: body.message,
    fields: body.fields ?? {},
    retryAfterMs: body.code === 'RATE_LIMITED' ? retryAfterMs(body) : undefined,
  }
}

/** True when the request may never have reached the upstream, or its outcome is unknown. */
export function isConnectionError(e: UiError): boolean {
  return e.code === 'UPSTREAM_UNAVAILABLE' || e.status === 0
}
