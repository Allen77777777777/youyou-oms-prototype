import { describe, expect, it } from 'vitest'
import { 命中时间范围 } from '@/组件/筛选/筛选工具'
import { formatMailTime } from '@/页面/eBay站内信/模型'
import { formatReviewTime, reviewDate } from '@/页面/eBay评价/模型'
import { getAwaitingShippedDays } from '@/页面/eBay评价/未收到评价模型'
import { beijingWallTimeToISO } from '@/页面/eBay退换货申请/展示工具'
import { createCustomerServiceLog, formatCustomerServiceLogTime } from './日志工具'

describe('客服固定北京时间与 UTC 传输', () => {
  it.each(['2026-11-05T16:30:00Z', '2026-11-05T08:30:00-08:00'])('同一绝对时刻跨北京日期后，消息、评价、日志和归日一致：%s', value => {
    expect(formatMailTime(value)).toBe('11-06 00:30')
    expect(formatReviewTime(value)).toBe('2026-11-06 00:30')
    expect(formatCustomerServiceLogTime(value)).toBe('2026-11-06 00:30:00')
    expect(reviewDate(value)).toBe('2026-11-06')
    expect(命中时间范围(value, ['2026-11-06', '2026-11-06'])).toBe(true)
  })

  it('北京日期筛选包含首尾毫秒，UTC 日期不能直接代替北京日期', () => {
    const range = ['2026-11-06', '2026-11-06']
    expect(命中时间范围('2026-11-05T15:59:59.999Z', range)).toBe(false)
    expect(命中时间范围('2026-11-05T16:00:00.000Z', range)).toBe(true)
    expect(命中时间范围('2026-11-06T15:59:59.999Z', range)).toBe(true)
    expect(命中时间范围('2026-11-06T16:00:00.000Z', range)).toBe(false)
    expect(getAwaitingShippedDays({ shippedAt: '2026-11-05T15:59:00Z' }, '2026-11-05T16:01:00Z')).toBe(1)
  })

  it.each(['2026-11-06 09:30:00', '2026-11-06T09:30:00', '2026-02-30T01:00:00Z'])('缺时区及非法来源不能按浏览器环境解释：%s', value => {
    expect(formatMailTime(value)).toBe('—')
    expect(formatReviewTime(value)).toBe('时间待核实')
    expect(formatCustomerServiceLogTime(value)).toBe('时间待核实')
    expect(reviewDate(value)).toBe('')
    expect(命中时间范围(value, ['2026-11-06', '2026-11-06'])).toBe(false)
    expect(getAwaitingShippedDays({ shippedAt: value })).toBeUndefined()
  })

  it('北京时间输入换算 UTC 后回显不偏移，新日志保存 UTC', () => {
    const utc = beijingWallTimeToISO('2026-11-06T09:30')
    expect(utc).toBe('2026-11-06T01:30:00.000Z')
    expect(formatCustomerServiceLogTime(utc!)).toBe('2026-11-06 09:30:00')
    const log = createCustomerServiceLog('客服01', '保存', '已保存')
    expect(log.at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })
})
