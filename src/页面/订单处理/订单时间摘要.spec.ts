import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import OrderTimeSummary from './订单时间摘要.vue'

const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.useRealTimers() })

describe('订单时间摘要计时生命周期', () => {
  it('每秒按真实时刻刷新，跨过截止变红，并在终态或卸载时清理定时器', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'))
    const wrapper = mount(OrderTimeSummary, { props: { orderedAt: '2026-10-08 20:00:00 UTC+8', deadline: '2026-10-09T00:00:02Z', stage: '待审核' } })
    wrappers.push(wrapper)
    expect(wrapper.text()).toContain('2026-10-08 20:00:00')
    expect(wrapper.text()).not.toContain('UTC')
    expect(wrapper.get('[data-shipping-remaining]').text()).toBe('00:00:02')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.get('[data-shipping-remaining]').text()).toBe('00:00:01')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.get('[data-shipping-remaining]').text()).toBe('已超时')
    expect(wrapper.get('[data-shipping-remaining]').classes()).toContain('已超时')
    await wrapper.setProps({ stage: '已发货' })
    await nextTick()
    expect(wrapper.get('[data-shipping-remaining]').text()).toBe('已发货')
    expect(wrapper.get('[data-shipping-remaining]').classes()).not.toContain('已超时')
    expect(vi.getTimerCount()).toBe(0)
    await wrapper.setProps({ stage: '待发货' })
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    wrappers.splice(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
