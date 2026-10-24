import type { ApiErrorBody, Page } from '#shared/schemas/common'
import type { Client, Project, Task } from '#shared/schemas/catalog'

export type NodeKey = 'root' | `client:${number}` | `project:${number}`

export type NodeStatus = 'idle' | 'loading' | 'loadingMore' | 'waiting' | 'error' | 'loaded'

export interface CatalogNode<T = unknown> {
  status: NodeStatus
  items: T[]
  hasMore: boolean
  nextOffset: number | null
  error?: ApiErrorBody
  /** Epoch ms when a rate-limited load retries by itself. */
  retryAt?: number
}

export interface TaskContext {
  task: Task
  project: Project
  client: Client
}

function endpointFor(key: NodeKey): string {
  if (key === 'root') return '/api/clients'
  const [kind, id] = key.split(':')
  return kind === 'client' ? `/api/clients/${id}/projects` : `/api/projects/${id}/tasks`
}

function emptyNode<T>(): CatalogNode<T> {
  return { status: 'idle', items: [], hasMore: false, nextOffset: null }
}

// Retry timers are client-only and never serialised, so they live outside useState.
const retryTimers = new Map<NodeKey, ReturnType<typeof setTimeout>>()

/**
 * Lazily loaded client → project → task catalog, shared by the tree, the entries list (task names)
 * and the entry form (task picker). Each node loads at most once until refreshed.
 */
export function useCatalog() {
  const nodes = useState<Partial<Record<NodeKey, CatalogNode>>>('catalog:nodes', () => ({}))
  const expanded = useState<string[]>('catalog:expanded', () => [])
  const { refreshSnapshot } = useRateLimitState()

  function node<T>(key: NodeKey): CatalogNode<T> {
    return (nodes.value[key] as CatalogNode<T> | undefined) ?? emptyNode<T>()
  }

  function patch(key: NodeKey, update: Partial<CatalogNode>) {
    nodes.value = { ...nodes.value, [key]: { ...node(key), ...update } }
  }

  async function load(key: NodeKey, { append = false } = {}) {
    const current = node(key)
    if (current.status === 'loading' || current.status === 'loadingMore') return
    clearTimeout(retryTimers.get(key))
    retryTimers.delete(key)

    const offset = append ? current.nextOffset ?? 0 : 0
    patch(key, { status: append ? 'loadingMore' : 'loading', error: undefined, retryAt: undefined })
    try {
      // retry: 0 — ofetch retries 429/5xx immediately by default, which would only burn budget.
      const page = await $fetch<Page<unknown>>(endpointFor(key), { query: { offset }, retry: 0 })
      patch(key, {
        status: 'loaded',
        items: append ? [...current.items, ...page.items] : page.items,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      })
    }
    catch (err) {
      const error = parseApiError(err)
      if (error.code === 'RATE_LIMITED') {
        const delay = retryAfterMs(error)
        patch(key, { status: 'waiting', error, retryAt: Date.now() + delay })
        if (import.meta.client) retryTimers.set(key, setTimeout(() => load(key, { append }), delay))
      }
      else {
        patch(key, { status: 'error', error })
      }
    }
    finally {
      if (import.meta.client) refreshSnapshot()
    }
  }

  /**
   * Manual retry from an error or waiting row. A node that already shows items failed on "Load
   * more", so continue from there instead of reloading page 1. A node waiting out a rate limit
   * already has a timed retry; asking early would only be refused again and spend budget.
   */
  function retry(key: NodeKey) {
    const current = node(key)
    if (current.status === 'waiting' && current.retryAt && Date.now() < current.retryAt) return
    return load(key, { append: current.items.length > 0 })
  }

  /** Loads a node if it has never loaded or last failed. Loaded nodes cost nothing. */
  function ensureLoaded(key: NodeKey) {
    const { status } = node(key)
    if (status === 'idle' || status === 'error') return load(key)
  }

  function isExpanded(key: string) {
    return expanded.value.includes(key)
  }

  function setExpanded(key: string, open: boolean) {
    if (open === isExpanded(key)) return
    expanded.value = open ? [...expanded.value, key] : expanded.value.filter(k => k !== key)
  }

  function expand(key: string) {
    setExpanded(key, true)
    if (key.startsWith('client:') || key.startsWith('project:')) ensureLoaded(key as NodeKey)
  }

  function collapse(key: string) {
    setExpanded(key, false)
  }

  /** Drops server and client caches and reloads the client list (one upstream request). */
  async function refresh() {
    for (const timer of retryTimers.values()) clearTimeout(timer)
    retryTimers.clear()
    await $fetch('/api/catalog/refresh', { method: 'POST', retry: 0 })
    nodes.value = {}
    expanded.value = []
    await load('root')
  }

  const clients = computed(() => node<Client>('root').items)

  const taskIndex = computed(() => {
    const clientsById = new Map(clients.value.map(c => [c.id, c]))
    const projectsById = new Map<number, Project>()
    const index = new Map<number, TaskContext>()
    for (const [key, value] of Object.entries(nodes.value)) {
      if (key.startsWith('client:')) for (const p of value!.items as Project[]) projectsById.set(p.id, p)
    }
    for (const [key, value] of Object.entries(nodes.value)) {
      if (!key.startsWith('project:')) continue
      const project = projectsById.get(Number(key.slice('project:'.length)))
      const client = project && clientsById.get(project.clientId)
      if (!project || !client) continue
      for (const task of value!.items as Task[]) index.set(task.id, { task, project, client })
    }
    return index
  })

  return {
    nodes: readonly(nodes),
    clients,
    node,
    load,
    ensureLoaded,
    loadMore: (key: NodeKey) => load(key, { append: true }),
    retry,
    isExpanded,
    expand,
    collapse,
    refresh,
    /** taskId → { task, project, client } for every task loaded so far. */
    taskIndex,
  }
}
