<script setup lang="ts">
import type { Task } from '#shared/schemas/catalog'

useHead({ title: 'Time Tracker' })

const selectedTaskId = ref<number | null>(null)

function logTime(task: Task) {
  return navigateTo({ path: '/entries/new', query: { taskId: task.id } })
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
    <section
      aria-labelledby="catalog-heading"
      class="rounded-lg border border-default p-4"
    >
      <h2
        id="catalog-heading"
        class="mb-1 text-base font-semibold"
      >
        Clients &amp; projects
      </h2>
      <p class="mb-3 text-xs text-muted">
        Select a task to highlight its entries. Press Enter or "Log time" to record time for it.
      </p>
      <ClientTree
        v-model:selected-task-id="selectedTaskId"
        @log="logTime"
      />
    </section>
    <!-- Task 2 mounts <EntriesPanel :highlight-task-id="selectedTaskId" /> here. -->
  </div>
</template>
