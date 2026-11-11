import { expect, it } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { applyReturnFull } from '../eBay退换货申请/接口契约'
import { 共享订单 } from '../订单处理/演示会话'
import { getCancelHandlerIds, refreshCancelWithHandlers } from '../eBay取消订单申请/处理人'
import { createCancellations, submitCancellation } from '../eBay取消订单申请/模型'
import { createReturnData } from '../eBay退换货申请/数据'
import { initializeReturnDemoContext } from '../eBay退换货申请/关联资料'
import { getReturnHandlerIds } from '../eBay退换货申请/处理人'
import { initializeDisputeContext } from './客服关联'
import { getDisputeHandlerIds } from './处理人'
import { disputeRecords } from './模型'

it('整单取消合并多人的 SKU，关闭时固定人员，此后来源资料缺失仍可查历史', () => {
  const rows = createCancellations()
  const multi = rows[15]!
  expect(getCancelHandlerIds(multi)).toEqual(['staff-01', 'staff-02'])
  expect(getCancelHandlerIds(rows[7]!)).toEqual([])
  const row = rows[0]!
  expect(submitCancellation(row, 'reject', '确认继续履约', '2026-10-29T02:00:00Z').ok).toBe(true)
  refreshCancelWithHandlers(row)
  expect(row.closedHandlerIds).toEqual(['staff-01'])
  row.systemOrderNo = undefined
  expect(getCancelHandlerIds(row)).toEqual(['staff-01'])
})

it('同一 UK 订单取消归两人、单行退货归一人，首次只读查询和进原单后的归属一致', () => {
  const cancel = createCancellations()[10]!, application = createReturnData()[1]!
  expect([cancel.systemOrderNo, cancel.orderId, cancel.shopId, cancel.buyer]).toEqual([application.systemOrderNo, application.orderNo, application.shopId, application.buyerId])
  const before = 共享订单.value.length
  expect(getCancelHandlerIds(cancel)).toEqual(['staff-01', 'staff-02'])
  expect(getReturnHandlerIds(application)).toEqual(['staff-02'])
  expect(共享订单.value).toHaveLength(before)
  initializeReturnDemoContext(cancel.systemOrderNo)
  expect(getReturnHandlerIds(application)).toEqual(['staff-02'])
  expect(getCancelHandlerIds(cancel)).toEqual(['staff-01', 'staff-02'])
})

it('共同处理人共用一次取消结果，切换人员不会覆盖原提交人或重复受理', () => {
  const cancel = createCancellations()[10]!, now = '2026-11-09T02:00:00Z'
  const original = currentHandlerId.value
  try {
    currentHandlerId.value = 'staff-02'
    expect(submitCancellation(cancel, 'reject', '订单已发货', now).ok).toBe(true)
    currentHandlerId.value = 'staff-01'
    expect(submitCancellation(cancel, 'reject', '复核同一申请', now).ok).toBe(false)
    refreshCancelWithHandlers(cancel, now)
    expect(cancel.lastSubmission?.operator).toBe('客服02')
    expect(cancel.cancelState).toBe('CLOSED')
    expect(cancel.closedHandlerIds).toEqual(['staff-01', 'staff-02'])
  } finally { currentHandlerId.value = original }
})

it('退货归属只取本次匹配行，交易身份失配后不采用商品卡仍可见的 SKU', () => {
  initializeReturnDemoContext()
  const row = createReturnData()[0]!
  expect(getReturnHandlerIds(row)).toEqual(['staff-01'])
  const { itemId, transactionId } = row.detail!
  expect(() => applyReturnFull(row, { detail: { itemDetail: { itemId, transactionId: 'another-transaction' } } })).toThrow('交易身份冲突')
  expect(row.sku).toBe('HOME-RACK-01')
  expect(getReturnHandlerIds(row)).toEqual([])
  applyReturnFull(row, { detail: { itemDetail: { itemId, transactionId } } })
  expect(getReturnHandlerIds(row)).toEqual(['staff-01'])
})

it('支付争议仅涉及订单前两行，同订单第三位员工不归入本案', () => {
  const row = disputeRecords.value.find(item => item.id === 'DEMO-PD-113')!
  const before = 共享订单.value.length
  expect(getDisputeHandlerIds(row)).toEqual(['staff-01', 'staff-02'])
  expect(共享订单.value).toHaveLength(before)
  initializeDisputeContext(row, 'order')
  expect(getDisputeHandlerIds(row)).toEqual(['staff-01', 'staff-02'])
  expect(row.owner).toBe('卖家')
})
