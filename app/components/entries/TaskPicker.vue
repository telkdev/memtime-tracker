<script setup lang="ts">
import type { TaskOption, TaskOptionGroups } from '~/utils/task-options'

// Label, error text and aria wiring come from the surrounding UFormField.
const props = defineProps<{ groups: TaskOptionGroups }>()
const model = defineModel<number | null>({ required: true })
const emit = defineEmits<{ browse: [] }>()

type Item = TaskOption | { type: 'label', label: string, path?: undefined }

const items = computed<Item[][]>(() => {
  const groups: Item[][] = []
  if (props.groups.recent.length) groups.push([{ type: 'label', label: 'Recent' }, ...props.groups.recent])
  if (props.groups.catalog.length) groups.push([{ type: 'label', label: 'From loaded clients' }, ...props.groups.catalog])
  return groups
})

const selected = computed({
  get: () => [...props.groups.recent, ...props.groups.catalog].find(o => o.id === model.value),
  set: (o: TaskOption | undefined) => {
    model.value = o?.id ?? null
  },
})
</script>

<template>
  <div class="flex gap-2">
    <UInputMenu
      v-model="selected"
      :items="items"
      label-key="label"
      description-key="path"
      :filter-fields="['label', 'path']"
      placeholder="Search tasks…"
      class="min-w-0 flex-1"
      open-on-focus
    >
      <template #empty>
        <span class="text-sm">No loaded task matches. Use “Browse” to find it in the client list.</span>
      </template>
    </UInputMenu>
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-folder-tree"
      label="Browse"
      @click="emit('browse')"
    />
  </div>
</template>
