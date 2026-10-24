import { describe, expect, it } from 'vitest'
import { useDirtyGuard } from '../../app/composables/useDirtyGuard'
import { useDurationInput } from '../../app/composables/useDurationInput'
import { mergeFieldErrors } from '../../app/utils/entry-form'

describe('useDurationInput', () => {
  it('treats 0 as a value with its own message, not as empty', () => {
    const d = useDurationInput(null)
    expect(d.input('0m')).toBe(true)
    expect(d.ms.value).toBe(0)
    expect(d.error.value).toBe('Enter a duration longer than 0 minutes.')
  })

  it('keeps the last good duration while the text is unreadable', () => {
    const d = useDurationInput(60 * 60_000)
    expect(d.input('soon')).toBe(false)
    expect([d.ms.value, d.invalid.value]).toEqual([60 * 60_000, true])
  })

  it('reports no change when the same duration is typed differently', () => {
    const d = useDurationInput(90 * 60_000)
    expect(d.input('90m')).toBe(false)
  })
})

describe('useDirtyGuard', () => {
  it('tracks every field it is given, with optional normalising', () => {
    const fields = { a: ref(1), b: ref('x') }
    const g = useDirtyGuard(fields, { b: v => v.trim() })
    fields.b.value = 'x  '
    expect(g.isDirty.value).toBe(false)
    fields.a.value = 2
    expect(g.isDirty.value).toBe(true)
    g.markSaved()
    expect(g.isDirty.value).toBe(false)
  })
})

describe('mergeFieldErrors', () => {
  const iso = (path: string) => ({ path: [path], message: 'Use a UTC ISO 8601 timestamp.' })

  it('hides ISO messages when a time field already explains the problem', () => {
    expect(mergeFieldErrors({ duration: 'Enter a duration.' }, [iso('end')])).toEqual({ duration: 'Enter a duration.' })
  })

  it('keeps the form\'s own message over the schema\'s for the same field', () => {
    expect(mergeFieldErrors({ end: 'End must be after the start time.' }, [iso('end')])).toEqual({ end: 'End must be after the start time.' })
  })

  it('fills fields the form had nothing to say about', () => {
    expect(mergeFieldErrors({}, [{ path: ['comment'], message: 'Add a comment.' }])).toEqual({ comment: 'Add a comment.' })
  })
})
