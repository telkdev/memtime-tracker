// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '../../server/utils/cache'
import { ApiException } from '../../server/utils/errors'
import { createMemtimeClient } from '../../server/utils/memtime-client'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { createTaskLookup, MISSING_TASK_TTL_MS } from '../../server/utils/task-lookup'

const task = { id: 7, projectId: 5, name: 'Design review', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

function setup(respond: () => Response) {
  const fetch = vi.fn(async () => respond())
  const limiter = createRateLimiter({ budget: 14, windowMs: 60_000, maxWaitMs: 8_000 })
  const schedule = vi.spyOn(limiter, 'schedule')
  const client = createMemtimeClient({ baseUrl: 'https://api.test/api/v1', apiKey: 'k', limiter, fetch: fetch as typeof globalThis.fetch })
  const cache = createCache()
  const lookup = createTaskLookup({ client: () => client, cache: () => cache })
  return { fetch, schedule, lookup }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('task lookup (GET /api/tasks/:id)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs in the background lane, so it never delays paging or saves', async () => {
    const { schedule, lookup } = setup(() => json(200, task))
    await expect(lookup(7)).resolves.toMatchObject({ id: 7, name: 'Design review' })
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule.mock.calls[0]![0]).toBe('background')
  })

  it('caches a found task: the second lookup costs no upstream call', async () => {
    const { fetch, lookup } = setup(() => json(200, task))
    await lookup(7)
    await lookup(7)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('remembers a missing task for 30 s, then asks again', async () => {
    const { fetch, lookup } = setup(() => json(404, { error: 'Task not found' }))
    const first = await lookup(9).catch(e => e)
    expect(first).toBeInstanceOf(ApiException)
    expect((first as ApiException).body).toMatchObject({ status: 404, code: 'NOT_FOUND' })

    vi.advanceTimersByTime(MISSING_TASK_TTL_MS - 1)
    await expect(lookup(9)).rejects.toBeInstanceOf(ApiException)
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await expect(lookup(9)).rejects.toBeInstanceOf(ApiException)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not remember transient failures', async () => {
    const { fetch, lookup } = setup(() => json(500, { error: 'boom' }))
    await expect(lookup(9)).rejects.toMatchObject({ body: { code: 'UPSTREAM_UNAVAILABLE' } })
    await expect(lookup(9)).rejects.toMatchObject({ body: { code: 'UPSTREAM_UNAVAILABLE' } })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
