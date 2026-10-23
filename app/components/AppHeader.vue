<script setup lang="ts">
const timeZone = ref('')
onMounted(() => {
  timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
})
</script>

<template>
  <header class="border-b border-default">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
      <NuxtLink
        to="/"
        class="flex items-center gap-2 font-semibold"
      >
        <UIcon
          name="i-lucide-timer"
          class="size-5 text-primary"
        />
        Time Tracker
      </NuxtLink>
      <span
        v-if="timeZone"
        class="text-sm text-muted"
        :title="`Times are shown in ${timeZone}`"
      >
        <UIcon
          name="i-lucide-globe"
          class="mr-1 size-4 align-[-3px]"
        />{{ timeZone }}
      </span>
    </div>
  </header>
</template>
