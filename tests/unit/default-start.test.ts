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
    const { start, from } = defaultStart([last], new Date('2026-10-23T09:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-10-23T08:01:00.000Z')
    expect(from).toBe('previous')
    expect(findOverlaps([last], start, new Date(start.getTime() + 3_600_000))).toEqual([])
  })

  it('says it continues the last entry even when that entry ended on a quarter hour', () => {
    // 09:00 is also 09:10 rounded down to 15 minutes, so comparing times cannot tell the two apart.
    const { start, from } = defaultStart([entry('2026-10-23T09:00:00.000Z')], new Date('2026-10-23T09:10:00.000Z'))
    expect(start.toISOString()).toBe('2026-10-23T09:00:00.000Z')
    expect(from).toBe('previous')
  })

  it('falls back to now, rounded down to 15 minutes, with no entry today', () => {
    expect(defaultStart([], new Date('2026-10-23T09:10:00.000Z'))).toEqual({ start: new Date('2026-10-23T09:00:00.000Z'), from: 'now' })
  })
})
