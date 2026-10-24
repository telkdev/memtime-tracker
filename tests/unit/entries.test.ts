import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '../../shared/schemas/timeEntry'
import { groupEntriesByDay, listPositionQuery, needsQueryFix, readListPosition } from '../../app/features/time-entries/lib/entries'

function entry(id: number, start: string, end: string): TimeEntry {
  return { id, taskId: 1, comment: 'x', start, end, createdAt: end, updatedAt: end }
}

describe('groupEntriesByDay', () => {
  const entries = [
    entry(3, '2026-10-23T07:00:00Z', '2026-10-23T08:30:00Z'),
    entry(2, '2026-10-22T21:00:00Z', '2026-10-22T23:15:00Z'),
    entry(1, '2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z'),
  ]

  it('groups by local start day and totals each day', () => {
    const groups = groupEntriesByDay(entries, { hasPrev: false, hasMore: false })
    expect(groups.map(g => [g.day, g.entries.map(e => e.id), g.totalMs / 60_000])).toEqual([
      ['2026-10-23', [3], 90],
      ['2026-10-22', [2, 1], 135 + 60],
    ])
  })

  it('marks edge days as partial when neighbouring pages exist', () => {
    const groups = groupEntriesByDay(entries, { hasPrev: true, hasMore: true })
    expect(groups.map(g => g.partial)).toEqual([true, true])
    expect(groupEntriesByDay(entries, { hasPrev: false, hasMore: false }).some(g => g.partial)).toBe(false)
  })

  it('ignores negative durations in the total', () => {
    const [group] = groupEntriesByDay([entry(1, '2026-10-23T10:00:00Z', '2026-10-23T09:00:00Z')], { hasPrev: false, hasMore: false })
    expect(group!.totalMs).toBe(0)
  })
})

describe('list position in the URL', () => {
  it('reads page and size', () => {
    expect(readListPosition({ page: '3', size: '50' })).toEqual({ page: 3, size: 50 })
  })

  it.each([
    [{}, { page: 1, size: 25 }],
    [{ page: 'abc', size: '1000' }, { page: 1, size: 25 }],
    [{ page: '0', size: '7' }, { page: 1, size: 25 }],
    [{ page: '2.5' }, { page: 1, size: 25 }],
    [{ page: ['4', '5'] }, { page: 4, size: 25 }],
  ])('falls back to defaults for %j', (query, expected) => {
    expect(readListPosition(query)).toEqual(expected)
  })

  it('leaves defaults out of the canonical query', () => {
    expect(listPositionQuery({ page: 1, size: 25 })).toEqual({})
    expect(listPositionQuery({ page: 2, size: 10 })).toEqual({ page: '2', size: '10' })
  })

  it('flags URLs that need correcting', () => {
    expect(needsQueryFix({ page: '3', size: '50' })).toBe(false)
    expect(needsQueryFix({})).toBe(false)
    expect(needsQueryFix({ page: 'abc' })).toBe(true)
    expect(needsQueryFix({ size: '1000' })).toBe(true)
  })
})
