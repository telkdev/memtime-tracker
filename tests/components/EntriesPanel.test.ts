import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import EntriesPanel from '../../app/features/time-entries/ui/EntriesPanel.vue'
import fixture from '../fixtures/time-entries.json'
import { useLastListPosition, useTimeEntryCache } from '../../app/features/time-entries/composables/useTimeEntries'

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
  return { id: 7, name: 'Design review', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
})
registerEndpoint('/api/tasks/9', () => {
  taskCalls.push('9')
  return { id: 9, name: 'Release', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
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
  afterEach(async () => {
    // Let name lookups finish, so a late answer can't fill the next test's state.
    await vi.waitFor(() => expect(useState('task-names:running').value).toBe(0))
    while (mounted.length) mounted.pop()!.unmount()
  })

  it('requests the page and size from the URL', async () => {
    await mountAt('/?page=3&size=10')
    expect(listCalls.at(-1)).toMatchObject({ limit: '10', offset: '20' })
  })

  it('sends one request per page change, not one per watcher', async () => {
    await mountAt('/')
    await useRouter().push('/?page=2')
    await vi.waitFor(() => expect(listCalls).toHaveLength(2))
    await flushPromises()
    expect(listCalls.map(q => q.offset)).toEqual(['0', '25'])
  })

  it('keeps the cached page on screen when an older request lands late', async () => {
    let release: (v: unknown) => void = () => {}
    listResponse = (event) => {
      const offset = new URL(event.node.req.url ?? '', 'http://x').searchParams.get('offset')
      if (offset !== '75') return { items: entries, hasMore: true, nextOffset: 25 }
      return new Promise((resolve) => {
        release = () => resolve({ items: [{ ...entries[0]!, id: 999, comment: 'Late page four' }], hasMore: false, nextOffset: null })
      })
    }
    const wrapper = await mountAt('/')
    await useRouter().push('/?page=4')
    await vi.waitFor(() => expect(listCalls.at(-1)).toMatchObject({ offset: '75' }))
    // Back to page 1 before page 2 answers: served from the fresh cache.
    await useRouter().push('/?page=1')
    await flushPromises()
    release(undefined)
    await flushPromises()
    await new Promise(r => setTimeout(r, 20))
    expect(wrapper.text()).not.toContain('Late page four')
    expect(wrapper.text()).toContain(entries[0]!.comment)
  })

  it('reloads the page on screen once when a write clears the cache', async () => {
    await mountAt('/')
    useTimeEntryCache().invalidate()
    await vi.waitFor(() => expect(listCalls).toHaveLength(2))
    await flushPromises()
    expect(listCalls.map(q => q.offset)).toEqual(['0', '0'])
  })

  it('does not put a list answer that started before a save back into the cache', async () => {
    let answer!: (value: unknown) => void
    listResponse = () => new Promise((resolve) => {
      answer = resolve
    })
    await mount('/')
    await vi.waitFor(() => expect(listCalls).toHaveLength(1))
    const stale = { ...entries[0]!, comment: 'before the save' }
    useTimeEntryCache().invalidate() // a save finished while the list request was in flight
    listResponse = () => ({ items: entries, hasMore: true, nextOffset: 25 })
    answer({ items: [stale], hasMore: false, nextOffset: null })
    await vi.waitFor(() => expect(listCalls).toHaveLength(2))
    await flushPromises()
    expect(useTimeEntryCache().getCached(stale.id)?.comment).toBe(entries[0]!.comment)
  })

  it('says so when a just-saved entry is not on the page it returned to', async () => {
    const wrapper = await mountAt('/?highlight=999')
    expect(wrapper.text()).toContain('Entry #999 was saved, but it isn\'t on this page')
  })

  it('shows an already-seen page again without asking the server (within the cache TTL)', async () => {
    await mountAt('/')
    const router = useRouter()
    await router.push('/?page=2')
    await vi.waitFor(() => expect(listCalls).toHaveLength(2))
    await router.push('/?page=1')
    await flushPromises()
    expect(listCalls).toHaveLength(2)
    expect(listCalls.map(q => q.offset)).toEqual(['0', '25'])
  })

  it('keeps a cached page on screen when a slower request for another page answers late', async () => {
    const wrapper = await mountAt('/')
    let answer!: (value: unknown) => void
    listResponse = () => new Promise((resolve) => {
      answer = resolve
    })
    const router = useRouter()
    await router.push('/?page=2')
    await vi.waitFor(() => expect(listCalls).toHaveLength(2))
    await router.push('/?page=1')
    await flushPromises()
    answer({ items: [{ ...entries[0]!, id: 999, comment: 'From page two' }], hasMore: false, nextOffset: null })
    await flushPromises()
    await new Promise(r => setTimeout(r, 20))
    expect(wrapper.text()).toContain('Sprint planning')
    expect(wrapper.text()).not.toContain('From page two')
  })

  it('schedules no retry for a rate limit that answers after the panel is gone', async () => {
    let answer!: (value: unknown) => void
    listResponse = (event) => {
      setResponseStatus(event, 429)
      return new Promise((resolve) => {
        answer = resolve
      })
    }
    await mount('/')
    await vi.waitFor(() => expect(listCalls).toHaveLength(1))
    mounted.pop()!.unmount()
    answer({ error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 1 } })
    await new Promise(r => setTimeout(r, 1500))
    expect(listCalls).toHaveLength(1)
  })

  it('follows back and forward through pages via the URL', async () => {
    const wrapper = await mountAt('/')
    const router = useRouter()
    await router.push('/?page=2')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2'))
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBeUndefined())
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 1'))
    router.forward()
    await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBe('2'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2'))
    // Both pages came from memory after the first visit.
    expect(listCalls).toHaveLength(2)
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
      'project:5': loaded([{ id: 7, name: 'Homepage copy', ...stamp }]),
    }
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Homepage copy'))
    expect(wrapper.text()).toContain('Acme › Website')
    expect(taskCalls).not.toContain('7')
    useState('catalog:nodes').value = {}
  })

  it('treats id 0 as a real entry and task', async () => {
    const zero = { ...entries[0]!, id: 0, taskId: 0, comment: 'Entry zero' }
    listResponse = () => ({ items: [zero], hasMore: false, nextOffset: null })
    const wrapper = await mountSuspended(EntriesPanel, { route: '/?highlight=0', props: { highlightTaskId: 0 } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Entry zero'))
    expect(wrapper.find('a[aria-label="Edit entry #0"]').attributes('href')).toBe('/entries/0/edit')
    expect(wrapper.text()).toContain('Highlighting')
    expect(wrapper.find('[data-entry-id="0"]').classes().join(' ')).toContain('bg-primary/15')
  })

  it('drops the post-save highlight after a few seconds, but not after the panel is gone', async () => {
    // shouldAdvanceTime keeps mounting and fetching working; advanceTimersByTime then skips the 4 s.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    try {
      const wrapper = await mountAt('/?highlight=103')
      await vi.waitFor(() => expect(wrapper.find('[data-entry-id="103"]').classes().join(' ')).toContain('bg-primary/15'))
      const replace = vi.spyOn(useRouter(), 'replace')
      mounted.pop()!.unmount()
      vi.advanceTimersByTime(5_000)
      expect(replace).not.toHaveBeenCalled()
      replace.mockRestore()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('remembers the page on screen, so a save can return to it', async () => {
    await mountAt('/?page=3&size=10')
    expect(useLastListPosition().value).toEqual({ page: 3, size: 10 })
  })

  it('shows the brief\'s columns, and the task id even once the name is known', async () => {
    const wrapper = await mountAt('/')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Design review'))
    const headers = wrapper.findAll('thead th').map(th => th.text())
    expect(headers).toEqual(expect.arrayContaining(['ID', 'Task ID', 'Comment', 'Start', 'End', 'Created At']))
    const row = wrapper.find('tr[data-entry-id="103"]')
    expect(row.text()).toContain('#7')
    expect(row.text()).toContain('Design review')
  })
})
