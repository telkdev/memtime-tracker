// The entry form's main types and rules. The request body type is TimeEntryInput in shared/.
import type { TimeEntry } from '#shared/schemas/timeEntry'
import type { TimeEntryInput } from '#shared/schemas/timeEntryInput'

export type { TimeEntry, TimeEntryInput }

export const LONG_ENTRY_MS = 12 * 60 * 60_000

export type EntryWarning
  = | { kind: 'long' }
    | { kind: 'future' }
    | { kind: 'overlap', entry: TimeEntry }

export type EntryField = 'taskId' | 'date' | 'start' | 'duration' | 'end' | 'comment'

export type FieldErrors = Partial<Record<EntryField, string>>

export interface TaskOption {
  id: number
  label: string
  /** "Client › Project", when the task's place in the tree is known. */
  path?: string
}

export interface TaskOptionGroups {
  recent: TaskOption[]
  catalog: TaskOption[]
}
