<script setup lang="ts">
/** Filter box and Refresh button above the tree; says why a refresh changed nothing. */
const filter = defineModel<string>('filter', { required: true })

const catalog = useCatalog()
const refreshing = ref(false)
const refreshError = ref<string | null>(null)

// Once the clients load again (a retry, or the next refresh), the old message is no longer true.
watch(() => catalog.node('root').status, (status) => {
  if (status === 'loaded') refreshError.value = null
})

async function refresh() {
  refreshing.value = true
  refreshError.value = null
  try {
    await catalog.refresh()
  }
  catch (err) {
    // The tree keeps what it had; say why nothing changed. (The refresh POST itself makes no
    // upstream call, so this is a connection or server problem, never a rate limit.)
    refreshError.value = `Couldn't refresh. ${parseApiError(err).message}`
  }
  finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <UInput
      v-model="filter"
      icon="i-lucide-search"
      placeholder="Filter loaded items"
      aria-label="Filter loaded clients, projects and tasks"
      class="flex-1"
      size="sm"
    >
      <template
        v-if="filter"
        #trailing
      >
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="link"
          color="neutral"
          aria-label="Clear filter"
          @click="filter = ''"
        />
      </template>
    </UInput>
    <UButton
      icon="i-lucide-refresh-cw"
      size="sm"
      variant="ghost"
      color="neutral"
      aria-label="Refresh"
      title="Reload clients from the server"
      :loading="refreshing"
      @click="refresh"
    />
  </div>

  <p
    v-if="refreshError"
    role="alert"
    class="text-xs text-error"
  >
    {{ refreshError }}
  </p>

  <p
    v-if="filter"
    class="text-xs text-muted"
  >
    Searching only what's already loaded. Expand a client or project to include its contents.
  </p>
</template>
