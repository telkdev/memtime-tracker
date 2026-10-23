/** Asks before leaving while `dirty` is true: in-app navigation and closing or reloading the tab. */
export function useLeaveGuard(dirty: () => boolean) {
  const message = 'You have unsaved changes. Leave without saving?'

  onBeforeRouteLeave(() => {
    if (dirty() && !window.confirm(message)) return false
  })

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty()) e.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
