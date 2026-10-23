<script setup lang="ts">
const props = defineProps<{ highlightTaskId?: number | null }>()
const emit = defineEmits<{ clearTaskHighlight: [] }>()

const list = useTimeEntries()
const { entries, status, error, page } = list
const names = useTaskNames()
const route = useRoute()
const router = useRouter()

const groups = computed(() => groupEntriesByDay(entries.value, { hasPrev: list.hasPrev.value, hasMore: list.hasMore.value }))
// Ids start at 0 upstream, so check for null rather than truthiness.
const highlightTaskName = computed(() => {
  const id = props.highlightTaskId
  return id == null ? null : names.label(id)?.name ?? `Task #${id}`
})

watch(entries, items => names.resolve(items.map(e => e.taskId)), { immediate: true })

const showSkeleton = computed(() => entries.value.length === 0 && status.value === 'loading')
const showBlockingError = computed(() => status.value === 'error' && entries.value.length === 0)
const isEmpty = computed(() => status.value === 'ready' && list.isCurrent.value && entries.value.length === 0)

const now = useNow()
const countdown = computed(() => list.retryAt.value ? Math.max(1, Math.ceil((list.retryAt.value - now.value) / 1000)) : 0)

// `?highlight=<id>` is set after a save: bring that row into view, then drop it from the URL.
const highlightId = ref<number | null>(null)
watch([() => route.query.highlight, entries], async ([raw]) => {
  // Number('') is 0, which is a real entry id; only a non-empty value counts.
  if (typeof raw !== 'string' || raw === '') return
  const id = Number(raw)
  if (!Number.isInteger(id) || !entries.value.some(e => e.id === id)) return
  highlightId.value = id
  await nextTick()
  const rows = document.querySelectorAll<HTMLElement>(`[data-entry-id="${id}"]`)
  ;[...rows].find(el => el.offsetParent !== null)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  setTimeout(() => {
    highlightId.value = null
    router.replace({ query: { ...route.query, highlight: undefined } })
  }, 4000)
})

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return
  if (event.key === '[') list.prev()
  else if (event.key === ']') list.next()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- @container: the table switches to cards based on the panel's width, not the window's. -->
  <section
    class="@container space-y-4"
    aria-labelledby="entries-heading"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2
        id="entries-heading"
        class="text-lg font-semibold"
      >
        Time entries
      </h2>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Refresh entries"
          title="Reload from the server (uses 1 API request)"
          :loading="status === 'loading' && entries.length > 0"
          @click="list.refresh()"
        />
        <UButton
          to="/entries/new"
          icon="i-lucide-plus"
          size="sm"
        >
          Log time
        </UButton>
      </div>
    </header>

    <div
      v-if="highlightTaskName"
      class="flex items-center gap-2 text-sm"
    >
      <UBadge
        color="primary"
        variant="subtle"
      >
        Highlighting {{ highlightTaskName }} on this page
      </UBadge>
      <UButton
        size="xs"
        variant="link"
        color="neutral"
        @click="emit('clearTaskHighlight')"
      >
        Clear
      </UButton>
    </div>

    <UAlert
      v-if="status === 'waiting'"
      icon="i-lucide-hourglass"
      color="info"
      variant="subtle"
      :title="`Waiting for the rate limit · ${countdown}s`"
      description="The list continues by itself."
    />
    <UAlert
      v-else-if="status === 'error' && !showBlockingError && error"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      :title="error.message"
      description="Showing the last entries we loaded."
      :actions="error.code === 'UPSTREAM_AUTH' ? [] : [{ label: 'Retry', onClick: () => list.refresh() }]"
    />

    <EntriesStatus
      v-if="showSkeleton || showBlockingError || isEmpty"
      :state="showSkeleton ? 'loading' : showBlockingError ? 'error' : page > 1 ? 'past-end' : 'empty'"
      :error="error"
      @retry="list.refresh()"
      @first="list.first()"
    />
    <EntriesTable
      v-else
      :groups="groups"
      :task-label="names.label"
      :highlight-id="highlightId"
      :highlight-task-id="highlightTaskId"
      :class="{ 'opacity-60 transition-opacity': !list.isCurrent.value }"
      :aria-busy="!list.isCurrent.value"
    />

    <EntriesPager
      v-if="!isEmpty || page > 1"
      :page="page"
      :size="list.size.value"
      :has-prev="list.hasPrev.value"
      :has-more="list.hasMore.value"
      :busy="!list.isCurrent.value"
      @prev="list.prev()"
      @next="list.next()"
      @size="list.setSize($event)"
    />
  </section>
</template>
