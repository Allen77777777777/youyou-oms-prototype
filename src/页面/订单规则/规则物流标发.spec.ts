import { describe, expect, it } from 'vitest'
import { 创建规则样例, 试算规则 } from './规则逻辑'
import { 创建规则渠道样例, 分仓仓库键 } from './规则路由'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 履约单摘要, 订单路由 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'

function 路由(channel: 渠道配置): 订单路由 {
  return { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account,
    shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
}
function 履约(channel: 渠道配置, changes: Partial<履约单摘要> = {}): 履约单摘要 {
  return { fulfillmentOrderNo: `TEST-LOGISTICS-${channel.id}`, status: '执行中', isActive: true, route: 路由(channel),
    plannedQuantity: 1, shippedQuantity: 0, trackingNumber: 'TEST-TRACKING-001', ...changes }
}
function 准备() {
  const channels = 创建规则渠道样例().filter(channel => ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].includes(channel.id))
  const first = channels[0]!, second = channels[1]!
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.platformCode = 'eBay'; order.fulfillmentMode = '自配送'; order.processingStatus = '待发货'
  order.cancelledAt = undefined; order.blockReason = undefined; order.manualShippingPlan = undefined
  order.defaultRoute = 路由(first); order.fulfillmentOrders = [履约(first)]
  const rule = 创建规则样例().find(item => item.type === '订单标发规则')!
  rule.enabled = true; rule.action = '物流下单后标发'; rule.shippingAction = { timing: 'immediate' }
  rule.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
  return { rule, order, channels, first, second }
}

describe('物流下单后标发以有效履约真实跟踪号触发', () => {
  it.each(['待推单', '待发货', '已发货'] as const)('%s阶段取得跟踪号即可立即试算，不附加出库或OMS已发货前提且保持只读', processingStatus => {
    const { rule, order, channels } = 准备()
    order.processingStatus = processingStatus
    const before = JSON.stringify({ rule, order, channels })
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toEqual([])
    expect(order.fulfillmentOrders[0]).toMatchObject({ shippedQuantity: 0, trackingNumber: 'TEST-TRACKING-001' })
    expect(order.fulfillmentOrders[0]!.shippedAt).toBeUndefined()
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
  })

  it.each([
    { name: '缺失跟踪号', change: { trackingNumber: undefined } },
    { name: '空跟踪号', change: { trackingNumber: '' } },
    { name: '纯空白跟踪号', change: { trackingNumber: ' \t ' } },
    { name: '非字符串跟踪号', change: { trackingNumber: 123 } },
    { name: '失效历史履约', change: { isActive: false } },
    { name: '已终止履约', change: { status: '已终止' } },
  ])('$name不能被当作已取得有效跟踪号', ({ change }) => {
    const { rule, order, channels } = 准备()
    Object.assign(order.fulfillmentOrders[0]!, change)
    const before = JSON.stringify({ rule, order })
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toContain('未取得本次有效履约的跟踪号，不得标发')
    expect(JSON.stringify({ rule, order })).toBe(before)
  })

  it('已出库和OMS已发货也不能代替物流触发所必需的跟踪号', () => {
    const { rule, order, channels } = 准备()
    order.processingStatus = '已发货'
    Object.assign(order.fulfillmentOrders[0]!, { status: '已发货', shippedQuantity: 1, shippedAt: '2026-10-22T01:00:00Z', trackingNumber: undefined })
    expect(试算规则([rule], order, '订单标发规则', channels).gates).toContain('未取得本次有效履约的跟踪号，不得标发')
  })

  it('延迟标发缺少跟踪号获取时间时保留门禁，不拿出库时间或查询时刻代填', () => {
    const { rule, order, channels } = 准备()
    rule.shippingAction = { timing: 'delay', delayHours: '2' }
    order.processingStatus = '已发货'
    Object.assign(order.fulfillmentOrders[0]!, { status: '已发货', shippedQuantity: 1, shippedAt: '2026-10-22T01:00:00Z' })
    const before = JSON.stringify({ rule, order })
    expect(试算规则([rule], order, '订单标发规则', channels).gates).toEqual(['未取得跟踪号获取时间，无法确定延迟标发计划'])
    expect(JSON.stringify({ rule, order })).toBe(before)
  })

  it('提前标发仍缺独立平台截止时间，已有最晚发货时间不能作为替代', () => {
    const { rule, order, channels } = 准备()
    rule.shippingAction = { timing: 'beforeDeadline', beforeDeadlineHours: '3' }
    order.shipByAt = '2026-10-23 12:00:00 UTC+8'
    const before = JSON.stringify({ rule, order })
    expect(试算规则([rule], order, '订单标发规则', channels).gates).toEqual(['未取得平台最晚标发时间，无法确定提前标发计划'])
    expect(JSON.stringify({ rule, order })).toBe(before)
  })

  it.each<{ name: string; change: Partial<全渠道订单>; gate: string }>([
    { name: '其他平台', change: { platformCode: 'Temu' }, gate: '该平台接入与动作门禁尚未验证' },
    { name: '平台履约', change: { fulfillmentMode: '平台履约' }, gate: '平台履约订单不进入自配送作业' },
    { name: '尚未进入处理', change: { processingStatus: undefined }, gate: '订单尚未进入 OMS 处理' },
    { name: '异常订单', change: { processingStatus: '异常' }, gate: '订单存在终止或异常门禁' },
    { name: '不发货订单', change: { processingStatus: '不发货' }, gate: '订单存在终止或异常门禁' },
    { name: '平台最终取消', change: { cancelledAt: '2026-10-22T01:00:00Z' }, gate: '订单存在终止或异常门禁' },
    { name: '其他发货条件拦截', change: { blockReason: 'TEST-发货条件未满足' }, gate: '订单存在终止或异常门禁' },
  ])('有跟踪号也保留$name门禁', ({ change, gate }) => {
    const { rule, order, channels } = 准备()
    Object.assign(order, change)
    rule.conditions[0]!.value = order.platformCode
    const before = JSON.stringify({ rule, order, channels })
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toContain(gate)
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
  })

  it('发货仓库条件只匹配有号有效履约，不借默认仓、无号履约或有号历史仓', () => {
    const { rule, order, channels, first, second } = 准备()
    order.fulfillmentOrders = [履约(first, { trackingNumber: undefined }), 履约(first, { isActive: false }), 履约(second)]
    rule.conditions = [{ field: 'shippingWarehouse', operator: '等于', value: '', values: [分仓仓库键(second)] }]
    const before = JSON.stringify({ rule, order, channels })
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toEqual([])
    expect(result.unknownFields).toEqual([])
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
    rule.conditions[0]!.values = [分仓仓库键(first)]
    expect(试算规则([rule], order, '订单标发规则', channels).hit).toBeUndefined()
    order.fulfillmentOrders = order.fulfillmentOrders.slice(0, 2)
    rule.conditions[0]!.operator = '不等于'
    const unknown = 试算规则([rule], order, '订单标发规则', channels)
    expect(unknown.hit).toBeUndefined()
    expect(unknown.unknownFields).toContain('发货仓库')
  })

  it.each(['仓库发货完成后标发', '无需标发'])('新物流触发不放宽%s原有出库与OMS阶段前提', action => {
    const { rule, order, channels } = 准备()
    rule.action = action
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toContain('来源 OMS 订单尚未已发货，不得生成或调度标发')
    expect(result.gates).toContain('未取得有效出库事实，不得标发')
  })
})
