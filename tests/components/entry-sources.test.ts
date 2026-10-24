import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { defineComponent, h, ref } from 'vue'
import { useEntrySources } from '../../app/features/entry-form/composables/useEntrySources'

const lookups: string[] = []
registerEndpoint('/api/tasks/42', () => {
  lookups.push('42')
  return { id: 42, projectId: 5, name: 'Quarterly report', status: 'active', createdAt: '', updatedAt: '' }
})

const failing: string[] = []
registerEndpoint('/api/tasks/77', (event) => {
  failing.push('77')
  setResponseStatus(event, 503)
  return { error: { status: 503, code: 'UPSTREAM_UNAVAILABLE', message: 'Try again.' } }
})

describe('useEntrySources', () => {
  it('looks up the name of a deep-linked task that nothing else has loaded', async () => {
    useState('time-entries:pages').value = {}
    useState('catalog:nodes').value = {}
    useState('task-names').value = {}
    const taskId = ref<number | null>(42)
    let groups!: () => { recent: Array<{ id: number, label: string }> }
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const sources = useEntrySources()
        sources.watchTaskName(() => taskId.value)
        groups = () => sources.taskGroups(taskId.value)
        return () => h('div')
      },
    }))
    await vi.waitFor(() => expect(groups().recent.find(o => o.id === 42)?.label).toBe('Quarterly report'))
    expect(lookups).toEqual(['42'])
    wrapper.unmount()
  })

  it('does not retry a failing task-name lookup in a loop', async () => {
    useState('catalog:nodes').value = {}
    useState('task-names').value = {}
    const entry = { id: 1, taskId: 77, comment: 'x', start: '2026-10-23T09:00:00.000Z', end: '2026-10-23T10:00:00.000Z', createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z' }
    useState('time-entries:pages').value = { '25:1': { key: '25:1', items: [entry], hasMore: false, loadedAt: Date.now() } }
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        useEntrySources()
        return () => h('div')
      },
    }))
    await vi.waitFor(() => expect(failing.length).toBeGreaterThan(0))
    await new Promise(r => setTimeout(r, 300))
    expect(failing).toEqual(['77'])
    wrapper.unmount()
  })
})
