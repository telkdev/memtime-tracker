<script setup lang="ts">
import DurationInput from './DurationInput.vue'
import type { EntryForm } from '../composables/useEntryForm'
import { zoneLabel } from '~/common'

/** Date, Start, Duration and End, kept in sync by the form, plus the DST gap and overlap helpers. */
const props = defineProps<{ form: EntryForm }>()
const emit = defineEmits<{ durationEnter: [] }>()

const f = props.form
const durationModel = computed({ get: () => f.durationText.value, set: v => f.setDurationText(v) })
const dateModel = computed({ get: () => f.date.value, set: v => f.setDate(v) })
const startModel = computed({ get: () => f.startTime.value, set: v => f.setStartTime(v) })
// End is committed on change (not per keystroke), so a half-typed time doesn't move the duration.
// A refused End stays in the box next to its error. Once Date, Start or the duration moves, End is
// derived again, so the box must show that derived time even when its text didn't change.
const endInput = ref(f.endTime.value)
watch([f.endTime, f.date, f.startTime, f.startOccurrence, f.durationMs], () => {
  endInput.value = f.endTime.value
})

const occurrenceItems = computed(() => {
  const a = f.startAmbiguous.value
  if (!a) return []
  return [
    { value: 'first', label: `First time (${zoneLabel(a.first)})` },
    { value: 'second', label: `Second time, after clocks go back (${zoneLabel(a.second)})` },
  ]
})
</script>

<template>
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-[1.1fr_1fr_1.25fr_1.2fr]">
    <UFormField
      label="Date"
      name="date"
      required
      :error="f.errors.value.date"
    >
      <UInput
        v-model="dateModel"
        type="date"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Start"
      name="start"
      required
      :error="f.errors.value.start"
    >
      <UInput
        v-model="startModel"
        type="time"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Duration"
      name="duration"
      required
      :error="f.errors.value.duration"
    >
      <DurationInput
        v-model="durationModel"
        @keydown.enter.exact.prevent="emit('durationEnter')"
      />
    </UFormField>
    <UFormField
      label="End"
      name="end"
      :error="f.errors.value.end"
      :hint="f.endDayOffset.value > 0 ? `+${f.endDayOffset.value} day` : undefined"
    >
      <div class="flex gap-1">
        <UInput
          v-model="endInput"
          type="time"
          class="min-w-0 flex-1"
          @change="f.setEndTime(endInput)"
        />
        <UTooltip text="End now">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-clock-arrow-down"
            aria-label="Set end to now"
            @click="f.setEndNow()"
          />
        </UTooltip>
      </div>
    </UFormField>
  </div>

  <UButton
    v-if="!f.start.value.ok && f.start.value.reason === 'gap'"
    size="sm"
    variant="soft"
    :label="`Use ${f.start.value.suggestion} instead`"
    @click="f.fixStartGap()"
  />

  <UFormField
    v-if="occurrenceItems.length"
    :label="`${f.startTime.value} happens twice on this day because clocks go back. Which one?`"
    name="occurrence"
  >
    <URadioGroup
      v-model="f.startOccurrence.value"
      :items="occurrenceItems"
      orientation="horizontal"
    />
  </UFormField>
</template>
