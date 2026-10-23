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

const editPath = (entry: TimeEntry) => `/entries/${entry.id}/edit`

/** The whole row opens edit, but links, buttons and text selection keep working normally. */
function onRowClick(event: MouseEvent, entry: TimeEntry) {
  if ((event.target as HTMLElement).closest('a, button')) return
  if (window.getSelection()?.toString()) return
  if (event.metaKey || event.ctrlKey) {
    window.open(editPath(entry), '_blank', 'noopener')
    return
  }
  navigateTo(editPath(entry))
}

function rowClass(entry: TimeEntry) {
  // An inset bar as well as the tint, so the highlight doesn't rely on colour alone.
  if (entry.id === props.highlightId) return 'bg-primary/15 shadow-[inset_3px_0_0_var(--ui-primary)]'
  if (entry.taskId === props.highlightTaskId) return 'bg-primary/5 shadow-[inset_3px_0_0_var(--ui-primary)]'
  return ''
}

/** Calendar days the entry runs past its start day, so 01:00 isn't misread as a negative duration. */
const endDays = (entry: TimeEntry) => Math.max(0, localDaysBetween(entry.start, entry.end))
const endsLater = (days: number) => `Ends ${days} day${days > 1 ? 's' : ''} later`
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
          :class="rowClass(entry)"
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
              v-if="endDays(entry)"
              class="ml-0.5 text-[10px] text-muted"
              :title="endsLater(endDays(entry))"
            >+{{ endDays(entry) }}d<span class="sr-only"> ({{ endsLater(endDays(entry)) }})</span></sup>
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
              :to="editPath(entry)"
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
    <div class="space-y-4 @2xl:hidden">
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
            :class="rowClass(entry)"
          >
            <NuxtLink
              :to="editPath(entry)"
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
                {{ formatTime(entry.start) }}–{{ formatTime(entry.end) }}<template v-if="endDays(entry)"> (+{{ endDays(entry) }}d)</template> · #{{ entry.id }} · created {{ formatShortDateTime(entry.createdAt) }}
              </div>
              <p class="line-clamp-2 text-sm">
                {{ entry.comment }}
              </p>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
