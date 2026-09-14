import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 标发阻断原因, type 标发单 } from './标发逻辑'

function 场景() {
  const 订单 = structuredClone(全渠道订单模拟数据[0]!)
  订单.items = [订单.items[0]!]
  订单.processingStatus = '已发货'
  const 履约 = 订单.fulfillmentOrders[0]!
  履约.status = '已发货'; 履约.shippedQuantity = 1; 履约.shippedAt = '2026-09-12 10:00 UTC+8'
  const 单: 标发单 = { no: 'CF-TEST', orderNo: 订单.systemOrderNo, fulfillmentNo: 履约.fulfillmentOrderNo, status: '待标发', tracking: 'DEMO-TRACK', carrier: 'USPS', shippedAt: 履约.shippedAt, quantity: 1, lineId: 订单.items[0]!.externalLineId, idempotencyKey: 'TEST-V1', pendingVerification: false, reason: '', attempts: [] }
  return { 订单, 履约, 单 }
}

describe('标发门禁', () => {
  it('有效出库事实完整且没有阻断时可提交', () => { const { 单, 订单 } = 场景(); expect(标发阻断原因(单, 订单)).toEqual([]) })
  it('失败但外部结果待核查时禁止重提', () => { const { 单, 订单 } = 场景(); 单.status = '标发失败'; 单.pendingVerification = true; expect(标发阻断原因(单, 订单)).toContain('平台结果待核查，确认前禁止重提') })
  it('仅跟踪号不构成出库依据', () => { const { 单, 订单, 履约 } = 场景(); 履约.shippedQuantity = 0; expect(标发阻断原因(单, 订单)).toContain('缺少有效仓库出库事实或实际发货时间') })
  it('同一行少量提交不能绕过 eBay 整行覆盖限制', () => { const { 单, 订单 } = 场景(); 订单.items[0]!.fulfillableQuantity = 2; expect(标发阻断原因(单, 订单)).toContain('eBay 同一订单行必须以一个跟踪号覆盖该行全部应标发数量') })
  it('成功和无需标发终态均不能再次提交', () => { const { 单, 订单 } = 场景(); for (const 状态 of ['标发成功', '无需标发'] as const) { 单.status = 状态; expect(标发阻断原因(单, 订单)).toContain('当前状态不可提交') } })
  it('取消和未知平台会阻断；付款时间缺失不改变已发货及出库事实', () => { const { 单, 订单, 履约 } = 场景(); 订单.cancelledAt = '2026-09-12'; 订单.platformCode = 'Temu'; 订单.paidAt = undefined; const 原因 = 标发阻断原因(单, 订单); expect(原因).toEqual(expect.arrayContaining(['该平台标发规则与接口待接入', '订单存在已确认阻断，需核查订单上下文'])); expect(原因.join('；')).not.toContain('付款'); expect(履约.shippedQuantity).toBe(1); expect(订单.processingStatus).toBe('已发货') })
})
