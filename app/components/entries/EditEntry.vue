<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'

// Separate from the page so the form state is created only once the entry has loaded.
const props = defineProps<{ entry: TimeEntry }>()

const sources = useEntrySources()
const form = useEntryForm({ mode: 'edit', entry: props.entry, knownEntries: () => sources.loadedEntries.value })
const taskGroups = computed(() => sources.taskGroups(form.taskId.value))
const taskName = (id: number) => [...taskGroups.value.recent, ...taskGroups.value.catalog].find(o => o.id === id)?.label
const browsing = ref(false)

useLeaveGuard(() => form.isDirty.value && !form.pending.value)
const onSaved = useEntrySaved()
const returnToList = useReturnToList()

async function handleSaved(entry: TimeEntry) {
  // A 404 may have turned this into a create ("Create as new entry").
  await onSaved(entry, entry.id === props.entry.id ? 'updated' : 'created', taskName(entry.taskId))
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
