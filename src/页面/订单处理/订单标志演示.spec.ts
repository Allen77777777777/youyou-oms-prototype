import { describe, expect, it } from 'vitest'
import { 共享订单, 审核阻断原因 } from './演示会话'
import { 订单标志演示证据 } from './订单标志演示'
import { 计算订单标志 } from './订单标志模型'

describe('订单标志演示场景与既有履约边界', () => {
  it('八个虚构订单具有独立身份，展示零个、一个及两个标志，读取不改订单事实', () => {
    const 订单们 = 共享订单.value.filter(订单 => 订单.storeId === 'demo-ebay-flags')
    const 快照 = JSON.stringify(订单们)
    expect(订单们).toHaveLength(8)
    expect(new Set(订单们.map(订单 => 订单.systemOrderNo)).size).toBe(8)
    expect(new Set(订单们.map(订单 => 订单.platformOrderId)).size).toBe(8)
    expect(订单们.map(订单 => 计算订单标志(订单, 订单标志演示证据).map(标志 => 标志.text).join(''))).toEqual(['言', '信', '信言', '', '退言', '消信', '消', '退消'])
    expect(JSON.stringify(订单们)).toBe(快照)
  })

  it('退款取消固定异常不能审核，取消中无最终取消事实，已发货终态仍有足量出库', () => {
    const 订单们 = 共享订单.value.filter(订单 => 订单.storeId === 'demo-ebay-flags')
    for (const 订单 of 订单们.filter(订单 => 订单.processingStatus === '异常')) expect(审核阻断原因(订单).length).toBeGreaterThan(0)
    const 取消中 = 订单们.find(订单 => 订单.systemOrderNo.endsWith('06'))!
    expect(取消中.cancelledAt).toBeUndefined()
    expect(取消中.cancelledReason).toBeUndefined()
    const 已发货 = 订单们.find(订单 => 订单.systemOrderNo.endsWith('08'))!
    expect(已发货.processingStatus).toBe('已发货')
    expect(已发货.fulfillmentOrders[0]).toMatchObject({ isActive: true, status: '已发货', plannedQuantity: 1, shippedQuantity: 1 })
    expect(计算订单标志(已发货, 订单标志演示证据).map(标志 => 标志.code)).toEqual(['REFUND', 'CANCEL'])
    expect(已发货.processingStatus).toBe('已发货')
  })
})
