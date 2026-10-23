// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { idParamsSchema } from '../../shared/schemas/catalog-query'
import { timeEntryListQuerySchema } from '../../shared/schemas/timeEntry'

describe('id and paging params', () => {
  it('reads plain digits, including id 0', () => {
    expect(idParamsSchema.parse({ id: '0' })).toEqual({ id: 0 })
    expect(idParamsSchema.parse({ id: '16' })).toEqual({ id: 16 })
  })

  it.each(['0x10', '1e2', '1.0', ' 5', '-1', '', 'abc'])('rejects %j instead of guessing another id', (raw) => {
    expect(idParamsSchema.safeParse({ id: raw }).success).toBe(false)
  })

  it('applies the same rule to limit and offset', () => {
    expect(timeEntryListQuerySchema.parse({ limit: '10', offset: '20' })).toMatchObject({ limit: 10, offset: 20 })
    expect(timeEntryListQuerySchema.safeParse({ limit: '1e1' }).success).toBe(false)
    expect(timeEntryListQuerySchema.safeParse({ offset: '0x10' }).success).toBe(false)
  })
})
