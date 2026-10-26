import type { Client, Project, Task } from '#shared/schemas/catalog'
import type { CatalogNode, NodeKey } from '../model/types'

export type EntityRow
  = | { kind: 'client', entity: Client }
    | { kind: 'project', entity: Project }
    | { kind: 'task', entity: Task, project: Project, client: Client }

export type StatusKind = 'loading' | 'loadingMore' | 'waiting' | 'error' | 'empty' | 'more'

interface RowBase {
  key: string
  level: number
  parentKey: string | null
  posinset: number
  setsize: number
}

export type TreeRow = RowBase & (
  | (EntityRow & { label: string, expandable: boolean, expanded: boolean, count?: string, countLabel?: string, loadKey?: NodeKey })
  | { kind: 'status', status: StatusKind, label: string, ownerKey: NodeKey, retryAt?: number, retryable?: boolean }
)

export interface TreeInput {
  node: <T>(key: NodeKey) => CatalogNode<T>
  isExpanded: (key: string) => boolean
  filter?: string
}

function emptyLabel(key: NodeKey) {
  if (key === 'root') return 'No clients yet'
  return key.startsWith('client:') ? 'No projects' : 'No tasks'
}

function countLabel(n: CatalogNode): string | undefined {
  if (n.status !== 'loaded' && n.status !== 'loadingMore') return undefined
  return `${n.items.length}${n.hasMore ? '+' : ''}`
}

/** The count read aloud: "1 project", "25 or more tasks". "+" means more pages exist. */
function countAria(n: CatalogNode, noun: 'project' | 'task'): string | undefined {
  if (n.status !== 'loaded' && n.status !== 'loadingMore') return undefined
  const one = n.items.length === 1 && !n.hasMore
  return `${n.items.length}${n.hasMore ? ' or more' : ''} ${noun}${one ? '' : 's'}`
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type Draft = DistributiveOmit<TreeRow, 'posinset' | 'setsize'>

/**
 * Flattens the lazily loaded catalog into visible rows (WAI-ARIA tree with aria-level/posinset).
 * Status rows (loading, waiting, error, empty, load more) are real rows so they're reachable by
 * keyboard. With a filter, only loaded data is searched and nothing is fetched.
 */
export function buildTreeRows(input: TreeInput): TreeRow[] {
  const query = input.filter?.trim().toLowerCase() ?? ''
  const matches = (label: string) => label.toLowerCase().includes(query)

  function statusRows(key: NodeKey, n: CatalogNode, level: number, parentKey: string | null): Draft[] {
    const base = { kind: 'status' as const, ownerKey: key, level, parentKey }
    switch (n.status) {
      case 'idle':
      case 'loading':
        return [{ ...base, key: `${key}#loading`, status: 'loading', label: 'Loading…' }]
      case 'waiting':
        return [{ ...base, key: `${key}#waiting`, status: 'waiting', label: 'Waiting for rate limit', retryAt: n.retryAt }]
      case 'error':
        // A rejected server key won't fix itself, so offering Retry would only spend budget.
        return [{ ...base, key: `${key}#error`, status: 'error', label: n.error?.message ?? 'Couldn\'t load.', retryable: n.error?.code !== 'UPSTREAM_AUTH' }]
      case 'loadingMore':
        return [{ ...base, key: `${key}#more`, status: 'loadingMore', label: 'Loading more…' }]
      case 'loaded':
        if (!n.items.length) return [{ ...base, key: `${key}#empty`, status: 'empty', label: emptyLabel(key) }]
        return n.hasMore ? [{ ...base, key: `${key}#more`, status: 'more', label: 'Load more' }] : []
    }
  }

  function taskRows(tasks: Task[], level: number, parentKey: string, ctx: { project: Project, client: Client }): { rows: Draft[], hit: boolean } {
    const rows: Draft[] = tasks
      .filter(task => !query || matches(task.name))
      .map(task => ({ kind: 'task', entity: task, ...ctx, key: `task:${task.id}`, level, parentKey, label: task.name, expandable: false, expanded: false }))
    return { rows, hit: rows.length > 0 }
  }

  function projectRows(clientKey: NodeKey, client: Client, level: number): { rows: Draft[], hit: boolean } {
    const n = input.node<Project>(clientKey)
    const rows: Draft[] = []
    let anyHit = false
    for (const project of n.items) {
      const key = `project:${project.id}` as const
      const tasks = input.node<Task>(key)
      const children = taskRows(tasks.items, level + 1, key, { project, client })
      const self = !query || matches(project.name)
      if (query && !self && !children.hit) continue
      anyHit = true
      const expanded = query ? children.hit : input.isExpanded(key)
      rows.push({ kind: 'project', entity: project, key, level, parentKey: clientKey, label: project.name, expandable: true, expanded, count: countLabel(tasks), countLabel: countAria(tasks, 'task'), loadKey: key })
      if (expanded) {
        rows.push(...children.rows)
        if (!query) rows.push(...statusRows(key, tasks, level + 1, key))
      }
    }
    return { rows, hit: anyHit }
  }

  const root = input.node<Client>('root')
  const drafts: Draft[] = []
  for (const client of root.items) {
    const key = `client:${client.id}` as const
    const children = projectRows(key, client, 2)
    const self = !query || matches(client.name)
    if (query && !self && !children.hit) continue
    const expanded = query ? children.hit : input.isExpanded(key)
    drafts.push({ kind: 'client', entity: client, key, level: 1, parentKey: null, label: client.name, expandable: true, expanded, count: countLabel(input.node(key)), countLabel: countAria(input.node(key), 'project'), loadKey: key })
    if (expanded) {
      drafts.push(...children.rows)
      if (!query) drafts.push(...statusRows(key, input.node(key), 2, key))
    }
  }
  if (!query) drafts.push(...statusRows('root', root, 1, null))

  return withPositions(drafts)
}

function withPositions(drafts: Draft[]): TreeRow[] {
  const groups = new Map<string, number>()
  for (const d of drafts) {
    const g = `${d.parentKey}|${d.level}`
    groups.set(g, (groups.get(g) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return drafts.map((d) => {
    const g = `${d.parentKey}|${d.level}`
    const pos = (seen.get(g) ?? 0) + 1
    seen.set(g, pos)
    return { ...d, posinset: pos, setsize: groups.get(g)! } as TreeRow
  })
}
