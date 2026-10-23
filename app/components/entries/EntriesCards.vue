<script setup lang="ts">
import type { TaskLabel } from '~/composables/useTaskNames'
import type { DayGroup } from '~/utils/entries'

/** The entries list on narrow screens: stacked cards instead of a sideways-scrolling table. */
defineProps<{
  groups: DayGroup[]
  taskLabel: (id: number) => TaskLabel | undefined
  highlight: { id?: number | null, taskId?: number | null }
}>()
</script>

<template>
  <div class="space-y-4">
    <section
      v-for="group in groups"
      :key="group.day"
      :aria-label="formatDay(group.sample)"
    >
      <h3 class="flex items-baseline justify-between border-b border-default px-2 pb-1 text-sm">
        <span class="font-semibold">{{ formatDay(group.sample) }}</span>
        <span class="tabular-nums text-muted">
          {{ formatDuration(group.totalMs) }}<template v-if="group.partial"> on this page</template>
        </span>
      </h3>
      <ul class="divide-y divide-default/60">
        <li
          v-for="entry in group.entries"
          :key="entry.id"
          :data-entry-id="entry.id"
          :class="entryRowClass(entry, highlight)"
        >
          <NuxtLink
            :to="entryEditPath(entry)"
            class="block space-y-1 px-2 py-3"
            :aria-label="`Edit entry #${entry.id}`"
          >
            <div class="flex items-start justify-between gap-3">
              <EntriesTaskCell
                :task-id="entry.taskId"
                :label="taskLabel(entry.taskId)"
              />
              <span class="shrink-0 tabular-nums font-medium">{{ formatDuration(durationMs(entry.start, entry.end)) }}</span>
            </div>
            <div class="text-sm tabular-nums text-muted">
              {{ formatTime(entry.start) }}–{{ formatTime(entry.end) }}<template v-if="entryEndDays(entry)"> (+{{ entryEndDays(entry) }}d)</template> · #{{ entry.id }} · created at {{ formatShortDateTime(entry.createdAt) }}
            </div>
            <p class="line-clamp-2 text-sm">
              {{ entry.comment }}
            </p>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
