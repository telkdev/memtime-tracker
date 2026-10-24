import { formatDuration, parseDuration } from '~/utils/time'

/** The duration box: the text the user typed and the milliseconds it means. */
export function useDurationInput(initialMs: number | null) {
  const ms = ref<number | null>(initialMs)
  // 0 is a real value ("0m"), so every check here is against null, never truthiness.
  const text = ref(initialMs !== null ? formatDuration(initialMs) : '')
  const invalid = ref(false)

  /** Typed text. Returns whether the duration changed; unreadable text keeps the old one. */
  function input(value: string): boolean {
    text.value = value
    const parsed = parseDuration(value)
    invalid.value = value.trim() !== '' && parsed === null
    if (invalid.value || parsed === ms.value) return false
    ms.value = parsed
    return true
  }

  /** A duration that came from somewhere else (End, "End now"): show it in the box too. */
  function set(value: number | null) {
    ms.value = value
    text.value = value !== null ? formatDuration(value) : ''
    invalid.value = false
  }

  const error = computed(() => {
    if (invalid.value) return 'Try 1h 30m, 1:30 or 90m.'
    if (ms.value === null) return 'Enter how long you worked, or an end time.'
    if (ms.value === 0) return 'Enter a duration longer than 0 minutes.'
    return null
  })

  return { text, ms, invalid, error, input, set }
}

export type DurationInput = ReturnType<typeof useDurationInput>
