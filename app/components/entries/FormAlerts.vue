<script setup lang="ts">
import type { EntryForm } from '~/composables/useEntryForm'

const props = defineProps<{ form: EntryForm }>()
const emit = defineEmits<{ retry: [] }>()
const f = props.form
</script>

<template>
  <div
    aria-live="assertive"
    class="space-y-3 empty:hidden"
  >
    <UAlert
      v-if="f.notFound.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-file-x"
      title="This entry no longer exists."
      description="It may have been deleted. Your values are kept, so you can save them as a new entry."
      :actions="[
        { label: 'Create as new entry', onClick: f.switchToCreate },
        { label: 'Back to list', color: 'neutral', variant: 'ghost', to: '/' },
      ]"
    />
    <UAlert
      v-else-if="f.retryIn.value > 0"
      color="info"
      variant="subtle"
      icon="i-lucide-hourglass"
      :title="`Too many requests right now. Saving again in ${f.retryIn.value}s.`"
      description="Your values are kept. You don't need to do anything."
    />
    <UAlert
      v-else-if="f.summary.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="f.summary.value"
      :actions="[{ label: 'Try again', onClick: () => emit('retry') }]"
    />
  </div>
</template>
