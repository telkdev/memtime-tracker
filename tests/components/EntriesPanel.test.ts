import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import EntriesPanel from '../../app/components/entries/EntriesPanel.vue'
import fixture from '../fixtures/time-entries.json'

// The BFF strips userId; the browser-side fixture mirrors that.
const entries = fixture.map(({ userId: _userId, ...rest }) => rest)

const listCalls: Array<Record<string, unknown>> = []
type Responder = (event: Parameters<Parameters<typeof registerEndpoint>[1]>[0]) => unknown
let listResponse: Responder = () => ({ items: entries, hasMore: true, nextOffset: 25 })
const taskCalls: string[] = []

registerEndpoint('/api/time-entries', (event) => {
  const query = Object.fromEntries(new URL(event.node.req.url ?? '', 'http://x').searchParams)
  listCalls.push(query)
  return listResponse(event)
})
registerEndpoint('/api/tasks/7', () => {
  taskCalls.push('7')
  return { id: 7, parent: 0, name: 'Design review', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
})
registerEndpoint('/api/tasks/9', () => {
  taskCalls.push('9')
  return { id: 9, parent: 0, name: 'Release', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
})

const mounted: Array<{ unmount: () => void }> = []

async function mount(route: string) {
  const wrapper = await mountSuspended(EntriesPanel, { route })
  mounted.push(wrapper)
  return wrapper
}

async function mountAt(route: string) {
  const wrapper = await mount(route)
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.text()).not.toContain('Loading'))
  return wrapper
}

describe('EntriesPanel', () => {
  beforeEach(() => {
    listCalls.length = 0
    taskCalls.length = 0
    listResponse = () => ({ items: entries, hasMore: true, nextOffset: 25 })
    useState('time-entries:pages').value = {}
    useState('task-names').value = {}
    useState('task-names:queue').value = []
    useState('task-names:running').value = 0
  })
  afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount()
  })

  it('requests the page and size from the URL', async () => {
    await mountAt('/?page=3&size=10')
    expect(listCalls.at(-1)).toMatchObject({ limit: '10', offset: '20' })
  })

  it('shows entries grouped by local day with totals and local times', async () => {
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sprint planning'))
    const text = wrapper.text()
    // 07:00Z is 09:00 in Berlin; the late deploy ends after local midnight.
    expect(text).toContain('09:00')
    expect(text).toContain('+1d')
    expect(text).toContain('1h 30m')
    // Last group may continue on the next page.
    expect(text).toContain('on this page')
  })

  it('resolves each unknown task once, however many rows use it', async () => {
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Design review'))
    expect(taskCalls.filter(id => id === '7')).toHaveLength(1)
  })

  it('links every row to its edit page with an accessible Edit button', async () => {
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.find('[aria-label="Edit entry #103"]').exists()).toBe(true))
    expect(wrapper.find('a[aria-label="Edit entry #103"]').attributes('href')).toBe('/entries/103/edit')
  })

  it('shows the empty state with a call to action on page 1', async () => {
    listResponse = () => ({ items: [], hasMore: false, nextOffset: null })
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No time entries yet'))
    expect(wrapper.find('a[href="/entries/new"]').exists()).toBe(true)
  })

  it('says "nothing on this page" instead of "no entries" past the end', async () => {
    listResponse = () => ({ items: [], hasMore: false, nextOffset: null })
    const wrapper = await mountAt('/?page=9')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Nothing on this page'))
    expect(wrapper.text()).not.toContain('No time entries yet')
  })

  it('shows a misconfiguration without a pointless retry', async () => {
    listResponse = (event) => {
      setResponseStatus(event, 502)
      return { error: { status: 502, code: 'UPSTREAM_AUTH', message: 'The server is misconfigured.' } }
    }
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('The server is misconfigured.'))
    expect(wrapper.text()).not.toContain('Try again')
  })

  it('waits out a rate limit and then loads by itself', async () => {
    let calls = 0
    listResponse = (event) => {
      calls++
      if (calls === 1) {
        setResponseStatus(event, 429)
        return { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 1 } }
      }
      return { items: entries, hasMore: false, nextOffset: null }
    }
    const wrapper = await mount('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Waiting for the rate limit'))
    expect(wrapper.text()).not.toContain('Try again')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sprint planning'), { timeout: 3000 })
    expect(wrapper.text()).not.toContain('Waiting for the rate limit')
    expect(calls).toBe(2)
  })

  it('takes task names from the loaded tree without asking the server', async () => {
    const stamp = { status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
    const loaded = (items: unknown[]) => ({ status: 'loaded', items, hasMore: false, nextOffset: null })
    useState('catalog:nodes').value = {
      'root': loaded([{ id: 1, name: 'Acme', description: '', ...stamp }]),
      'client:1': loaded([{ id: 5, clientId: 1, name: 'Website', ...stamp }]),
      'project:5': loaded([{ id: 7, parent: 0, name: 'Homepage copy', ...stamp }]),
    }
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Homepage copy'))
    expect(wrapper.text()).toContain('Acme › Website')
    expect(taskCalls).not.toContain('7')
    useState('catalog:nodes').value = {}
  })
})
