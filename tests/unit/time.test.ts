import { describe, expect, it } from 'vitest'
import { durationMs, formatDay, formatDuration, formatTime, localDayKey, localDaysBetween, localTimeZone } from '../../app/utils/time'

// vitest.config.ts pins TZ=Europe/Berlin (UTC+2 in summer, UTC+1 in winter).

describe('time display helpers', () => {
  it('runs in the pinned zone', () => {
    expect(localTimeZone()).toBe('Europe/Berlin')
  })

  it.each([
    [0, '0m'],
    [45 * 60_000, '45m'],
    [90 * 60_000, '1h 30m'],
    [8 * 3_600_000, '8h'],
    [89.6 * 60_000, '1h 30m'],
    [-5 * 60_000, '0m'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })

  it('shows UTC timestamps in local time', () => {
    expect(formatTime('2026-10-23T07:00:00.000Z', 'en-GB')).toBe('09:00')
    expect(formatTime('2026-12-01T07:00:00Z', 'en-GB')).toBe('08:00')
  })

  it('follows the spring-forward jump', () => {
    expect(formatTime('2026-03-29T00:30:00Z', 'en-GB')).toBe('01:30')
    expect(formatTime('2026-03-29T01:30:00Z', 'en-GB')).toBe('03:30')
    // One real hour, although the wall clock moved two.
    expect(formatDuration(durationMs('2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z'))).toBe('1h')
  })

  it('groups by the local day, not the UTC day', () => {
    // 22:30 UTC on the 22nd is already the 23rd in Berlin.
    expect(localDayKey('2026-10-22T22:30:00Z')).toBe('2026-10-23')
  })

  it('detects an entry that crosses local midnight', () => {
    expect(localDaysBetween('2026-10-22T21:00:00Z', '2026-10-22T23:15:00Z')).toBe(1)
    expect(localDaysBetween('2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z')).toBe(0)
  })

  it('counts calendar days across the fall-back day', () => {
    expect(localDaysBetween('2026-10-24T20:00:00Z', '2026-10-25T23:30:00Z')).toBe(2)
  })

  it('adds the year only for other years', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    expect(formatDay('2026-10-23T07:00:00Z', 'en-GB', now)).toMatch(/^Fri,? 23 Oct$/)
    expect(formatDay('2025-10-23T07:00:00Z', 'en-GB', now)).toMatch(/^Thu,? 23 Oct 2025$/)
  })
})
