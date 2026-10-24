import { describe, expect, it } from 'vitest'
import {
  fromUtcIso,
  localDaysBetween,
  parseDuration,
  resolveEndTime,
  resolveLocal,
  roundDownToMinutes,
} from '../../app/common/lib/time'

// vitest.config.ts pins TZ=Europe/Berlin: CET (UTC+1) in winter, CEST (UTC+2) in summer.

function instant(date: string, time: string) {
  const r = resolveLocal(date, time)
  if (!r.ok) throw new Error(`expected ${date} ${time} to resolve`)
  return r.instant
}

describe('resolveLocal', () => {
  it('converts a summer local time to UTC', () => {
    expect(instant('2026-07-01', '09:00').toISOString()).toBe('2026-07-01T07:00:00.000Z')
  })

  it('converts a winter local time to UTC', () => {
    expect(instant('2026-01-15', '09:00').toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })

  it('round-trips through fromUtcIso', () => {
    expect(fromUtcIso(instant('2026-10-22', '23:45').toISOString())).toEqual({ date: '2026-10-22', time: '23:45' })
  })

  it('reports a time inside the spring-forward gap instead of shifting it', () => {
    expect(resolveLocal('2026-03-29', '02:30')).toEqual({ ok: false, reason: 'gap', suggestion: '03:30' })
  })

  it('offers both occurrences of a time repeated when clocks fall back', () => {
    const first = resolveLocal('2026-10-25', '02:30', 'first')
    const second = resolveLocal('2026-10-25', '02:30', 'second')
    if (!first.ok || !second.ok) throw new Error('expected ok')
    expect(first.ambiguous).toBeDefined()
    expect(first.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(second.instant.toISOString()).toBe('2026-10-25T01:30:00.000Z')
  })

  it('does not flag ordinary times as ambiguous', () => {
    const r = resolveLocal('2026-10-25', '04:00')
    expect(r.ok && r.ambiguous).toBeFalsy()
  })

  it.each([
    ['2026-02-31', '10:00'],
    ['2026-13-01', '10:00'],
    ['2026-10-23', '24:00'],
    ['2026-10-23', '9:00'],
    ['', '10:00'],
  ])('rejects invalid input %s %s', (date, time) => {
    expect(resolveLocal(date, time)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('resolveEndTime', () => {
  it('keeps the end on the same day when it is after the start', () => {
    const start = instant('2026-10-22', '09:00')
    const end = resolveEndTime(start, '10:30')
    expect(end.ok && end.instant.toISOString()).toBe('2026-10-22T08:30:00.000Z')
  })

  it('moves an end at or before the start to the next day (23:00 to 01:00)', () => {
    const start = instant('2026-10-22', '23:00')
    const end = resolveEndTime(start, '01:00')
    if (!end.ok) throw new Error('expected ok')
    expect(start.toISOString()).toBe('2026-10-22T21:00:00.000Z')
    expect(end.instant.toISOString()).toBe('2026-10-22T23:00:00.000Z')
    expect(localDaysBetween(start, end.instant)).toBe(1)
  })

  it('treats an end equal to the start as 24 hours later, not zero', () => {
    const start = instant('2026-10-22', '09:00')
    const end = resolveEndTime(start, '09:00')
    expect(end.ok && end.instant.getTime() - start.getTime()).toBe(24 * 3_600_000)
  })

  it('keeps an end in the repeated hour on the same night when the start is the second occurrence', () => {
    const r = resolveLocal('2026-10-25', '02:15', 'second')
    const start = r.ok ? r.instant : new Date(NaN)
    expect(start.toISOString()).toBe('2026-10-25T01:15:00.000Z')
    const end = resolveEndTime(start, '02:45')
    expect(end.ok && end.instant.toISOString()).toBe('2026-10-25T01:45:00.000Z')
  })

  it('counts real elapsed time across the fall-back night', () => {
    const start = instant('2026-10-24', '23:00')
    const end = resolveEndTime(start, '03:00')
    expect(end.ok && end.instant.getTime() - start.getTime()).toBe(5 * 3_600_000)
  })
})

describe('parseDuration', () => {
  const m = 60_000
  it.each([
    ['1h 30m', 90],
    ['1h30', 90],
    ['1h30m', 90],
    ['1 h 30 min', 90],
    ['1:30', 90],
    ['0:45', 45],
    ['90m', 90],
    ['90 min', 90],
    ['1.5h', 90],
    ['1,5h', 90],
    ['1,5', 90],
    ['2h', 120],
    ['2', 120],
    ['12', 720],
    ['90', 90],
    ['0.25', 15],
    ['  2 hours ', 120],
  ])('reads %j as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes * m)
  })

  it.each(['', 'abc', '1h30x', '1:75', '-1h', '1.5h30m', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull()
  })
})

describe('roundDownToMinutes', () => {
  it('rounds down to the previous quarter hour', () => {
    const r = roundDownToMinutes(new Date(2026, 9, 23, 14, 52, 31), 15)
    expect([r.getHours(), r.getMinutes(), r.getSeconds()]).toEqual([14, 45, 0])
  })
})
