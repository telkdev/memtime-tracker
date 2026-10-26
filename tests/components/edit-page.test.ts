import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import EditPage from '../../app/pages/entries/[id]/edit.vue'

registerEndpoint('/api/time-entries/404', (event) => {
  setResponseStatus(event, 404)
  return { error: { status: 404, code: 'NOT_FOUND', message: 'Time entry #404 not found.' } }
})

const entry = { id: 5, taskId: 7, comment: 'Review', start: '2026-10-23T07:00:00.000Z', end: '2026-10-23T08:00:00.000Z', createdAt: '2026-10-23T08:00:00.000Z', updatedAt: '2026-10-23T08:00:00.000Z' }
registerEndpoint('/api/time-entries/5', (event) => {
  if (event.method === 'GET') return { entry }
  setResponseStatus(event, 404) // deleted elsewhere while the form was open
  return { error: { status: 404, code: 'NOT_FOUND', message: 'Time entry #5 not found.' } }
})
registerEndpoint('/api/tasks/7', () => ({ id: 7, name: 'Design review', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }))
// The form loads the newest entries for Recent tasks when none are loaded.
registerEndpoint('/api/time-entries', () => ({ items: [], hasMore: false, nextOffset: null }))

const mounted: Array<{ unmount: () => void }> = []
afterEach(() => mounted.splice(0).forEach(w => w.unmount()))

async function mountAt(route: string) {
  const wrapper = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(EditPage)) }), { route })
  mounted.push(wrapper)
  return wrapper
}

describe('edit page', () => {
  it('explains a deep link to a missing entry and offers a way forward', async () => {
    const wrapper = await mountAt('/entries/404/edit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This entry doesn\'t exist'))
    expect(wrapper.find('a[href="/entries/new"]').exists()).toBe(true)
  })

  it('treats a malformed id as missing without asking the server', async () => {
    const wrapper = await mountAt('/entries/abc/edit')
    expect(wrapper.text()).toContain('This entry doesn\'t exist')
  })

  it('turns the heading into a create after a 404 on save and "Create as new entry"', async () => {
    const wrapper = await mountAt('/entries/5/edit')
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    expect(wrapper.find('h1').text()).toContain('Edit entry #5')

    await wrapper.find('form').trigger('submit')
    const createAsNew = await vi.waitFor(() => {
      const b = wrapper.findAll('button').find(b => b.text().includes('Create as new entry'))
      expect(b).toBeDefined()
      return b!
    })
    await createAsNew.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Log as a new entry'))
  })
})
