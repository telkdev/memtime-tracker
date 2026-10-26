import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import EntryEditor from '../../app/features/entry-form/ui/EntryEditor.vue'
import { toTimeString } from '../../app/common'

// The newest entries page. A test can hold it open (`gate`) to type before it arrives.
const listCalls: string[] = []
let listItems: unknown[] = []
let gate: Promise<void> | null = null
registerEndpoint('/api/time-entries', {
  method: 'GET',
  handler: async () => {
    listCalls.push('list')
    if (gate) await gate
    return { items: listItems, hasMore: false, nextOffset: null }
  },
})

let nextId = 50
registerEndpoint('/api/time-entries', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<Record<string, unknown>>(event)
    const entry = { id: nextId++, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    listItems = [entry, ...listItems]
    return { entry }
  },
})
registerEndpoint('/api/tasks/7', () => ({ id: 7, name: 'Design review', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }))

const mounted: Array<{ unmount: () => void }> = []
afterEach(async () => {
  mounted.splice(0).forEach(w => w.unmount())
  gate = null
  await new Promise(r => setTimeout(r, 20))
})

function reset(items: unknown[] = []) {
  useState('time-entries:pages').value = {}
  useState('catalog:nodes').value = {}
  useState('task-names').value = {}
  listCalls.length = 0
  listItems = items
}

async function mountNew() {
  const wrapper = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(EntryEditor, { taskId: 7 })) }), { route: '/entries/new' })
  mounted.push(wrapper)
  return wrapper
}

const startValue = (w: Awaited<ReturnType<typeof mountNew>>) => (w.find('input[name="start"]').element as HTMLInputElement).value

/** An entry that ended `minutesAgo` minutes ago (whole minute), or null if that would be before today. */
function endedToday(minutesAgo: number) {
  const end = new Date(Math.floor(Date.now() / 60_000) * 60_000 - minutesAgo * 60_000)
  const start = new Date(end.getTime() - 30 * 60_000)
  if (start.toDateString() !== new Date().toDateString()) return null
  return { id: 1, taskId: 7, comment: 'Earlier', start: start.toISOString(), end: end.toISOString(), createdAt: end.toISOString(), updatedAt: end.toISOString() }
}

describe('EntryEditor (create)', () => {
  it('opened directly, starts after today\'s last entry once the entries have loaded', async () => {
    const earlier = endedToday(7)
    if (!earlier) return // just after midnight: no "earlier today" to continue from
    reset([earlier])
    const wrapper = await mountNew()
    await vi.waitFor(() => expect(startValue(wrapper)).toBe(toTimeString(new Date(earlier.end))))
    expect(listCalls).toEqual(['list'])
  })

  it('keeps a start the user typed while the entries were still loading', async () => {
    const earlier = endedToday(7)
    if (!earlier) return
    reset([earlier])
    let release!: () => void
    gate = new Promise(r => release = r)
    const wrapper = await mountNew()
    await wrapper.find('input[name="start"]').setValue('08:30')
    release()
    await vi.waitFor(() => expect(listCalls).toEqual(['list']))
    await new Promise(r => setTimeout(r, 50))
    expect(startValue(wrapper)).toBe('08:30')
  })

  it('after "Save & log another", still warns about an overlap with the entry just saved', async () => {
    const yesterday = new Date(Date.now() - 24 * 3600_000)
    reset([{ id: 2, taskId: 7, comment: 'Yesterday', start: new Date(yesterday.getTime() - 3600_000).toISOString(), end: yesterday.toISOString(), createdAt: yesterday.toISOString(), updatedAt: yesterday.toISOString() }])
    const wrapper = await mountNew()
    await vi.waitFor(() => expect(listCalls).toEqual(['list']))
    await wrapper.find('input[name="duration"]').setValue('1h')
    await wrapper.find('input[name="duration"]').trigger('change')
    await wrapper.find('textarea').setValue('First')
    const savedStart = startValue(wrapper)
    await wrapper.findAll('button').find(b => b.text() === 'Save & log another')!.trigger('click')

    // The form restarts at the saved entry's end and knows that entry without asking again.
    await vi.waitFor(() => expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(''))
    await wrapper.find('input[name="start"]').setValue(savedStart)
    await wrapper.find('input[name="duration"]').setValue('30m')
    await wrapper.find('input[name="duration"]').trigger('change')
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/Overlaps\s+entry #\d+/))
    expect(listCalls).toEqual(['list'])
  })

  it('after "Save & log another" with nothing loaded yet, loads the entries once more', async () => {
    reset()
    const wrapper = await mountNew()
    await vi.waitFor(() => expect(listCalls).toEqual(['list']))
    await wrapper.find('input[name="duration"]').setValue('1h')
    await wrapper.find('input[name="duration"]').trigger('change')
    await wrapper.find('textarea').setValue('First')
    await wrapper.findAll('button').find(b => b.text() === 'Save & log another')!.trigger('click')
    await vi.waitFor(() => expect(listCalls).toEqual(['list', 'list']))
  })
})
