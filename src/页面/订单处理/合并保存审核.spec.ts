import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { 人工发货方案, 全渠道订单 } from '../全渠道订单/类型'
import { 创建合并发货草稿, 创建拆分发货草稿, 保存人工发货方案 } from './拆合发货模型'
import {
  共享订单, 仓库执行记录, 演示库存, 订单版本, 操作核查证据, 演示路由,
  人工发货上下文, 当前版本, 执行演示合并保存并审核,
} from './演示会话'
import { 订单标志演示证据 } from './订单标志演示'
import type { 订单标志证据 } from './订单标志模型'
import { 关联演示数据 } from './库存关联模型'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
const 初始 = {
  订单: 克隆(共享订单.value), 执行: 克隆(仓库执行记录.value), 库存: 克隆(演示库存.value),
  版本: 克隆(订单版本.value), 证据: 克隆(操作核查证据.value), 标志: 克隆(订单标志演示证据),
}
function 恢复会话() {
  共享订单.value = 克隆(初始.订单); 仓库执行记录.value = 克隆(初始.执行)
  演示库存.value = 克隆(初始.库存); 订单版本.value = 克隆(初始.版本); 操作核查证据.value = 克隆(初始.证据)
  订单标志演示证据.splice(0, 订单标志演示证据.length, ...克隆(初始.标志))
}
beforeEach(恢复会话)
afterEach(恢复会话)

function 创建来源(号: string, 组号: number): 全渠道订单 {
  const 模板 = 克隆(共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-MERGE-01')!)
  return {
    ...模板, systemOrderNo: 号, platformCode: 'eBay', storeId: 'DEMO-MERGE-REVIEW-STORE', platformOrderId: `DEMO-PLATFORM-${号}`, platformOrderNo: `DEMO-PLATFORM-${号}`,
    buyerExternalId: `DEMO-MERGE-REVIEW-BUYER-${组号}`, processingStatus: '待审核', fulfillmentMode: '自配送',
    manualShippingPlan: undefined, fulfillmentOrders: [], reviews: [], operationLogs: [], blockReason: undefined, cancelledAt: undefined,
    defaultRoute: { ...演示路由[0]! }, address: { fullName: `虚构合并审核收件人${组号}`, countryCode: 'US', city: 'DEMO-CITY', addressLine1: `DEMO-MERGE-STREET-${组号}`, postalCode: 'DEMO-POSTAL' },
    items: [{ ...模板.items[0]!, externalLineId: `DEMO-LINE-${号}`, orderedQuantity: 2, fulfillableQuantity: 2, skuResolutionStatus: '成功' }],
  }
}
function 创建批次(组数 = 2) {
  const 来源 = Array.from({ length: 组数 }, (_, 组号) => [1, 2].map(序号 => 创建来源(`OMS-DEMO-MERGE-REVIEW-G${组号 + 1}-${序号}`, 组号 + 1))).flat()
  共享订单.value.push(...来源)
  const 订单 = 共享订单.value.filter(单 => 来源.some(项 => 项.systemOrderNo === 单.systemOrderNo))
  const 方案列表 = Array.from({ length: 组数 }, (_, 索引) => {
    const 方案 = 创建合并发货草稿(订单.slice(索引 * 2, 索引 * 2 + 2))
    方案.packages[0]!.route = { ...演示路由[索引 % 2]! }
    return 方案
  })
  return { 订单, 方案列表, 版本: Object.fromEntries(订单.map(单 => [单.systemOrderNo, 当前版本(单.systemOrderNo)])) }
}
function 添加标志(单: 全渠道订单, 覆盖: Partial<订单标志证据> = {}) {
  订单标志演示证据.push({ systemOrderNo: 单.systemOrderNo, storeId: 单.storeId, platformOrderId: 单.platformOrderId!, revision: 1, sourceVersion: 'DEMO-MERGE-REVIEW-V1', reliable: true, complete: true, paymentStatus: 'PAID', cancelState: 'NONE_REQUESTED', ...覆盖 })
}
function 状态快照() {
  return JSON.stringify({ 订单: 共享订单.value, 执行: 仓库执行记录.value, 库存: 演示库存.value, 版本: 订单版本.value, 来源库存: 关联演示数据.inventory })
}

describe('合并方案保存并审核', () => {
  it.each([1, 2])('%i 组合并空原因可保存并审核，各组生成共享履约且全部来源进入待推单，不推仓或扣库存', 组数 => {
    const { 订单, 方案列表, 版本 } = 创建批次(组数)
    const 原事实 = JSON.stringify(订单.map(单 => ({ items: 单.items, amount: 单.amount, address: 单.address, route: 单.defaultRoute, platform: 单.platformOrderStatus })))
    const 原执行 = JSON.stringify(仓库执行记录.value), 原库存 = JSON.stringify({ 演示: 演示库存.value, 来源: 关联演示数据.inventory })
    const 结果 = 执行演示合并保存并审核(方案列表, 版本)
    expect(结果.成功, 结果.信息).toBe(true)
    expect(结果.信息).toContain(`${组数} 组`)
    expect(订单.every(单 => 单.processingStatus === '待推单' && 单.fulfillmentOrders.length === 1 && 单.reviews.length === 1)).toBe(true)
    expect(订单.every(单 => 单.manualShippingPlan!.reason === '' && 单.reviews[0]!.status === '已通过')).toBe(true)
    expect(订单.every(单 => 当前版本(单.systemOrderNo) === 3 && 单.operationLogs.length === 2)).toBe(true)
    expect(订单.every(单 => !单.operationLogs[0]!.content.includes('原因：'))).toBe(true)
    for (const [索引, 方案] of 方案列表.entries()) {
      const 本组 = 订单.slice(索引 * 2, 索引 * 2 + 2)
      expect(本组[0]!.fulfillmentOrders).toEqual(本组[1]!.fulfillmentOrders)
      expect(本组[0]!.fulfillmentOrders[0]).toMatchObject({ fulfillmentOrderNo: `FL-${方案.id}-1`, route: 方案.packages[0]!.route, items: 方案.packages[0]!.items, plannedQuantity: 4, shippedQuantity: 0, manualPlanId: 方案.id })
      expect(本组[0]!.manualShippingPlan).not.toBe(本组[1]!.manualShippingPlan)
    }
    expect(new Set(订单.map(单 => 单.fulfillmentOrders[0]!.fulfillmentOrderNo)).size).toBe(组数)
    expect(JSON.stringify(仓库执行记录.value)).toBe(原执行)
    expect(JSON.stringify({ 演示: 演示库存.value, 来源: 关联演示数据.inventory })).toBe(原库存)
    expect(JSON.stringify(订单.map(单 => ({ items: 单.items, amount: 单.amount, address: 单.address, route: 单.defaultRoute, platform: 单.platformOrderStatus })))).toBe(原事实)
    const 完成快照 = 状态快照()
    expect(执行演示合并保存并审核(方案列表, 版本).成功).toBe(false)
    expect(状态快照()).toBe(完成快照)
  })

  it.each([
    ['版本过期', (订单: 全渠道订单[], _: 人工发货方案[]) => { 订单版本.value[订单[3]!.systemOrderNo] = 2 }, '版本'],
    ['不同收货地址', (订单: 全渠道订单[], _: 人工发货方案[]) => { 订单[3]!.address.addressLine1 = 'DEMO-OTHER-STREET' }, '完整收货地址'],
    ['数量漏分', (_: 全渠道订单[], 方案: 人工发货方案[]) => { 方案[1]!.packages[0]!.items[0]!.quantity = 1 }, '分配总数'],
    ['路由失效', (_: 全渠道订单[], 方案: 人工发货方案[]) => { 方案[1]!.packages[0]!.route.shippingChannelCode = 'DEMO-EXPIRED' }, '组合已失效'],
    ['库存不足', (订单: 全渠道订单[], _: 人工发货方案[]) => { 演示库存.value[订单[3]!.systemOrderNo] = '不足' }, '库存不足'],
    ['库存未知', (订单: 全渠道订单[], _: 人工发货方案[]) => { 演示库存.value[订单[3]!.systemOrderNo] = '结果未知' }, '库存结果未知'],
    ['取消事实', (订单: 全渠道订单[], _: 人工发货方案[]) => { 订单[3]!.cancelledAt = '2026-10-21 12:00:00 UTC+8' }, '最终取消'],
    ['平台付款或取消不满足', (订单: 全渠道订单[], _: 人工发货方案[]) => { 操作核查证据.value[订单[3]!.systemOrderNo] = { 平台允许: false, 剩余已核实: true, 零出库已核实: true } }, '付款或取消'],
    ['剩余范围未核实', (订单: 全渠道订单[], _: 人工发货方案[]) => { 操作核查证据.value[订单[3]!.systemOrderNo] = { 平台允许: true, 剩余已核实: false, 零出库已核实: true } }, '剩余范围'],
    ['仓库结果待核查', (订单: 全渠道订单[], _: 人工发货方案[]) => { 仓库执行记录.value.push({ 履约单号: 'DEMO-UNLINKED', 订单号: [订单[3]!.systemOrderNo], 出库单号: 'CK-DEMO-UNLINKED', 状态: '下单中', 待核查: true, 原因: '', 更新时间: '' }) }, '待核查'],
  ] as const)('后组%s 时全批次不保存、不审核，草稿和已有订单保持原状', (_, 修改, 提示) => {
    const { 订单, 方案列表, 版本 } = 创建批次()
    修改(订单, 方案列表)
    const 提交前 = 状态快照(), 草稿 = JSON.stringify(方案列表)
    const 结果 = 执行演示合并保存并审核(方案列表, 版本)
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain('未保存，未提交审核')
    expect(结果.信息).toContain(提示)
    expect(状态快照()).toBe(提交前)
    expect(JSON.stringify(方案列表)).toBe(草稿)
    expect(订单.every(单 => !单.manualShippingPlan && !单.reviews.length && !单.fulfillmentOrders.length && !单.operationLogs.length)).toBe(true)
  })

  it.each([
    ['退', { refunds: [{ refundId: 'DEMO-REFUND', refundStatus: 'PENDING', revision: 1, reliable: true }] }],
    ['消', { cancelState: 'IN_PROGRESS' }],
  ] as Array<[string, Partial<订单标志证据>]>)('后组任一来源自身可信“%s”标志命中则全批保留草稿，不靠审核说明解除', (标志, 覆盖) => {
    const { 订单, 方案列表, 版本 } = 创建批次()
    添加标志(订单[3]!, 克隆(覆盖))
    const 原状态 = 状态快照()
    const 结果 = 执行演示合并保存并审核(方案列表, 版本)
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain(`“${标志}”`)
    expect(状态快照()).toBe(原状态)
  })

  it('信与言不追加拦截，异源或不可靠退消证据不冒充本订单可信标志', () => {
    const { 订单, 方案列表, 版本 } = 创建批次()
    订单[0]!.address.buyerMessage = 'DEMO-买家留言'
    const 来源 = 订单[1]!
    添加标志(来源, { messages: [{ messageId: 'DEMO-INBOUND', direction: 'BUYER_INBOUND', valid: true, linkedOrder: { systemOrderNo: 来源.systemOrderNo, storeId: 来源.storeId, platformOrderId: 来源.platformOrderId! } }] })
    添加标志(订单[2]!, { cancelState: 'IN_PROGRESS', reliable: false })
    添加标志(订单[3]!, { storeId: 'DEMO-OTHER-STORE', paymentStatus: 'FULLY_REFUNDED' })
    expect(执行演示合并保存并审核(方案列表, 版本).成功).toBe(true)
    expect(订单.every(单 => 单.processingStatus === '待推单')).toBe(true)
  })

  it('已有未审核合并方案编辑后提交失败不覆盖旧案，也不审核其他组', () => {
    const { 订单, 方案列表, 版本 } = 创建批次()
    const 旧案 = 方案列表[0]!; 旧案.reason = '原合并安排'
    expect(保存人工发货方案(人工发货上下文(), 旧案, 版本).成功).toBe(true)
    方案列表[0] = 克隆(订单[0]!.manualShippingPlan!); 方案列表[0]!.reason = ''
    const 最新版本 = Object.fromEntries(订单.map(单 => [单.systemOrderNo, 当前版本(单.systemOrderNo)]))
    演示库存.value[订单[3]!.systemOrderNo] = '不足'
    const 原状态 = 状态快照()
    expect(执行演示合并保存并审核(方案列表, 最新版本).成功).toBe(false)
    expect(状态快照()).toBe(原状态)
    expect(订单[0]!.manualShippingPlan!.reason).toBe('原合并安排')
    expect(订单[2]!.manualShippingPlan).toBeUndefined()
    expect(订单.every(单 => !单.reviews.length && !单.fulfillmentOrders.length)).toBe(true)
  })

  it('空批次、漏来源版本、重复来源及非合并类型均拒绝且不改变任何订单', () => {
    const { 订单, 方案列表, 版本 } = 创建批次()
    const 提交前 = 状态快照()
    expect(执行演示合并保存并审核([], 版本).成功).toBe(false)
    expect(执行演示合并保存并审核(方案列表, {}).成功).toBe(false)
    expect(执行演示合并保存并审核([方案列表[0]!, 克隆(方案列表[0]!)], 版本).信息).toContain('重复来源')
    const 拆分 = 创建拆分发货草稿(订单[0]!); 拆分.reason = 'DEMO-拆分不能混入合并批次'
    expect(执行演示合并保存并审核([拆分], 版本).信息).toContain('只支持合并')
    expect(状态快照()).toBe(提交前)
  })
})
