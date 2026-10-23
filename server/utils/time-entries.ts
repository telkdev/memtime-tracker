import { createHash } from 'node:crypto'
import type { Page } from '#shared/schemas/common'
import { timeEntrySchema, upstreamTimeEntrySchema, type TimeEntry } from '#shared/schemas/timeEntry'
import type { TimeEntryInput } from '#shared/schemas/timeEntryInput'
import { ApiException } from './errors'
import type { MemtimeClient } from './memtime-client'
import { useMemtime, useServerCache } from './memtime'

/** Every cached list page lives under this prefix; writes call invalidatePrefix() with it. */
export const TIME_ENTRIES_CACHE_PREFIX = 'time-entries:'
/** Short: entries change whenever the user logs time, possibly from another device. */
export const TIME_ENTRIES_TTL_MS = 15_000

/** Parses with the upstream schema, then re-parses with the public one so `userId` is dropped. */
export function toPublicTimeEntry(raw: unknown): TimeEntry {
  return timeEntrySchema.parse(raw)
}

/** One page of the user's entries, newest first, with `userId` stripped. */
export async function loadTimeEntriesPage(client: MemtimeClient, limit: number, offset: number): Promise<Page<TimeEntry>> {
  const page = await client.list({
    path: '/time-entries',
    itemSchema: upstreamTimeEntrySchema,
    limit,
    offset,
    query: { sortBy: 'start', order: 'desc' },
  })
  return { ...page, items: page.items.map(toPublicTimeEntry) }
}

/** Cached (briefly) and coalesced version of loadTimeEntriesPage for the BFF route. */
export function timeEntriesPage(limit: number, offset: number, refresh: boolean): Promise<Page<TimeEntry>> {
  return useServerCache().cached(
    `${TIME_ENTRIES_CACHE_PREFIX}list?limit=${limit}&offset=${offset}`,
    () => loadTimeEntriesPage(useMemtime(), limit, offset),
    { ttlMs: TIME_ENTRIES_TTL_MS, force: refresh },
  )
}

/** Identical creates inside this window are treated as one (double click, second tab). */
const CREATE_DEDUPE_MS = 5_000

const FIELD_HINTS: Array<[RegExp, keyof TimeEntryInput]> = [
  [/task/i, 'taskId'],
  [/comment/i, 'comment'],
  [/start/i, 'start'],
  [/end/i, 'end'],
]

/**
 * Upstream errors are a single string. Turn the ones a user can act on into field errors or
 * plain-language messages; everything else passes through unchanged.
 */
export function mapWriteError(err: unknown, op: 'create' | 'update'): unknown {
  if (!(err instanceof ApiException)) return err
  const { code, message } = err.body

  if (code === 'NOT_FOUND') {
    if (op === 'update' && /time entry/i.test(message)) {
      return new ApiException(404, 'NOT_FOUND', 'This entry no longer exists. It may have been deleted.')
    }
    if (/task/i.test(message)) {
      return new ApiException(400, 'BAD_REQUEST', 'The selected task no longer exists.', {
        fields: { taskId: 'This task no longer exists. Pick another one.' },
      })
    }
  }

  if (code === 'BAD_REQUEST') {
    // Our BFF always sends valid JSON, so this means a bug on our side, not a user mistake.
    if (/invalid json/i.test(message)) {
      return new ApiException(400, 'BAD_REQUEST', 'The server rejected this entry. Nothing was saved.')
    }
    const field = FIELD_HINTS.find(([re]) => re.test(message))?.[1]
    const text = `The server rejected this entry: ${message}`
    return new ApiException(400, 'BAD_REQUEST', text, field ? { fields: { [field]: message } } : {})
  }
  return err
}

export async function createTimeEntry(input: TimeEntryInput): Promise<TimeEntry> {
  const key = `time-entry-create:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`
  const entry = await useServerCache().cached(
    key,
    () => useMemtime().request({ method: 'POST', path: '/time-entries', body: input, schema: upstreamTimeEntrySchema }).then(toPublicTimeEntry),
    { ttlMs: CREATE_DEDUPE_MS },
  ).catch((err: unknown) => {
    throw mapWriteError(err, 'create')
  })
  useServerCache().invalidatePrefix(TIME_ENTRIES_CACHE_PREFIX)
  return entry
}

export async function updateTimeEntry(id: number, input: TimeEntryInput): Promise<TimeEntry> {
  const entry = await useMemtime()
    .request({ method: 'PUT', path: `/time-entries/${id}`, body: input, schema: upstreamTimeEntrySchema })
    .then(toPublicTimeEntry)
    .catch((err: unknown) => {
      throw mapWriteError(err, 'update')
    })
  useServerCache().invalidatePrefix(TIME_ENTRIES_CACHE_PREFIX)
  return entry
}

export async function getTimeEntry(id: number): Promise<TimeEntry> {
  return useMemtime()
    .request({ path: `/time-entries/${id}`, schema: upstreamTimeEntrySchema })
    .then(toPublicTimeEntry)
    .catch((err: unknown) => {
      if (err instanceof ApiException && err.body.code === 'NOT_FOUND') {
        throw new ApiException(404, 'NOT_FOUND', 'This entry doesn\'t exist, or it was deleted.')
      }
      throw err
    })
}
