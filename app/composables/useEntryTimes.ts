import type { TimeEntry } from '#shared/schemas/timeEntry'
import {
  fromUtcIso,
  isValidLocalDate,
  localDayKey,
  localDaysBetween,
  resolveEndTime,
  resolveLocal,
  sameInstant,
  toTimeString,
  type Occurrence,
} from '~/utils/time'
import { useDurationInput } from './useDurationInput'

export interface EntryTimesOptions {
  entry?: TimeEntry
  start?: Date
  /**
   * `now`: until the user touches the date or start, typing a duration keeps the end at the
   * current time and moves the start back. That's how people log work they just finished.
   * `start` (default): the start stays put and the end moves.
   */
  anchor?: 'start' | 'now'
  now: () => Date
}

/**
 * Date, start, DST choice and duration, and the start and end instants they mean. End is derived
 * from start + duration, so it can't be before the start and a midnight crossing is always the
 * next day. Typing an end time sets the duration instead.
 */
export function useEntryTimes(opts: EntryTimesOptions) {
  const { now, entry } = opts
  const initial = entry ? fromUtcIso(entry.start) : { date: localDayKey(opts.start ?? now()), time: toTimeString(opts.start ?? now()) }
  const date = ref(initial.date)
  const startTime = ref(initial.time)
  const startOccurrence = ref<Occurrence>('first')
  const duration = useDurationInput(entry ? Date.parse(entry.end) - Date.parse(entry.start) : null)
  const endError = ref<string | null>(null)
  let anchorNow = !entry && opts.anchor === 'now'

  if (entry) {
    // An edited entry may sit on the second pass through a repeated hour; keep it there.
    const r = resolveLocal(date.value, startTime.value, 'second')
    if (r.ok && r.ambiguous && sameInstant(r.instant, entry.start)) startOccurrence.value = 'second'
  }
  const initialOccurrence = startOccurrence.value

  const start = computed(() => {
    const r = resolveLocal(date.value, startTime.value, startOccurrence.value)
    // The form shows whole minutes. While the user leaves the start alone, keep the entry's exact
    // instant (seconds included), so saving a comment change doesn't move its times.
    const untouched = entry && date.value === initial.date && startTime.value === initial.time
      && startOccurrence.value === initialOccurrence
    return r.ok && untouched ? { ...r, instant: new Date(entry.start) } : r
  })
  const end = computed(() => start.value.ok && duration.ms.value !== null ? new Date(start.value.instant.getTime() + duration.ms.value) : null)
  const endTime = computed(() => end.value ? toTimeString(end.value) : '')
  const endDayOffset = computed(() => start.value.ok && end.value ? localDaysBetween(start.value.instant, end.value) : 0)
  const startAmbiguous = computed(() => start.value.ok ? start.value.ambiguous : undefined)

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
    // A refused End stays refused until something actually moves End; otherwise the End box would
    // keep the refused text while the form saves a different time.
    if (duration.input(text)) endError.value = null
    const ms = duration.ms.value
    if (anchorNow && ms !== null && !duration.invalid.value) {
      const startAt = new Date(now().getTime() - ms)
      startAt.setSeconds(0, 0)
      date.value = localDayKey(startAt)
      startTime.value = toTimeString(startAt)
    }
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
    duration.set(r.instant.getTime() - start.value.instant.getTime())
  }

  /** Ends the entry now: duration = now − start, on whatever day the start is. */
  function setEndNow() {
    endError.value = null
    if (!start.value.ok) return
    // Passing only the clock time would land on the start's day: "End now" on Monday's entry,
    // pressed on Wednesday at 14:00, would end it on Monday at 14:00.
    const endAt = new Date(Math.floor(now().getTime() / 60_000) * 60_000)
    const ms = endAt.getTime() - start.value.instant.getTime()
    if (ms <= 0) {
      endError.value = 'The start is in the future, so the entry can\'t end now.'
      return
    }
    duration.set(ms)
  }

  function fixStartGap() {
    if (!start.value.ok && start.value.reason === 'gap') setStartTime(start.value.suggestion)
  }

  /** Starts over at a new start with no duration ("Save & log another"). */
  function restartAt(next: { date: string, time: string }) {
    anchorNow = false
    endError.value = null
    date.value = next.date
    startTime.value = next.time
    startOccurrence.value = 'first'
    duration.set(null)
  }

  /** Messages about the times, keyed by the field that shows them. */
  const errors = computed(() => {
    const e: { date?: string, start?: string, duration?: string, end?: string } = {}
    const s = start.value
    if (!isValidLocalDate(date.value)) e.date = 'Enter a valid date.'
    else if (!s.ok) {
      e.start = s.reason === 'gap'
        ? `${startTime.value} doesn't exist on this day because clocks jump forward to ${s.suggestion}.`
        : 'Enter a valid start time.'
    }
    if (duration.error.value) e.duration = duration.error.value
    if (endError.value) e.end = endError.value
    return e
  })

  return {
    date, startTime, startOccurrence, duration, start, end, endTime, endDayOffset, startAmbiguous, errors,
    setDate, setStartTime, setDurationText, setEndTime, setEndNow, fixStartGap, restartAt,
  }
}

export type EntryTimes = ReturnType<typeof useEntryTimes>
