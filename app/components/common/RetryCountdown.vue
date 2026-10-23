<script setup lang="ts">
/**
 * " · 12s" until `at`. Owns its ticking clock, so only rows that are actually waiting re-render
 * every second, not the whole tree.
 */
const props = defineProps<{ at: number }>()
const now = useNow()
const seconds = computed(() => Math.max(0, Math.ceil((props.at - now.value) / 1000)))
</script>

<template>
  <span v-if="seconds"> · {{ seconds }}s</span>
</template>
