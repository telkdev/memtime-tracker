<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { idSchema } from '#shared/schemas/common'
import { parseApiError } from '~/utils/api-error'

useHead({ title: 'Edit entry' })

const route = useRoute()
const sources = useEntrySources()
const id = idSchema.safeParse(route.params.id).data

// Opened from the list: the entry is already in memory, so this costs no request.
const cached = id ? sources.getCached(id) : undefined
const { data, error, status, refresh } = await useAsyncData(
  `time-entry:${id}`,
  () => cached ? Promise.resolve({ entry: cached }) : $fetch<{ entry: TimeEntry }>(`/api/time-entries/${id}`, { retry: 0 }),
  { immediate: !!id },
)
const loadError = computed(() => error.value ? parseApiError(error.value) : null)
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <h1 class="text-xl font-semibold">
      Edit entry<span
        v-if="id"
        class="text-muted"
      > #{{ id }}</span>
    </h1>

    <UEmpty
      v-if="!id || loadError?.code === 'NOT_FOUND'"
      icon="i-lucide-file-x"
      title="This entry doesn't exist"
      description="It may have been deleted, or the link is wrong."
      :actions="[{ label: 'Log new entry', to: '/entries/new' }, { label: 'Back to list', to: '/', color: 'neutral', variant: 'ghost' }]"
    />
    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="loadError.message"
      :actions="[{ label: 'Try again', onClick: () => refresh() }]"
    />
    <div
      v-else-if="status === 'pending' || !data"
      class="space-y-4"
      aria-busy="true"
    >
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>
    <EditEntry
      v-else
      :key="data.entry.id"
      :entry="data.entry"
    />
  </div>
</template>
