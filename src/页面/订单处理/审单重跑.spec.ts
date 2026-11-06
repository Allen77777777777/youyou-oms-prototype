import { describe, expect, it } from 'vitest'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 读取审单重跑状态, 记录已完成审单 } from './审单重跑'

const 设置 = { dailyRetryLimit: 2, retryDays: 3 }
const 创建 = () => ({ fulfillmentMode: '自配送', processingStatus: '待审核', orderType: '平台订单' }) as 全渠道订单
const 起点 = Date.parse('2026-11-06T15:00:00Z') // 北京 23:00。

describe('单订单审单重跑额度', () => {
  it('首次完成不计次数，异常与待审核共用额度；北京跨日只清当日次数', () => {
    const 单 = 创建()
    记录已完成审单(单, '定时执行', 起点)
    expect(单.reviewRetry).toEqual({ firstCompletedAt: '2026-11-06T15:00:00.000Z', dailyDate: '2026-11-06', dailyCount: 0, totalCount: 0 })
    记录已完成审单(单, '定时执行', 起点 + 1)
    单.processingStatus = '异常'; 单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
    记录已完成审单(单, '定时执行', 起点 + 2)
    expect(读取审单重跑状态(单, 设置, 起点 + 3).状态).toBe('今日已达上限')
    const 次日 = Date.parse('2026-11-06T16:00:00Z')
    expect(读取审单重跑状态(单, 设置, 次日)).toMatchObject({ 状态: '可重跑', 今日次数: 0 })
    记录已完成审单(单, '定时执行', 次日)
    expect(单.reviewRetry).toMatchObject({ firstCompletedAt: '2026-11-06T15:00:00.000Z', dailyDate: '2026-11-07', dailyCount: 1, totalCount: 3 })
  })

  it('期限按首次完成满24小时计算，精确到期停止；人工执行及改配置不重置起点', () => {
    const 单 = 创建()
    记录已完成审单(单, '新单首轮', 起点)
    记录已完成审单(单, '立即执行', 起点 + 3 * 86_400_000)
    expect(单.reviewRetry?.dailyCount).toBe(0)
    expect(读取审单重跑状态(单, 设置, 起点 + 3 * 86_400_000 - 1).状态).toBe('可重跑')
    expect(读取审单重跑状态(单, 设置, 起点 + 3 * 86_400_000).状态).toBe('已到期')
    expect(读取审单重跑状态(单, { ...设置, retryDays: 5 }, 起点 + 3 * 86_400_000)).toMatchObject({ 状态: '可重跑', 截止时间: '2026-11-11T15:00:00.000Z' })
    expect(单.reviewRetry?.firstCompletedAt).toBe('2026-11-06T15:00:00.000Z')
  })

  it('无起点记录不推造历史，其他状态与强制人工来源退出，损坏计数阻断', () => {
    const 单 = 创建()
    expect(读取审单重跑状态(单, 设置, 起点).状态).toBe('未开始')
    单.processingStatus = '异常'
    expect(读取审单重跑状态(单, 设置, 起点).状态).toBe('已退出')
    单.processingStatus = '待推单'
    expect(读取审单重跑状态(单, 设置, 起点).状态).toBe('已退出')
    单.processingStatus = '待审核'
    记录已完成审单(单, '立即执行', 起点)
    单.reviewRetry!.firstCompletedAt = '未知'
    expect(读取审单重跑状态(单, 设置, 起点).状态).toBe('待核查')
    单.orderType = '手工订单'
    单.manualOrder = { scenario: '售后补寄', afterSaleNo: 'AS-DEMO', paidConfirmed: true, reason: '', requestId: 'DEMO' }
    expect(读取审单重跑状态(单, 设置, 起点).状态).toBe('已退出')
  })
})
