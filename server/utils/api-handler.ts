import { getRequestHeader, readRawBody, type H3Event } from 'h3'
import type { z } from 'zod'
import { ApiException, toApiError } from './errors'

/** Event handler that always answers errors in the shared `{ error: ApiErrorBody }` shape. */
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (err) {
      const error = toApiError(err)
      setResponseStatus(event, error.status)
      if (error.retryAfter !== undefined) setResponseHeader(event, 'Retry-After', error.retryAfter)
      return { error }
    }
  })
}

/** Validates route params; a bad id is answered locally and costs no upstream request. */
export function parseParams<S extends z.ZodType>(event: H3Event, schema: S): z.infer<S> {
  return schema.parse(getRouterParams(event))
}

export function parseQuery<S extends z.ZodType>(event: H3Event, schema: S): z.infer<S> {
  return schema.parse(getQuery(event))
}

/**
 * Every POST/PUT must say `application/json`. A form post or a `no-cors` fetch from another site
 * can't send that header without a CORS preflight, so this keeps other sites from calling writes,
 * including the ones without a body (catalog refresh).
 */
export function requireJsonContentType(event: H3Event) {
  const type = getRequestHeader(event, 'content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    throw new ApiException(415, 'BAD_REQUEST', 'Send the request body as application/json.')
  }
}

/**
 * The JSON body, or an error in the BFF shape. Only `application/json` is accepted: a form post or a
 * `no-cors` fetch from another site can send a body without a CORS preflight, and h3 would happily
 * parse it as JSON, so any web page could create entries through a running BFF.
 */
export async function readJsonBody(event: H3Event): Promise<unknown> {
  requireJsonContentType(event)
  const raw = await readRawBody(event, 'utf8')
  try {
    return JSON.parse(raw ?? '')
  }
  catch {
    throw new ApiException(400, 'BAD_REQUEST', 'The request body isn\'t valid JSON.')
  }
}
