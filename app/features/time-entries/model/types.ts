// The entries list's main types. TimeEntry itself comes from the shared zod schema.
import type { TimeEntry } from '#shared/schemas/timeEntry'

export type { TimeEntry }

export type EntriesStatus = 'loading' | 'waiting' | 'error' | 'ready'

export interface DayGroup {
  /** Local "YYYY-MM-DD". */
  day: string
  /** Any entry of the day; formatted for the header. */
  sample: string
  totalMs: number
  /** The day may have entries on a neighbouring page, so the total covers this page only. */
  partial: boolean
  entries: TimeEntry[]
}

export interface ListPosition {
  page: number
  size: number
}
