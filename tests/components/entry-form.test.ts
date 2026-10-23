import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import EntryForm from '../../app/components/entries/EntryForm.vue'
import { useEntryForm } from '../../app/composables/useEntryForm'

const groups = { recent: [{ id: 7, label: 'Design review', path: 'Acme › Website' }], catalog: [] }

const mounted: Array<{ unmount: () => void }> = []
afterEach(() => mounted.splice(0).forEach(w => w.unmount()))

async function mountForm() {
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      const form = useEntryForm({ mode: 'create', start: new Date(2026, 9, 23, 9, 0) })
      // UApp provides the tooltip and toast context that Nuxt UI components need.
      return () => h(UApp, () => h(EntryForm, { form, taskGroups: groups }))
    },
  }))
  mounted.push(wrapper)
  return wrapper
}

describe('EntryForm', () => {
  it('shows each error under its field and links it with aria-describedby', async () => {
    const wrapper = await mountForm()
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r))

    const comment = wrapper.find('textarea')
    expect(comment.attributes('aria-invalid')).toBe('true')
    const described = comment.attributes('aria-describedby')!.split(' ').map(id => wrapper.find(`[id="${id}"]`).text()).join(' ')
    expect(described).toContain('Add a short comment')
  })

  it('marks an end on the next day', async () => {
    const wrapper = await mountForm()
    await wrapper.find('input[name="duration"]').setValue('16h')
    expect(wrapper.text()).toContain('+1 day')
  })

  it('offers a one-click fix for a time skipped by DST', async () => {
    const wrapper = await mountForm()
    await wrapper.find('input[name="date"]').setValue('2026-03-29')
    await wrapper.find('input[name="start"]').setValue('02:30')
    expect(wrapper.text()).toContain('Use 03:30 instead')
  })

  it('updates the duration field when End is edited, and End when the duration is', async () => {
    const wrapper = await mountForm()
    const duration = wrapper.find('input[name="duration"]')
    const end = wrapper.find('input[name="end"]')
    await duration.setValue('1h')
    await duration.trigger('change')
    expect((end.element as HTMLInputElement).value).toBe('10:00')

    await end.setValue('11:45')
    await end.trigger('change')
    expect((duration.element as HTMLInputElement).value).toBe('2h 45m')
  })

  it('offers "Save & log another" only on a form that was opened to create', async () => {
    const entry = { id: 5, taskId: 7, comment: 'x', start: '2026-10-23T07:00:00.000Z', end: '2026-10-23T08:00:00.000Z', createdAt: '', updatedAt: '' }
    let form!: ReturnType<typeof useEntryForm>
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        form = useEntryForm({ mode: 'edit', entry })
        return () => h(UApp, () => h(EntryForm, { form, taskGroups: groups }))
      },
    }))
    mounted.push(wrapper)
    form.switchToCreate() // what "Create as new entry" does after a 404
    await new Promise(r => setTimeout(r))
    expect(wrapper.text()).toContain('Save entry')
    expect(wrapper.text()).not.toContain('Save & log another')
  })
})
