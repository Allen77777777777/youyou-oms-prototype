import { describe, expect, it } from 'vitest'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 创建标发联动渠道样例 } from '../仓配管理/物流渠道配置'
import { 创建标发演示单 } from './标发逻辑'
import { 取得标发渠道, 取得标发出库, 取得标发准备单, 标发字段阻断, 标发时效 } from './标发字段展示'

function 场景() {
  const 来源 = JSON.parse(JSON.stringify(共享订单.value.find(row => row.systemOrderNo === 'OMS-DEMO-CF-01'))) as typeof 共享订单.value[number]
  const 单 = 创建标发演示单([来源])[0]!
  const 渠道 = 创建标发联动渠道样例()
  const 执行 = JSON.parse(JSON.stringify(仓库执行记录.value.filter(row => row.履约单号 === 单.fulfillmentNo))) as typeof 仓库执行记录.value
  return { 来源, 单, 渠道, 执行 }
}

describe('标发渠道与实际出库展示契约', () => {
  it('物流商单号独立读取，空值不补，且不替换实际提交跟踪号', () => {
    const { 来源, 单, 渠道, 执行 } = 场景()
    执行[0]!.externalLogisticsOrderNo = 'LOGISTICS-ONLY'
    expect(取得标发出库(单, 执行)?.externalLogisticsOrderNo).toBe('LOGISTICS-ONLY')
    expect(取得标发准备单(单, 来源, 渠道).tracking).toBe(来源.fulfillmentOrders[0]!.trackingNumber)
    delete 执行[0]!.externalLogisticsOrderNo
    expect(取得标发出库(单, 执行)?.externalLogisticsOrderNo).toBeUndefined()
    expect(取得标发出库(单, [...执行, ...执行])).toBeUndefined()
    expect(标发字段阻断(单, 来源, 渠道, 执行)).toEqual([])
  })
  it('首次准备读取准确渠道的本平台映射和仓库跟踪号，不改写业务单', () => {
    const { 来源, 单, 渠道 } = 场景(), before = JSON.stringify(单)
    expect(取得标发准备单(单, 来源, 渠道).carrier).toBe('FedEx')
    expect(取得标发准备单(单, 来源, 渠道).tracking).toBe(来源.fulfillmentOrders[0]!.trackingNumber)
    渠道[1]!.shipmentMappings[0]!.carrierCode = 'DEMO-NEW-CARRIER'
    expect(取得标发准备单(单, 来源, 渠道).carrier).toBe('DEMO-NEW-CARRIER')
    expect(JSON.stringify(单)).toBe(before)
  })
  it('空本平台映射不借其他平台值，缺失渠道 ID 不按名称或代码猜关联', () => {
    const { 来源, 单, 渠道 } = 场景()
    渠道[1]!.shipmentMappings[0]!.carrierCode = ''
    渠道[1]!.shipmentMappings[1]!.carrierCode = 'TEMU-ONLY'
    expect(取得标发渠道(单, 来源, 渠道).error).toContain('承运商未配置')
    expect(取得标发准备单(单, 来源, 渠道).carrier).toBe('')
    delete 来源.fulfillmentOrders[0]!.route.shippingChannelId
    expect(取得标发渠道(单, 来源, 渠道).channel).toBeUndefined()
  })
  it('重复渠道身份、执行仓库不一致、错误来源不选第一条', () => {
    const { 来源, 单, 渠道 } = 场景()
    expect(取得标发渠道(单, 来源, [...渠道, 渠道[1]!]).channel).toBeUndefined()
    渠道[1]!.warehouse = '其他仓库'
    expect(取得标发渠道(单, 来源, 渠道).error).toContain('不一致')
    来源.systemOrderNo = 'OTHER-ORDER'
    expect(取得标发渠道(单, 来源, 渠道).channel).toBeUndefined()
  })
  it('已有提交保留载荷，当前映射变化要求核查，查询不读取准备值', () => {
    const { 来源, 单, 渠道, 执行 } = 场景()
    单.status = '标发失败'; 单.carrier = 'FedEx'; 单.attempts.push({ time: 单.shippedAt, action: '提交', result: '失败', evidence: '原请求' })
    const before = JSON.stringify(单)
    渠道[1]!.shipmentMappings[0]!.carrierCode = 'NEW-CARRIER'
    expect(取得标发准备单(单, 来源, 渠道).carrier).toBe('FedEx')
    expect(标发字段阻断(单, 来源, 渠道, 执行)).toContain('当前渠道承运商与原提交快照不同，请先核查实际发运及历史请求')
    expect(JSON.stringify(单)).toBe(before)
  })
  it('出库同时按业务单号、履约和来源关联，重复或其他来源不取首条', () => {
    const { 单, 执行 } = 场景()
    expect(取得标发出库(单, 执行)?.状态).toBe('已出库')
    expect(取得标发出库(单, [...执行, ...执行])).toBeUndefined()
    执行[0]!.订单号 = ['OTHER-ORDER']
    expect(取得标发出库(单, 执行)).toBeUndefined()
    delete 单.outboundNo
    expect(取得标发出库(单, 执行)).toBeUndefined()
    const { 来源, 渠道 } = 场景()
    expect(标发字段阻断(单, 来源, 渠道, 执行)).toContain('缺少本次出库单关联，请先核查有效出库依据')
  })
  it('合单出库数量展示整张单，不把总量或跟踪号套作当前来源行事实', () => {
    const { 来源, 单, 执行, 渠道 } = 场景()
    执行[0]!.订单号.push('OTHER-SOURCE'); 执行[0]!.出库事实!.planned = 8; 执行[0]!.出库事实!.shipped = 8
    expect(取得标发出库(单, 执行)?.出库事实?.shipped).toBe(8)
    expect(单.quantity).toBe(1)
    expect(标发字段阻断(单, 来源, 渠道, 执行)).toEqual([])
  })
  it('状态待核查、实发缺失及跟踪号矛盾均阻断，等价时区不误判', () => {
    const { 来源, 单, 执行, 渠道 } = 场景()
    执行[0]!.出库事实!.shippedAt = '2026-09-12T01:30:00Z'
    expect(标发字段阻断(单, 来源, 渠道, 执行)).toEqual([])
    执行[0]!.待核查 = true
    expect(标发字段阻断(单, 来源, 渠道, 执行).join()).toContain('关联出库事实缺失或待核查')
    执行[0]!.待核查 = false; 执行[0]!.出库事实!.shipped = null
    expect(标发字段阻断(单, 来源, 渠道, 执行).join()).toContain('关联出库事实缺失或待核查')
    执行[0]!.出库事实!.tracking = 'OTHER-PARCEL'
    expect(标发字段阻断(单, 来源, 渠道, 执行).join()).toContain('与关联出库事实不同')
  })
})

describe('标发工作台发货时效', () => {
  it('来源 OMS 已发货但标发未完成仍倒计时，到期显示超时而不改变状态', () => {
    const { 单, 来源 } = 场景()
    const deadline = '2026-10-10T12:00:00Z', now = Date.parse('2026-10-10T11:59:58Z')
    expect(来源.processingStatus).toBe('已发货')
    for (const status of ['待标发', '标发中', '标发失败'] as const) {
      单.status = status
      expect(标发时效(单, deadline, now)).toEqual({ kind: 'remaining', text: '00:00:02' })
      expect(标发时效(单, deadline, now + 2000)).toEqual({ kind: 'overdue', text: '已超时' })
      expect(单.status).toBe(status)
    }
  })
  it('成功和无需标发终态停止，缺失或无时区时间不推算', () => {
    const { 单 } = 场景()
    expect(标发时效(单, undefined, Date.now()).text).toBe('—')
    expect(标发时效(单, '2026-10-10 20:00:00', Date.now()).text).toBe('时间待核实')
    单.status = '标发成功'; expect(标发时效(单, undefined, Date.now()).text).toBe('标发已完成')
    单.status = '无需标发'; expect(标发时效(单, undefined, Date.now()).text).toBe('无需标发')
  })
})
