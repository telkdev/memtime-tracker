import type { TimeEntry } from '#shared/schemas/timeEntry'
import { timeEntryInputSchema } from '#shared/schemas/timeEntryInput'
import { ceilToMinute, entryWarnings, fieldForPath, mergeFieldErrors } from '../model/rules'
import type { EntryWarning, FieldErrors } from '../model/types'
import { fromUtcIso, isConnectionError, toUtcIso, useDirtyGuard, useSubmitWithRetry } from '~/common'
import { createTimeEntry, updateTimeEntry } from '~/features/time-entries'
import { useEntryTimes, type EntryTimesOptions } from './useEntryTimes'

export interface EntryFormOptions extends Omit<EntryTimesOptions, 'now'> {
  mode: 'create' | 'edit'
  taskId?: number | null
  /** Entries already loaded by the list, for overlap warnings. Never fetched for this. */
  knownEntries?: () => readonly TimeEntry[]
  now?: () => Date
}

/**
 * The create/edit form. It only connects the parts:
 * - `useEntryTimes`: date, start, DST choice, duration, end
 * - `useDirtyGuard`: unsaved changes, over every field in `fields`
 * - `useSubmitWithRetry`: pending, error, one automatic retry after a 429
 * - `mergeFieldErrors`: which message each field shows
 */
export function useEntryForm(opts: EntryFormOptions) {
  const now = opts.now ?? (() => new Date())
  const mode = ref(opts.mode)
  const entryId = ref(opts.entry?.id)
  const times = useEntryTimes({ ...opts, now, anchor: opts.mode === 'create' ? opts.anchor : 'start' })

  // Everything the user can edit, and so everything that makes the form dirty. Components only see
  // what is in here, so a new field can't be shown without being tracked.
  const fields = {
    taskId: ref<number | null>(opts.entry?.taskId ?? opts.taskId ?? null),
    date: times.date,
    startTime: times.startTime,
    startOccurrence: times.startOccurrence,
    duration: times.duration.ms,
    comment: ref(opts.entry?.comment ?? ''),
  }
  const dirty = useDirtyGuard(fields, { comment: c => c.trim() })
  const submitter = useSubmitWithRetry<TimeEntry>()

  // --- validation ----------------------------------------------------------------------------
  const attempted = ref(false)
  const serverFields = ref<FieldErrors>({})

  const payload = computed(() => ({
    taskId: fields.taskId.value ?? undefined,
    comment: fields.comment.value,
    start: times.start.value.ok ? toUtcIso(times.start.value.instant) : '',
    end: times.end.value ? toUtcIso(times.end.value) : '',
  }))

  const localErrors = computed(() => {
    const parsed = timeEntryInputSchema.safeParse(payload.value)
    return mergeFieldErrors(times.errors.value, parsed.success ? [] : parsed.error.issues)
  })
  const errors = computed<FieldErrors>(() => attempted.value ? { ...serverFields.value, ...localErrors.value } : {})
  const isValid = computed(() => Object.keys(localErrors.value).length === 0)

  const warnings = computed<EntryWarning[]>(() => {
    const { start, end } = times
    if (!start.value.ok || !end.value) return []
    return entryWarnings(opts.knownEntries?.() ?? [], start.value.instant, end.value, now(), entryId.value)
  })

  // --- submit --------------------------------------------------------------------------------
  const { error, pending, retryIn } = submitter
  const notFound = computed(() => mode.value === 'edit' && error.value?.code === 'NOT_FOUND')

  /** Message shown above the form for errors that aren't about one field. */
  const summary = computed(() => {
    const e = error.value
    if (!e || notFound.value) return null
    if (e.code === 'RATE_LIMITED') return retryIn.value > 0 ? null : 'Still too many requests. Wait a few seconds and save again. Your values are kept.'
    if (isConnectionError(e)) {
      return mode.value === 'create'
        ? 'Couldn\'t reach the server. The entry may not have been saved. Check the list before trying again.'
        // A PUT may have been applied before the connection dropped; repeating it is harmless.
        : 'Couldn\'t reach the server, so your changes may not be saved. Saving again is safe.'
    }
    // Field messages already explain it, unless none of them maps to a field the form shows.
    if (Object.keys(serverFields.value).length) return null
    return e.summary
  })

  function send(): Promise<TimeEntry> {
    const body = timeEntryInputSchema.parse(payload.value)
    const req = mode.value === 'create' || entryId.value === undefined
      ? createTimeEntry(body)
      : updateTimeEntry(entryId.value, body)
    return req.then(res => res.entry)
  }

  async function submit({ auto = false } = {}): Promise<TimeEntry | null> {
    if (pending.value) return null
    if (!auto) submitter.reset()
    attempted.value = true
    serverFields.value = {}
    if (!isValid.value) return null

    // What is being sent. Edits typed while the request is in flight stay dirty afterwards.
    const sent = dirty.snapshot()
    const entry = await submitter.run(send, () => submit({ auto: true }))
    if (entry) dirty.markSaved(sent)
    else serverFields.value = serverFieldErrors(error.value?.fields ?? {})
    return entry
  }

  /** After a 404 on update: keep every value and save it as a new entry instead. */
  function switchToCreate() {
    mode.value = 'create'
    entryId.value = undefined
    error.value = null
  }

  /** "Save & log another": same task, next entry starts where this one ended. */
  function resetForNext(previous: TimeEntry) {
    times.restartAt(fromUtcIso(ceilToMinute(new Date(previous.end)).toISOString()))
    fields.comment.value = ''
    attempted.value = false
    error.value = null
    dirty.markSaved()
  }

  return {
    /** How the form was opened; `mode` can change from edit to create after a 404. */
    initialMode: opts.mode,
    fields,
    ...fields,
    mode, entryId,
    durationText: times.duration.text,
    durationMs: times.duration.ms,
    start: times.start, end: times.end, endTime: times.endTime, endDayOffset: times.endDayOffset, startAmbiguous: times.startAmbiguous,
    errors, isValid, warnings, isDirty: dirty.isDirty, markSaved: () => dirty.markSaved(), pending, error, notFound, summary, retryIn,
    setDate: times.setDate, setStartTime: times.setStartTime, setDurationText: times.setDurationText,
    setEndTime: times.setEndTime, setEndNow: times.setEndNow, fixStartGap: times.fixStartGap,
    onSaved: submitter.onRetried, submit, switchToCreate, resetForNext,
  }
}

function serverFieldErrors(fields: Record<string, string>): FieldErrors {
  const out: FieldErrors = {}
  for (const [path, message] of Object.entries(fields)) {
    const field = fieldForPath(path)
    if (field) out[field] = message
  }
  return out
}

export type EntryForm = ReturnType<typeof useEntryForm>
