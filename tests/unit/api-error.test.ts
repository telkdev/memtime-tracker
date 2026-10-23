import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseApiError } from '../../app/utils/api-error'

describe('parseApiError', () => {
  it('passes a BFF error body through', () => {
    const body = { status: 404, code: 'NOT_FOUND', message: 'Task #9 not found.' }
    expect(parseApiError({ statusCode: 404, data: { error: body } })).toEqual(body)
  })

  it('reports a response that fails our schema as invalid data, not as a connection problem', () => {
    const err = z.object({ items: z.array(z.string()) }).safeParse({ items: 'nope' }).error
    expect(parseApiError(err)).toMatchObject({ code: 'UPSTREAM_INVALID' })
    expect(parseApiError(err).message).not.toMatch(/reach the server/)
  })

  it('reports a request that got no answer as a connection problem', () => {
    const fetchError = Object.assign(new Error('fetch failed'), { name: 'FetchError' })
    expect(parseApiError(fetchError)).toMatchObject({ status: 0, code: 'UPSTREAM_UNAVAILABLE' })
    expect(parseApiError(new TypeError('Failed to fetch'))).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' })
  })

  it('reports a status without our error shape, or a plain bug, as a generic failure', () => {
    expect(parseApiError({ statusCode: 500, data: '<html>' })).toMatchObject({ status: 500, code: 'INTERNAL' })
    expect(parseApiError(new Error('oops'))).toMatchObject({ code: 'INTERNAL' })
  })
})
