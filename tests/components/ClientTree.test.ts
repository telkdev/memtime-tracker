import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import ClientTree from '../../app/components/tree/ClientTree.vue'

const at = { status: 'active', createdAt: '', updatedAt: '' }
const page = <T>(items: T[]) => ({ items, hasMore: false, nextOffset: null })
let calls: string[] = []

registerEndpoint('/api/clients', () => {
  calls.push('clients')
  return page([{ id: 1, name: 'Acme', description: '', ...at }, { id: 2, name: 'Globex', description: '', ...at }])
})
registerEndpoint('/api/clients/1/projects', () => {
  calls.push('projects:1')
  return page([{ id: 10, clientId: 1, name: 'Website', ...at }])
})
registerEndpoint('/api/projects/10/tasks', () => {
  calls.push('tasks:10')
  return page([{ id: 100, parent: 0, name: 'Design', ...at }])
})
let globexAttempts = 0
registerEndpoint('/api/clients/2/projects', (event) => {
  calls.push('projects:2')
  if (++globexAttempts === 1) {
    event.node.res.statusCode = 429
    return { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 1 } }
  }
  return page([])
})
registerEndpoint('/api/_meta/rate-limit', () => ({ budget: 14, remaining: 10, resetsInMs: 1000, queued: 0, blockedForMs: 0 }))

async function mountTree() {
  useState('catalog:nodes').value = {}
  useState('catalog:expanded').value = []
  const wrapper = await mountSuspended(ClientTree, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const labels = (w: Awaited<ReturnType<typeof mountTree>>) => w.findAll('[role=treeitem]').map(r => r.text().replace('Log time', '').trim())

describe('ClientTree', () => {
  beforeEach(() => {
    calls = []
  })

  it('loads only clients on mount, then one level per expand, and nothing on re-expand', async () => {
    const w = await mountTree()
    expect(calls).toEqual(['clients'])
    expect(labels(w)).toEqual(['Acme', 'Globex'])

    const tree = w.find('[role=tree]')
    await tree.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(calls).toEqual(['clients', 'projects:1'])
    expect(w.find('[data-key="client:1"]').attributes('aria-expanded')).toBe('true')

    await tree.trigger('keydown', { key: 'ArrowLeft' })
    await tree.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(calls).toEqual(['clients', 'projects:1'])
    w.unmount()
  })

  it('supports full keyboard navigation and Enter on a task emits log', async () => {
    const w = await mountTree()
    const tree = w.find('[role=tree]')
    const press = async (key: string) => {
      await tree.trigger('keydown', { key })
      await flushPromises()
    }
    await press('ArrowRight') // expand Acme
    await press('ArrowRight') // move to Website
    await press('ArrowRight') // expand Website
    await press('ArrowDown') // Design
    expect(document.activeElement?.getAttribute('data-key')).toBe('task:100')
    expect(w.find('[data-key="task:100"]').attributes()).toMatchObject({ 'aria-level': '3', 'tabindex': '0' })

    await press('Enter')
    expect(w.emitted('log')?.[0]?.[0]).toMatchObject({ id: 100 })

    await press(' ')
    expect(w.emitted('select')?.[0]?.[0]).toMatchObject({ id: 100 })
    expect(w.find('[data-key="task:100"]').attributes('aria-selected')).toBe('true')

    await press('ArrowLeft') // to parent project
    expect(document.activeElement?.getAttribute('data-key')).toBe('project:10')
    await press('g') // type-ahead
    expect(document.activeElement?.getAttribute('data-key')).toBe('client:2')
    w.unmount()
  })

  it('shows a waiting countdown on 429 and retries by itself', async () => {
    const w = await mountTree()
    await w.find('[data-key="client:2"]').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('Waiting for rate limit'))
    expect(calls.filter(c => c === 'projects:2')).toHaveLength(1)
    expect(w.find('[role=alert]').exists()).toBe(false)

    await vi.waitFor(() => expect(w.text()).toContain('No projects'), { timeout: 3000 })
    expect(calls.filter(c => c === 'projects:2')).toHaveLength(2)
    w.unmount()
  })
})
