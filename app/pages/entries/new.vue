<script setup lang="ts">
import { EntryEditor } from '~/features/entry-form'
import { idSchema } from '#shared/schemas/common'

useHead({ title: 'Log time' })

// Ids start at 0, so parse instead of testing truthiness.
const rawTask = useRoute().query.taskId
const taskId = typeof rawTask === 'string' && rawTask !== '' ? idSchema.safeParse(rawTask).data : undefined
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <h1 class="text-xl font-semibold">
      Log time
    </h1>
    <EntryEditor :task-id="taskId" />
  </div>
</template>
