/** Asks before leaving while `dirty` is true: in-app navigation and closing or reloading the tab. */
export function useLeaveGuard(dirty: () => boolean) {
  const message = 'You have unsaved changes. Leave without saving?'

  const guard = () => {
    if (dirty() && !window.confirm(message)) return false
  }
  onBeforeRouteLeave(guard)
  // Same route, other entry (/entries/5/edit → /entries/7/edit): a leave guard doesn't fire.
  // Query-only changes stay on the same form, so they don't ask.
  onBeforeRouteUpdate((to, from) => to.path === from.path ? undefined : guard())

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty()) e.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
