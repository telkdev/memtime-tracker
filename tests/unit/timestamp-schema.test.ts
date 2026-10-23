// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isoTimestampSchema, utcTimestampSchema } from '../../shared/schemas/timeEntry'

const ok = (schema: typeof isoTimestampSchema, value: string) => schema.safeParse(value).success

describe('timestamp schemas', () => {
  it('reads upstream timestamps with Z or an explicit offset', () => {
    expect(ok(isoTimestampSchema, '2026-10-23T07:00:00.000Z')).toBe(true)
    expect(ok(isoTimestampSchema, '2026-10-23T07:00:00Z')).toBe(true)
    expect(ok(isoTimestampSchema, '2026-10-23T09:00:00+02:00')).toBe(true)
  })

  it('rejects an upstream timestamp without a zone instead of guessing local time', () => {
    expect(ok(isoTimestampSchema, '2026-10-23T07:00:00')).toBe(false)
    expect(ok(isoTimestampSchema, '2026-10-23')).toBe(false)
    expect(ok(isoTimestampSchema, 'Fri, 23 Oct 2026 07:00:00 GMT')).toBe(false)
  })

  it('accepts only UTC with Z for what we send upstream', () => {
    expect(ok(utcTimestampSchema, '2026-10-23T07:00:00.000Z')).toBe(true)
    expect(ok(utcTimestampSchema, '2026-10-23T09:00:00+02:00')).toBe(false)
    expect(ok(utcTimestampSchema, '2026-10-23T07:00:00')).toBe(false)
  })
})
