import { pageSchema, type ApiErrorBody } from '#shared/schemas/common'
import { DEFAULT_TIME_ENTRY_PAGE_SIZE, timeEntrySchema, type TimeEntry } from '#shared/schemas/timeEntry'
import { listPositionQuery, listReturnQuery, needsQueryFix, readListPosition } from '../lib/entries'
import type { ListPosition, EntriesStatus } from '../model/types'
import { fetchTimeEntries } from '../api/time-entries'
import { parseApiError, retryAfterMs, useRateLimitState, useRequestGuard } from '~/common'

/** Matches the BFF cache: within this window a page is shown from memory without asking again. */
const CLIENT_FRESH_MS = 15_000

const entryPageSchema = pageSchema(timeEntrySchema)

interface LoadedPage {
  key: string
  items: TimeEntry[]
  hasMore: boolean
  loadedAt: number
}

function pageKey(page: number, size: number) {
  return `${size}:${page}`
}

/**
 * Entries already loaded by the list, shared app-wide. The edit form uses it to open an entry
 * without a request and to suggest recent tasks; writes call invalidate().
 */
export function useTimeEntryCache() {
  const pages = useState<Record<string, LoadedPage>>('time-entries:pages', () => ({}))
  // invalidate() cancels requests that started before it: their answers may hold data from
  // before a save, so they must not go back into the cache (same guard as the catalog).
  const requests = useRequestGuard('time-entries:cache')

  const loadedEntries = computed<readonly TimeEntry[]>(() => {
    const byId = new Map<number, TimeEntry>()
    for (const page of Object.values(pages.value)) {
      for (const entry of page.items) byId.set(entry.id, entry)
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  })

  function getCached(id: number): TimeEntry | undefined {
    for (const page of Object.values(pages.value)) {
      const hit = page.items.find(e => e.id === id)
      if (hit) return hit
    }
    return undefined
  }

  const newestLoading = useState('time-entries:newest-loading', () => false)

  /**
   * The newest page, when nothing is loaded yet (the form opened by a link or a reload). One
   * request at most; it is stored like a list page, so going back to the list reuses it.
   */
  async function ensureNewest() {
    if (Object.keys(pages.value).length || newestLoading.value) return
    newestLoading.value = true
    const ticket = requests.start()
    const { size } = useLastListPosition().value
    try {
      const data = entryPageSchema.parse(await fetchTimeEntries({ limit: size, offset: 0 }, ticket.signal))
      if (!ticket.isCurrent()) return
      const key = pageKey(1, size)
      pages.value = { ...pages.value, [key]: { key, items: data.items, hasMore: data.hasMore, loadedAt: Date.now() } }
    }
    catch {
      // Recent tasks are a convenience; the form works without them.
    }
    finally {
      ticket.done()
      // After invalidate() a newer load may own the flag; a dropped one leaves it alone.
      if (ticket.isCurrent()) newestLoading.value = false
    }
  }

  /** Forget every loaded page; the list refetches the one on screen. */
  function invalidate() {
    requests.invalidate()
    pages.value = {}
    // A dropped load must not block the next ensureNewest().
    newestLoading.value = false
  }

  return { pages, requests, loadedEntries, getCached, ensureNewest, invalidate }
}

/** The list page the user last looked at, so the form can send them back to it. */
export function useLastListPosition() {
  return useState<ListPosition>('time-entries:last-position', () => ({ page: 1, size: DEFAULT_TIME_ENTRY_PAGE_SIZE }))
}

/** Navigates back to the list after a save or cancel (see listReturnQuery). */
export function useReturnToList() {
  const last = useLastListPosition()
  return (verb: 'created' | 'updated' | 'cancel', id?: number) =>
    navigateTo({ path: '/', query: listReturnQuery(last.value, verb, id) })
}

/**
 * The paginated list, driven by `?page&size` in the URL. Fetches only in the browser: times are
 * shown in the viewer's zone, which the server doesn't know.
 */
export function useTimeEntries() {
  const route = useRoute()
  const router = useRouter()
  const { pages, requests: cacheRequests, invalidate } = useTimeEntryCache()
  // One list on screen: a new page load replaces the one before it.
  const listRequests = useRequestGuard('time-entries:list')
  const { refreshSnapshot } = useRateLimitState()

  const position = computed(() => readListPosition(route.query))
  const lastPosition = useLastListPosition()
  const current = computed(() => pages.value[pageKey(position.value.page, position.value.size)])
  /** Last page that was on screen; kept visible (dimmed) while the next one loads or waits. */
  const shown = shallowRef<LoadedPage>()

  const status = ref<EntriesStatus>('loading')
  const error = ref<ApiErrorBody | null>(null)
  const retryAt = ref<number | null>(null)

  let retryTimer: ReturnType<typeof setTimeout> | undefined

  function clearRetry() {
    clearTimeout(retryTimer)
    retryTimer = undefined
    retryAt.value = null
  }

  async function load(force = false) {
    clearRetry()
    // Every load, cached or not, cancels the one before it. A save elsewhere (cache invalidate)
    // cancels it too; the watcher below then loads the page again.
    const ticket = listRequests.startLatest({ also: [cacheRequests] })
    const { page, size } = position.value
    const key = pageKey(page, size)
    const cached = pages.value[key]
    if (cached) shown.value = cached
    if (cached && !force && Date.now() - cached.loadedAt < CLIENT_FRESH_MS) {
      ticket.done()
      status.value = 'ready'
      return
    }

    status.value = 'loading'
    error.value = null
    try {
      const raw = await fetchTimeEntries({ limit: size, offset: (page - 1) * size, refresh: force ? '1' : undefined }, ticket.signal)
      if (!ticket.isCurrent()) return
      const data = entryPageSchema.parse(raw)
      const loaded: LoadedPage = { key, items: data.items, hasMore: data.hasMore, loadedAt: Date.now() }
      pages.value = { ...pages.value, [key]: loaded }
      shown.value = loaded
      status.value = 'ready'
      refreshSnapshot()
    }
    catch (err) {
      if (!ticket.isCurrent()) return
      const apiError = parseApiError(err)
      refreshSnapshot()
      error.value = apiError
      if (apiError.code === 'RATE_LIMITED') {
        // Not a failure from the user's point of view: wait for the budget and continue.
        status.value = 'waiting'
        const ms = retryAfterMs(apiError)
        retryAt.value = Date.now() + ms
        retryTimer = setTimeout(() => load(force), ms)
      }
      else {
        status.value = 'error'
      }
    }
    finally {
      ticket.done()
    }
  }

  /** Other query params (e.g. a highlight) survive; page and size are rewritten canonically. */
  function queryFor(page: number, size: number) {
    return { ...route.query, page: undefined, size: undefined, ...listPositionQuery({ page, size }) }
  }

  function goTo(page: number, size = position.value.size) {
    return router.push({ query: queryFor(page, size) })
  }

  const hasPrev = computed(() => position.value.page > 1)
  const hasMore = computed(() => current.value?.hasMore ?? false)

  if (import.meta.client) {
    if (needsQueryFix(route.query)) {
      router.replace({ query: queryFor(position.value.page, position.value.size) })
    }
    watch(() => pageKey(position.value.page, position.value.size), () => {
      lastPosition.value = position.value
      load()
    }, { immediate: true })
    // A write elsewhere cleared the cache (and cancelled a load in flight): reload what's on screen.
    watch(cacheRequests.generation, () => load())
    // Cancelling also drops a response that lands after unmount, so a late 429 can't schedule a
    // retry nobody will cancel.
    onScopeDispose(() => {
      listRequests.invalidate()
      clearRetry()
    })
  }

  return {
    page: computed(() => position.value.page),
    size: computed(() => position.value.size),
    /** Entries on screen; may be the previous page while the next one loads. */
    entries: computed(() => shown.value?.items ?? []),
    /** True when `entries` belongs to the page in the URL. */
    isCurrent: computed(() => !!current.value && shown.value?.key === current.value.key),
    hasPrev,
    hasMore,
    status,
    error,
    retryAt,
    next: () => hasMore.value && goTo(position.value.page + 1),
    prev: () => hasPrev.value && goTo(position.value.page - 1),
    first: () => goTo(1),
    setSize: (size: number) => goTo(1, size),
    refresh: () => load(true),
    invalidate,
  }
}
