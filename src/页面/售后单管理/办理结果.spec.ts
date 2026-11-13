import { afterEach, describe, expect, it } from 'vitest'
import type { AfterSaleRecord } from './会话'
import { activeAfterSaleActor, afterSaleActors } from './权限'
import { 共享订单 } from '../订单处理/演示会话'
import { afterSaleResultPresentation, resolveAfterSaleReshipOrder } from './办理结果'

const sample = (overrides: Partial<AfterSaleRecord> = {}): AfterSaleRecord => ({
  no: 'SH-DEMO-RESULT', requestId: 'DEMO-RESULT', platform: 'eBay', source: '本地办理', shopId: 'shop-us', shopName: '演示店铺',
  returnId: 'DEMO-RETURN', orderNo: 'DEMO-ORDER', systemOrderNo: 'OMS-DEMO-RESULT', kind: '部分退款',
  approval: null, createdBy: '客服01', createdAt: '2026-11-13T00:00:00Z', items: [], executionResult: '', ...overrides,
})
afterEach(() => { activeAfterSaleActor.value = afterSaleActors[0]! })

describe('售后单本次办理结果展示', () => {
  it('已知原文明确分组，金额为空不推断失败，未知结果保留原文', () => {
    for (const [text, group] of Object.entries({
      平台提交失败: '失败', 平台结果待核实: '待核查', 买家已拒绝报价: '买家拒绝',
      '已报价，等待买家决定': '等待买家决定', 退款处理中: '处理中', 平台退款成功: '已确认',
    })) expect(afterSaleResultPresentation(sample({ executionResult: text }))).toMatchObject({ text, group })
    expect(afterSaleResultPresentation(sample({ executionResult: '来源新增结果' }))).toMatchObject({ text: '来源新增结果', group: '其他' })
    expect(afterSaleResultPresentation(sample({ executionResult: '未提交：资格已变化' }))).toMatchObject({ group: '失败' })
    expect(afterSaleResultPresentation(sample({ executionResult: '平台结果待核实', actualAmount: { value: '1.00', currency: 'USD' } }))).toMatchObject({ group: '待核查' })
  })

  it('重发随关联OMS执行进度显示，保留原审核登记事实且不把不发货当已完成', () => {
    const record = sample({ kind: '重发', approval: '已审核', manualOrderNo: 'MANUAL-DEMO-RESULT', executionResult: '已创建手工订单' })
    const order = { ...共享订单.value[0]!, systemOrderNo: record.manualOrderNo!, storeId: record.shopId,
      manualOrder: { scenario: '售后补寄' as const, originalOrderNo: record.systemOrderNo, afterSaleNo: record.no, requestId: record.requestId, reason: '演示重发', paidConfirmed: false } }
    for (const [status, group] of Object.entries({ 待审核: '处理中', 待推单: '处理中', 待发货: '处理中', 已发货: '已确认', 异常: '待核查', 不发货: '已停止' })) {
      order.processingStatus = status as typeof order.processingStatus
      expect(resolveAfterSaleReshipOrder(record, [order])).toBe(order)
      expect(afterSaleResultPresentation(record, [order])).toMatchObject({ text: '重发' + status, group })
      expect(record.executionResult).toBe('已创建手工订单')
    }
    expect(afterSaleResultPresentation(record, [])).toMatchObject({ group: '待核查' })
    expect(resolveAfterSaleReshipOrder(record, [])).toBeUndefined()
    expect(afterSaleResultPresentation(record, [order, order])).toMatchObject({ group: '待核查' })
    expect(resolveAfterSaleReshipOrder(record, [order, order])).toBeUndefined()
    order.manualOrder.afterSaleNo = 'ANOTHER-SALE'
    expect(afterSaleResultPresentation(record, [order])).toMatchObject({ group: '待核查' })
    expect(resolveAfterSaleReshipOrder(record, [order])).toBeUndefined()
    order.manualOrder.afterSaleNo = record.no
    activeAfterSaleActor.value = { ...afterSaleActors[2]!, shopIds: [] }
    expect(afterSaleResultPresentation(record, [order])).toMatchObject({ text: '重发订单关联待核查', group: '待核查' })
    expect(resolveAfterSaleReshipOrder(record, [order])).toBeUndefined()
  })
})
