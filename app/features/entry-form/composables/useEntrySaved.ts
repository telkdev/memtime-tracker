import type { TimeEntry } from '#shared/schemas/timeEntry'
import { formatDuration, formatTime } from '~/common'
import { useReturnToList, useTimeEntryCache } from '~/features/time-entries'

/** Toast + return to the list (the page the user came from) with the saved row highlighted. Shared by the create and edit pages. */
export function useEntrySaved() {
  const toast = useToast()
  const { invalidate, ensureNewest } = useTimeEntryCache()
  const returnToList = useReturnToList()

  return async function onSaved(entry: TimeEntry, verb: 'created' | 'updated', taskName: string | undefined, navigate = true) {
    const ms = Date.parse(entry.end) - Date.parse(entry.start)
    const what = taskName ? ` on ${taskName}` : ''
    toast.add({
      title: `Entry #${entry.id} ${verb}`,
      description: `${formatTime(entry.start)}–${formatTime(entry.end)}, ${formatDuration(ms)}${what}`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    // Loaded list pages are stale now (the server cache was cleared on write). Dropping them costs
    // nothing; the list refetches only the page it shows.
    invalidate()
    clearNuxtData(`time-entry:${entry.id}`)
    if (navigate) await returnToList(verb, entry.id)
    // "Save & log another" stays on the form: without entries, the next one would get no Recent
    // tasks and no overlap warning, not even against the entry just saved. One request refills them.
    else void ensureNewest()
  }
}
