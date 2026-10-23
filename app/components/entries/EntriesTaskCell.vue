<script setup lang="ts">
import type { TaskLabel } from '~/composables/useTaskNames'

const props = defineProps<{ taskId: number, label?: TaskLabel }>()

const title = computed(() => {
  const name = props.label?.name
  return name ? `${props.label?.path ? `${props.label.path} › ` : ''}${name} (task #${props.taskId})` : `Task #${props.taskId}`
})
</script>

<template>
  <div
    class="min-w-0"
    :title="title"
  >
    <template v-if="label?.name">
      <div class="truncate font-medium text-highlighted">
        <span class="font-normal tabular-nums text-muted">#{{ taskId }}</span> {{ label.name }}
      </div>
      <div
        v-if="label.path"
        class="truncate text-xs text-muted"
      >
        {{ label.path }}
      </div>
    </template>
    <div
      v-else
      class="flex items-center gap-2"
    >
      <span class="text-muted">Task #{{ taskId }}</span>
      <USkeleton
        v-if="label?.status === 'loading'"
        class="h-3 w-16"
        aria-hidden="true"
      />
      <span
        v-else-if="label?.status === 'missing'"
        class="text-xs text-muted"
      >(unavailable)</span>
    </div>
  </div>
</template>
