<script setup lang="ts">
import EntryForm from './EntryForm.vue'
import TaskBrowser from './TaskBrowser.vue'
import { useEntryForm } from '../composables/useEntryForm'
import { useEntrySaved } from '../composables/useEntrySaved'
import { useEntrySources } from '../composables/useEntrySources'
import { defaultStart } from '../model/rules'
import { useLeaveGuard } from '~/common'
import { useReturnToList } from '~/features/time-entries'
import type { TimeEntry } from '#shared/schemas/timeEntry'

// The form plus what both pages need around it: task options, the task browser, the leave guard
// and the "saved" toast. With `entry` it edits that entry, without it it logs a new one. The edit
// page mounts it only once the entry has loaded, so the form state starts from real values.
const props = defineProps<{ entry?: TimeEntry, taskId?: number | null }>()
/** The page heading follows the form: after a 404, "Create as new entry" turns an edit into a create. */
const emit = defineEmits<{ mode: [mode: 'create' | 'edit'] }>()

const sources = useEntrySources()
const knownEntries = () => sources.loadedEntries.value
const form = props.entry ? useEntryForm({ mode: 'edit', entry: props.entry, knownEntries }) : createForm()

function createForm() {
  const { start, from } = defaultStart(knownEntries(), new Date())
  return useEntryForm({
    mode: 'create',
    taskId: props.taskId ?? null,
    start,
    // Continuing after today's last entry: keep that start. Otherwise assume the work just ended.
    // Asked of defaultStart, not guessed by comparing times: a last entry ending on a quarter hour
    // looks exactly like "now, rounded".
    anchor: from === 'now' ? 'now' : 'start',
    knownEntries,
  })
}

watch(form.mode, mode => emit('mode', mode))
sources.watchTaskName(() => form.taskId.value)
const taskGroups = computed(() => sources.taskGroups(form.taskId.value))
const taskName = (id: number) => [...taskGroups.value.recent, ...taskGroups.value.catalog].find(o => o.id === id)?.label
const browsing = ref(false)

useLeaveGuard(() => form.isDirty.value && !form.pending.value)
const onSaved = useEntrySaved()
const returnToList = useReturnToList()

async function handleSaved(entry: TimeEntry, { another }: { another: boolean }) {
  if (another) form.resetForNext(entry)
  // A 404 on update may have turned an edit into a create ("Create as new entry").
  const verb = entry.id === props.entry?.id ? 'updated' : 'created'
  await onSaved(entry, verb, taskName(entry.taskId), !another)
}
</script>

<template>
  <div>
    <EntryForm
      :form="form"
      :task-groups="taskGroups"
      @saved="handleSaved"
      @browse="browsing = true"
      @cancel="returnToList('cancel')"
    />
    <TaskBrowser
      v-model:open="browsing"
      @select="form.taskId.value = $event"
    />
  </div>
</template>
