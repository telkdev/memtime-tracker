import { describe, expect, it } from 'vitest'
import { useRequestGuard } from '../../app/common/composables/useRequestGuard'

let n = 0
const fresh = () => useRequestGuard(`test-${n++}`)

describe('useRequestGuard', () => {
  it('keeps a ticket current until the guard is invalidated, then aborts it', () => {
    const guard = fresh()
    const ticket = guard.start()
    expect(ticket.isCurrent()).toBe(true)
    guard.invalidate()
    expect(ticket.isCurrent()).toBe(false)
    expect(ticket.signal.aborted).toBe(true)
  })

  it('startLatest replaces the previous request', () => {
    const guard = fresh()
    const first = guard.startLatest()
    const second = guard.startLatest()
    expect([first.isCurrent(), first.signal.aborted, second.isCurrent()]).toEqual([false, true, true])
  })

  it('lets independent requests run side by side with start()', () => {
    const guard = fresh()
    const a = guard.start()
    const b = guard.start()
    expect([a.isCurrent(), b.isCurrent()]).toEqual([true, true])
  })

  it('is shared by key, so one caller can invalidate another caller\'s requests', () => {
    const ticket = useRequestGuard('shared-key').start()
    useRequestGuard('shared-key').invalidate()
    expect(ticket.isCurrent()).toBe(false)
  })

  it('a ticket can also depend on a second guard', () => {
    const list = fresh()
    const cache = fresh()
    const ticket = list.start({ also: [cache] })
    cache.invalidate()
    expect([ticket.isCurrent(), ticket.signal.aborted]).toEqual([false, true])
  })

  it('does not abort a request that already finished', () => {
    const guard = fresh()
    const ticket = guard.start()
    ticket.done()
    guard.invalidate()
    expect(ticket.signal.aborted).toBe(false)
    expect(ticket.isCurrent()).toBe(false)
  })
})
