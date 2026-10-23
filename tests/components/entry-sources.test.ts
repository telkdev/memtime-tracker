import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent, h, ref } from 'vue'

const lookups: string[] = []
registerEndpoint('/api/tasks/42', () => {
  lookups.push('42')
  return { id: 42, projectId: 5, name: 'Quarterly report', status: 'active', createdAt: '', updatedAt: '' }
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
})
