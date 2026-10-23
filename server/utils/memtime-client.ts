// The only code that talks to the Memtime API. Pure factory (no Nitro globals) so it can be tested
// with a fake fetch; server/utils/memtime.ts wires it to runtime config.
import { z } from 'zod'
import type { Page } from '#shared/schemas/common'
import { ApiException } from './errors'
import { RateLimitedError, type Lane, type RateLimiter } from './rate-limiter'

type QueryValue = string | number | boolean | undefined

export interface MemtimeClientOptions {
  baseUrl: string
  apiKey: string
  limiter: RateLimiter
  fetch?: typeof fetch
  /** Retries after an upstream 429 (each retry goes through the limiter again). */
  maxRetries?: number
  timeoutMs?: number
}

export interface MemtimeRequest<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, QueryValue>
  body?: unknown
  lane?: Lane
  schema: z.ZodType<T>
}

export interface MemtimeListRequest<T> {
  path: string
  itemSchema: z.ZodType<T>
  offset?: number
  /** Page size; we request one extra item to learn whether more exist (the API has no totals). */
  limit?: number
  query?: Record<string, QueryValue>
  lane?: Lane
}

interface RawResponse {
  status: number
  headers: Headers
  text: string
}

export const MAX_LIMIT = 100

/** Parses Retry-After (seconds or HTTP date). Not documented upstream, but cheap to honour. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

function rateLimited(retryAfterMs: number) {
  return new ApiException(429, 'RATE_LIMITED', 'Too many requests to the time tracking service. Retrying shortly.', {
    retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  })
}

export function createMemtimeClient(opts: MemtimeClientOptions) {
  const doFetch = opts.fetch ?? fetch
  const maxRetries = opts.maxRetries ?? 3
  const timeoutMs = opts.timeoutMs ?? 10_000

  /** Never let the key reach a log line or a browser, whatever the upstream echoes back. */
  function redact(text: string) {
    return opts.apiKey ? text.split(opts.apiKey).join('[redacted]') : text
  }

  function buildUrl(path: string, query: Record<string, QueryValue> = {}) {
    const url = new URL(opts.baseUrl.replace(/\/$/, '') + path)
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    return url
  }

  async function send(method: string, url: URL, body: unknown): Promise<RawResponse> {
    try {
      const res = await doFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      return { status: res.status, headers: res.headers, text: await res.text() }
    }
    catch (err) {
      console.warn(`[memtime] ${method} ${url.pathname} failed: ${err instanceof Error ? redact(err.message) : 'unknown error'}`)
      throw new ApiException(503, 'UPSTREAM_UNAVAILABLE', 'Couldn\'t reach the time tracking service. Check your connection and try again.')
    }
  }

  function upstreamMessage(text: string): string {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
        return redact(parsed.error)
      }
    }
    catch {
      // Non-JSON error body; fall through to a generic message.
    }
    return ''
  }

  function toException(method: string, path: string, res: RawResponse): ApiException {
    const message = upstreamMessage(res.text)
    console.warn(`[memtime] ${method} ${path} → ${res.status}${message ? ` (${message})` : ''}`)

    const authFailure = res.status === 401 || res.status === 403
      || (res.status === 404 && /unknown user/i.test(message))
    if (authFailure) {
      return new ApiException(502, 'UPSTREAM_AUTH', 'The server is misconfigured: its API credentials were rejected. Please contact the administrator.')
    }
    if (res.status === 404) return new ApiException(404, 'NOT_FOUND', message || 'Not found.')
    if (res.status === 400) return new ApiException(400, 'BAD_REQUEST', message || 'The request was rejected as invalid.')
    return new ApiException(502, 'UPSTREAM_UNAVAILABLE', 'The time tracking service is having trouble. Please try again in a moment.')
  }

  async function request<T>(req: MemtimeRequest<T>): Promise<T> {
    const method = req.method ?? 'GET'
    const lane = req.lane ?? (method === 'GET' ? 'interactive' : 'write')
    const url = buildUrl(req.path, req.query)

    for (let attempt = 0; ; attempt++) {
      const res = await opts.limiter.schedule(lane, () => send(method, url, req.body)).catch((err) => {
        if (err instanceof RateLimitedError) throw rateLimited(err.retryAfterMs)
        throw err
      })

      const resetMs = parseRetryAfter(res.headers.get('ratelimit-reset'))
      if (res.status === 429) {
        opts.limiter.penalize(parseRetryAfter(res.headers.get('retry-after')) ?? resetMs)
        console.warn(`[memtime] ${method} ${req.path} → 429 (attempt ${attempt + 1})`)
        if (attempt < maxRetries) continue
        throw rateLimited(opts.limiter.snapshot().resetsInMs)
      }

      // The upstream sends IETF draft headers (ratelimit-remaining/-reset, seconds).
      const remaining = Number.parseInt(res.headers.get('ratelimit-remaining') ?? '', 10)
      if (Number.isFinite(remaining)) opts.limiter.sync(remaining, resetMs)

      if (res.status < 200 || res.status >= 300) throw toException(method, req.path, res)
      opts.limiter.recordSuccess()

      let json: unknown
      try {
        json = JSON.parse(res.text)
      }
      catch {
        json = undefined
      }
      const parsed = req.schema.safeParse(json)
      if (!parsed.success) {
        const where = parsed.error.issues.slice(0, 3).map(i => i.path.join('.') || '(root)').join(', ')
        console.error(`[memtime] ${method} ${req.path}: unexpected response shape at ${where}`)
        throw new ApiException(502, 'UPSTREAM_INVALID', 'The time tracking service returned data we didn\'t understand.')
      }
      return parsed.data
    }
  }

  async function list<T>(req: MemtimeListRequest<T>): Promise<Page<T>> {
    const limit = Math.min(Math.max(req.limit ?? MAX_LIMIT, 1), MAX_LIMIT)
    const offset = Math.max(req.offset ?? 0, 0)
    const rows = await request({
      path: req.path,
      lane: req.lane,
      query: { ...req.query, limit: limit + 1, offset },
      schema: z.array(req.itemSchema),
    })
    const hasMore = rows.length > limit
    return { items: rows.slice(0, limit), hasMore, nextOffset: hasMore ? offset + limit : null }
  }

  return { request, list }
}

export type MemtimeClient = ReturnType<typeof createMemtimeClient>
