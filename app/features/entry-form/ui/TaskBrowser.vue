<script setup lang="ts">
import { ClientTree } from '~/features/catalog'
// Slideover with the client tree in pick mode, for tasks the picker hasn't seen yet.
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ select: [taskId: number] }>()

function pick(taskId: number) {
  emit('select', taskId)
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Choose a task"
    description="Expand a client and a project, then pick a task."
  >
    <template #body>
      <ClientTree
        mode="pick"
        @select="task => pick(task.id)"
      />
    </template>
  </USlideover>
</template>
