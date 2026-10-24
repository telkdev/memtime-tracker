import type { TimeEntry } from '#shared/schemas/timeEntry'
import type { TimeEntryInput } from '#shared/schemas/timeEntryInput'

/** One page of the user's entries. Unparsed; the caller validates it. */
export function fetchTimeEntries(query: { limit: number, offset: number, refresh?: '1' }): Promise<unknown> {
  return $fetch('/api/time-entries', { query, retry: 0 })
}

export function fetchTimeEntry(id: number) {
  return $fetch<{ entry: TimeEntry }>(`/api/time-entries/${id}`, { retry: 0 })
}

/** Never retried on a network error or 5xx: the API has no idempotency key, so a retry could duplicate. */
export function createTimeEntry(body: TimeEntryInput) {
  return $fetch<{ entry: TimeEntry }>('/api/time-entries', { method: 'POST', body, retry: 0 })
}

export function updateTimeEntry(id: number, body: TimeEntryInput) {
  return $fetch<{ entry: TimeEntry }>(`/api/time-entries/${id}`, { method: 'PUT', body, retry: 0 })
}
