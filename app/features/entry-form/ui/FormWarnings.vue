<script setup lang="ts">
import type { EntryForm } from '../composables/useEntryForm'
import { formatTime } from '~/common'

/** Soft warnings (long, in the future, overlapping): they inform but never block saving. */
defineProps<{ form: EntryForm }>()
</script>

<template>
  <ul
    v-if="form.warnings.value.length"
    class="space-y-1 text-sm text-warning"
    aria-live="polite"
  >
    <li
      v-for="w in form.warnings.value"
      :key="w.kind"
      class="flex items-center gap-1.5"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="size-4 shrink-0"
      />
      <span v-if="w.kind === 'long'">That's a long entry. Double-check the times.</span>
      <span v-else-if="w.kind === 'future'">This entry ends in the future.</span>
      <span v-else>
        Overlaps
        <NuxtLink
          :to="`/entries/${w.entry.id}/edit`"
          class="underline"
        >entry #{{ w.entry.id }}</NuxtLink>
        ({{ formatTime(w.entry.start) }}–{{ formatTime(w.entry.end) }}).
      </span>
    </li>
  </ul>
</template>
