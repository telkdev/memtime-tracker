<script setup lang="ts">
import type { TimeEntry } from '#shared/schemas/timeEntry'
import type { TaskLabel } from '~/composables/useTaskNames'
import type { DayGroup } from '~/utils/entries'

const props = defineProps<{
  groups: DayGroup[]
  taskLabel: (id: number) => TaskLabel | undefined
  /** Entry just created or updated. */
  highlightId?: number | null
  /** Task selected in the tree. */
  highlightTaskId?: number | null
}>()

const highlight = computed(() => ({ id: props.highlightId, taskId: props.highlightTaskId }))

/** The whole row opens edit, but links, buttons and text selection keep working normally. */
function onRowClick(event: MouseEvent, entry: TimeEntry) {
  if ((event.target as HTMLElement).closest('a, button')) return
  if (window.getSelection()?.toString()) return
  if (event.metaKey || event.ctrlKey) {
    window.open(entryEditPath(entry), '_blank', 'noopener')
    return
  }
  navigateTo(entryEditPath(entry))
}
</script>

<template>
  <div>
    <!-- Wide screens: one table, one row group per day, so columns line up across days. -->
    <table class="hidden w-full table-fixed text-sm @2xl:table">
      <thead class="text-left text-xs font-medium uppercase tracking-wide text-muted">
        <tr class="border-b border-default">
          <th
            scope="col"
            class="w-12 px-2 py-1 font-medium"
          >
            ID
          </th>
          <th
            scope="col"
            class="w-[22%] px-2 py-1 font-medium"
          >
            Task
          </th>
          <th
            scope="col"
            class="px-2 py-1 font-medium"
          >
            Comment
          </th>
          <th
            scope="col"
            class="w-14 px-2 py-1 font-medium"
          >
            Start
          </th>
          <th
            scope="col"
            class="w-20 px-2 py-1 font-medium"
          >
            End
          </th>
          <th
            scope="col"
            class="w-20 px-2 py-1 text-right font-medium"
          >
            Duration
          </th>
          <th
            scope="col"
            class="w-28 py-1 pl-4 pr-2 font-medium"
          >
            Created
          </th>
          <th
            scope="col"
            class="w-10"
          >
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody
        v-for="group in groups"
        :key="group.day"
      >
        <tr class="border-b border-default">
          <th
            colspan="8"
            scope="rowgroup"
            class="px-2 pb-1 pt-5 text-left font-normal"
          >
            <span class="flex items-baseline justify-between">
              <span class="font-semibold text-highlighted">{{ formatDay(group.sample) }}</span>
              <span class="tabular-nums text-muted">
                {{ formatDuration(group.totalMs) }}<template v-if="group.partial"> on this page</template>
              </span>
            </span>
          </th>
        </tr>
        <tr
          v-for="entry in group.entries"
          :key="entry.id"
          :data-entry-id="entry.id"
          class="cursor-pointer border-b border-default/60 transition-colors hover:bg-elevated/60"
          :class="entryRowClass(entry, highlight)"
          @click="onRowClick($event, entry)"
        >
          <td class="px-2 py-2 tabular-nums text-muted">
            #{{ entry.id }}
          </td>
          <td class="px-2 py-2">
            <EntriesTaskCell
              :task-id="entry.taskId"
              :label="taskLabel(entry.taskId)"
            />
          </td>
          <td
            class="truncate px-2 py-2"
            :title="entry.comment"
          >
            {{ entry.comment }}
          </td>
          <td class="px-2 py-2 tabular-nums">
            {{ formatTime(entry.start) }}
          </td>
          <td class="px-2 py-2 tabular-nums">
            {{ formatTime(entry.end) }}<sup
              v-if="entryEndDays(entry)"
              class="ml-0.5 text-[10px] text-muted"
              :title="endsLaterLabel(entryEndDays(entry))"
            >+{{ entryEndDays(entry) }}d<span class="sr-only"> ({{ endsLaterLabel(entryEndDays(entry)) }})</span></sup>
          </td>
          <td class="whitespace-nowrap px-2 py-2 text-right tabular-nums font-medium">
            {{ formatDuration(durationMs(entry.start, entry.end)) }}
          </td>
          <td
            class="truncate py-2 pl-4 pr-2 text-xs text-muted"
            :title="`Created ${formatDateTime(entry.createdAt)}`"
          >
            {{ formatShortDateTime(entry.createdAt) }}
          </td>
          <td class="px-1 py-1 text-right">
            <UButton
              :to="entryEditPath(entry)"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Edit entry #${entry.id}`"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Narrow screens: stacked cards instead of a sideways-scrolling table. -->
    <EntriesCards
      class="@2xl:hidden"
      :groups="groups"
      :task-label="taskLabel"
      :highlight="highlight"
    />
  </div>
</template>
