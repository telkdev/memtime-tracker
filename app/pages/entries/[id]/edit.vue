<script setup lang="ts">
import { idSchema } from '#shared/schemas/common'
import { parseApiError } from '~/utils/api-error'

const route = useRoute()
const id = idSchema.safeParse(route.params.id).data
const { data, error, status, refresh } = await useTimeEntry(id)
const mode = ref<'create' | 'edit'>('edit')
useHead({ title: () => mode.value === 'create' ? 'Log new entry' : 'Edit entry' })
const loadError = computed(() => error.value ? parseApiError(error.value) : null)
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <h1 class="text-xl font-semibold">
      <template v-if="mode === 'create'">
        Log as a new entry
      </template>
      <template v-else>
        Edit entry<span
          v-if="id !== undefined"
          class="text-muted"
        > #{{ id }}</span>
      </template>
    </h1>

    <UEmpty
      v-if="id === undefined || loadError?.code === 'NOT_FOUND'"
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
      @mode="mode = $event"
    />
  </div>
</template>
