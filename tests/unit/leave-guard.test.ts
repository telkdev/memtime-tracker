import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { effectScope } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { useLeaveGuard } from '../../app/common/composables/useLeaveGuard'

type Guard = (to?: RouteLocationNormalized, from?: RouteLocationNormalized) => unknown
const { guards } = vi.hoisted(() => ({ guards: {} as { leave?: Guard, update?: Guard } }))
mockNuxtImport('onBeforeRouteLeave', () => (g: Guard) => {
  guards.leave = g
})
mockNuxtImport('onBeforeRouteUpdate', () => (g: Guard) => {
  guards.update = g
})

const at = (path: string, query = {}) => ({ path, query }) as unknown as RouteLocationNormalized

function setup(dirty: boolean, answer: boolean) {
  const confirm = vi.fn(() => answer)
  vi.stubGlobal('confirm', confirm)
  effectScope().run(() => useLeaveGuard(() => dirty))
  return confirm
}

describe('useLeaveGuard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks before opening another entry on the same edit route', () => {
    const confirm = setup(true, false)
    expect(guards.update!(at('/entries/7/edit'), at('/entries/5/edit'))).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('lets the user go when they confirm', () => {
    setup(true, true)
    expect(guards.update!(at('/entries/7/edit'), at('/entries/5/edit'))).toBeUndefined()
  })

  it('does not ask on a query-only change or when nothing is unsaved', () => {
    const confirm = setup(true, false)
    expect(guards.update!(at('/entries/5/edit', { from: 'list' }), at('/entries/5/edit'))).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
    setup(false, false)
    expect(guards.update!(at('/entries/7/edit'), at('/entries/5/edit'))).toBeUndefined()
    expect(guards.leave!()).toBeUndefined()
  })

  it('still asks when leaving the page', () => {
    setup(true, false)
    expect(guards.leave!()).toBe(false)
  })
})
