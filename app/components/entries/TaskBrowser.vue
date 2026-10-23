<script setup lang="ts">
// Slideover with the client tree in pick mode, for tasks the picker hasn't seen yet.
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ select: [taskId: number] }>()

function pick(taskId: number) {
  emit('select', taskId)
  open.value = false
}
defineExpose({ pick })
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Choose a task"
    description="Expand a client and a project, then pick a task."
  >
    <template #body>
      <!-- Task 1's <ClientTree mode="pick" @select="pick($event.id)" /> goes here once it lands. -->
      <p class="text-sm text-muted">
        The client list is loading…
      </p>
    </template>
  </USlideover>
</template>
