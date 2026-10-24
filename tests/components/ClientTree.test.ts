import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import ClientTree from '../../app/features/catalog/ui/ClientTree.vue'

const at = { status: 'active', createdAt: '', updatedAt: '' }
const page = <T>(items: T[]) => ({ items, hasMore: false, nextOffset: null })
let calls: string[] = []

let authFails = false
let rootDown = false
registerEndpoint('/api/clients', (event) => {
  calls.push('clients')
  if (rootDown) {
    event.node.res.statusCode = 503
    return { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Couldn\'t reach the time tracking service.' } }
  }
  if (authFails) {
    event.node.res.statusCode = 502
    return { error: { status: 502, code: 'UPSTREAM_AUTH', message: 'The server is misconfigured: its API credentials were rejected.' } }
  }
  return page([{ id: 1, name: 'Acme', description: '', ...at }, { id: 2, name: 'Globex', description: '', ...at }, { id: 5, name: 'Stark', description: '', ...at }])
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
let releaseStark: () => void = () => {}
registerEndpoint('/api/clients/5/projects', async () => {
  await new Promise<void>(r => (releaseStark = r))
  return page([{ id: 50, clientId: 5, name: 'Arc reactor', ...at }])
})
let refreshResponse: (event: Parameters<Parameters<typeof registerEndpoint>[1]>[0]) => unknown = () => ({ ok: true })
registerEndpoint('/api/catalog/refresh', { method: 'POST', handler: event => refreshResponse(event) })
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
    expect(labels(w)).toEqual(['Acme', 'Globex', 'Stark'])

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

  it('keeps keyboard focus when the loading row it sits on resolves', async () => {
    const w = await mountTree()
    const tree = w.find('[role=tree]')
    const press = async (key: string) => {
      await tree.trigger('keydown', { key })
      await flushPromises()
    }
    await press('End') // Stark
    ;(w.find('[data-key="client:5"]').element as HTMLElement).focus()
    await press('ArrowRight') // expand: projects are pending
    await press('ArrowDown') // onto the loading row
    expect(document.activeElement?.getAttribute('data-key')).toBe('client:5#loading')

    releaseStark()
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-key')).toBe('project:50'))
    w.unmount()
  })

  it('says why a failed refresh changed nothing, keeps the tree, and clears once it works', async () => {
    refreshResponse = (event) => {
      event.node.res.statusCode = 503
      return { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Couldn\'t reach the time tracking service.' } }
    }
    const w = await mountTree()
    await w.find('button[aria-label="Refresh"]').trigger('click')
    await vi.waitFor(() => expect(w.find('[role=alert]').text()).toContain('Couldn\'t reach the time tracking service.'))
    expect(labels(w)).toEqual(['Acme', 'Globex', 'Stark'])

    // The next refresh works: the tree reloads and the stale message goes away.
    refreshResponse = () => ({ ok: true })
    await w.find('button[aria-label="Refresh"]').trigger('click')
    await vi.waitFor(() => expect(w.find('[role=alert]').exists()).toBe(false))
    w.unmount()
  })

  it('shows no Retry for a misconfigured server key, and Enter does not retry it', async () => {
    useState('catalog:nodes').value = {}
    useState('catalog:expanded').value = []
    authFails = true
    const w = await mountSuspended(ClientTree, { attachTo: document.body })
    await vi.waitFor(() => expect(w.text()).toContain('credentials were rejected'))
    expect(w.findAll('button').map(b => b.text())).not.toContain('Retry')
    const before = calls.length
    await w.find('[role=tree]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(calls.length).toBe(before)
    authFails = false
    w.unmount()
  })

  it('clears the refresh error once the clients load again through a Retry', async () => {
    rootDown = true
    refreshResponse = (event) => {
      event.node.res.statusCode = 503
      return { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Service down.' } }
    }
    const w = await mountTree()
    await vi.waitFor(() => expect(w.text()).toContain('Couldn\'t reach the time tracking service.'))
    await w.find('button[aria-label="Refresh"]').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('Couldn\'t refresh. Service down.'))

    rootDown = false
    refreshResponse = () => ({ ok: true })
    const retry = w.findAll('button').find(b => b.text() === 'Retry')!
    await retry.trigger('click')
    await vi.waitFor(() => expect(labels(w)).toEqual(['Acme', 'Globex', 'Stark']))
    expect(w.text()).not.toContain('Couldn\'t refresh')
    w.unmount()
  })
})
