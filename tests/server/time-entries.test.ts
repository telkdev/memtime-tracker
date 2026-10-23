// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemtimeClient } from '../../server/utils/memtime-client'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { loadTimeEntriesPage } from '../../server/utils/time-entries'
import { timeEntryListQuerySchema } from '../../shared/schemas/timeEntry'
import fixture from '../fixtures/time-entries.json'

// A sentinel, not a real key. The upstream echoes the caller's key in every entry's userId.
const KEY = 'sentinel-key-9f8e7d6c5b4a3210zyxwvu'
const entriesWithKey = fixture.map(e => ({ ...e, userId: KEY }))

function setup(body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  const limiter = createRateLimiter({ budget: 14, windowMs: 60_000, maxWaitMs: 8_000 })
  const client = createMemtimeClient({ baseUrl: 'https://api.test/api/v1', apiKey: KEY, limiter, fetch: fetch as typeof globalThis.fetch })
  return { client, fetch }
}

describe('time entries list (BFF)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('never returns the API key or a userId field', async () => {
    const { client } = setup(entriesWithKey)
    const page = await loadTimeEntriesPage(client, 25, 0)

    expect(JSON.stringify(page)).not.toContain(KEY)
    for (const item of page.items) expect(item).not.toHaveProperty('userId')
  })

  it('asks for limit+1, newest first', async () => {
    const { client, fetch } = setup([])
    await loadTimeEntriesPage(client, 25, 50)

    const url = new URL(String((fetch.mock.calls[0] as unknown as [URL])[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '26', offset: '50', sortBy: 'start', order: 'desc' })
  })

  it('uses the extra row only to detect a next page', async () => {
    const { client } = setup(entriesWithKey)
    const page = await loadTimeEntriesPage(client, 2, 0)

    expect(page.items.map(e => e.id)).toEqual([103, 102])
    expect(page).toMatchObject({ hasMore: true, nextOffset: 2 })
  })

  it('reports the last page when no extra row comes back', async () => {
    const { client } = setup(entriesWithKey)
    const page = await loadTimeEntriesPage(client, 3, 0)

    expect(page).toMatchObject({ hasMore: false, nextOffset: null })
  })

  it('rejects an oversized page locally, before spending budget', () => {
    expect(timeEntryListQuerySchema.safeParse({ limit: '1000' }).success).toBe(false)
    expect(timeEntryListQuerySchema.parse({})).toEqual({ limit: 25, offset: 0 })
  })
})
