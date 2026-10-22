import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由, 履约单摘要 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 创建规则样例, 命中规则, 校验规则配置, 试算规则 } from './规则逻辑'
import { 创建规则渠道样例, 分仓仓库键 } from './规则路由'
import { 创建发货仓库选项, 读取发货仓库来源 } from './规则仓库条件'

function 路由(channel: 渠道配置): 订单路由 {
  return { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account,
    shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
}
function 履约(route: 订单路由, changes: Partial<履约单摘要> = {}): 履约单摘要 {
  return { fulfillmentOrderNo: `DEMO-FULFILLMENT-${route.shippingChannelId}`, isActive: true, status: '已发货', route,
    plannedQuantity: 1, shippedQuantity: 1, shippedAt: '2026-10-22T01:00:00Z', ...changes }
}
function 准备() {
  const channels = 创建规则渠道样例().filter(项 => ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].includes(项.id))
  const first = channels[0]!, second = channels[1]!
  channels.push({ ...first, id: 'DEMO-CONDITION-OTHER-ACCOUNT', accountId: 'DEMO-OTHER-ACCOUNT', account: first.account, enabled: false, labelMode: '仓配分离' })
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.processingStatus = '待审核'; order.defaultRoute = 路由(first); order.fulfillmentOrders = []; order.manualShippingPlan = undefined
  const rule = structuredClone(创建规则样例()[0]!)
  rule.conditions = [{ field: 'shippingWarehouse', operator: '等于', value: '', values: [分仓仓库键(first)] }]
  return { rule, order, channels, first, second, other: channels[2]! }
}
function 设置人工方案(order: 全渠道订单, routes: 订单路由[]) {
  order.manualShippingPlan = { id: 'DEMO-CONDITION-PLAN', kind: '拆分发货', orderNos: [order.systemOrderNo], reason: '', updatedAt: '2026-10-22T01:00:00Z',
    packages: routes.map((route, index) => ({ key: `DEMO-PACKAGE-${index}`, route, items: [{ orderNo: order.systemOrderNo, externalLineId: order.items[0]!.externalLineId, quantity: 1 }] })) }
}

describe('发货仓库条件使用稳定仓库身份而非展示名称', () => {
  it('选项复用所有已识别渠道，停用与仓配分离仍保留；同仓多渠道按三元组去重', () => {
    const { channels, first, other } = 准备()
    channels.push({ ...first, id: 'DEMO-CONDITION-SECOND-CHANNEL', warehouse: '修改后的仓库名称', name: '另一渠道' })
    const options = 创建发货仓库选项(channels)
    expect(options).toHaveLength(3)
    expect(options.some(项 => 项.value === 分仓仓库键(other))).toBe(true)
    expect(options.find(项 => 项.value === 分仓仓库键(first))!.label).toContain(first.warehouse)
    const invalid = { ...first, id: 'DEMO-INVALID-CHANNEL', accountId: '' }
    expect(创建发货仓库选项([invalid])).toEqual([])
  })
  it('等于任一所选仓，不等于排除全部所选仓，多值不按名称包含判断', () => {
    const { rule, order, channels, first, second, other } = 准备()
    order.fulfillmentOrders = [履约(路由(first)), 履约(路由(second))]
    rule.conditions[0]!.values = [分仓仓库键(other), 分仓仓库键(second)]
    expect(命中规则(rule, order, channels)).toBe(true)
    rule.conditions[0]!.operator = '不等于'
    expect(命中规则(rule, order, channels)).toBe(false)
    rule.conditions[0]!.values = [分仓仓库键(other)]
    expect(命中规则(rule, order, channels)).toBe(true)
    rule.conditions[0]!.operator = '等于'
    expect(命中规则(rule, order, channels)).toBe(false)
  })
  it('同名仓库跨账号分别匹配，字典显示名变化不改变身份', () => {
    const { rule, order, channels, first, other } = 准备()
    expect(first.warehouse).toBe(other.warehouse)
    expect(first.account).toBe(other.account)
    order.defaultRoute = 路由(other)
    expect(命中规则(rule, order, channels)).toBe(false)
    rule.conditions[0]!.values = [分仓仓库键(other)]
    expect(命中规则(rule, order, channels)).toBe(true)
    other.warehouse = '新展示名'; other.account = '新账号显示名'; other.provider = '新服务商显示名'
    expect(命中规则(rule, order, channels)).toBe(true)
  })
  it('同仓不同渠道聚合为一个仓库，使用同名同渠道的不同账号时仍不折叠', () => {
    const { order, channels, first, other } = 准备()
    const secondChannel = { ...first, id: 'DEMO-CONDITION-SAME-WAREHOUSE' }; channels.push(secondChannel)
    order.fulfillmentOrders = [履约(路由(first)), 履约(路由(secondChannel)), 履约(路由(other))]
    expect(读取发货仓库来源(order, '审单规则', channels)).toEqual([分仓仓库键(first), 分仓仓库键(other)])
  })
  it('审单依次使用有效履约、当前人工方案、默认路由；失效历史不参加', () => {
    const { order, channels, first, second, other } = 准备()
    expect(读取发货仓库来源(order, '审单规则', channels)).toEqual([分仓仓库键(first)])
    设置人工方案(order, [路由(second)])
    expect(读取发货仓库来源(order, '审单规则', channels)).toEqual([分仓仓库键(second)])
    order.fulfillmentOrders = [履约(路由(other)), 履约(路由(first), { isActive: false, status: '已终止' })]
    expect(读取发货仓库来源(order, '审单规则', channels)).toEqual([分仓仓库键(other)])
  })
  it('已有有效履约或人工方案未识别时整体未知，不借较低优先级默认仓补齐', () => {
    const { rule, order, channels, first, second } = 准备()
    const missing = { ...路由(second), shippingChannelId: undefined }
    设置人工方案(order, [missing])
    expect(读取发货仓库来源(order, '审单规则', channels)).toBeUndefined()
    order.fulfillmentOrders = [履约(路由(first)), 履约(missing)]
    expect(读取发货仓库来源(order, '审单规则', channels)).toBeUndefined()
    rule.conditions[0]!.operator = '不等于'
    const result = 试算规则([rule], order, '审单规则', channels)
    expect(result.hit).toBeUndefined(); expect(result.unknownFields).toContain('发货仓库')
    order.fulfillmentOrders = []; 设置人工方案(order, [])
    expect(读取发货仓库来源(order, '审单规则', channels)).toBeUndefined()
  })
  it.each(['无路由', '无渠道ID', '未知渠道', '渠道ID重复', '账号身份空白'])('%s时等于和不等于均不能命中', scenario => {
    const { rule, order, channels, first } = 准备()
    if (scenario === '无路由') order.defaultRoute = undefined
    if (scenario === '无渠道ID') delete order.defaultRoute!.shippingChannelId
    if (scenario === '未知渠道') order.defaultRoute!.shippingChannelId = 'UNKNOWN'
    if (scenario === '渠道ID重复') channels.push({ ...first })
    if (scenario === '账号身份空白') first.accountId = ' '
    for (const operator of ['等于', '不等于'] as const) {
      rule.conditions[0]!.operator = operator
      expect(命中规则(rule, order, channels)).toBe(false)
      expect(试算规则([rule], order, '审单规则', channels).unknownFields).toContain('发货仓库')
    }
  })
  it('伪造展示名或不存在的仓库值不能利用否定条件放行，也不能保存', () => {
    const { rule, order, channels } = 准备()
    rule.conditions[0]!.values = ['万邑通美西仓']; rule.conditions[0]!.operator = '不等于'
    expect(校验规则配置(rule, [rule], channels)).not.toBe('')
    expect(命中规则(rule, order, channels)).toBe(false)
  })
  it('分仓规则即使伪造此条件也不能保存或命中', () => {
    const { rule, order, channels } = 准备(), routing = structuredClone(创建规则样例()[1]!)
    routing.conditions = structuredClone(rule.conditions)
    expect(校验规则配置(routing, [routing], channels)).toContain('仅适用于审单规则和订单标发规则')
    expect(命中规则(routing, order, channels)).toBe(false)
    expect(试算规则([routing], order, '分仓规则', channels).hit).toBeUndefined()
  })
  it('标发只使用有效且有可靠实发量和时间的履约；不使用默认仓或人工待发方案', () => {
    const { rule, order, channels, first, second, other } = 准备()
    rule.type = '订单标发规则'; rule.action = '仓库发货完成后标发'; rule.shippingAction = { timing: 'immediate' }; order.processingStatus = '已发货'
    设置人工方案(order, [路由(first)])
    order.fulfillmentOrders = [履约(路由(second)), 履约(路由(first), { shippedQuantity: 0 }), 履约(路由(other), { isActive: false, status: '已终止' })]
    expect(读取发货仓库来源(order, '订单标发规则', channels)).toEqual([分仓仓库键(second)])
    rule.conditions[0]!.values = [分仓仓库键(second)]
    expect(命中规则(rule, order, channels)).toBe(true)
    expect(试算规则([rule], order, '订单标发规则', channels).gates).toEqual([])
  })
  it.each([{ shippedQuantity: 0 }, { shippedAt: undefined }, { shippedAt: '无可靠时间' }, { isActive: false, status: '已终止' } ] as Partial<履约单摘要>[])('标发无可信实际来源%s时否定条件也保持未知', change => {
    const { rule, order, channels, first } = 准备()
    rule.type = '订单标发规则'; rule.action = '仓库发货完成后标发'; rule.shippingAction = { timing: 'immediate' }; rule.conditions[0]!.operator = '不等于'
    order.processingStatus = '已发货'; order.fulfillmentOrders = [履约(路由(first), change)]
    expect(读取发货仓库来源(order, '订单标发规则', channels)).toBeUndefined()
    expect(命中规则(rule, order, channels)).toBe(false)
  })
  it('只读试算保留原平台与阶段门禁，不因仓库条件命中而放行', () => {
    const { rule, order, channels, first } = 准备()
    rule.type = '订单标发规则'; rule.action = '仓库发货完成后标发'; rule.shippingAction = { timing: 'immediate' }
    order.platformCode = 'Temu'; order.processingStatus = '待发货'; order.fulfillmentOrders = [履约(路由(first))]
    const before = JSON.stringify({ rule, order, channels })
    const result = 试算规则([rule], order, '订单标发规则', channels)
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toContain('该平台接入与动作门禁尚未验证')
    expect(result.gates).toContain('来源 OMS 订单尚未已发货，不得生成或调度标发')
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
  })
})
