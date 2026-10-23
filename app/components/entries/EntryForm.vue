<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { COMMENT_MAX } from '#shared/schemas/timeEntryInput'
import type { EntryForm } from '~/composables/useEntryForm'
import type { TaskOptionGroups } from '~/utils/task-options'
import { formatTime, zoneLabel } from '~/utils/time'

const props = defineProps<{ form: EntryForm, taskGroups: TaskOptionGroups }>()
const emit = defineEmits<{
  saved: [entry: TimeEntry, opts: { another: boolean }]
  browse: []
  cancel: []
}>()

const f = props.form
const isCreate = computed(() => f.mode.value === 'create')
const root = useTemplateRef<HTMLElement>('root')

const durationModel = computed({ get: () => f.durationText.value, set: v => f.setDurationText(v) })
const dateModel = computed({ get: () => f.date.value, set: v => f.setDate(v) })
const startModel = computed({ get: () => f.startTime.value, set: v => f.setStartTime(v) })
const endInput = ref(f.endTime.value)
watch(f.endTime, (v) => {
  endInput.value = v
})

const occurrenceItems = computed(() => {
  const a = f.startAmbiguous.value
  if (!a) return []
  return [
    { value: 'first', label: `First time (${zoneLabel(a.first)})` },
    { value: 'second', label: `Second time, after clocks go back (${zoneLabel(a.second)})` },
  ]
})

async function save(another = false) {
  const entry = await f.submit()
  if (entry) emit('saved', entry, { another })
  else await focusFirstError()
}
f.onSaved(entry => emit('saved', entry, { another: false }))

async function focusFirstError() {
  await nextTick()
  root.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

// The fast path is task → duration → comment → Ctrl+Enter. Date and time inputs have one tab stop
// per segment, so focus jumps over them; they stay reachable with Tab and the mouse.
function focusField(selector: string) {
  nextTick(() => root.value?.querySelector<HTMLElement>(selector)?.focus())
}
const focusDuration = () => focusField('input[name="duration"]')

function onDurationEnter(e: KeyboardEvent) {
  e.preventDefault()
  focusField('textarea')
}

onMounted(() => {
  if (!isCreate.value) return
  if (f.taskId.value === null) focusField('[role="combobox"]')
  else focusDuration()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    save()
  }
}
</script>

<template>
  <form
    ref="root"
    class="space-y-5"
    novalidate
    @submit.prevent="save()"
    @keydown="onKeydown"
  >
    <FormAlerts
      :form="form"
      @retry="save()"
    />

    <UFormField
      label="Task"
      name="taskId"
      required
      :error="f.errors.value.taskId"
    >
      <TaskPicker
        v-model="f.taskId.value"
        :groups="taskGroups"
        @browse="emit('browse')"
        @picked="focusDuration"
      />
    </UFormField>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-[1.1fr_1fr_1.25fr_1.2fr]">
      <UFormField
        label="Date"
        name="date"
        required
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
          @keydown.enter.exact="onDurationEnter"
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

    <UFormField
      label="Comment"
      name="comment"
      required
      :error="f.errors.value.comment"
      :hint="`${f.comment.value.length}/${COMMENT_MAX}`"
    >
      <UTextarea
        v-model="f.comment.value"
        :rows="3"
        :maxlength="COMMENT_MAX"
        autoresize
        placeholder="What did you work on?"
        class="w-full"
      />
    </UFormField>

    <ul
      v-if="f.warnings.value.length"
      class="space-y-1 text-sm text-warning"
      aria-live="polite"
    >
      <li
        v-for="w in f.warnings.value"
        :key="w.kind"
        class="flex items-center gap-1.5"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />
        <span v-if="w.kind === 'long'">That's a long entry. Double-check the times.</span>
        <span v-else-if="w.kind === 'future'">This entry ends in the future.</span>
        <span v-else>
          Overlaps
          <NuxtLink
            :to="`/entries/${w.entry.id}/edit`"
            class="underline"
          >entry #{{ w.entry.id }}</NuxtLink>
          ({{ formatTime(w.entry.start) }}–{{ formatTime(w.entry.end) }}).
        </span>
      </li>
    </ul>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        type="submit"
        :loading="f.pending.value"
        :label="f.pending.value ? 'Saving…' : isCreate ? 'Save entry' : 'Save changes'"
      />
      <UButton
        v-if="isCreate && f.initialMode === 'create'"
        color="neutral"
        variant="outline"
        label="Save & log another"
        :disabled="f.pending.value"
        @click="save(true)"
      />
      <UButton
        color="neutral"
        variant="ghost"
        label="Cancel"
        @click="emit('cancel')"
      />
      <span class="ml-auto hidden text-xs text-muted sm:inline">
        <UKbd value="meta" /> <UKbd value="enter" /> to save
      </span>
    </div>
  </form>
</template>
