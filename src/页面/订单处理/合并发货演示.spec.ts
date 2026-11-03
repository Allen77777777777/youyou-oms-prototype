import { describe, expect, it } from 'vitest'
import { 共享订单 } from './演示会话'
import { 人工发货操作阻断原因 } from './拆合发货模型'

const 合并样例 = () => 共享订单.value.filter(单 => 单.platformOrderNo.startsWith('DEMO-MANUAL-MERGE-'))
const 查单 = (序号: number) => 合并样例().find(单 => 单.systemOrderNo === `OMS-DEMO-MERGE-0${序号}`)!
const 上下文 = () => ({ 订单: 合并样例(), 仓库执行: [], 当前版本: () => 1, 记录操作: () => {} })
const 合并阻断 = (...序号: number[]) => 人工发货操作阻断原因(上下文(), 序号.map(号 => 查单(号).systemOrderNo), '合并发货')

describe('人工合并发货计算结果的虚构演示资料', () => {
  it('按统一平台单号前缀可找到八张独立待审核订单，保留原拆分样例', () => {
    expect(合并样例().map(单 => 单.systemOrderNo)).toEqual(Array.from({ length: 8 }, (_, 索引) => `OMS-DEMO-MERGE-0${索引 + 1}`))
    for (const 单 of 合并样例()) {
      expect(单.fulfillmentMode).toBe('自配送')
      expect(单.processingStatus).toBe('待审核')
      expect(单.fulfillmentOrders).toEqual([])
      expect(单.manualShippingPlan).toBeUndefined()
      expect(单.operationLogs[0]!.content).toContain('虚构')
      expect(单.orderedAt).toMatch(/^2026-10-21 0[89]:[0-5]\d:00 UTC\+8$/)
    }
    expect(共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-SPLIT-01')!.items.map(行 => 行.fulfillableQuantity)).toEqual([2, 1, 1])
    expect(共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-SPLIT-02')!.items.map(行 => 行.fulfillableQuantity)).toEqual([10, 11, 12, 13])
  })

  it('前两张及第四第五张分别可合并，两组买家不同', () => {
    expect(合并阻断(1, 2)).toEqual([])
    expect(合并阻断(4, 5)).toEqual([])
    expect(查单(1).buyerExternalId).not.toBe(查单(4).buyerExternalId)
    expect(合并阻断(1, 4).join('；')).toContain('买家身份')
  })

  it('其余四张覆盖无匹配、同买家地址不同、缺买家及SKU缺失', () => {
    expect(查单(3).buyerExternalId).toBe('DEMO-OTHER-BUYER')
    expect(合并阻断(1, 3).join('；')).toContain('买家身份')
    expect(查单(6).buyerExternalId).toBe(查单(1).buyerExternalId)
    expect(查单(6).address.addressLine1).not.toBe(查单(1).address.addressLine1)
    expect(合并阻断(1, 6).join('；')).toContain('地址')
    expect(合并阻断(1, 7).join('；')).toContain('买家身份')
    expect(合并阻断(1, 8).join('；')).toContain('SKU 映射')
  })
})
