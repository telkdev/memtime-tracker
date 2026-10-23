<script setup lang="ts">
import { TIME_ENTRY_PAGE_SIZES } from '#shared/schemas/timeEntry'

defineProps<{ page: number, size: number, hasPrev: boolean, hasMore: boolean, busy?: boolean }>()
const emit = defineEmits<{ prev: [], next: [], size: [size: number] }>()

const sizeItems = TIME_ENTRY_PAGE_SIZES.map(value => ({ label: `${value} per page`, value: value as number }))
</script>

<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-3"
    aria-label="Time entries pages"
  >
    <USelect
      :model-value="size"
      :items="sizeItems"
      size="sm"
      class="w-36"
      aria-label="Entries per page"
      @update:model-value="emit('size', Number($event))"
    />
    <div class="flex items-center gap-2">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="!hasPrev"
        title="Previous page ( [ )"
        @click="emit('prev')"
      >
        Newer
      </UButton>
      <!-- The API returns no total, so there is no "of N". -->
      <span
        class="min-w-16 text-center text-sm tabular-nums text-muted"
        aria-live="polite"
      >Page {{ page }}</span>
      <UButton
        trailing-icon="i-lucide-chevron-right"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="!hasMore || busy"
        title="Next page ( ] )"
        @click="emit('next')"
      >
        Older
      </UButton>
    </div>
  </nav>
</template>
