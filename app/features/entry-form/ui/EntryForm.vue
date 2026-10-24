<script setup lang="ts">
import EntryTimeFields from './EntryTimeFields.vue'
import FormAlerts from './FormAlerts.vue'
import FormWarnings from './FormWarnings.vue'
import TaskPicker from './TaskPicker.vue'
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { COMMENT_MAX } from '#shared/schemas/timeEntryInput'
import type { EntryForm } from '../composables/useEntryForm'
import type { TaskOptionGroups } from '../model/types'

const props = defineProps<{ form: EntryForm, taskGroups: TaskOptionGroups }>()
const emit = defineEmits<{
  saved: [entry: TimeEntry, opts: { another: boolean }]
  browse: []
  cancel: []
}>()

const f = props.form
const isCreate = computed(() => f.mode.value === 'create')
const root = useTemplateRef<HTMLElement>('root')

// The automatic retry after a 429 saves on its own; it must keep the button the user chose.
let lastAnother = false
async function save(another = false) {
  lastAnother = another
  const entry = await f.submit()
  if (entry) emit('saved', entry, { another })
  else await focusFirstError()
}
f.onSaved(entry => emit('saved', entry, { another: lastAnother }))

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

    <EntryTimeFields
      :form="form"
      @duration-enter="focusField('textarea')"
    />

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

    <FormWarnings :form="form" />

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
