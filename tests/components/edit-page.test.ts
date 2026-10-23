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
})
