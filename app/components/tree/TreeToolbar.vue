<script setup lang="ts">
/** Filter box and Refresh button above the tree; says why a refresh changed nothing. */
const filter = defineModel<string>('filter', { required: true })

const catalog = useCatalog()
const refreshing = ref(false)
const refreshError = ref<string | null>(null)

async function refresh() {
  refreshing.value = true
  refreshError.value = null
  try {
    await catalog.refresh()
  }
  catch (err) {
    // The tree keeps what it had; say why nothing changed.
    const error = parseApiError(err)
    refreshError.value = error.code === 'RATE_LIMITED'
      ? `Couldn't refresh: too many requests right now. Try again in ${Math.ceil(retryAfterMs(error) / 1000)}s.`
      : `Couldn't refresh. ${error.message}`
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
