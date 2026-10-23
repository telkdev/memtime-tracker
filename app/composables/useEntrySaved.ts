import type { TimeEntry } from '#shared/schemas/timeEntry'
import { formatDuration, formatTime } from '~/utils/time'

/** Toast + return to the list with the saved row highlighted. Shared by the create and edit pages. */
export function useEntrySaved() {
  const toast = useToast()

  return async function onSaved(entry: TimeEntry, verb: 'created' | 'updated', taskName: string | undefined, navigate = true) {
    const ms = Date.parse(entry.end) - Date.parse(entry.start)
    const what = taskName ? ` on ${taskName}` : ''
    toast.add({
      title: `Entry #${entry.id} ${verb}`,
      description: `${formatTime(entry.start)}–${formatTime(entry.end)}, ${formatDuration(ms)}${what}`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    // Pages already cached in the browser are stale now; the server cache was cleared on write.
    await refreshNuxtData()
    if (navigate) await navigateTo({ path: '/', query: { highlight: entry.id } })
  }
}
