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

/** Parses with the public schema, which has no `userId`, so the key the upstream echoes is dropped. */
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

/** One wording for a missing entry, whether it was read or updated. */
const ENTRY_NOT_FOUND = 'This entry doesn\'t exist. It may have been deleted.'

/** Identical creates inside this window are treated as one (double click, second tab). */
const CREATE_DEDUPE_MS = 5_000
const CREATE_DEDUPE_PREFIX = 'time-entry-create:'

// Whole words only: /end/ alone matched "pending" and "extended".
const FIELD_HINTS: Array<[RegExp, keyof TimeEntryInput]> = [
  [/\btask(?:id)?\b/i, 'taskId'],
  [/\bcomment\b/i, 'comment'],
  [/\bstart\b/i, 'start'],
  [/\bend\b/i, 'end'],
]

/** The field the message names first: "End must be after start" is about End, not Start. */
function fieldNamedIn(message: string): keyof TimeEntryInput | undefined {
  let best: { at: number, field: keyof TimeEntryInput } | undefined
  for (const [re, field] of FIELD_HINTS) {
    const at = message.search(re)
    if (at >= 0 && (!best || at < best.at)) best = { at, field }
  }
  return best?.field
}

/**
 * Upstream errors are a single string. Turn the ones a user can act on into field errors or
 * plain-language messages; everything else passes through unchanged.
 */
export function mapWriteError(err: unknown, op: 'create' | 'update'): unknown {
  if (!(err instanceof ApiException)) return err
  const { code, message } = err.body

  if (code === 'NOT_FOUND') {
    if (op === 'update' && /time entry/i.test(message)) {
      return new ApiException(404, 'NOT_FOUND', ENTRY_NOT_FOUND)
    }
    // Unverified: API_NOTES records no write that answers 404 for an unknown task. If one ever
    // does, point at the Task field instead of saying the entry is gone. Harmless otherwise.
    if (/task/i.test(message)) {
      return new ApiException(400, 'BAD_REQUEST', 'The selected task no longer exists.', {
        fields: { taskId: 'This task no longer exists. Pick another one.' },
      })
    }
  }

  if (code === 'BAD_REQUEST') {
    // The BFF always sends a complete, valid body, so this means a bug on our side, not a user
    // mistake. The docs say "Invalid JSON body"; the live API says "Invalid request body".
    if (/invalid (json|request) body/i.test(message)) {
      return new ApiException(400, 'BAD_REQUEST', 'The server rejected this entry. Nothing was saved.')
    }
    const field = fieldNamedIn(message)
    const text = `The server rejected this entry: ${message}`
    return new ApiException(400, 'BAD_REQUEST', text, field ? { fields: { [field]: message } } : {})
  }
  return err
}

export async function createTimeEntry(input: TimeEntryInput): Promise<TimeEntry> {
  const key = `${CREATE_DEDUPE_PREFIX}${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`
  const entry = await useServerCache().cached(
    key,
    () => useMemtime().request({ method: 'POST', path: '/time-entries', body: input, schema: upstreamTimeEntrySchema }).then(toPublicTimeEntry),
    { ttlMs: CREATE_DEDUPE_MS },
  ).catch((err: unknown) => {
    throw mapWriteError(err, 'create')
  }).finally(() => {
    // Also on failure: a create that timed out may have been saved, and the list must show it.
    useServerCache().invalidatePrefix(TIME_ENTRIES_CACHE_PREFIX)
  })
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
  // A remembered create may now describe an entry that was edited since. Creating the same body
  // again after an edit is a new entry, not a double click.
  useServerCache().invalidatePrefix(CREATE_DEDUPE_PREFIX)
  return entry
}

export async function getTimeEntry(id: number): Promise<TimeEntry> {
  return useMemtime()
    .request({ path: `/time-entries/${id}`, schema: upstreamTimeEntrySchema })
    .then(toPublicTimeEntry)
    .catch((err: unknown) => {
      if (err instanceof ApiException && err.body.code === 'NOT_FOUND') {
        throw new ApiException(404, 'NOT_FOUND', ENTRY_NOT_FOUND)
      }
      throw err
    })
}
