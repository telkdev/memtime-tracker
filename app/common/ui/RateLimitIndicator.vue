<script setup lang="ts">
import { useNow } from '../composables/useNow'
import { useRateLimitState } from '../composables/useRateLimitState'

const { snapshot } = useRateLimitState()
const now = useNow()

const resetsIn = computed(() => {
  const s = snapshot.value
  if (!s) return 0
  return Math.max(0, Math.ceil((s.at + s.resetsInMs - now.value) / 1000))
})

// Once the window has reset locally, show the full budget again without another request.
const remaining = computed(() => {
  const s = snapshot.value
  if (!s) return null
  return resetsIn.value === 0 ? s.budget : s.remaining
})

const low = computed(() => remaining.value !== null && remaining.value <= 3)
</script>

<template>
  <span
    v-if="snapshot && remaining !== null"
    class="inline-flex items-center gap-1 text-xs tabular-nums"
    :class="low ? 'text-warning' : 'text-dimmed'"
    :title="`The time tracking API allows ${snapshot.budget + 1} requests per minute; this app keeps one spare.`"
  >
    <UIcon
      name="i-lucide-gauge"
      class="size-3.5"
      aria-hidden="true"
    />
    {{ remaining }}/{{ snapshot.budget }} requests left<template v-if="remaining < snapshot.budget && resetsIn"> · resets in {{ resetsIn }}s</template>
  </span>
</template>
