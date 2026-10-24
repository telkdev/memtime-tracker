// @vitest-environment node
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'
import { readJsonBody } from '../../server/utils/api-handler'
import { ApiException } from '../../server/utils/errors'

function event(body: string, contentType?: string) {
  const req = new IncomingMessage(new Socket())
  req.method = 'POST'
  req.url = '/api/time-entries'
  if (contentType) req.headers['content-type'] = contentType
  req.headers['content-length'] = String(Buffer.byteLength(body))
  req.push(body)
  req.push(null)
  return createEvent(req, new ServerResponse(req))
}

async function status(p: Promise<unknown>) {
  const err = await p.catch(e => e)
  return err instanceof ApiException ? err.body.status : 'ok'
}

describe('readJsonBody', () => {
  it('parses a JSON body, with or without a charset', async () => {
    await expect(readJsonBody(event('{"a":1}', 'application/json'))).resolves.toEqual({ a: 1 })
    await expect(readJsonBody(event('{"a":1}', 'application/json; charset=utf-8'))).resolves.toEqual({ a: 1 })
  })

  it('refuses bodies a cross-site page can send without a preflight', async () => {
    expect(await status(readJsonBody(event('{"a":1}')))).toBe(415)
    expect(await status(readJsonBody(event('{"a":1}', 'text/plain')))).toBe(415)
    expect(await status(readJsonBody(event('a=1', 'application/x-www-form-urlencoded')))).toBe(415)
  })

  it('answers invalid JSON with a 400', async () => {
    expect(await status(readJsonBody(event('{nope', 'application/json; charset=utf-8')))).toBe(400)
  })
})
