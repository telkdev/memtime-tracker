import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { TimeEntry } from '../../shared/schemas/timeEntry'
import { useEntryForm } from '../../app/composables/useEntryForm'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
mockNuxtImport('$fetch', () => fetchMock)

const NOW = new Date(2026, 9, 23, 17, 0)
const now = () => NOW

const saved: TimeEntry = {
  id: 123, taskId: 7, comment: 'Design review',
  start: '2026-10-23T07:00:00.000Z', end: '2026-10-23T08:30:00.000Z',
  createdAt: '2026-10-23T08:31:00.000Z', updatedAt: '2026-10-23T08:31:00.000Z',
}

function apiError(status: number, error: Record<string, unknown>) {
  return Object.assign(new Error('fetch failed'), { statusCode: status, data: { error: { status, ...error } } })
}

function filled(opts: Parameters<typeof useEntryForm>[0] = { mode: 'create' }) {
  const form = useEntryForm({ now, start: new Date(2026, 9, 23, 9, 0), ...opts })
  form.taskId.value = 7
  form.setDurationText('1h30')
  form.comment.value = 'Design review'
  return form
}

describe('useEntryForm', () => {
  beforeEach(() => fetchMock.mockReset())
  afterEach(() => vi.useRealTimers())

  it('sends UTC timestamps derived from local start and duration', async () => {
    fetchMock.mockResolvedValueOnce({ entry: saved })
    const form = filled()
    expect(await form.submit()).toEqual(saved)
    expect(fetchMock).toHaveBeenCalledWith('/api/time-entries', {
      method: 'POST',
      retry: 0,
      body: { taskId: 7, comment: 'Design review', start: '2026-10-23T07:00:00.000Z', end: '2026-10-23T08:30:00.000Z' },
    })
  })

  it('saves 23:00 to 01:00 as two hours ending the next day', async () => {
    fetchMock.mockResolvedValueOnce({ entry: saved })
    const form = filled({ mode: 'create', start: new Date(2026, 9, 22, 23, 0) })
    form.setEndTime('01:00')
    expect(form.durationText.value).toBe('2h')
    expect(form.endDayOffset.value).toBe(1)
    await form.submit()
    expect(fetchMock.mock.calls[0]![1].body).toMatchObject({ start: '2026-10-22T21:00:00.000Z', end: '2026-10-22T23:00:00.000Z' })
  })

  it('keeps End and duration in sync both ways', () => {
    const form = filled() // 09:00 + 1h30
    expect(form.endTime.value).toBe('10:30')
    form.setDurationText('2h')
    expect(form.endTime.value).toBe('11:00')
    form.setEndTime('12:15')
    expect(form.durationText.value).toBe('3h 15m')
    // Moving the start keeps the duration and moves the end with it.
    form.setStartTime('10:00')
    expect(form.durationText.value).toBe('3h 15m')
    expect(form.endTime.value).toBe('13:15')
  })

  it('never puts End before Start: an earlier end time means the next day', () => {
    const form = filled()
    form.setEndTime('08:00')
    expect(form.endDayOffset.value).toBe(1)
    expect(form.durationText.value).toBe('23h')
    expect(form.end.value!.getTime()).toBeGreaterThan((form.start.value as { instant: Date }).instant.getTime())
  })

  it('refuses an End equal to Start instead of saving 0 or 24 hours', async () => {
    const form = filled()
    form.setEndTime('09:00')
    expect(form.durationText.value).toBe('1h30') // unchanged
    await form.submit()
    expect(form.errors.value.end).toBe('End must be after the start time.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops a stale End error when Start or Date changes, so a valid entry can be saved', async () => {
    fetchMock.mockResolvedValue({ entry: saved })
    const form = filled()
    form.setEndTime('09:00')
    await form.submit()
    expect(form.errors.value.end).toBeDefined()

    form.setStartTime('08:00')
    expect(form.errors.value.end).toBeUndefined()
    expect(await form.submit()).toEqual(saved)

    form.setEndTime('08:00')
    form.setDate('2026-10-22')
    expect(form.isValid.value).toBe(true)
  })

  it('reports an impossible date under Date, not under Start', async () => {
    const form = filled()
    form.setDate('2026-02-31')
    await form.submit()
    expect(form.errors.value.date).toBe('Enter a valid date.')
    expect(form.errors.value.start).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks saving a start time inside the DST gap and offers the fix', async () => {
    const form = filled()
    form.date.value = '2026-03-29'
    form.startTime.value = '02:30'
    expect(await form.submit()).toBeNull()
    expect(form.errors.value.start).toMatch(/doesn't exist/)
    expect(fetchMock).not.toHaveBeenCalled()
    form.fixStartGap()
    expect(form.startTime.value).toBe('03:30')
    expect(form.errors.value.start).toBeUndefined()
  })

  it('lets the user pick the second 02:30 on the fall-back night', () => {
    const form = filled()
    form.date.value = '2026-10-25'
    form.startTime.value = '02:30'
    expect(form.startAmbiguous.value).toBeDefined()
    form.startOccurrence.value = 'second'
    expect(form.start.value.ok && form.start.value.instant.toISOString()).toBe('2026-10-25T01:30:00.000Z')
  })

  it('shows field errors only after the first save attempt, and sends nothing', async () => {
    const form = useEntryForm({ mode: 'create', now })
    expect(form.errors.value).toEqual({})
    await form.submit()
    expect(Object.keys(form.errors.value).sort()).toEqual(['comment', 'duration', 'taskId'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains unreadable durations', async () => {
    const form = filled()
    form.setDurationText('soon')
    await form.submit()
    expect(form.errors.value.duration).toMatch(/1h 30m/)
  })

  it('sends exactly one request when save is clicked twice', async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => {
      resolve = r
    }))
    const form = filled()
    const first = form.submit()
    const second = form.submit()
    resolve({ entry: saved })
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps edits typed while a save is in flight marked as unsaved', async () => {
    let resolve: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise(r => (resolve = r)))
    const form = useEntryForm({ mode: 'edit', entry: saved, now })
    form.comment.value = 'First edit'
    const pending = form.submit()
    form.comment.value = 'Typed during the save'
    resolve({ entry: { ...saved, comment: 'First edit' } })
    await pending
    expect(form.isDirty.value).toBe(true)
  })

  it('updates with PUT and the full entry', async () => {
    fetchMock.mockResolvedValueOnce({ entry: saved })
    const form = useEntryForm({ mode: 'edit', entry: saved, now })
    expect(form.durationText.value).toBe('1h 30m')
    expect(form.isDirty.value).toBe(false)
    form.comment.value = 'Changed'
    expect(form.isDirty.value).toBe(true)
    await form.submit()
    expect(fetchMock).toHaveBeenCalledWith('/api/time-entries/123', expect.objectContaining({ method: 'PUT' }))
    expect(form.isDirty.value).toBe(false)
  })

  it('offers create-as-new after a 404 on update, keeping every value', async () => {
    fetchMock.mockRejectedValueOnce(apiError(404, { code: 'NOT_FOUND', message: 'This entry no longer exists.' }))
    const form = useEntryForm({ mode: 'edit', entry: saved, now })
    await form.submit()
    expect(form.notFound.value).toBe(true)
    form.switchToCreate()
    fetchMock.mockResolvedValueOnce({ entry: { ...saved, id: 200 } })
    await form.submit()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/time-entries', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ comment: 'Design review', start: saved.start, end: saved.end }),
    }))
  })

  it('puts a server field error next to that field', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw apiError(400, { code: 'BAD_REQUEST', message: 'The server rejected this entry', fields: { comment: 'Comment is too long' } })
    })
    const form = filled()
    await form.submit()
    expect(form.errors.value.comment).toBe('Comment is too long')
  })

  it('warns that a failed create may still have been saved', async () => {
    fetchMock.mockImplementationOnce(async () => {
      // What ofetch throws when the request never got an answer.
      throw Object.assign(new Error('fetch failed'), { name: 'FetchError', statusCode: undefined })
    })
    const form = filled()
    await form.submit()
    expect(form.summary.value).toMatch(/may not have been saved/)
    expect(form.comment.value).toBe('Design review')
  })

  it('on an update the server can\'t answer, keeps the edits and says saving again is safe', async () => {
    fetchMock.mockRejectedValueOnce(apiError(503, { code: 'UPSTREAM_UNAVAILABLE', message: 'Couldn\'t reach the time tracking service.' }))
    const form = useEntryForm({ mode: 'edit', entry: saved, now })
    form.comment.value = 'Edited'
    await form.submit()
    expect(form.summary.value).toBe('Couldn\'t reach the server, so your changes may not be saved. Saving again is safe.')
    expect(form.comment.value).toBe('Edited')
    expect(form.isDirty.value).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries once by itself after a rate limit', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce(apiError(429, { code: 'RATE_LIMITED', message: 'Too many', retryAfter: 2 }))
      .mockResolvedValueOnce({ entry: saved })
    const form = filled()
    const onSaved = vi.fn()
    form.onSaved(onSaved)
    await form.submit()
    expect(form.retryIn.value).toBe(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('warns about overlaps with loaded entries but still allows saving', () => {
    const form = filled({ mode: 'create', knownEntries: () => [{ ...saved, id: 99 }] })
    expect(form.warnings.value).toContainEqual({ kind: 'overlap', entry: expect.objectContaining({ id: 99 }) })
    expect(form.isValid.value).toBe(true)
  })
})

describe('useEntryForm with anchor "now"', () => {
  it('keeps the end at now and moves the start back while the start is untouched', () => {
    const form = useEntryForm({ mode: 'create', now, start: new Date(2026, 9, 23, 17, 0), anchor: 'now' })
    form.setDurationText('1h30')
    expect([form.startTime.value, form.endTime.value]).toEqual(['15:30', '17:00'])
  })

  it('stops anchoring once the user sets the start', () => {
    const form = useEntryForm({ mode: 'create', now, start: new Date(2026, 9, 23, 17, 0), anchor: 'now' })
    form.setStartTime('09:00')
    form.setDurationText('1h')
    expect([form.startTime.value, form.endTime.value]).toEqual(['09:00', '10:00'])
  })
})
