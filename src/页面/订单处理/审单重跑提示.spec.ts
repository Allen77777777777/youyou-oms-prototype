import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import Hint from './审单重跑提示.vue'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 保存审单执行设置, 共享审单执行设置 } from '../业务配置/规则执行设置'

const 原设置 = { ...共享审单执行设置.value }
afterEach(() => { 保存审单执行设置(原设置) })
const 创建 = () => ({
  fulfillmentMode: '自配送', processingStatus: '异常', reviewExceptionCode: 'NO_REVIEW_RULE_MATCH',
  reviewRetry: { firstCompletedAt: '2026-11-06T01:00:00.000Z', dailyDate: '2026-11-06', dailyCount: 1, totalCount: 1 },
}) as 全渠道订单

describe('订单重跑只读提示', () => {
  it('到期保持订单原状态和历史，并明确人工处理及北京时间', () => {
    保存审单执行设置({ ...原设置, retryDays: 1, enabled: true })
    const order = 创建(); const before = JSON.stringify(order)
    const wrapper = mount(Hint, { props: { order, now: Date.parse('2026-11-07T01:00:00Z') } })
    expect(wrapper.attributes('data-retry-status')).toBe('已到期')
    expect(wrapper.text()).toContain('待人工处理')
    expect(wrapper.text()).toContain('2026-11-07 09:00:00（北京时间）')
    expect(JSON.stringify(order)).toBe(before)
    wrapper.unmount()
  })
  it('每日限额次日恢复展示，关闭定时不冒称正在执行', async () => {
    保存审单执行设置({ ...原设置, dailyRetryLimit: 1, retryDays: 3, enabled: true })
    const wrapper = mount(Hint, { props: { order: 创建(), now: Date.parse('2026-11-06T15:59:00Z') } })
    expect(wrapper.text()).toContain('次日继续')
    await wrapper.setProps({ now: Date.parse('2026-11-06T16:00:00Z') })
    expect(wrapper.text()).toContain('今日自动重跑 0 / 1 次')
    保存审单执行设置({ ...共享审单执行设置.value, enabled: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('自动审单未开启')
    wrapper.unmount()
  })
  it('其他异常不展示可重跑提示', () => {
    const order = 创建(); delete order.reviewExceptionCode
    const wrapper = mount(Hint, { props: { order, now: Date.parse('2026-11-06T02:00:00Z') } })
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })
})
