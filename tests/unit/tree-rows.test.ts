// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CatalogNode, NodeKey } from '../../app/composables/useCatalog'
import { buildTreeRows } from '../../app/utils/tree-rows'

const at = { status: 'active', createdAt: '', updatedAt: '' }
const loaded = <T>(items: T[], hasMore = false): CatalogNode<T> => ({ status: 'loaded', items, hasMore, nextOffset: hasMore ? items.length : null })

function build(nodes: Partial<Record<NodeKey, CatalogNode>>, expanded: string[] = [], filter = '') {
  return buildTreeRows({
    node: <T>(key: NodeKey) => (nodes[key] ?? { status: 'idle', items: [], hasMore: false, nextOffset: null }) as CatalogNode<T>,
    isExpanded: key => expanded.includes(key),
    filter,
  })
}

const summary = (rows: ReturnType<typeof build>) => rows.map(r => `${'  '.repeat(r.level - 1)}${r.kind === 'status' ? `[${r.status}]` : r.label}`)

const catalog = {
  'root': loaded([{ id: 1, name: 'Acme', ...at }, { id: 2, name: 'Globex', ...at }]),
  'client:1': loaded([{ id: 10, clientId: 1, name: 'Website', ...at }]),
  'project:10': loaded([{ id: 100, parent: 0, name: 'Design', ...at }, { id: 101, parent: 100, name: 'Review', ...at }]),
} satisfies Partial<Record<NodeKey, CatalogNode>>

describe('buildTreeRows', () => {
  it('shows a loading row before clients arrive', () => {
    expect(summary(build({}))).toEqual(['[loading]'])
  })

  it('shows only expanded branches', () => {
    expect(summary(build(catalog))).toEqual(['Acme', 'Globex'])
    expect(summary(build(catalog, ['client:1', 'project:10']))).toEqual(['Acme', '  Website', '    Design', 'Globex'])
    expect(summary(build(catalog, ['client:1', 'project:10', 'task:100']))).toEqual(['Acme', '  Website', '    Design', '      Review', 'Globex'])
  })

  it('shows per-node status rows: loading, waiting, error, empty and load more', () => {
    const rows = build({
      'root': loaded([{ id: 1, name: 'A', ...at }, { id: 2, name: 'B', ...at }, { id: 3, name: 'C', ...at }, { id: 4, name: 'D', ...at }], true),
      'client:1': { status: 'loading', items: [], hasMore: false, nextOffset: null },
      'client:2': { status: 'waiting', items: [], hasMore: false, nextOffset: null, retryAt: 5 },
      'client:3': { status: 'error', items: [], hasMore: false, nextOffset: null, error: { status: 502, code: 'UPSTREAM_UNAVAILABLE', message: 'Down' } },
      'client:4': loaded([]),
    }, ['client:1', 'client:2', 'client:3', 'client:4'])
    expect(summary(rows)).toEqual(['A', '  [loading]', 'B', '  [waiting]', 'C', '  [error]', 'D', '  [empty]', '[more]'])
    expect(rows.find(r => r.kind === 'status' && r.status === 'error')?.label).toBe('Down')
  })

  it('reports item counts, with + when more pages exist', () => {
    const rows = build({ ...catalog, 'client:1': loaded(catalog['client:1'].items, true) })
    expect(rows[0]).toMatchObject({ label: 'Acme', count: '1+' })
  })

  it('sets aria positions within each sibling group', () => {
    const rows = build(catalog, ['client:1'])
    expect(rows.map(r => [r.label, r.level, r.posinset, r.setsize])).toEqual([
      ['Acme', 1, 1, 2],
      ['Website', 2, 1, 1],
      ['Globex', 1, 2, 2],
    ])
  })

  it('filters loaded data only and opens the path to each match', () => {
    expect(summary(build(catalog, [], 'review'))).toEqual(['Acme', '  Website', '    Design', '      Review'])
    expect(summary(build(catalog, [], 'glob'))).toEqual(['Globex'])
    expect(build(catalog, [], 'nothing')).toEqual([])
  })

  it('offers Retry on an error row, except when the server key was rejected', () => {
    const failed = (code: 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_AUTH') =>
      build({ root: { status: 'error', items: [], hasMore: false, nextOffset: null, error: { status: 502, code, message: 'x' } } })[0]
    expect(failed('UPSTREAM_UNAVAILABLE')).toMatchObject({ kind: 'status', status: 'error', retryable: true })
    expect(failed('UPSTREAM_AUTH')).toMatchObject({ kind: 'status', status: 'error', retryable: false })
  })
})
