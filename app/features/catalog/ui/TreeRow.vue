<script setup lang="ts">
import { RetryCountdown } from '~/common'
import type { TreeRow } from '../lib/tree-rows'

const props = defineProps<{
  row: TreeRow
  active: boolean
  selected?: boolean
  mode: 'browse' | 'pick'
}>()

const emit = defineEmits<{
  activate: []
  log: []
  focus: []
}>()

const ICONS = {
  client: 'i-lucide-building-2',
  project: 'i-lucide-folder',
  task: 'i-lucide-circle-dot',
} as const

const indent = computed(() => ({ paddingInlineStart: `${(props.row.level - 1) * 1.25 + 0.5}rem` }))

const inactiveStatus = computed(() =>
  props.row.kind !== 'status' && props.row.entity.status !== 'active' ? props.row.entity.status : null,
)
</script>

<template>
  <li
    role="treeitem"
    :data-key="row.key"
    :tabindex="active ? 0 : -1"
    :aria-level="row.level"
    :aria-posinset="row.posinset"
    :aria-setsize="row.setsize"
    :aria-expanded="row.kind !== 'status' && row.expandable ? row.expanded : undefined"
    :aria-busy="row.kind === 'status' && (row.status === 'loading' || row.status === 'loadingMore') ? true : undefined"
    :aria-selected="row.kind === 'task' ? !!selected : undefined"
    class="group flex min-h-9 cursor-pointer items-center gap-2 rounded-md pe-2 text-sm outline-none select-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary"
    :class="{ 'bg-elevated/60': active && !selected, 'bg-primary/10 text-primary': selected }"
    :style="indent"
    @click="emit('focus'); emit('activate')"
  >
    <template v-if="row.kind !== 'status'">
      <UIcon
        v-if="row.expandable"
        name="i-lucide-chevron-right"
        class="size-4 shrink-0 text-muted transition-transform"
        :class="{ 'rotate-90': row.expanded }"
        aria-hidden="true"
      />
      <span
        v-else
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      <UIcon
        :name="row.kind === 'project' && row.expanded ? 'i-lucide-folder-open' : ICONS[row.kind]"
        class="size-4 shrink-0"
        :class="row.kind === 'client' ? 'text-primary' : 'text-muted'"
        aria-hidden="true"
      />
      <span
        class="truncate"
        :class="{ 'font-medium': row.kind === 'client' }"
        :title="row.label"
      >{{ row.label }}</span>
      <UBadge
        v-if="inactiveStatus"
        :label="inactiveStatus"
        color="neutral"
        variant="subtle"
        size="sm"
      />
      <span
        v-if="row.count"
        class="text-xs text-dimmed tabular-nums"
        :aria-label="`${row.count} items`"
      >{{ row.count }}</span>
      <UButton
        v-if="row.kind === 'task' && mode === 'browse'"
        label="Log time"
        icon="i-lucide-plus"
        size="xs"
        variant="soft"
        tabindex="-1"
        class="ms-auto opacity-0 group-hover:opacity-100 group-focus:opacity-100"
        :class="{ 'opacity-100': active }"
        @click.stop="emit('log')"
      />
    </template>

    <template v-else>
      <span
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      <template v-if="row.status === 'loading' || row.status === 'loadingMore'">
        <span class="sr-only">{{ row.label }}</span>
        <USkeleton class="h-3.5 w-40" />
      </template>
      <span
        v-else-if="row.status === 'waiting'"
        class="flex items-center gap-1.5 text-warning"
        role="status"
      >
        <UIcon
          name="i-lucide-hourglass"
          class="size-4"
          aria-hidden="true"
        />
        {{ row.label }}<RetryCountdown
          v-if="row.retryAt"
          :at="row.retryAt"
        />
      </span>
      <span
        v-else-if="row.status === 'error'"
        class="flex items-center gap-2 text-error"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="size-4"
          aria-hidden="true"
        />
        <span class="truncate">{{ row.label }}</span>
        <UButton
          v-if="row.retryable"
          label="Retry"
          size="xs"
          variant="link"
          tabindex="-1"
          @click.stop="emit('activate')"
        />
      </span>
      <span
        v-else-if="row.status === 'empty'"
        class="text-muted italic"
      >{{ row.label }}</span>
      <UButton
        v-else-if="row.status === 'more'"
        :label="row.label"
        icon="i-lucide-chevrons-down"
        size="xs"
        variant="ghost"
        tabindex="-1"
        @click.stop="emit('activate')"
      />
    </template>
  </li>
</template>
