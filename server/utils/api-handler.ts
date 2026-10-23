import type { H3Event } from 'h3'
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

/** The JSON body, or a 400 in the BFF shape. h3's own parse error would surface as a 500. */
export async function readJsonBody(event: H3Event): Promise<unknown> {
  try {
    return await readBody(event)
  }
  catch {
    throw new ApiException(400, 'BAD_REQUEST', 'The request body isn\'t valid JSON.')
  }
}
