import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '../../shared/schemas/timeEntry'
import { defaultStart, findOverlaps } from '../../app/utils/entry-form'

const entry = (end: string): TimeEntry => ({
  id: 1, taskId: 7, comment: 'x', start: '2026-10-23T07:00:00.000Z', end,
  createdAt: end, updatedAt: end,
})

describe('defaultStart', () => {
  it('continues on the minute after the last entry, so it never overlaps it', () => {
    const last = entry('2026-10-23T08:00:35.000Z')
    const start = defaultStart([last], new Date('2026-10-23T09:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-10-23T08:01:00.000Z')
    expect(findOverlaps([last], start, new Date(start.getTime() + 3_600_000))).toEqual([])
  })

  it('keeps an end that is already on the minute', () => {
    const start = defaultStart([entry('2026-10-23T08:00:00.000Z')], new Date('2026-10-23T09:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-10-23T08:00:00.000Z')
  })
})
