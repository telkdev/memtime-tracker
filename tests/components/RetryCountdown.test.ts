import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RetryCountdown from '../../app/components/common/RetryCountdown.vue'

describe('RetryCountdown', () => {
  it('shows the whole seconds left and hides itself at zero', async () => {
    const w = await mountSuspended(RetryCountdown, { props: { at: Date.now() + 2_500 } })
    expect(w.text()).toBe('· 3s')
    await w.setProps({ at: 0 })
    expect(w.text()).toBe('')
    w.unmount()
  })
})
