import type { TimeEntry } from '#shared/schemas/timeEntry'
import { timeEntryInputSchema, type TimeEntryInput } from '#shared/schemas/timeEntryInput'
import { entryWarnings, type EntryWarning } from '~/utils/entry-form'
import { isConnectionError, toUiError, type UiError } from '~/utils/errors'
import {
  calendarDaysBetween,
  formatDuration,
  fromUtcIso,
  parseDuration,
  resolveEndTime,
  resolveLocal,
  toDateString,
  toTimeString,
  type Occurrence,
} from '~/utils/time'

export type EntryField = 'taskId' | 'date' | 'start' | 'duration' | 'end' | 'comment'

export interface EntryFormOptions {
  mode: 'create' | 'edit'
  entry?: TimeEntry
  taskId?: number | null
  start?: Date
  /** Entries already loaded by the list, for overlap warnings. Never fetched for this. */
  knownEntries?: () => readonly TimeEntry[]
  now?: () => Date
}

/** Upstream schema paths → the form field that shows the message. */
const FIELD_FOR_PATH: Record<string, EntryField> = { taskId: 'taskId', comment: 'comment', start: 'start', end: 'end' }

/**
 * State and behaviour of the create/edit form. End is derived from start + duration, so an end
 * before the start can't be entered and a midnight crossing is always the next day.
 */
export function useEntryForm(opts: EntryFormOptions) {
  const now = opts.now ?? (() => new Date())
  const mode = ref(opts.mode)
  const entryId = ref(opts.entry?.id)

  const initialStart = opts.entry ? fromUtcIso(opts.entry.start) : { date: toDateString(opts.start ?? now()), time: toTimeString(opts.start ?? now()) }
  const taskId = ref<number | null>(opts.entry?.taskId ?? opts.taskId ?? null)
  const date = ref(initialStart.date)
  const startTime = ref(initialStart.time)
  const startOccurrence = ref<Occurrence>('first')
  const durationMs = ref<number | null>(opts.entry ? Date.parse(opts.entry.end) - Date.parse(opts.entry.start) : null)
  const durationText = ref(durationMs.value ? formatDuration(durationMs.value) : '')
  const durationInvalid = ref(false)
  const endError = ref<string | null>(null)
  const comment = ref(opts.entry?.comment ?? '')

  if (opts.entry) {
    // An edited entry may sit on the second pass through a repeated hour; keep it there.
    const r = resolveLocal(date.value, startTime.value, 'second')
    if (r.ok && r.ambiguous && r.instant.toISOString() === new Date(opts.entry.start).toISOString()) startOccurrence.value = 'second'
  }

  const start = computed(() => resolveLocal(date.value, startTime.value, startOccurrence.value))
  const end = computed(() => start.value.ok && durationMs.value ? new Date(start.value.instant.getTime() + durationMs.value) : null)
  const endTime = computed(() => end.value ? toTimeString(end.value) : '')
  const endDayOffset = computed(() => start.value.ok && end.value ? calendarDaysBetween(start.value.instant, end.value) : 0)
  const startAmbiguous = computed(() => start.value.ok ? start.value.ambiguous : undefined)

  function setDurationText(text: string) {
    durationText.value = text
    const ms = parseDuration(text)
    durationInvalid.value = text.trim() !== '' && ms === null
    if (ms !== null) durationMs.value = ms
    else if (text.trim() === '') durationMs.value = null
    endError.value = null
  }

  /** Called when the user commits a typed end time: recompute the duration from it. */
  function setEndTime(text: string) {
    endError.value = null
    if (!start.value.ok || !text) return
    const r = resolveEndTime(start.value.instant, text)
    if (!r.ok) {
      endError.value = r.reason === 'gap' ? `${text} doesn't exist that night because clocks jump forward. Try ${r.suggestion}.` : 'Enter a valid end time.'
      return
    }
    durationMs.value = r.instant.getTime() - start.value.instant.getTime()
    durationText.value = formatDuration(durationMs.value)
    durationInvalid.value = false
  }

  function setEndNow() {
    setEndTime(toTimeString(now()))
  }

  function fixStartGap() {
    if (!start.value.ok && start.value.reason === 'gap') startTime.value = start.value.suggestion
  }

  // --- validation ----------------------------------------------------------------------------
  const attempted = ref(false)
  const serverFields = ref<Partial<Record<EntryField, string>>>({})

  const payload = computed(() => ({
    taskId: taskId.value ?? undefined,
    comment: comment.value,
    start: start.value.ok ? start.value.instant.toISOString() : '',
    end: end.value?.toISOString() ?? '',
  }))

  const localErrors = computed(() => {
    const errors: Partial<Record<EntryField, string>> = {}
    const s = start.value
    if (!s.ok) {
      errors.start = s.reason === 'gap'
        ? `${startTime.value} doesn't exist on this day because clocks jump forward to ${s.suggestion}.`
        : 'Enter a valid date and start time.'
    }
    if (durationInvalid.value) errors.duration = 'Try 1h 30m, 1:30 or 90m.'
    else if (durationMs.value === null) errors.duration = 'Enter how long you worked, or an end time.'
    if (endError.value) errors.end = endError.value
    const parsed = timeEntryInputSchema.safeParse(payload.value)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR_PATH[String(issue.path[0])]
        // start/end ISO issues are already explained by the start and duration messages above.
        if (field && !errors[field] && !((field === 'start' || field === 'end') && (errors.start || errors.duration))) {
          errors[field] = issue.message
        }
      }
    }
    return errors
  })

  const errors = computed<Partial<Record<EntryField, string>>>(() => attempted.value ? { ...serverFields.value, ...localErrors.value } : {})
  const isValid = computed(() => Object.keys(localErrors.value).length === 0)

  const warnings = computed<EntryWarning[]>(() => {
    if (!start.value.ok || !end.value) return []
    return entryWarnings(opts.knownEntries?.() ?? [], start.value.instant, end.value, now(), entryId.value)
  })

  // --- dirty tracking ------------------------------------------------------------------------
  const snapshot = () => JSON.stringify([taskId.value, date.value, startTime.value, durationMs.value, comment.value.trim()])
  const saved = ref(snapshot())
  const isDirty = computed(() => snapshot() !== saved.value)

  // --- submit --------------------------------------------------------------------------------
  const pending = ref(false)
  /** Seconds until the automatic retry after a rate limit; 0 when none is scheduled. */
  const retryIn = ref(0)
  const error = ref<UiError | null>(null)
  const notFound = computed(() => mode.value === 'edit' && error.value?.code === 'NOT_FOUND')

  /** Message shown above the form for errors that aren't about one field. */
  const summary = computed(() => {
    const e = error.value
    if (!e || notFound.value) return null
    if (e.code === 'RATE_LIMITED') return retryIn.value > 0 ? null : 'Still too many requests. Wait a few seconds and save again. Your values are kept.'
    if (isConnectionError(e)) {
      return mode.value === 'create'
        ? 'Couldn\'t reach the server. The entry may not have been saved. Check the list before trying again.'
        : 'Couldn\'t reach the server. Your changes aren\'t saved yet.'
    }
    if (e.code === 'VALIDATION' && Object.keys(e.fields).length) return null
    return e.summary
  })

  // A 429 waits out the countdown and retries once by itself, keeping every value.
  let retryTimer: ReturnType<typeof setInterval> | undefined
  let autoRetried = false
  let onAutoSaved: ((entry: TimeEntry) => void) | undefined

  function stopRetry() {
    clearInterval(retryTimer)
    retryTimer = undefined
    retryIn.value = 0
  }
  onScopeDispose(stopRetry)

  function scheduleRetry(ms: number) {
    stopRetry()
    retryIn.value = Math.ceil(ms / 1000)
    retryTimer = setInterval(async () => {
      retryIn.value -= 1
      if (retryIn.value > 0) return
      stopRetry()
      const entry = await submit({ auto: true })
      if (entry) onAutoSaved?.(entry)
    }, 1000)
  }

  /** Called when an automatic retry after a rate limit succeeds. */
  function onSaved(cb: (entry: TimeEntry) => void) {
    onAutoSaved = cb
  }

  async function submit({ auto = false } = {}): Promise<TimeEntry | null> {
    if (pending.value) return null
    if (!auto) {
      autoRetried = false
      stopRetry()
    }
    attempted.value = true
    serverFields.value = {}
    if (!isValid.value) return null

    pending.value = true
    error.value = null
    try {
      const body = timeEntryInputSchema.parse(payload.value) satisfies TimeEntryInput
      const res = mode.value === 'create'
        ? await $fetch<{ entry: TimeEntry }>('/api/time-entries', { method: 'POST', body })
        : await $fetch<{ entry: TimeEntry }>(`/api/time-entries/${entryId.value}`, { method: 'PUT', body })
      saved.value = snapshot()
      return res.entry
    }
    catch (err) {
      const e = toUiError(err)
      error.value = e
      const fields: Partial<Record<EntryField, string>> = {}
      for (const [path, message] of Object.entries(e.fields)) {
        const field = FIELD_FOR_PATH[path]
        if (field) fields[field] = message
      }
      serverFields.value = fields
      if (e.code === 'RATE_LIMITED' && !autoRetried) {
        autoRetried = true
        scheduleRetry(e.retryAfterMs ?? 5000)
      }
      return null
    }
    finally {
      pending.value = false
    }
  }

  /** After a 404 on update: keep every value and save it as a new entry instead. */
  function switchToCreate() {
    mode.value = 'create'
    entryId.value = undefined
    error.value = null
  }

  /** "Save & log another": same task, next entry starts where this one ended. */
  function resetForNext(previous: TimeEntry) {
    const next = fromUtcIso(previous.end)
    date.value = next.date
    startTime.value = next.time
    startOccurrence.value = 'first'
    durationMs.value = null
    durationText.value = ''
    comment.value = ''
    attempted.value = false
    error.value = null
    saved.value = snapshot()
  }

  return {
    mode, entryId, taskId, date, startTime, startOccurrence, startAmbiguous, durationText, durationMs, comment,
    start, end, endTime, endDayOffset, errors, isValid, warnings, isDirty, pending, error, notFound, summary, retryIn,
    setDurationText, onSaved, setEndTime, setEndNow, fixStartGap, submit, switchToCreate, resetForNext,
  }
}

export type EntryForm = ReturnType<typeof useEntryForm>
