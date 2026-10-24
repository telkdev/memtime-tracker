import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import EntryForm from '../../app/features/entry-form/ui/EntryForm.vue'
import { useEntryForm } from '../../app/features/entry-form/composables/useEntryForm'

const groups = { recent: [{ id: 7, label: 'Design review', path: 'Acme › Website' }], catalog: [] }

const mounted: Array<{ unmount: () => void }> = []
afterEach(async () => {
  mounted.splice(0).forEach(w => w.unmount())
  // Let Nuxt UI's post-unmount work (focus, tooltips) run before the worker tears down.
  await new Promise(r => setTimeout(r, 20))
})

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

  it('shows the End that will be saved once a Date change clears a refused End', async () => {
    const wrapper = await mountForm()
    const duration = wrapper.find('input[name="duration"]')
    const end = wrapper.find('input[name="end"]')
    await duration.setValue('1h30')
    await duration.trigger('change')
    await end.setValue('09:00') // same as Start: refused, the typed text stays
    await end.trigger('change')
    expect((end.element as HTMLInputElement).value).toBe('09:00')

    await wrapper.find('input[name="date"]').setValue('2026-10-22')
    expect((end.element as HTMLInputElement).value).toBe('10:30')
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

  it('keeps "Save & log another" when the save is retried after a rate limit', async () => {
    let posts = 0
    const saved = { id: 41, taskId: 7, comment: 'Review', start: '2026-10-23T07:00:00.000Z', end: '2026-10-23T08:00:00.000Z', createdAt: '2026-10-23T08:00:00.000Z', updatedAt: '2026-10-23T08:00:00.000Z' }
    registerEndpoint('/api/time-entries', {
      method: 'POST',
      handler: (event) => {
        posts++
        if (posts === 1) {
          setResponseStatus(event, 429)
          return { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 1 } }
        }
        setResponseStatus(event, 201)
        return { entry: saved }
      },
    })
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const form = useEntryForm({ mode: 'create', taskId: 7, start: new Date(2026, 9, 23, 9, 0) })
        form.setDurationText('1h')
        form.comment.value = 'Review'
        return () => h(UApp, () => h(EntryForm, { form, taskGroups: groups }))
      },
    }))
    mounted.push(wrapper)
    await wrapper.findAll('button').find(b => b.text().includes('Save & log another'))!.trigger('click')
    const form = wrapper.findComponent(EntryForm)
    await vi.waitFor(() => expect(form.emitted('saved')).toHaveLength(1), { timeout: 3000 })
    expect(posts).toBe(2)
    expect(form.emitted('saved')![0]![1]).toEqual({ another: true })
  })
})
