import { taskSchema } from '#shared/schemas/catalog'

export interface TaskLabel {
  status: 'loading' | 'loaded' | 'missing'
  name?: string
  /** "Client › Project", only known for tasks loaded through the tree. */
  path?: string
}

/**
 * Lookups run in the server's background lane, which may hold them for a while. Two at a time
 * keeps them from using up the browser's connections, so paging never queues behind them.
 */
const MAX_PARALLEL_LOOKUPS = 2

/**
 * Task names for the entries list. The tree's catalog is used first, at no cost. Unknown ids are
 * looked up one by one and cached. This never loads the tree itself.
 */
export function useTaskNames() {
  const { taskIndex } = useCatalog()

  function catalogTask(id: number) {
    const hit = taskIndex.value.get(id)
    return hit && { name: hit.task.name, path: `${hit.client.name} › ${hit.project.name}` }
  }
  const labels = useState<Record<number, TaskLabel>>('task-names', () => ({}))
  const queue = useState<number[]>('task-names:queue', () => [])
  const running = useState('task-names:running', () => 0)

  function fromCatalog(id: number): TaskLabel | undefined {
    const hit = catalogTask(id)
    return hit ? { status: 'loaded', name: hit.name, path: hit.path } : undefined
  }

  function label(id: number): TaskLabel | undefined {
    return fromCatalog(id) ?? labels.value[id]
  }

  function forget(id: number) {
    labels.value = Object.fromEntries(Object.entries(labels.value).filter(([key]) => Number(key) !== id))
  }

  function pump() {
    while (running.value < MAX_PARALLEL_LOOKUPS && queue.value.length) {
      const id = queue.value.shift()!
      running.value++
      lookup(id).finally(() => {
        running.value--
        pump()
      })
    }
  }

  async function lookup(id: number) {
    if (fromCatalog(id)) {
      forget(id)
      return
    }
    try {
      const task = taskSchema.parse(await $fetch(`/api/tasks/${id}`, { retry: 0 }))
      labels.value[id] = { status: 'loaded', name: task.name }
    }
    catch (err) {
      if (parseApiError(err).code === 'NOT_FOUND') {
        labels.value[id] = { status: 'missing' }
      }
      else {
        // Transient: forget it, so the next page view tries again. The row keeps showing the id.
        forget(id)
      }
    }
  }

  /** Queues lookups for ids that neither the catalog nor an earlier lookup knows. */
  function resolve(ids: Iterable<number>) {
    if (import.meta.server) return
    for (const id of new Set(ids)) {
      if (label(id)) continue
      labels.value[id] = { status: 'loading' }
      queue.value.push(id)
    }
    pump()
  }

  return { label, resolve }
}
