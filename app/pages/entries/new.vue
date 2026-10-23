<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { idSchema } from '#shared/schemas/common'
import { defaultStart } from '~/utils/entry-form'
import { roundDownToMinutes } from '~/utils/time'

useHead({ title: 'Log time' })

const route = useRoute()
const sources = useEntrySources()
// Ids start at 0, so parse instead of testing truthiness.
const rawTask = route.query.taskId
const queryTask = typeof rawTask === 'string' && rawTask !== '' ? idSchema.safeParse(rawTask).data : undefined

const now = new Date()
const start = defaultStart(sources.loadedEntries.value, now)
const form = useEntryForm({
  mode: 'create',
  taskId: queryTask ?? null,
  start,
  // Continuing after today's last entry: keep that start. Otherwise assume the work just ended.
  anchor: start.getTime() === roundDownToMinutes(now, 15).getTime() ? 'now' : 'start',
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
    <EntryForm
      :form="form"
      :task-groups="taskGroups"
      @saved="handleSaved"
      @browse="browsing = true"
      @cancel="navigateTo('/')"
    />
    <TaskBrowser
      v-model:open="browsing"
      @select="form.taskId.value = $event"
    />
  </div>
</template>
