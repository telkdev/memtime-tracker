import type { TimeEntry } from '#shared/schemas/timeEntry'
import { timeEntryInputSchema, type TimeEntryInput } from '#shared/schemas/timeEntryInput'
import { ceilToMinute, entryWarnings, type EntryWarning } from '~/utils/entry-form'
import { isConnectionError, toUiError, type UiError } from '~/utils/errors'
import {
  formatDuration,
  fromUtcIso,
  localDayKey,
  localDaysBetween,
  parseDuration,
  resolveEndTime,
  isValidLocalDate,
  resolveLocal,
  sameInstant,
  toTimeString,
  toUtcIso,
  type Occurrence,
} from '~/utils/time'

export type EntryField = 'taskId' | 'date' | 'start' | 'duration' | 'end' | 'comment'

export interface EntryFormOptions {
  mode: 'create' | 'edit'
  entry?: TimeEntry
  taskId?: number | null
  start?: Date
  /**
   * `now`: until the user touches the date or start, typing a duration keeps the end at the
   * current time and moves the start back. That's how people log work they just finished.
   * `start` (default): the start stays put and the end moves.
   */
  anchor?: 'start' | 'now'
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

  const initialStart = opts.entry ? fromUtcIso(opts.entry.start) : { date: localDayKey(opts.start ?? now()), time: toTimeString(opts.start ?? now()) }
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
    if (r.ok && r.ambiguous && sameInstant(r.instant, opts.entry.start)) startOccurrence.value = 'second'
  }

  const initialOccurrence = startOccurrence.value
  const start = computed(() => {
    const r = resolveLocal(date.value, startTime.value, startOccurrence.value)
    // The form shows whole minutes. While the user leaves the start alone, keep the entry's exact
    // instant (seconds included), so saving a comment change doesn't move its times.
    const untouched = opts.entry && date.value === initialStart.date && startTime.value === initialStart.time
      && startOccurrence.value === initialOccurrence
    return r.ok && untouched ? { ...r, instant: new Date(opts.entry!.start) } : r
  })
  const end = computed(() => start.value.ok && durationMs.value ? new Date(start.value.instant.getTime() + durationMs.value) : null)
  const endTime = computed(() => end.value ? toTimeString(end.value) : '')
  const endDayOffset = computed(() => start.value.ok && end.value ? localDaysBetween(start.value.instant, end.value) : 0)
  const startAmbiguous = computed(() => start.value.ok ? start.value.ambiguous : undefined)

  let anchorNow = opts.mode === 'create' && opts.anchor === 'now'

  // An End error was about the old start; once the start moves, End is recomputed from the
  // duration and the message would be stale (and block saving a valid entry).
  function setDate(value: string) {
    anchorNow = false
    endError.value = null
    date.value = value
  }

  function setStartTime(value: string) {
    anchorNow = false
    endError.value = null
    startTime.value = value
  }

  function setDurationText(text: string) {
    durationText.value = text
    const ms = parseDuration(text)
    durationInvalid.value = text.trim() !== '' && ms === null
    // A refused End stays refused until something actually moves End; otherwise the End box would
    // keep the refused text while the form saves a different time.
    const moved = ms !== durationMs.value && !(ms === null && text.trim() !== '')
    if (ms !== null) {
      durationMs.value = ms
      if (anchorNow) {
        const startAt = new Date(now().getTime() - ms)
        startAt.setSeconds(0, 0)
        date.value = localDayKey(startAt)
        startTime.value = toTimeString(startAt)
      }
    }
    else if (text.trim() === '') durationMs.value = null
    if (moved) endError.value = null
  }

  function repeatsLaterTonight(startAt: Date, text: string) {
    const r = resolveLocal(localDayKey(startAt), text)
    return r.ok && !!r.ambiguous && r.ambiguous.second.getTime() > startAt.getTime()
  }

  /** Called when the user commits a typed end time: recompute the duration from it. */
  function setEndTime(text: string) {
    endError.value = null
    if (!start.value.ok || !text) return
    // Same as the start is almost always a slip, not a 24-hour entry: ask instead of guessing.
    // The one exception is the repeated fall-back hour: 02:15 (first) → 02:15 (second) is one hour.
    if (text === toTimeString(start.value.instant) && !repeatsLaterTonight(start.value.instant, text)) {
      endError.value = 'End must be after the start time.'
      return
    }
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
    if (!start.value.ok && start.value.reason === 'gap') setStartTime(start.value.suggestion)
  }

  // --- validation ----------------------------------------------------------------------------
  const attempted = ref(false)
  const serverFields = ref<Partial<Record<EntryField, string>>>({})

  const payload = computed(() => ({
    taskId: taskId.value ?? undefined,
    comment: comment.value,
    start: start.value.ok ? toUtcIso(start.value.instant) : '',
    end: end.value ? toUtcIso(end.value) : '',
  }))

  const localErrors = computed(() => {
    const errors: Partial<Record<EntryField, string>> = {}
    const s = start.value
    if (!isValidLocalDate(date.value)) errors.date = 'Enter a valid date.'
    else if (!s.ok) {
      errors.start = s.reason === 'gap'
        ? `${startTime.value} doesn't exist on this day because clocks jump forward to ${s.suggestion}.`
        : 'Enter a valid start time.'
    }
    if (durationInvalid.value) errors.duration = 'Try 1h 30m, 1:30 or 90m.'
    else if (durationMs.value === null) errors.duration = 'Enter how long you worked, or an end time.'
    if (endError.value) errors.end = endError.value
    const parsed = timeEntryInputSchema.safeParse(payload.value)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR_PATH[String(issue.path[0])]
        // start/end ISO issues are already explained by the start and duration messages above.
        if (field && !errors[field] && !((field === 'start' || field === 'end') && (errors.date || errors.start || errors.duration))) {
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
        // A PUT may have been applied before the connection dropped; repeating it is harmless.
        : 'Couldn\'t reach the server, so your changes may not be saved. Saving again is safe.'
    }
    // Field messages already explain it, unless none of them maps to a field the form shows.
    if (Object.keys(serverFields.value).length) return null
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
    // What is being sent. Edits typed while the request is in flight stay dirty afterwards.
    const sent = snapshot()
    try {
      const body = timeEntryInputSchema.parse(payload.value) satisfies TimeEntryInput
      const res = mode.value === 'create'
        ? await $fetch<{ entry: TimeEntry }>('/api/time-entries', { method: 'POST', body, retry: 0 })
        : await $fetch<{ entry: TimeEntry }>(`/api/time-entries/${entryId.value}`, { method: 'PUT', body, retry: 0 })
      saved.value = sent
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
    const next = fromUtcIso(ceilToMinute(new Date(previous.end)).toISOString())
    anchorNow = false
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
    /** How the form was opened; `mode` can change from edit to create after a 404. */
    initialMode: opts.mode,
    mode, entryId, taskId, date, startTime, startOccurrence, startAmbiguous, durationText, durationMs, comment,
    start, end, endTime, endDayOffset, errors, isValid, warnings, isDirty, pending, error, notFound, summary, retryIn,
    setDate, setStartTime, setDurationText, onSaved, setEndTime, setEndNow, fixStartGap, submit, switchToCreate, resetForNext,
  }
}

export type EntryForm = ReturnType<typeof useEntryForm>
