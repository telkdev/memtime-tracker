<script setup lang="ts">
import { formatDuration, parseDuration } from '~/common'

// Label, error text and aria wiring come from the surrounding UFormField.
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const previewId = useId()
const QUICK = ['15m', '30m', '1h', '2h']

const preview = computed(() => {
  const ms = parseDuration(props.modelValue)
  return ms === null ? '' : formatDuration(ms)
})
// Only show the normalised value when it differs from what was typed, so `2` → "= 2h" is visible.
const showPreview = computed(() => preview.value && preview.value !== props.modelValue.trim())
</script>

<template>
  <div class="space-y-1.5">
    <UInput
      :model-value="modelValue"
      placeholder="1h 30m"
      autocomplete="off"
      inputmode="text"
      class="w-full"
      @update:model-value="emit('update:modelValue', String($event))"
    >
      <template #trailing>
        <span
          :id="previewId"
          class="text-xs text-muted tabular-nums"
          aria-live="polite"
        >{{ showPreview ? `= ${preview}` : '' }}</span>
      </template>
    </UInput>
    <div
      class="flex flex-wrap gap-1"
      role="group"
      aria-label="Quick durations"
    >
      <UButton
        v-for="q in QUICK"
        :key="q"
        size="xs"
        color="neutral"
        variant="soft"
        :label="q"
        tabindex="-1"
        @click="emit('update:modelValue', q)"
      />
    </div>
  </div>
</template>
