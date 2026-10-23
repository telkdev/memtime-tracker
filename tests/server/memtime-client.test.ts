// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { clientSchema } from '../../shared/schemas/catalog'
import { createMemtimeClient, parseRetryAfter } from '../../server/utils/memtime-client'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { ApiException } from '../../server/utils/errors'
import clientsFixture from '../fixtures/clients.json'

const KEY = 'test-key-0123456789abcdefghijklmn'

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

function setup(responses: Array<Response | Error>) {
  const fetch = vi.fn(async () => {
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  const limiter = createRateLimiter({ budget: 14, windowMs: 60_000, maxWaitMs: 8_000 })
  const client = createMemtimeClient({ baseUrl: 'https://api.test/api/v1', apiKey: KEY, limiter, fetch: fetch as typeof globalThis.fetch })
  return { client, fetch, limiter }
}

async function apiError(p: Promise<unknown>) {
  const err = await p.catch(e => e)
  expect(err).toBeInstanceOf(ApiException)
  return (err as ApiException).body
}

describe('memtime client', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends the bearer key and requests limit+1 to detect more pages', async () => {
    const { client, fetch } = setup([json(200, clientsFixture.slice(0, 3))])
    const page = await client.list({ path: '/clients', itemSchema: clientSchema, limit: 2 })

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://api.test/api/v1/clients?limit=3&offset=0')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(page).toEqual({ items: clientsFixture.slice(0, 2), hasMore: true, nextOffset: 2 })
  })

  it('reports no more pages when the extra item is missing', async () => {
    const { client } = setup([json(200, clientsFixture.slice(0, 2))])
    const page = await client.list({ path: '/clients', itemSchema: clientSchema, limit: 2, offset: 4 })
    expect(page.hasMore).toBe(false)
    expect(page.nextOffset).toBeNull()
  })

  it('drops unknown upstream fields', async () => {
    const { client } = setup([json(200, [{ ...clientsFixture[0], secret: 'x' }])])
    const page = await client.list({ path: '/clients', itemSchema: clientSchema })
    expect(page.items[0]).not.toHaveProperty('secret')
  })

  it('maps an unexpected response shape to UPSTREAM_INVALID', async () => {
    const { client } = setup([json(200, { data: [] })])
    expect(await apiError(client.list({ path: '/clients', itemSchema: clientSchema }))).toMatchObject({
      status: 502,
      code: 'UPSTREAM_INVALID',
    })
  })

  it.each([
    [404, { error: 'Client not found' }, { status: 404, code: 'NOT_FOUND', message: 'Client not found' }],
    [404, { error: 'Unknown user' }, { status: 502, code: 'UPSTREAM_AUTH' }],
    [401, { error: 'Unauthorized' }, { status: 502, code: 'UPSTREAM_AUTH' }],
    [400, { error: 'Invalid JSON body' }, { status: 400, code: 'BAD_REQUEST', message: 'Invalid JSON body' }],
    [500, { error: 'Internal' }, { status: 502, code: 'UPSTREAM_UNAVAILABLE' }],
  ])('maps upstream %i %j', async (status, body, expected) => {
    const { client } = setup([json(status, body)])
    expect(await apiError(client.request({ path: '/clients/1', schema: z.unknown() }))).toMatchObject(expected)
  })

  it('maps network failures to UPSTREAM_UNAVAILABLE', async () => {
    const { client } = setup([new TypeError('fetch failed')])
    expect(await apiError(client.request({ path: '/clients', schema: z.unknown() }))).toMatchObject({
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
    })
  })

  it('never leaks the key through upstream error messages or logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = setup([json(400, { error: `Bad key ${KEY}` })])
    const body = await apiError(client.request({ path: '/x', schema: z.unknown() }))
    expect(JSON.stringify(body)).not.toContain(KEY)
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY)
  })

  it('retries after a 429 once the limiter pause ends', async () => {
    vi.useFakeTimers()
    const { client, fetch } = setup([json(429, { error: 'Too many requests' }), json(200, [])])
    const p = client.list({ path: '/clients', itemSchema: clientSchema })
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(p).resolves.toEqual({ items: [], hasMore: false, nextOffset: null })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up with RATE_LIMITED and a retryAfter when 429s persist', async () => {
    vi.useFakeTimers()
    const { client } = setup(Array.from({ length: 5 }, () => json(429, { error: 'Too many requests' })))
    const p = apiError(client.request({ path: '/clients', schema: z.unknown() }))
    await vi.advanceTimersByTimeAsync(30_000)
    const body = await p
    expect(body).toMatchObject({ status: 429, code: 'RATE_LIMITED' })
    expect(body.retryAfter).toBeGreaterThan(0)
  })

  it('parses Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('3')).toBe(3000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})
