// The catalog's main types. API shapes come from the shared zod schemas, never redeclared here.
import type { ApiErrorBody } from '#shared/schemas/common'
import type { Client, Project, Task } from '#shared/schemas/catalog'

export type { Client, Project, Task }

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

export interface TaskLabel {
  status: 'loading' | 'loaded' | 'missing' | 'failed'
  /** For `failed`: epoch ms after which a new lookup may be tried. */
  retryAt?: number
  name?: string
  /** "Client › Project", only known for tasks loaded through the tree. */
  path?: string
}
