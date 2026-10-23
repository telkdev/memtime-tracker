<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { defaultStart } from '~/utils/entry-form'

useHead({ title: 'Log time' })

const route = useRoute()
const sources = useEntrySources()
const queryTask = Number(route.query.taskId)

const form = useEntryForm({
  mode: 'create',
  taskId: Number.isInteger(queryTask) && queryTask > 0 ? queryTask : null,
  start: defaultStart(sources.loadedEntries.value, new Date()),
  knownEntries: () => sources.loadedEntries.value,
})
const taskGroups = computed(() => sources.taskGroups(form.taskId.value))
const taskName = (id: number) => [...taskGroups.value.recent, ...taskGroups.value.catalog].find(o => o.id === id)?.label
const browsing = ref(false)

useLeaveGuard(() => form.isDirty.value && !form.pending.value)
const onSaved = useEntrySaved()

async function handleSaved(entry: TimeEntry, { another }: { another: boolean }) {
  if (another) form.resetForNext(entry)
  await onSaved(entry, 'created', taskName(entry.taskId), !another)
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <h1 class="text-xl font-semibold">
      Log time
    </h1>
    <EntriesEntryForm
      :form="form"
      :task-groups="taskGroups"
      @saved="handleSaved"
      @browse="browsing = true"
      @cancel="navigateTo('/')"
    />
    <EntriesTaskBrowser
      v-model:open="browsing"
      @select="form.taskId.value = $event"
    />
  </div>
</template>
