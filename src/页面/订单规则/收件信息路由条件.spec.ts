import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 创建默认收件信息动作 } from './收件信息规则模型'
import { 试算收件信息规则 } from './收件信息执行'
import { 规则基础选项 } from './规则基础选项'
import { 创建空条件, 读取可选条件分组, 校验条件配置 } from './规则条件定义'
import { 创建物流渠道选项, 物流渠道条件键, 读取收件路由身份, 读取物流渠道来源 } from './规则渠道条件'
import { 读取发货仓库来源 } from './规则仓库条件'
import { 创建规则渠道样例, 分仓仓库键 } from './规则路由'
import { 命中规则, 校验规则配置, type 订单规则, type 规则条件, type 规则类型 } from './规则逻辑'

function 路由(channel: 渠道配置): 订单路由 {
  return { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account,
    shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
}
function 规则(id: string, conditions: 规则条件[], priority = 10): 订单规则 {
  return { id, name: `收件路由-${id}`, type: '收件信息规则', enabled: true, priority, mode: '全部满足', conditions,
    action: '门牌号解析', recipientAction: 创建默认收件信息动作(), version: 1, updatedAt: '2026-11-13 10:00:00 UTC+8', note: '' }
}
function 渠道条件(channel: 渠道配置): 规则条件 {
  return { field: 'shippingChannel', operator: '等于', value: '', values: [物流渠道条件键(channel)] }
}
function 准备() {
  const channels = 创建规则渠道样例().filter(channel => ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].includes(channel.id))
  const first = channels[0]!, second = channels[1]!
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.fulfillmentMode = '自配送'; order.processingStatus = undefined; order.fulfillmentOrders = []; order.manualShippingPlan = undefined
  order.address.countryCode = 'US'; order.defaultRoute = 路由(first)
  const rule = 规则('ROUTE', [渠道条件(first)])
  const low = 规则('LOW', [{ field: 'countryCode', operator: '等于', value: 'US' }], 20)
  return { channels, first, second, order, rule, low }
}

describe('收件信息规则的本次请求仓库物流条件', () => {
  it('两项为可多选条件，渠道仅向收件规则开放', () => {
    expect(读取可选条件分组('收件信息规则').flatMap(group => group.fields)).toEqual(['platformCode', 'storeId', 'countryCode', 'stateProvince', 'city', 'orderAddress', 'shippingWarehouse', 'shippingChannel'])
    expect(创建空条件('shippingChannel')).toEqual({ field: 'shippingChannel', operator: '等于', value: '', values: [] })
    for (const type of ['审单规则', '拆单规则', '合单规则', '分仓规则', '订单标发规则'] as 规则类型[]) {
      expect(读取可选条件分组(type).flatMap(group => group.fields)).not.toContain('shippingChannel')
      const { rule, order, channels } = 准备(); rule.type = type
      expect(校验规则配置(rule, [rule], channels)).toContain('物流渠道条件仅适用于收件信息规则')
      expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
    }
  })

  it('渠道选项保留停用历史和仓配分离身份，保存完整归属且展示名不参与身份', () => {
    const { channels, first } = 准备()
    const other = { ...first, id: 'DEMO-CHANNEL-OTHER', accountId: 'DEMO-ACCOUNT-OTHER', enabled: false, labelMode: '仓配分离' as const }
    channels.push(other)
    const options = 创建物流渠道选项(channels)
    expect(options).toHaveLength(3)
    expect(options.map(option => option.value)).toContain(JSON.stringify([other.providerId, other.accountId, other.warehouseId, other.id]))
    expect(规则基础选项('shippingChannel', [], channels)).toEqual(options)
    const before = options.map(option => option.value)
    first.name = '新渠道名称'; first.code = 'NEW-CODE'; first.account = '新账号名称'; first.warehouse = '新仓库名称'; first.provider = '新服务商名称'
    expect(创建物流渠道选项(channels).map(option => option.value)).toEqual(before)
    expect(创建物流渠道选项(channels)[0]!.label).toContain('新渠道名称')
  })

  it('渠道ID重复或稳定归属缺失不进入可选身份', () => {
    const { first, second } = 准备()
    expect(创建物流渠道选项([first, { ...first, accountId: 'OTHER' }, second]).map(option => option.value)).toEqual([物流渠道条件键(second)])
    for (const field of ['providerId', 'accountId', 'warehouseId', 'id'] as const) {
      expect(创建物流渠道选项([{ ...first, [field]: ' ' }])).toEqual([])
      expect(创建物流渠道选项([{ ...first, [field]: ` ${first[field]}` }])).toEqual([])
    }
  })

  it.each(['渠道名称', 'DEMO-CF-CHANNEL-WYT', '["provider","account","warehouse"]', '["provider","account","warehouse",""]'])('不接受无归属或畸形选值 %s', value => {
    const { rule, order, channels } = 准备()
    rule.conditions[0]!.operator = '不等于'; rule.conditions[0]!.values = [value]
    expect(校验条件配置(rule.conditions[0]!)).toContain('请选择有效的物流渠道及其归属')
    expect(校验规则配置(rule, [rule], channels)).not.toBe('')
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
  })

  it('多选等于任意所选渠道，不等于排除所有所选渠道', () => {
    const { rule, order, channels, first, second } = 准备()
    rule.conditions[0]!.values = [物流渠道条件键(second), 物流渠道条件键(first)]
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(true)
    rule.conditions[0]!.operator = '不等于'
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
    rule.conditions[0]!.values = [物流渠道条件键(second)]
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(true)
    rule.conditions[0]!.operator = '等于'
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
  })

  it('同名同代码的跨账号渠道不能互相命中', () => {
    const { rule, order, channels, first } = 准备()
    const other = { ...first, id: 'DEMO-CHANNEL-OTHER', accountId: 'DEMO-ACCOUNT-OTHER' }; channels.push(other)
    order.defaultRoute = 路由(other)
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
    rule.conditions[0]!.values = [物流渠道条件键(other)]
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(true)
  })

  it('显式请求路由的仓库和渠道按唯一渠道ID反查，展示字段变化不改变匹配', () => {
    const { rule, order, channels, first } = 准备()
    rule.conditions.push({ field: 'shippingWarehouse', operator: '等于', value: '', values: [分仓仓库键(first)] })
    order.defaultRoute = { ...路由(first), warehouse: '旧仓库名称', warehouseProvider: '旧服务商名称', warehouseAccount: '旧账号名称', shippingChannel: '旧渠道名称', shippingChannelCode: '旧代码' }
    expect(校验规则配置(rule, [rule], channels)).toBe('')
    expect(读取收件路由身份(order.defaultRoute, channels)).toEqual({ warehouseKey: 分仓仓库键(first), channelKey: 物流渠道条件键(first) })
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(true)
    expect(试算收件信息规则([rule], order, channels, { originalAddress: order.address, route: order.defaultRoute }).gates).toEqual([])
  })

  it('仓库与渠道的AND范围冲突时不命中，不按渠道的同名仓猜填', () => {
    const { rule, order, channels, second } = 准备()
    rule.conditions.push({ field: 'shippingWarehouse', operator: '等于', value: '', values: [分仓仓库键(second)] })
    expect(校验规则配置(rule, [rule], channels)).toBe('')
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
  })

  it('收件只读显式请求路由；履约与人工拆包不替换该来源', () => {
    const { rule, order, channels, first, second } = 准备()
    order.fulfillmentOrders = [{ fulfillmentOrderNo: 'DEMO-LATER', route: 路由(second), isActive: true, status: '待执行', plannedQuantity: 1, shippedQuantity: 0 }]
    order.manualShippingPlan = { id: 'DEMO-LATER-PLAN', kind: '拆分发货', orderNos: [order.systemOrderNo], reason: '', updatedAt: '2026-11-13T10:00:00Z', packages: [{ key: 'SECOND', route: 路由(second), items: [{ orderNo: order.systemOrderNo, externalLineId: order.items[0]!.externalLineId, quantity: 1 }] }] }
    expect(读取物流渠道来源(order, '收件信息规则', channels, { originalAddress: order.address, route: order.defaultRoute })).toEqual([物流渠道条件键(first)])
    expect(读取发货仓库来源(order, '收件信息规则', channels, undefined, { originalAddress: order.address, route: order.defaultRoute })).toEqual([分仓仓库键(first)])
    expect(读取发货仓库来源(order, '审单规则', channels)).toEqual([分仓仓库键(second)])
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(true)
    order.defaultRoute = undefined
    expect(读取物流渠道来源(order, '收件信息规则', channels, { originalAddress: order.address, route: order.defaultRoute })).toBeUndefined()
    expect(读取发货仓库来源(order, '收件信息规则', channels, undefined, { originalAddress: order.address, route: order.defaultRoute })).toBeUndefined()
  })

  it.each(['无路由', '无渠道ID', '未知渠道ID', 'ID带空白'])('%s时等于和不等于均未知，高优先级阻断后续规则', scenario => {
    const { rule, low, order, channels } = 准备()
    if (scenario === '无路由') order.defaultRoute = undefined
    if (scenario === '无渠道ID') delete order.defaultRoute!.shippingChannelId
    if (scenario === '未知渠道ID') order.defaultRoute!.shippingChannelId = 'UNKNOWN'
    if (scenario === 'ID带空白') order.defaultRoute!.shippingChannelId += ' '
    for (const operator of ['等于', '不等于'] as const) {
      rule.conditions[0]!.operator = operator
      const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
      expect(result.hit).toBeUndefined()
      expect(result.blockedRule?.rule.id).toBe(rule.id)
      expect(result.blockedRule?.pending).toBe(true)
      expect(result.unknownFields).toContain('物流渠道')
      expect(result.gates).toEqual([])
    }
  })

  it.each(['渠道ID重复', '归属缺失'])('%s不能解析本次请求路由，也不能降级到低优先级规则', scenario => {
    const { rule, low, order, channels, first } = 准备()
    if (scenario === '渠道ID重复') channels.push({ ...first, accountId: 'ANOTHER-ACCOUNT' })
    if (scenario === '归属缺失') first.accountId = ''
    expect(读取收件路由身份(order.defaultRoute, channels)).toBeUndefined()
    const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit).toBeUndefined()
    expect(result.blockedRule?.rule.id).toBe(rule.id)
  })

  it('缺本次路由使仓库条件未知，不能把未知解释为不在所选仓', () => {
    const { rule, low, order, channels, first } = 准备()
    rule.conditions = [{ field: 'shippingWarehouse', operator: '不等于', value: '', values: [分仓仓库键(first)] }]
    order.defaultRoute = undefined
    const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit).toBeUndefined(); expect(result.blockedRule?.pending).toBe(true)
    expect(result.unknownFields).toContain('发货仓库')
  })

  it('未配置路由条件的规则不要求本次已选路由', () => {
    const { low, order, channels } = 准备(); order.defaultRoute = undefined
    const result = 试算收件信息规则([low], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit?.id).toBe(low.id); expect(result.gates).toEqual([]); expect(result.unknownFields).toEqual([])
  })

  it('调用方未显式给请求上下文时，不以订单默认路由命中收件条件', () => {
    const { rule, order, channels, first, second } = 准备()
    expect(order.defaultRoute?.shippingChannelId).toBe(first.id)
    expect(命中规则(rule, order, channels)).toBe(false)
    expect(读取物流渠道来源(order, '收件信息规则', channels)).toBeUndefined()
    expect(读取发货仓库来源(order, '收件信息规则', channels)).toBeUndefined()
    order.defaultRoute = 路由(second)
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: 路由(first) })).toBe(true)
  })

  it('高优先级动作坏配置且渠道未知时仍阻断，不能把收件渠道条件按其他规则求值', () => {
    const { rule, low, order, channels } = 准备(); rule.recipientAction = undefined; order.defaultRoute = undefined
    const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit).toBeUndefined(); expect(result.blockedRule?.rule.id).toBe(rule.id)
    expect(result.blockedRule?.configError).toBeTruthy()
  })

  it.each(['国家明确不符', '渠道明确不符'])('坏动作可被%s排除范围，后续规则仍能命中', scenario => {
    const { rule, low, order, channels, second } = 准备(); rule.recipientAction = undefined
    if (scenario === '国家明确不符') {
      order.defaultRoute = undefined
      rule.conditions.push({ field: 'countryCode', operator: '等于', value: 'DE' })
    } else rule.conditions = [渠道条件(second)]
    const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.trace[0]!.configError).toBeTruthy(); expect(result.trace[0]!.configBlocks).toBe(false)
    expect(result.hit?.id).toBe(low.id); expect(result.blockedRule).toBeUndefined()
  })

  it.each(['providerId', 'accountId', 'warehouseId'] as const)('渠道ID未变但%s归属变化时旧配置失效，不得用不等于放行', field => {
    const { rule, low, order, channels, first } = 准备(); first[field] = 'DEMO-CHANGED-OWNER'
    rule.conditions[0]!.operator = '不等于'
    expect(校验规则配置(rule, [rule], channels)).toContain('归属已变化')
    const result = 试算收件信息规则([low, rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit).toBeUndefined(); expect(result.blockedRule?.rule.id).toBe(rule.id)
    expect(命中规则(rule, order, channels, { originalAddress: order.address, route: order.defaultRoute })).toBe(false)
  })

  it('试算不修改订单、规则及渠道字典，保存命中结果是独立快照', () => {
    const { rule, order, channels } = 准备()
    const before = JSON.stringify({ rule, order, channels })
    const result = 试算收件信息规则([rule], order, channels, { originalAddress: order.address, route: order.defaultRoute })
    expect(result.hit?.id).toBe(rule.id)
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
    result.hit!.conditions[0]!.values![0] = 'CHANGED'
    expect(JSON.stringify({ rule, order, channels })).toBe(before)
  })
})
