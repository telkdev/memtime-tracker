// Code any feature may use: time and error helpers, small generic composables, shared widgets.
// It never imports from a feature.
export { default as AppHeader } from './ui/AppHeader.vue'
export { default as RateLimitIndicator } from './ui/RateLimitIndicator.vue'
export { default as RetryCountdown } from './ui/RetryCountdown.vue'
export { useDirtyGuard } from './composables/useDirtyGuard'
export { useLeaveGuard } from './composables/useLeaveGuard'
export { useNow } from './composables/useNow'
export { useRequestGuard, type RequestGuard, type RequestTicket } from './composables/useRequestGuard'
export { useRateLimitState } from './composables/useRateLimitState'
export { useSubmitWithRetry } from './composables/useSubmitWithRetry'
export { parseApiError, retryAfterMs } from './lib/api-error'
export { type UiError, isConnectionError, toUiError } from './lib/errors'
export { type Occurrence, durationMs, formatDateTime, formatDay, formatDuration, formatShortDateTime, formatTime, fromUtcIso, isValidLocalDate, localDayKey, localDaysBetween, parseDuration, resolveEndTime, resolveLocal, roundDownToMinutes, sameInstant, startOfLocalDay, toTimeString, toUtcIso, zoneLabel } from './lib/time'
