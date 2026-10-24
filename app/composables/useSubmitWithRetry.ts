import { toUiError, type UiError } from '~/utils/errors'

/**
 * Pending and error state for a write, plus one automatic retry after a rate limit: it counts
 * down `retryIn` seconds, then calls `retry` once. A second 429 waits for the user.
 */
export function useSubmitWithRetry<T>() {
  const pending = ref(false)
  /** Seconds until the automatic retry; 0 when none is scheduled. */
  const retryIn = ref(0)
  const error = ref<UiError | null>(null)

  let timer: ReturnType<typeof setInterval> | undefined
  let autoRetried = false
  let onRetried: ((value: T) => void) | undefined

  function stopRetry() {
    clearInterval(timer)
    timer = undefined
    retryIn.value = 0
  }
  onScopeDispose(stopRetry)

  function scheduleRetry(ms: number, retry: () => Promise<T | null>) {
    stopRetry()
    retryIn.value = Math.ceil(ms / 1000)
    timer = setInterval(async () => {
      retryIn.value -= 1
      if (retryIn.value > 0) return
      stopRetry()
      const value = await retry()
      if (value !== null) onRetried?.(value)
    }, 1000)
  }

  /** A save the user asked for: cancel a pending countdown and allow one new automatic retry. */
  function reset() {
    autoRetried = false
    stopRetry()
  }

  async function run(send: () => Promise<T>, retry: () => Promise<T | null>): Promise<T | null> {
    pending.value = true
    error.value = null
    try {
      return await send()
    }
    catch (err) {
      const e = toUiError(err)
      error.value = e
      if (e.code === 'RATE_LIMITED' && !autoRetried) {
        autoRetried = true
        scheduleRetry(e.retryAfterMs ?? 5000, retry)
      }
      return null
    }
    finally {
      pending.value = false
    }
  }

  return {
    pending, retryIn, error, run, reset,
    /** Called when the automatic retry succeeds, since no click is waiting for that result. */
    onRetried: (cb: (value: T) => void) => { onRetried = cb },
  }
}
