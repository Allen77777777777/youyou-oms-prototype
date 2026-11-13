import { describe, expect, it } from 'vitest'
import type { 全渠道订单, 订单路由, 订单收件处理记录, 收件信息请求触发点 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 订单规则 } from './规则逻辑'
import { 创建默认收件信息动作 } from './收件信息规则模型'
import { 准备收件信息请求, type 收件信息请求准备输入 } from './收件信息执行'
import { 创建规则渠道样例, 分仓仓库键 } from './规则路由'
import { 物流渠道条件键 } from './规则渠道条件'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'

function 路由(channel: 渠道配置): 订单路由 {
  return { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account, shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
}
function 规则(patch: Partial<订单规则> = {}): 订单规则 {
  return { id: 'RECIPIENT-TEST', name: '美国门牌解析', type: '收件信息规则', priority: 10, enabled: true, mode: '全部满足',
    conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '门牌号解析',
    recipientAction: { ...创建默认收件信息动作(), sourceOrder: 'address1', method: 'firstNumber', addressMode: 'remove' },
    version: 1, updatedAt: '2026-11-13T01:00:00Z', note: '', ...patch }
}
function 准备(): 收件信息请求准备输入 {
  const order: 全渠道订单 = structuredClone(全渠道订单模拟数据[0]!)
  delete order.recipientProcessing; delete order.recipientRequestRecords
  order.fulfillmentMode = '自配送'; order.processingStatus = undefined; order.defaultRoute = undefined; order.operationLogs = []
  order.address = { fullName: '订单收件人', countryCode: 'DE', addressLine1: '999 Source Road', city: 'Source City' }
  return { requestId: 'DEMO-REQUEST-1', trigger: 'warehouse_push', order, processedAt: '2026-11-13T02:00:00Z', rules: [规则()], channels: 创建规则渠道样例(),
    originalAddress: { fullName: '本次收件人', countryCode: 'US', addressLine1: '128 Example Street', city: 'Example City', telephone: '000-000-0000', postalCode: '90000' } }
}
function 路由规则(channel: 渠道配置, patch: Partial<订单规则> = {}): 订单规则 {
  return 规则({ conditions: [
    { field: 'shippingWarehouse', operator: '等于', value: '', values: [分仓仓库键(channel)] },
    { field: 'shippingChannel', operator: '等于', value: '', values: [物流渠道条件键(channel)] },
  ], ...patch })
}

describe('对外请求前收件信息准备', () => {
  it.each(['freight_quote', 'logistics_order', 'warehouse_push'] as 收件信息请求触发点[])('%s仅处理本次原始请求地址副本，不写来源、日志或状态', trigger => {
    const input = 准备(); input.trigger = trigger
    const before = JSON.stringify(input)
    const result = 准备收件信息请求(input)
    expect(result).toMatchObject({ requestId: input.requestId, trigger, blocked: false, reused: false, address: { addressLine1: 'Example Street', houseNumber: '128' } })
    expect(result.record).toMatchObject({ trigger, ruleId: 'RECIPIENT-TEST', ruleVersion: 1, status: 'parsed', before: { addressLine1: '128 Example Street' }, after: { addressLine1: 'Example Street' } })
    expect(result.address.fullName).toBe('本次收件人'); expect(result.address.telephone).toBe('000-000-0000')
    expect(JSON.stringify(input)).toBe(before)
    expect(input.order.recipientRequestRecords).toBeUndefined(); expect(input.order.recipientProcessing).toBeUndefined()
  })

  it('地址类条件读取本次请求地址，平台店铺条件仍来自明确的来源订单', () => {
    const input = 准备()
    input.rules[0]!.conditions.push({ field: 'platformCode', operator: '等于', value: input.order.platformCode }, { field: 'storeId', operator: '等于', value: input.order.storeId }, { field: 'orderAddress', operator: '包含', value: 'Example Street' })
    const result = 准备收件信息请求(input)
    expect(result.record.status).toBe('parsed')
    expect(result.record.conditionInput).toMatchObject({ countryCode: 'US', city: 'Example City', addressLine1: '128 Example Street', platformCode: input.order.platformCode, storeId: input.order.storeId })
    input.originalAddress.countryCode = 'DE'
    expect(准备收件信息请求(input).record.status).toBe('not_matched')
  })

  it('仓库渠道只使用本次目标，默认路由和其他履约不作兜底或替换', () => {
    const input = 准备(), first = input.channels[0]!, second = input.channels[1]!
    input.order.defaultRoute = 路由(first); input.route = 路由(second); input.rules = [路由规则(second)]
    const result = 准备收件信息请求(input)
    expect(result.record.status, result.record.reason).toBe('parsed')
    expect(result.record.requestInput).toMatchObject({ shippingChannelId: second.id, shippingWarehouseKey: 分仓仓库键(second), shippingChannelKey: 物流渠道条件键(second) })
    expect(result.record.routeSnapshot).toEqual(input.route); expect(result.record.routeSnapshot).not.toBe(input.route)
    input.route = undefined
    const pending = 准备收件信息请求(input)
    expect(pending.blocked).toBe(true); expect(pending.record.status).toBe('needs_review')
    expect(pending.record.conditionInput.shippingChannelId).toBe('')
  })

  it('不同运费候选分别匹配和处理，不复用另一候选的副本', () => {
    const input = 准备(), first = input.channels[0]!, second = input.channels[1]!
    input.trigger = 'freight_quote'; input.rules = [路由规则(first)]
    const a = 准备收件信息请求({ ...input, requestId: 'QUOTE-A', route: 路由(first) })
    const b = 准备收件信息请求({ ...input, requestId: 'QUOTE-B', route: 路由(second), previous: a })
    expect(a.record.status).toBe('parsed'); expect(b.record.status).toBe('not_matched')
    expect(a.address.addressLine1).toBe('Example Street'); expect(b.address).toEqual(input.originalAddress)
    expect(input.originalAddress.houseNumber).toBeUndefined()
  })

  it('没有路由条件不要求默认仓、SKU或处理阶段，但不代替下游门禁', () => {
    const input = 准备(); input.order.items = []; input.channels = []
    const result = 准备收件信息请求(input)
    expect(result.blocked).toBe(false); expect(result.record.status).toBe('parsed')
    expect(result.trial.gates).toEqual([])
  })

  it('无启用命中规则时副本原样返回，包含字段缺省而非补空字符串', () => {
    const input = 准备(); input.rules[0]!.enabled = false
    const result = 准备收件信息请求(input)
    expect(result.record.status).toBe('not_matched'); expect(result.blocked).toBe(false)
    expect(result.address).toEqual(input.originalAddress); expect(result.address).not.toBe(input.originalAddress)
    expect('houseNumber' in result.address).toBe(false); expect('addressLine2' in result.address).toBe(false)
  })

  it.each(['Example Street', '123456789 Example Street', '12/14 Example Street'])('解析未识别或候选无效 %s 保留原值，目标接口自行校验必填及格式', addressLine1 => {
    const input = 准备(); input.originalAddress.addressLine1 = addressLine1
    const result = 准备收件信息请求(input)
    expect(['unrecognized', 'needs_review']).toContain(result.record.status)
    expect(result.blocked).toBe(false); expect(result.address).toEqual(input.originalAddress)
  })

  it('本次原始请求已有独立门牌则保留，订单来源字段不替代本次值', () => {
    const input = 准备(); input.originalAddress.houseNumber = ' 42B '; input.order.address.houseNumber = 'OTHER'
    const result = 准备收件信息请求(input)
    expect(result.record.status).toBe('preserved'); expect(result.address.houseNumber).toBe(' 42B ')
    expect(result.address).toEqual(input.originalAddress)
  })

  it('较高优先级条件未知阻断低优先级规则与本次请求', () => {
    const input = 准备()
    input.rules = [规则(), 规则({ id: 'HIGH', name: '指定省州', priority: 1, conditions: [{ field: 'stateProvince', operator: '不包含', value: 'State' }] })]
    const result = 准备收件信息请求(input)
    expect(result).toMatchObject({ blocked: true, record: { status: 'needs_review', ruleId: 'HIGH', houseNumber: '' } })
    expect(result.address).toEqual(input.originalAddress); expect(result.trial.hit).toBeUndefined()
  })

  it('配置无效阻断；能被可靠条件明确排除的坏配置不阻断后续规则', () => {
    const input = 准备(), bad = 规则({ id: 'BAD', name: '坏配置', priority: 1, recipientAction: undefined })
    input.rules = [bad, 规则()]
    expect(准备收件信息请求(input)).toMatchObject({ blocked: true, record: { status: 'invalid_config', ruleId: 'BAD' } })
    bad.conditions = [{ field: 'countryCode', operator: '等于', value: 'GB' }]
    expect(准备收件信息请求(input)).toMatchObject({ blocked: false, record: { status: 'parsed', ruleId: 'RECIPIENT-TEST' } })
  })

  it('平台履约不适用且阻断本期对外请求准备', () => {
    const input = 准备(); input.order.fulfillmentMode = '平台履约'
    expect(准备收件信息请求(input)).toMatchObject({ blocked: true, record: { status: 'not_applicable' }, address: input.originalAddress })
  })

  it('快照与地址副本彼此隔离，后续订单、规则、渠道或地址变化不改旧记录', () => {
    const input = 准备(); input.route = 路由(input.channels[0]!)
    const result = 准备收件信息请求(input), saved = JSON.stringify(result.record)
    input.originalAddress.addressLine1 = '256 New Road'; input.order.storeId = 'CHANGED'; input.rules[0]!.recipientAction!.method = 'lastNumber'
    input.route.shippingChannelId = 'OTHER'; result.address.fullName = 'Edited output'
    expect(JSON.stringify(result.record)).toBe(saved)
    expect(result.record.actionSnapshot).not.toBe(input.rules[0]!.recipientAction)
    expect(result.record.requestInput.originalAddress).not.toBe(input.originalAddress)
  })

  it('同请求同原始输入重放复用冻结结果，后续规则变动不重复删除门牌', () => {
    const input = 准备(), first = 准备收件信息请求(input)
    input.rules[0]!.recipientAction!.method = 'lastNumber'; input.rules[0]!.version = 2
    const replay = 准备收件信息请求({ ...input, previous: first, processedAt: '2026-11-14T02:00:00Z' })
    expect(replay.reused).toBe(true); expect(replay.record.ruleVersion).toBe(1)
    expect(replay.record.processedAt).toBe(first.record.processedAt); expect(replay.address).toEqual(first.address)
    expect(replay.record).not.toBe(first.record)
    replay.address.addressLine1 = 'Changed'; expect(first.address.addressLine1).toBe('Example Street')
  })

  it('同请求误用已处理地址或修改原始输入必须阻断，不再次截取地址', () => {
    const input = 准备(); input.originalAddress.addressLine1 = '128 Example 7'
    const first = 准备收件信息请求(input)
    for (const originalAddress of [first.address, { ...input.originalAddress, addressLine1: '256 Other 9' }]) {
      const result = 准备收件信息请求({ ...input, originalAddress, previous: first })
      expect(result.blocked).toBe(true); expect(result.record.status).toBe('needs_review')
      expect(result.record.reason).toContain('重新建立请求'); expect(result.address).toEqual(originalAddress)
    }
  })

  it('相同ID改目标或触发位置不复用；新请求可从原始地址重新准备', () => {
    const input = 准备(); input.route = 路由(input.channels[0]!)
    const first = 准备收件信息请求(input)
    expect(准备收件信息请求({ ...input, previous: first, route: 路由(input.channels[1]!) }).blocked).toBe(true)
    expect(准备收件信息请求({ ...input, previous: first, trigger: 'logistics_order' }).blocked).toBe(true)
    const next = 准备收件信息请求({ ...input, requestId: 'DEMO-NEXT', previous: first })
    expect(next.reused).toBe(false); expect(next.address).toEqual(first.address)
  })

  it('旧创建记录仅保留历史，新请求忽略其结果且不覆盖该记录', () => {
    const input = 准备()
    const old = { ...准备收件信息请求(input).record, trigger: 'order_created' as const, houseNumber: 'OLD', after: { addressLine1: 'OLD PROCESSED', addressLine2: '', houseNumber: 'OLD' } } as 订单收件处理记录
    input.order.recipientProcessing = old
    const saved = JSON.stringify(old), result = 准备收件信息请求(input)
    expect(result.record.houseNumber).toBe('128'); expect(result.address.addressLine1).toBe('Example Street')
    expect(JSON.stringify(input.order.recipientProcessing)).toBe(saved)
  })

  it('请求标识为空则无发送准备资格', () => {
    const input = 准备(); input.requestId = ''
    expect(准备收件信息请求(input)).toMatchObject({ blocked: true, record: { status: 'invalid_config' }, address: input.originalAddress })
  })
})
