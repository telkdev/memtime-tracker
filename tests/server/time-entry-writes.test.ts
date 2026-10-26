// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '../../server/utils/cache'
import { createMemtimeClient } from '../../server/utils/memtime-client'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { ApiException } from '../../server/utils/errors'
import { timeEntryInputSchema } from '../../shared/schemas/timeEntryInput'
import errors from '../fixtures/errors.json'

const KEY = 'test-key-0123456789abcdefghijklmn'

const state = vi.hoisted(() => ({
  fetch: undefined as unknown as ReturnType<typeof vi.fn>,
  client: undefined as unknown,
  cache: undefined as unknown,
}))

vi.mock('../../server/utils/memtime', () => ({
  useMemtime: () => state.client,
  useServerCache: () => state.cache,
}))

const { createTimeEntry, updateTimeEntry, getTimeEntry, TIME_ENTRIES_CACHE_PREFIX } = await import('../../server/utils/time-entries')

const input = {
  taskId: 7,
  comment: 'Design review',
  start: '2026-10-22T07:00:00.000Z',
  end: '2026-10-22T08:30:00.000Z',
}

const upstreamEntry = { id: 123, userId: KEY, ...input, createdAt: '2026-10-22T08:31:00.000Z', updatedAt: '2026-10-22T08:31:00.000Z' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function setup(responses: Array<Response | Error | (() => Promise<Response>)>) {
  state.fetch = vi.fn(async () => {
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next() : next
  })
  const limiter = createRateLimiter({ budget: 14, windowMs: 60_000, maxWaitMs: 8_000 })
  state.client = createMemtimeClient({ baseUrl: 'https://api.test/api/v1', apiKey: KEY, limiter, fetch: state.fetch as unknown as typeof fetch })
  state.cache = createCache()
}

async function apiError(p: Promise<unknown>) {
  const err = await p.catch(e => e)
  expect(err).toBeInstanceOf(ApiException)
  return (err as ApiException).body
}

describe('time entry writes', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates an entry and never returns the API key', async () => {
    setup([json(201, upstreamEntry)])
    const entry = await createTimeEntry(input)
    expect(entry.id).toBe(123)
    expect(entry).not.toHaveProperty('userId')
    expect(JSON.stringify(entry)).not.toContain(KEY)
    const [url, init] = state.fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe('https://api.test/api/v1/time-entries')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(input)
  })

  it('sends one upstream request for a double-submitted create', async () => {
    setup([json(201, upstreamEntry), json(201, { ...upstreamEntry, id: 124 })])
    const [a, b] = await Promise.all([createTimeEntry(input), createTimeEntry(input)])
    const c = await createTimeEntry(input)
    expect(state.fetch).toHaveBeenCalledTimes(1)
    expect([a.id, b.id, c.id]).toEqual([123, 123, 123])
  })

  it('creates again after an edit, instead of returning the edited entry from the dedupe memo', async () => {
    const edited = { ...upstreamEntry, comment: 'Edited' }
    setup([json(201, upstreamEntry), json(200, edited), json(201, { ...upstreamEntry, id: 124 })])
    await createTimeEntry(input)
    await updateTimeEntry(123, { ...input, comment: 'Edited' })
    const again = await createTimeEntry(input)
    expect(again.id).toBe(124)
    expect(state.fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry a create after a network failure, because it might have been saved', async () => {
    setup([new Error('socket hang up'), json(201, upstreamEntry)])
    const body = await apiError(createTimeEntry(input))
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(state.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears cached list pages after a write', async () => {
    setup([json(201, upstreamEntry)])
    const cache = state.cache as ReturnType<typeof createCache>
    const loader = vi.fn(async () => 'page')
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    await createTimeEntry(input)
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('clears cached list pages after a create that failed on the network, since it may have been saved', async () => {
    setup([new Error('socket hang up')])
    const cache = state.cache as ReturnType<typeof createCache>
    const loader = vi.fn(async () => 'page')
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    await apiError(createTimeEntry(input))
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('clears cached list pages after an update that failed on the network, since it may have been applied', async () => {
    setup([new Error('socket hang up')])
    const cache = state.cache as ReturnType<typeof createCache>
    const loader = vi.fn(async () => 'page')
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    await apiError(updateTimeEntry(123, input))
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps cached list pages after an update the upstream rejected, since nothing changed', async () => {
    setup([json(404, { error: 'Time entry #123 not found' })])
    const cache = state.cache as ReturnType<typeof createCache>
    const loader = vi.fn(async () => 'page')
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    await apiError(updateTimeEntry(123, input))
    await cache.cached(`${TIME_ENTRIES_CACHE_PREFIX}limit=25&offset=0`, loader, { ttlMs: 60_000 })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('maps an update 404 to a plain "no longer exists" message', async () => {
    setup([json(errors.entryNotFoundPut.status, errors.entryNotFoundPut.body)])
    const body = await apiError(updateTimeEntry(5, input))
    expect(body).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'This entry doesn\'t exist. It may have been deleted.' })
  })

  it('says the same thing for a missing entry on read and on update', async () => {
    setup([json(404, { error: 'Time entry not found' }), json(404, { error: 'Time entry not found' })])
    const onRead = await apiError(getTimeEntry(9))
    const onUpdate = await apiError(updateTimeEntry(9, input))
    expect(onRead.message).toBe(onUpdate.message)
  })

  it('maps "Unknown user" to a server misconfiguration, not a missing entry', async () => {
    setup([json(404, { error: 'Unknown user' })])
    const body = await apiError(updateTimeEntry(5, input))
    expect(body.code).toBe('UPSTREAM_AUTH')
  })

  it.each(['Invalid JSON body', 'Invalid request body'])('shows %j as a summary without blaming a field', async (upstream) => {
    setup([json(400, { error: upstream })])
    const body = await apiError(createTimeEntry(input))
    expect(body).toMatchObject({ status: 400, message: 'The server rejected this entry. Nothing was saved.' })
    expect(body.fields).toBeUndefined()
  })

  it('attaches an upstream 400 that names a field to that field', async () => {
    setup([json(400, { error: 'Missing required field: comment' })])
    const body = await apiError(createTimeEntry(input))
    expect(body.fields).toEqual({ comment: 'Missing required field: comment' })
  })

  it.each([
    ['End must be after start', 'end'],
    ['Entry is pending review', undefined],
    ['The extended comment is too long', 'comment'],
  ])('puts the upstream 400 "%s" under the field it names first, matching whole words', async (message, field) => {
    setup([json(400, { error: message })])
    const body = await apiError(createTimeEntry(input))
    expect(body.fields).toEqual(field ? { [field]: message } : undefined)
  })

  it('accepts id 0 and task 0, which exist upstream', async () => {
    setup([json(200, { ...upstreamEntry, id: 0, taskId: 0 })])
    const entry = await updateTimeEntry(0, { ...input, taskId: timeEntryInputSchema.parse({ ...input, taskId: 0 }).taskId })
    expect(entry).toMatchObject({ id: 0, taskId: 0 })
    expect(String((state.fetch.mock.calls[0] as [URL])[0])).toBe('https://api.test/api/v1/time-entries/0')
  })

  it('updates with PUT and the full entry', async () => {
    setup([json(200, { ...upstreamEntry, comment: 'Edited' })])
    const entry = await updateTimeEntry(123, { ...input, comment: 'Edited' })
    const [url, init] = state.fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe('https://api.test/api/v1/time-entries/123')
    expect(init.method).toBe('PUT')
    expect(entry.comment).toBe('Edited')
  })

  it('reads one entry for deep links and reports a missing one clearly', async () => {
    setup([json(200, upstreamEntry), json(404, { error: 'Time entry not found' })])
    expect((await getTimeEntry(123)).id).toBe(123)
    expect((await apiError(getTimeEntry(9))).status).toBe(404)
  })
})

describe('timeEntryInputSchema', () => {
  it('accepts a valid entry and trims the comment', () => {
    expect(timeEntryInputSchema.parse({ ...input, comment: '  Review  ' }).comment).toBe('Review')
  })

  it('rejects end before start on the end field', () => {
    const r = timeEntryInputSchema.safeParse({ ...input, end: input.start })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['end'])
  })

  it('rejects entries longer than 24 hours', () => {
    const r = timeEntryInputSchema.safeParse({ ...input, end: '2026-10-23T08:00:00.000Z' })
    expect(r.error?.issues[0]?.message).toMatch(/24 hours/)
  })

  it.each([
    ['blank comment', { comment: '   ' }, 'comment'],
    ['missing task', { taskId: undefined }, 'taskId'],
    ['local time without offset', { start: '2026-10-22T09:00' }, 'start'],
    ['comment over 500 chars', { comment: 'x'.repeat(501) }, 'comment'],
  ])('rejects %s', (_name, patch, field) => {
    const r = timeEntryInputSchema.safeParse({ ...input, ...patch })
    expect(r.error?.issues.map(i => i.path[0])).toContain(field)
  })
})
