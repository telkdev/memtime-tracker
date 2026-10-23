<script setup lang="ts">
import type { ApiErrorBody } from '#shared/schemas/common'

defineProps<{ state: 'loading' | 'error' | 'empty' | 'past-end', error?: ApiErrorBody | null }>()
const emit = defineEmits<{ retry: [], first: [] }>()
</script>

<template>
  <div
    v-if="state === 'loading'"
    class="space-y-2"
    aria-busy="true"
    aria-label="Loading time entries"
  >
    <USkeleton class="h-5 w-40" />
    <USkeleton
      v-for="n in 6"
      :key="n"
      class="h-10 w-full"
    />
  </div>

  <div
    v-else
    class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default px-6 py-12 text-center"
    :role="state === 'error' ? 'alert' : undefined"
  >
    <template v-if="state === 'error'">
      <UIcon
        name="i-lucide-cloud-off"
        class="size-8 text-muted"
      />
      <p class="font-medium">
        {{ error?.message ?? 'Couldn\'t load your time entries.' }}
      </p>
      <UButton
        v-if="error?.code !== 'UPSTREAM_AUTH'"
        icon="i-lucide-rotate-cw"
        @click="emit('retry')"
      >
        Try again
      </UButton>
    </template>

    <template v-else-if="state === 'empty'">
      <UIcon
        name="i-lucide-clock"
        class="size-8 text-muted"
      />
      <p class="font-medium">
        No time entries yet
      </p>
      <p class="text-sm text-muted">
        Pick a task and log the time you spent on it.
      </p>
      <UButton
        to="/entries/new"
        icon="i-lucide-plus"
      >
        Log time
      </UButton>
    </template>

    <template v-else>
      <p class="font-medium">
        Nothing on this page
      </p>
      <p class="text-sm text-muted">
        You've gone past your oldest entry.
      </p>
      <UButton
        color="neutral"
        variant="outline"
        @click="emit('first')"
      >
        Back to page 1
      </UButton>
    </template>
  </div>
</template>
