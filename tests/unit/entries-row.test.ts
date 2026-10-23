import { describe, expect, it } from 'vitest'
import { entryEditPath, entryEndDays, entryRowClass, endsLaterLabel } from '../../app/utils/entries'

const entry = { id: 0, taskId: 7, comment: '', start: '2026-10-22T21:00:00.000Z', end: '2026-10-22T23:30:00.000Z', createdAt: '', updatedAt: '' }

describe('entry row helpers', () => {
  it('links id 0 to its edit page', () => {
    expect(entryEditPath(entry)).toBe('/entries/0/edit')
  })

  it('counts the local days an entry runs past its start (Berlin: 23:00 → 01:30)', () => {
    expect(entryEndDays(entry)).toBe(1)
    expect(endsLaterLabel(1)).toBe('Ends 1 day later')
    expect(endsLaterLabel(2)).toBe('Ends 2 days later')
  })

  it('highlights a just-saved entry more strongly than entries of the selected task', () => {
    expect(entryRowClass(entry, { id: 0 })).toContain('bg-primary/15')
    expect(entryRowClass(entry, { taskId: 7 })).toContain('bg-primary/5')
    expect(entryRowClass(entry, { id: null, taskId: null })).toBe('')
  })
})
