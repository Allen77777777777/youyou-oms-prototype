import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 订单规则 } from '../订单规则/规则逻辑'
import { 共享规则 } from '../订单规则/演示会话'
import { 准备收件信息请求 } from '../订单规则/收件信息执行'
import { 创建默认收件信息动作 } from '../订单规则/收件信息规则模型'
import { 渠道会话 } from '../仓配管理/渠道状态'
import { 共享订单, 仓库执行记录, 订单版本, 当前版本, 操作核查证据, 演示库存, 演示路由, 执行演示推单 } from './演示会话'
import { 执行演示重新推单, 同步演示仓库状态, 仓单期望版本 } from './操作功能模型'
import { 准备运费候选收件请求 } from './请求收件准备'
import { 创建手工订单, 创建手工订单草稿 } from '../手工订单/模型'
import { 路由仓库键 } from './仓库物流选择模型'
import { 运行自动推单轮次 } from '../业务配置/自动推单执行'
import RecipientResult from './收件信息处理结果.vue'

const initial = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, rules: 共享规则.value,
  versions: 订单版本.value, evidence: 操作核查证据.value, inventory: 演示库存.value })
function reset() {
  const data = JSON.parse(initial)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 共享规则.value = data.rules
  订单版本.value = data.versions; 操作核查证据.value = data.evidence; 演示库存.value = data.inventory
}
beforeEach(reset); afterEach(reset)

function rule(patch: Partial<订单规则> = {}): 订单规则 {
  return { id: 'REQUEST-RECIPIENT', name: '请求门牌解析', type: '收件信息规则', enabled: true, priority: 10, mode: '全部满足',
    conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '门牌号解析',
    recipientAction: { ...创建默认收件信息动作(), sourceOrder: 'address1', addressMode: 'remove' },
    version: 1, updatedAt: '2026-11-13T00:00:00Z', note: '', ...patch }
}
function target(): 全渠道订单 {
  const order = 共享订单.value.find(item => item.fulfillmentOrders.some(f => f.fulfillmentOrderNo === 'FL-DEMO-260912-6'))!
  order.address = { fullName: '样例收件人', countryCode: 'US', addressLine1: '712 Example Street', addressLine2: '', city: 'Example City', postalCode: '90000', telephone: '000-000-0000' }
  order.defaultRoute = { ...演示路由[1]! }
  order.fulfillmentOrders[0]!.route = { ...演示路由[0]! }
  delete order.recipientProcessing; delete order.recipientRequestRecords
  共享规则.value = [rule()]
  共享订单.value = [order]; 仓库执行记录.value = []
  return 共享订单.value[0]!
}
function push(order: 全渠道订单) {
  const versions = Object.fromEntries(共享订单.value.map(source => [source.systemOrderNo, 当前版本(source.systemOrderNo)]))
  return 执行演示推单(order.systemOrderNo, order.fulfillmentOrders[0]!.fulfillmentOrderNo, 当前版本(order.systemOrderNo), versions)
}

describe('对外请求前的收件规则入口集成', () => {
  it('手工创建和重放仅保存来源资料，不再解析或生成收件处理记录', () => {
    const draft = 创建手工订单草稿()
    draft.reason = '请求时点回归'; draft.storeId = 'store-ebay-us-01'
    draft.warehouse = 路由仓库键(演示路由[0]!); draft.channel = 演示路由[0]!.shippingChannelCode
    draft.items = [{ systemSku: 'DEMO-STORAGE-01', quantity: 1 }]
    draft.address = { fullName: '样例收件人', countryCode: 'US', city: 'Example City', addressLine1: '712 Example Street', postalCode: '90000', telephone: '000-000-0000' }
    const created = 创建手工订单(draft)
    expect(created.成功, created.信息).toBe(true)
    expect(created.订单?.recipientProcessing).toBeUndefined()
    expect(created.订单?.recipientRequestRecords).toBeUndefined()
    expect(created.订单?.address.addressLine1).toBe('712 Example Street')
    expect(created.订单?.operationLogs.some(log => log.operationType === '收件信息规则')).toBe(false)
    expect(创建手工订单(draft).订单).toBe(created.订单)
  })

  it('首次推仓使用实际履约渠道，来源原值不变并冻结请求载荷', () => {
    const order = target(), original = JSON.stringify(order.address)
    const channel = 渠道会话.value.find(item => item.id === 演示路由[0]!.shippingChannelId)!
    共享规则.value = [rule({ conditions: [{ field: 'shippingChannel', operator: '等于', value: '', values: [JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId, channel.id])] }] })]
    const result = push(order)
    expect(result.成功, result.信息).toBe(true)
    expect(order.recipientRequestRecords).toHaveLength(1)
    expect(order.recipientRequestRecords![0]).toMatchObject({ trigger: 'warehouse_push', status: 'parsed', houseNumber: '712', routeSnapshot: { shippingChannelId: 演示路由[0]!.shippingChannelId } })
    expect(仓库执行记录.value[0]!.出库快照?.recipient).toMatchObject({ addressLine1: 'Example Street', houseNumber: '712' })
    expect(仓库执行记录.value[0]!.收件请求历史).toHaveLength(1)
    expect(JSON.stringify(order.address)).toBe(original)
    expect(order.recipientProcessing).toBeUndefined()
  })

  it('规则准备未知时阻断推仓，不创建仓单或冒充已提交收件记录', () => {
    const order = target()
    共享规则.value = [rule({ conditions: [{ field: 'stateProvince', operator: '包含', value: 'Example State' }] })]
    const result = push(order)
    expect(result.成功).toBe(false)
    expect(result.信息).toContain('待核实')
    expect(仓库执行记录.value).toHaveLength(0)
    expect(order.recipientRequestRecords).toBeUndefined()
    expect(order.processingStatus).toBe('待推单')
  })

  it('首次推仓在解析后重新检查详细地址必填，不提交被截为空的地址', () => {
    const order = target(); order.address.addressLine1 = '712'
    const result = push(order)
    expect(result.成功).toBe(false)
    expect(result.信息).toContain('处理后的')
    expect(仓库执行记录.value).toHaveLength(0)
    expect(order.recipientRequestRecords).toBeUndefined()
    expect(order.address.addressLine1).toBe('712')
  })

  it('已提交未明请求在规则和原地址变化后仍只查回原快照', () => {
    const order = target(); expect(push(order).成功).toBe(true)
    const execution = 仓库执行记录.value[0]!, frozen = JSON.stringify(execution.收件请求历史)
    const records = JSON.stringify(order.recipientRequestRecords)
    order.address.addressLine1 = '99 Changed Street'; 共享规则.value[0]!.recipientAction!.method = 'lastNumber'
    expect(push(order).成功).toBe(false)
    expect(执行演示重新推单(execution.出库单号, 仓单期望版本(execution), '尚未核实').成功).toBe(false)
    同步演示仓库状态(execution.出库单号)
    expect(JSON.stringify(execution.收件请求历史)).toBe(frozen)
    expect(JSON.stringify(order.recipientRequestRecords)).toBe(records)
    expect(execution.出库快照?.recipient?.houseNumber).toBe('712')
  })

  it('明确未受理并已修复后重推建立新快照，保留原失败请求地址', () => {
    const order = target(); expect(push(order).成功).toBe(true)
    const execution = 仓库执行记录.value[0]!, previous = JSON.stringify(execution.收件请求历史![0])
    execution.状态 = '下单失败'; execution.待核查 = false; execution.原因 = '已核实原请求未受理'
    操作核查证据.value[order.systemOrderNo] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true, 原请求未生效: true, 失败已修复: true, 原方案有效: true }
    order.address.addressLine1 = '88 New Street'
    const retried = 执行演示重新推单(execution.出库单号, 仓单期望版本(execution), '已核实资料并修复')
    expect(retried.成功, retried.信息).toBe(true)
    expect(execution.收件请求历史).toHaveLength(2)
    expect(JSON.stringify(execution.收件请求历史![0])).toBe(previous)
    expect(order.recipientRequestRecords?.map(record => record.houseNumber)).toEqual(['712', '88'])
    expect(execution.出库快照?.recipient).toMatchObject({ addressLine1: 'New Street', houseNumber: '88' })
  })

  it('明确失败后的重推仍校验处理后地址，失败保留原请求与仓单状态', () => {
    const order = target(); expect(push(order).成功).toBe(true)
    const execution = 仓库执行记录.value[0]!
    execution.状态 = '下单失败'; execution.待核查 = false; execution.原因 = '已核实原请求未受理'
    操作核查证据.value[order.systemOrderNo] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true, 原请求未生效: true, 失败已修复: true, 原方案有效: true }
    const before = JSON.stringify(execution)
    order.address.addressLine1 = '712'
    const result = 执行演示重新推单(execution.出库单号, 仓单期望版本(execution), '已核实资料')
    expect(result.成功).toBe(false)
    expect(result.信息).toContain('处理后的')
    expect(JSON.stringify(execution)).toBe(before)
    expect(order.recipientRequestRecords).toHaveLength(1)
  })

  it('自动推单复用公共入口，重复扫描不重新解析', () => {
    const order = target()
    const result = 运行自动推单轮次()
    expect(result?.submitted).toBe(1)
    expect(order.recipientRequestRecords?.[0]?.houseNumber).toBe('712')
    运行自动推单轮次()
    expect(order.recipientRequestRecords).toHaveLength(1)
    expect(仓库执行记录.value).toHaveLength(1)
  })

  it('多来源包裹分别匹配条件，处理资料不一致时阻断而非取首单', () => {
    const first = target(), second: 全渠道订单 = JSON.parse(JSON.stringify(first))
    second.systemOrderNo = 'RECIPIENT-SECOND'; second.storeId = 'OTHER-STORE'
    first.address.addressLine1 = '12 Example Street 99'; second.address = { ...first.address }
    first.fulfillmentOrders[0]!.plannedQuantity = 2; second.fulfillmentOrders[0]!.plannedQuantity = 2
    共享订单.value.push(second)
    共享规则.value = [rule({ conditions: [{ field: 'storeId', operator: '等于', value: first.storeId }] }),
      rule({ id: 'OTHER', name: '其他来源尾部解析', priority: 20, recipientAction: { ...创建默认收件信息动作(), sourceOrder: 'address1', method: 'lastNumber', addressMode: 'remove' } })]
    const result = push(first)
    expect(result.成功).toBe(false)
    expect(result.信息).toContain('完整收件资料不一致')
    expect(仓库执行记录.value).toHaveLength(0)
    expect(first.recipientRequestRecords).toBeUndefined()
    expect(second.recipientRequestRecords).toBeUndefined()
  })

  it('原始收件身份不同即使解析结果相同也不放宽原合单及出库快照资格', () => {
    const first = target(), second: 全渠道订单 = JSON.parse(JSON.stringify(first))
    second.systemOrderNo = 'RECIPIENT-NORMALIZED-SAME'
    second.address.addressLine1 = 'Example Street'; second.address.houseNumber = '712'
    first.fulfillmentOrders[0]!.plannedQuantity = 2; second.fulfillmentOrders[0]!.plannedQuantity = 2
    共享订单.value.push(second)
    const result = push(first)
    expect(result.成功).toBe(false)
    expect(result.信息).toContain('来源订单完整收件资料不一致')
    expect(仓库执行记录.value).toHaveLength(0)
    expect(first.recipientRequestRecords).toBeUndefined()
    expect(second.recipientRequestRecords).toBeUndefined()
  })

  it('运费候选独立使用目标渠道准备，保持纯只读且不产生报价或正式记录', () => {
    const order = target(); order.address.addressLine1 = '12 Example Street 99'
    const channel = 渠道会话.value.find(item => item.id === 演示路由[0]!.shippingChannelId)!
    const rules = [rule({ conditions: [{ field: 'shippingChannel', operator: '等于', value: '', values: [JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId, channel.id])] }] }),
      rule({ id: 'FALLBACK', name: '其他渠道尾部解析', priority: 20, recipientAction: { ...创建默认收件信息动作(), sourceOrder: 'address1', method: 'lastNumber', addressMode: 'remove' } })]
    const before = JSON.stringify(order)
    const prepared = 准备运费候选收件请求({ requestId: 'QUOTE-TEST', orders: [order], candidates: 演示路由, rules, channels: 渠道会话.value })
    expect(prepared.map(item => item.address?.houseNumber)).toEqual(['12', '99'])
    expect(prepared.map(item => item.trigger)).toEqual(['freight_quote', 'freight_quote'])
    expect(prepared[0]!.requestId).not.toBe(prepared[1]!.requestId)
    expect(JSON.stringify(order)).toBe(before)
    expect(仓库执行记录.value).toHaveLength(0)
  })

  it('详情展示已提交请求和旧版历史，旧处理值不参与新请求', () => {
    const order = target()
    const legacy = 准备收件信息请求({ requestId: 'LEGACY', trigger: 'warehouse_push', order, originalAddress: { ...order.address, addressLine1: '999 Historical Street' }, route: 演示路由[0]!, rules: 共享规则.value, channels: 渠道会话.value }).record
    order.recipientProcessing = { ...legacy, trigger: 'order_created', requestId: undefined }
    expect(push(order).成功).toBe(true)
    const wrapper = mount(RecipientResult, { props: { order }, global: { directives: { prototype: {} } } })
    expect(wrapper.text()).toContain('推仓前')
    expect(wrapper.text()).toContain('旧版创建时历史记录')
    expect(wrapper.text()).toContain('999 Historical Street')
    expect(order.recipientRequestRecords![0]!.houseNumber).toBe('712')
    wrapper.unmount()
  })
})
