<script setup lang="ts">
import type { TaskContext } from '~/composables/useCatalog'
import { buildTreeRows, type TreeRow } from '~/utils/tree-rows'

const props = withDefaults(defineProps<{
  /** `browse` shows "Log time" actions; `pick` is for embedding in the task picker. */
  mode?: 'browse' | 'pick'
}>(), { mode: 'browse' })

type TaskEvent = [task: TaskContext['task'], context: Partial<Omit<TaskContext, 'task'>>]

const emit = defineEmits<{
  /** Click or Space on a task (in pick mode also Enter): the task the user is looking at. */
  select: TaskEvent
  /** Enter or the "Log time" button in browse mode: start a new entry for this task. */
  log: TaskEvent
}>()

const selectedTaskId = defineModel<number | null>('selectedTaskId', { default: null })

const catalog = useCatalog()
const now = useNow()
const filter = ref('')
const activeKey = ref<string | null>(null)
const treeEl = ref<HTMLElement | null>(null)

onMounted(() => catalog.ensureLoaded('root'))

const rows = computed(() => buildTreeRows({
  node: catalog.node,
  isExpanded: catalog.isExpanded,
  filter: filter.value,
}))

const rowIndex = computed(() => new Map(rows.value.map((r, i) => [r.key, i])))

// Keep exactly one row tabbable (roving tabindex), falling back to the nearest visible ancestor.
const focusKey = computed(() => {
  let key = activeKey.value
  const all = new Map(rows.value.map(r => [r.key, r]))
  while (key && !all.has(key)) {
    if (key.includes('#')) {
      // A loading/waiting/error row resolved: land on its first child, or on the node itself.
      const owner = key.split('#')[0]!
      key = rows.value.find(r => r.parentKey === owner)?.key ?? owner
    }
    else {
      key = parentOf(key)
    }
  }
  return key ?? rows.value[0]?.key ?? null
})

const lastParents = new Map<string, string | null>()
watchEffect(() => {
  for (const r of rows.value) lastParents.set(r.key, r.parentKey)
})
function parentOf(key: string) {
  return lastParents.get(key) ?? null
}

// When the focused row disappears (e.g. a loading row resolves), move DOM focus with it so keyboard
// users aren't dropped onto <body>.
const treeHasFocus = ref(false)
watch(focusKey, (key) => {
  const el = document.activeElement
  const lost = !el || el === document.body || !treeEl.value?.contains(el)
  if (treeHasFocus.value && lost && key) focusRow(key)
}, { flush: 'post' })

function onFocusOut(e: FocusEvent) {
  // A row removed from the DOM also fires focusout; that is not the user leaving the tree.
  const removed = !(e.target as Node).isConnected
  treeHasFocus.value = removed || (treeEl.value?.contains(e.relatedTarget as Node | null) ?? false)
}

function focusRow(key: string | null | undefined) {
  if (!key) return
  activeKey.value = key
  nextTick(() => treeEl.value?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus())
}

function toggle(row: TreeRow) {
  if (row.kind === 'status' || !row.expandable) return
  if (row.expanded) catalog.collapse(row.key)
  else catalog.expand(row.key)
}

function taskEvent(row: TreeRow, name: 'select' | 'log') {
  if (row.kind !== 'task') return
  if (name === 'select') selectedTaskId.value = row.entity.id
  const context = { project: row.project, client: row.client }
  if (name === 'log') emit('log', row.entity, context)
  else emit('select', row.entity, context)
}

function activate(row: TreeRow, via: 'pointer' | 'enter' | 'space') {
  if (row.kind === 'status') {
    if (row.status === 'error' || row.status === 'waiting') catalog.retry(row.ownerKey)
    else if (row.status === 'more') catalog.loadMore(row.ownerKey)
    return
  }
  if (row.kind !== 'task') return toggle(row)
  taskEvent(row, via === 'enter' && props.mode === 'browse' ? 'log' : 'select')
}

function onKeydown(e: KeyboardEvent) {
  const list = rows.value
  const i = rowIndex.value.get(focusKey.value ?? '') ?? 0
  const row = list[i]
  if (!row) return

  const handlers: Record<string, () => void> = {
    'ArrowDown': () => focusRow(list[Math.min(i + 1, list.length - 1)]?.key),
    'ArrowUp': () => focusRow(list[Math.max(i - 1, 0)]?.key),
    'Home': () => focusRow(list[0]?.key),
    'End': () => focusRow(list.at(-1)?.key),
    'ArrowRight': () => {
      if (row.kind === 'status' || !row.expandable) return
      if (!row.expanded) toggle(row)
      else focusRow(list[i + 1]?.key)
    },
    'ArrowLeft': () => {
      if (row.kind !== 'status' && row.expandable && row.expanded) toggle(row)
      else focusRow(row.parentKey)
    },
    'Enter': () => activate(row, 'enter'),
    ' ': () => activate(row, 'space'),
  }

  const handler = handlers[e.key]
  if (handler) {
    e.preventDefault()
    handler()
    return
  }

  // Type-ahead: jump to the next row starting with the typed character.
  if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const ch = e.key.toLowerCase()
    const ordered = [...list.slice(i + 1), ...list.slice(0, i + 1)]
    const hit = ordered.find(r => r.kind !== 'status' && r.label.toLowerCase().startsWith(ch))
    if (hit) focusRow(hit.key)
  }
}

const rootNode = computed(() => catalog.node('root'))
</script>

<template>
  <div class="flex flex-col gap-3">
    <TreeToolbar v-model:filter="filter" />

    <ul
      ref="treeEl"
      role="tree"
      aria-label="Clients, projects and tasks"
      class="flex flex-col"
      @keydown="onKeydown"
      @focusin="treeHasFocus = true"
      @focusout="onFocusOut"
    >
      <TreeRow
        v-for="row in rows"
        :key="row.key"
        :row="row"
        :active="row.key === focusKey"
        :selected="row.kind === 'task' && row.entity.id === selectedTaskId"
        :mode="props.mode"
        :now="now"
        @focus="activeKey = row.key"
        @activate="activate(row, 'pointer')"
        @log="taskEvent(row, 'log')"
      />
    </ul>

    <p
      v-if="filter && !rows.length"
      class="py-4 text-center text-sm text-muted"
    >
      Nothing loaded matches "{{ filter }}".
    </p>

    <div
      v-if="rootNode.status === 'loaded'"
      class="flex justify-end"
    >
      <RateLimitIndicator />
    </div>
  </div>
</template>
