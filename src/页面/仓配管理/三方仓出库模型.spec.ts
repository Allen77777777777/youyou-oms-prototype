import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { 创建出库工作台样例, 创建推单出库快照, 创建历史出库快照, 默认出库筛选, 命中出库筛选, 排序出库单据, 出库账号筛选键, 出库仓库筛选键, 取得出库详情 } from './三方仓出库模型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 演示路由, 共享订单, 仓库执行记录, 当前版本, 执行演示推单, 操作核查证据, 订单版本 } from '../订单处理/演示会话'
import { 仓库会话单据, 执行仓配会话动作, 仓配会话操作拦截, 取得出库截单影响范围, 创建仓库执行投影 } from './仓配会话'

function 深复制<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
const 截单基线 = { orders: 深复制(共享订单.value), executions: 深复制(仓库执行记录.value), rows: 深复制(仓库会话单据.value), evidence: 深复制(操作核查证据.value), versions: 深复制(订单版本.value) }
async function 恢复截单基线() {
  共享订单.value = 深复制(截单基线.orders); 仓库执行记录.value = 深复制(截单基线.executions)
  仓库会话单据.value = 深复制(截单基线.rows); 操作核查证据.value = 深复制(截单基线.evidence); 订单版本.value = 深复制(截单基线.versions)
  await nextTick()
}
function 专项旧仓单(suffix: string) {
  const no = `OUT-DEMO-ACTION-${suffix}`, existing = 仓库会话单据.value.find(row => row.no === no)
  if (existing) return existing
  const execution = 仓库执行记录.value.find(item => item.出库单号 === no)!
  const row = 创建仓库执行投影(execution)
  仓库会话单据.value.push(row)
  return row
}

function 来源(no = 'OMS-TEST-OUTBOUND'): 全渠道订单 {
  const order = JSON.parse(JSON.stringify(全渠道订单模拟数据[0])) as 全渠道订单
  order.systemOrderNo = no
  order.items = [{ ...order.items[0]!, externalLineId: `${no}-line-1`, orderedQuantity: 2, fulfillableQuantity: 2, systemSku: 'YY-CA-1048-US', skuResolutionStatus: '成功' }]
  order.fulfillmentOrders = [{ fulfillmentOrderNo: 'FULFILLMENT-TEST', status: '待执行', isActive: true, plannedQuantity: 2, shippedQuantity: 0, route: { ...演示路由[0]! } }]
  return order
}

describe('三方仓出库快照及同源筛选', () => {
  it('普通工作台基线包含十四张完整CK单据及四张详情演示仓单，不混入旧操作评审投影', () => {
    expect(截单基线.rows).toHaveLength(18)
    expect(截单基线.rows.every(row => row.no.startsWith('CK') && row.outboundDetail!.items.length > 0)).toBe(true)
    expect(截单基线.executions.some(item => item.出库单号.startsWith('OUT-'))).toBe(true)
  })
  it('新提交固化本次逐行范围，零数量行不进入出库，修改来源不改变快照', () => {
    const order = 来源()
    order.items.push({ ...order.items[0]!, externalLineId: 'zero-line', fulfillableQuantity: 0, systemSku: 'SKU-ZERO' })
    const snapshot = 创建推单出库快照([order], 'FULFILLMENT-TEST', '2026-10-10 10:00:00 UTC+8')
    expect(snapshot.snapshotReliable).toBe(true)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]).toMatchObject({ plannedQuantity: 2, shippedQuantity: 0, systemSku: 'YY-CA-1048-US', warehouseSku: 'LINK-DEMO-CA-W1', unit: '件' })
    order.items[0]!.systemSku = 'CHANGED'; order.items[0]!.fulfillableQuantity = 1; order.address.fullName = 'CHANGED'; order.fulfillmentOrders[0]!.route.warehouse = 'CHANGED'
    expect(snapshot.items[0]!.systemSku).toBe('YY-CA-1048-US')
    expect(snapshot.items[0]!.plannedQuantity).toBe(2)
    expect(snapshot.recipient!.fullName).not.toBe('CHANGED')
    expect(snapshot.route!.warehouse).toBe('万邑通美西仓')
  })
  it('历史摘要、分配总量不相等和来源行不唯一时不制造逐行数量', () => {
    const order = 来源()
    expect(创建历史出库快照([order], 'FULFILLMENT-TEST').items).toEqual([])
    order.fulfillmentOrders[0]!.plannedQuantity = 1
    expect(创建推单出库快照([order], 'FULFILLMENT-TEST', '').snapshotReliable).toBe(false)
    order.fulfillmentOrders[0]!.plannedQuantity = 4
    order.items.push({ ...order.items[0]! })
    expect(创建推单出库快照([order], 'FULFILLMENT-TEST', '').items).toEqual([])
  })
  it('合单逐来源各一件只记两件，筛选必须同一来源满足订单、平台、店铺及SKU', () => {
    const row = 创建出库工作台样例()[7]!, d = 取得出库详情(row), filter = 默认出库筛选()
    expect(row.planned).toBe(2)
    expect(d.items.reduce((sum, item) => sum + item.plannedQuantity!, 0)).toBe(2)
    filter.searchType = 'order'; filter.searchMatch = 'exact'; filter.keyword = d.sourceOrders[0]!.systemOrderNo; filter.platform = ['Temu']
    expect(命中出库筛选(row, filter)).toBe(false)
    filter.keyword = d.sourceOrders[1]!.systemOrderNo
    expect(命中出库筛选(row, filter)).toBe(true)
    filter.searchType = 'sku'; filter.keyword = d.items[0]!.systemSku!
    expect(命中出库筛选(row, filter)).toBe(false)
    filter.keyword = d.items[1]!.systemSku!; filter.shop = [d.sourceOrders[1]!.shopId]
    expect(命中出库筛选(row, filter)).toBe(true)
  })
  it('仅查询所选字段，复合账号和仓库身份不会因同名跨服务商相互命中', () => {
    const row = 创建出库工作台样例()[4]!, filter = 默认出库筛选()
    filter.keyword = row.tracking
    expect(命中出库筛选(row, filter)).toBe(false)
    filter.searchType = 'tracking'
    expect(命中出库筛选(row, filter)).toBe(true)
    filter.account = [出库账号筛选键({ ...row, provider: '另一服务商' })]
    expect(命中出库筛选(row, filter)).toBe(false)
    filter.account = [出库账号筛选键(row)]; filter.warehouse = [出库仓库筛选键(row)]
    expect(命中出库筛选(row, filter)).toBe(true)
  })
  it('精确包含推仓秒，缺失时间筛选不命中，缺失值排序末尾', () => {
    const rows = 创建出库工作台样例(), row = rows[4]!, filter = 默认出库筛选()
    filter.dates = [row.createdAt, row.createdAt]
    expect(命中出库筛选(row, filter)).toBe(true)
    filter.dateType = 'shippedAt'
    expect(命中出库筛选(rows[0]!, filter)).toBe(false)
    const sorted = 排序出库单据(rows, { field: 'shippedAt', direction: 'desc' })
    expect(sorted.slice(0, 2).every(item => !!取得出库详情(item).shippedAt)).toBe(true)
    expect(排序出库单据(rows, { field: '', direction: 'asc' })).toBe(rows)
  })
  it('创建、首次作业与更新分别读取对应时刻，缺首次作业不借用其他时间且排序末尾', () => {
    const row = 创建出库工作台样例()[3]!, filter = 默认出库筛选()
    row.createdAt = '2026-10-10 08:01:02'; row.outboundDetail!.operationStartedAt = '2026-10-10 09:03:04'; row.updatedAt = '2026-10-10 11:05:06'
    const values = { createdAt: row.createdAt, operationStartedAt: row.outboundDetail!.operationStartedAt!, updatedAt: row.updatedAt }
    for (const field of ['createdAt', 'operationStartedAt', 'updatedAt'] as const) {
      filter.dateType = field
      for (const candidate of Object.keys(values) as Array<keyof typeof values>) {
        filter.dates = [values[candidate], values[candidate]]
        expect(命中出库筛选(row, filter)).toBe(candidate === field)
      }
    }
    const missing = 深复制(row); missing.id += '-missing'; missing.outboundDetail!.operationStartedAt = null
    filter.dateType = 'operationStartedAt'
    for (const time of Object.values(values)) { filter.dates = [time, time]; expect(命中出库筛选(missing, filter)).toBe(false) }
    for (const direction of ['asc', 'desc'] as const) expect(排序出库单据([missing, row], { field: 'operationStartedAt', direction }).map(item => item.id)).toEqual([row.id, missing.id])
    const earlier = 深复制(row); earlier.id += '-earlier'; earlier.updatedAt = '2026-10-10 10:00:00'
    expect(排序出库单据([row, earlier], { field: 'updatedAt', direction: 'asc' }).map(item => item.id)).toEqual([earlier.id, row.id])
  })
})

describe('出库工作台安全共享操作', () => {
  it('推单提交保存范围，后续路由、收件和源SKU修改不覆盖出库快照', async () => {
    const order = 共享订单.value.find(item => item.systemOrderNo === 'OMS-DEMO-ACTION-07')!
    const result = 执行演示推单(order.systemOrderNo, 'FL-DEMO-ACTION-07', 当前版本(order.systemOrderNo))
    expect(result.成功).toBe(true)
    await nextTick()
    const row = 仓库会话单据.value.find(item => item.no === result.对象号)!, before = JSON.parse(JSON.stringify(取得出库详情(row)))
    expect(before.items).toHaveLength(1)
    expect(取得出库详情(row).acceptedAt).toBeNull()
    expect(取得出库详情(row).lastSyncedAt).toBeNull()
    expect(执行仓配会话动作(row, '查询结果').success).toBe(true)
    expect(row.status).toBe('待出库')
    // 查到明确建单只证明受理结果，不证明受理发生时刻；不能用查询时间补仓库事件时间。
    expect(取得出库详情(row).acceptedAt).toBeNull()
    expect(取得出库详情(row).lastSyncedAt).toBeTruthy()
    order.fulfillmentOrders[0]!.route.warehouse = '变化后的仓库'; order.items[0]!.systemSku = '变化后的SKU'; order.address.addressLine1 = '变化后的地址'
    await nextTick()
    expect(取得出库详情(row).items).toEqual(before.items)
    expect(取得出库详情(row).recipient).toEqual(before.recipient)
    expect(row.warehouse).toBe(before.route.warehouse)
  })
  it('查询未查到、未知与接口失败保留可信状态/量/时间，不生成新的执行对象', async () => {
    for (const suffix of ['11', '16', '30']) {
      const row = 专项旧仓单(suffix)
      const original = { status: row.status, planned: row.planned, shipped: row.shipped, syncedAt: 取得出库详情(row).lastSyncedAt, count: 仓库执行记录.value.length }
      const result = 执行仓配会话动作(row, '查询结果')
      expect(result.success).toBe(false)
      await nextTick()
      expect(row.status).toBe(original.status); expect(row.planned).toBe(original.planned); expect(row.shipped).toBe(original.shipped)
      expect(取得出库详情(row).lastSyncedAt).toBe(original.syncedAt)
      expect(仓库执行记录.value.length).toBe(original.count)
      if (suffix !== '16') expect(row.awaitingCheck).toBe(true)
    }
  })
  it('已修复失败复用原单重提，全来源门禁继续阻止未修复或方案变化', () => {
    const row = 专项旧仓单('08')
    expect(row.createdAt).toBe('')
    expect(取得出库详情(row).submittedAt).toBeNull()
    expect(仓配会话操作拦截(row, '重新提交')).toBe('')
    expect(执行仓配会话动作(row, '重新提交').success).toBe(false)
    const count = 仓库执行记录.value.length
    expect(执行仓配会话动作(row, '重新提交', { 修复说明: '核查账号渠道已开通，原请求明确未生效' }).success).toBe(true)
    expect(row.no).toBe('OUT-DEMO-ACTION-08'); expect(row.status).toBe('下单中'); expect(row.awaitingCheck).toBe(true)
    // 旧出库对象的创建时间仍未知；重新提交时间是本次推仓时间，不能反填创建时间。
    expect(row.createdAt).toBe('')
    expect(取得出库详情(row).submittedAt).toBeTruthy()
    expect(仓库执行记录.value.length).toBe(count)
    for (const suffix of ['09', '31']) expect(仓配会话操作拦截(专项旧仓单(suffix), '重新提交')).not.toBe('')
  })
  it('同一履约的不同历史出库对象不会覆盖来源/路由快照或合并为一行', async () => {
    专项旧仓单('13')
    const execution = 仓库执行记录.value.find(item => item.出库单号 === 'OUT-DEMO-ACTION-13')!
    const historical = { ...execution, 出库单号: 'OUT-TEST-HISTORICAL-PATH', 出库快照: undefined }
    仓库执行记录.value.push(historical)
    await nextTick()
    const rows = 仓库会话单据.value.filter(item => item.fulfillment === execution.履约单号)
    expect(rows.some(item => item.no === execution.出库单号)).toBe(true)
    expect(rows.some(item => item.no === historical.出库单号)).toBe(true)
    expect(new Set(rows.map(item => item.id)).size).toBe(rows.length)
    const order = 共享订单.value.find(item => item.systemOrderNo === execution.订单号[0])!
    const fulfillment = order.fulfillmentOrders.find(item => item.fulfillmentOrderNo === execution.履约单号)!
    fulfillment.shippedQuantity = 2; fulfillment.trackingNumber = 'NEW-PATH-TRACKING'
    await nextTick()
    expect(rows.every(item => item.shipped === 0 && item.tracking === '')).toBe(true)
    expect(rows.every(item => 取得出库详情(item).quantitySummary.shippedQuantity === 0)).toBe(true)
    仓库执行记录.value.pop()
  })
  it('明确出库只更新本单累计事实，无来源行回执时逐商品实际数为空', async () => {
    const order = 来源('OMS-TEST-SHIP-FACT')
    order.processingStatus = '待发货'; order.blockReason = undefined; order.cancelledAt = undefined
    共享订单.value.push(order)
    操作核查证据.value[order.systemOrderNo] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true, 同步结果: '已出库' }
    const snapshot = 创建推单出库快照([order], 'FULFILLMENT-TEST', '2026-10-10 10:00:00 UTC+8')
    仓库执行记录.value.push({ 履约单号: 'FULFILLMENT-TEST', 订单号: [order.systemOrderNo], 出库单号: 'OUT-TEST-SHIP-FACT', 三方仓出库单号: 'WH-TEST-SHIP-FACT', 状态: '待出库', 待核查: false, 原因: '', 更新时间: '2026-10-10 10:00:00 UTC+8', 出库快照: snapshot, 出库事实: { planned: 2, shipped: 0, tracking: null, shippedAt: null } })
    await nextTick()
    const row = 仓库会话单据.value.find(item => item.no === 'OUT-TEST-SHIP-FACT')!
    expect(执行仓配会话动作(row, '查询结果').success).toBe(true)
    expect(row.status).toBe('已出库')
    expect(取得出库详情(row).quantitySummary).toMatchObject({ plannedQuantity: 2, shippedQuantity: 2 })
    expect(取得出库详情(row).items[0]).toMatchObject({ plannedQuantity: 2, shippedQuantity: null, lineStatus: '出库量待核实' })
    expect(row.tracking).not.toBe('')
    共享订单.value.pop(); 仓库执行记录.value.pop(); delete 操作核查证据.value[order.systemOrderNo]
  })
})

describe('三方仓出库单截单适配', () => {
  beforeEach(恢复截单基线)
  afterEach(恢复截单基线)
  const rowFor = 专项旧仓单
  const optionsFor = (suffix: string) => ({ 截单原因: '买家已取消，请停止仓库发货', 确认全部来源: true, 批量: false, 版本表: 取得出库截单影响范围(rowFor(suffix)).versions })

  it('预检完整显示本仓单来源及数量，确认、全部版本和原因缺失均不产生尝试', () => {
    const row = rowFor('12'), impact = 取得出库截单影响范围(row), before = 深复制(row)
    expect(impact.blocker).toBe('')
    expect(impact.sourceOrders).toEqual([expect.objectContaining({ systemOrderNo: 'OMS-DEMO-ACTION-12', platformOrderNo: expect.any(String), platform: 'eBay', shopId: 'demo-ebay-actions', processingStatus: '待发货' })])
    expect(impact.quantitySummary).toMatchObject({ plannedQuantity: 2, shippedQuantity: 0, unit: null })
    expect(impact.isShared).toBe(false)
    const options = optionsFor('12')
    for (const invalid of [{ ...options, 确认全部来源: false }, { ...options, 版本表: {} }, { ...options, 截单原因: '   ' }, { ...options, 截单原因: '原'.repeat(501) }]) {
      expect(执行仓配会话动作(row, '截单', invalid).success).toBe(false)
      expect(row).toEqual(before)
    }
  })

  it('只申请本出库单截单，受理与明确取消分别更新仓库状态，订单阶段及原单身份不变', async () => {
    const row = rowFor('12'), order = 共享订单.value.find(item => item.systemOrderNo === 'OMS-DEMO-ACTION-12')!
    const original = { no: row.no, fulfillment: row.fulfillment, source: 深复制(取得出库详情(row).sourceOrders), quantity: 深复制(取得出库详情(row).quantitySummary), route: 深复制(取得出库详情(row).route), count: 仓库执行记录.value.length, phase: order.processingStatus }
    const options = optionsFor('12'); options.截单原因 = '  买家已取消，请停止仓库发货  '
    expect(执行仓配会话动作(row, '截单', options).success).toBe(true)
    await nextTick()
    expect(row.status).toBe('取消中'); expect(row.awaitingCheck).toBe(true)
    expect(order.processingStatus).toBe(original.phase)
    expect(row.attempts).toHaveLength(1); expect(row.attempts[0]!.action).toBe('截单')
    expect(order.operationLogs.some(log => log.content.includes('买家已取消，请停止仓库发货'))).toBe(true)
    expect(执行仓配会话动作(row, '截单', options).success).toBe(false)
    expect(row.attempts).toHaveLength(1)
    expect(执行仓配会话动作(row, '查询结果').success).toBe(true)
    await nextTick()
    expect(row.status).toBe('已取消'); expect(row.awaitingCheck).toBe(false)
    expect(order.processingStatus).toBe(original.phase)
    expect(row.no).toBe(original.no); expect(row.fulfillment).toBe(original.fulfillment)
    expect(仓库执行记录.value.length).toBe(original.count)
    expect(取得出库详情(row).sourceOrders).toEqual(original.source)
    expect(取得出库详情(row).quantitySummary).toEqual(original.quantity)
    expect(取得出库详情(row).route).toEqual(original.route)
    expect(仓配会话操作拦截(row, '重新提交')).not.toBe('')
    expect(仓配会话操作拦截(row, '截单')).not.toBe('')
  })

  it('共享仓单须核对两份完整来源，显式批量即使一张仓单也阻断，单个作用于全部来源', async () => {
    const row = rowFor('SHARED'), impact = 取得出库截单影响范围(row)
    expect(impact.isShared).toBe(true); expect(impact.blocker).toBe('')
    expect(impact.sourceOrders.map(source => source.systemOrderNo)).toEqual(['OMS-DEMO-ACTION-33', 'OMS-DEMO-ACTION-34'])
    expect(Object.keys(impact.versions)).toEqual(['OMS-DEMO-ACTION-33', 'OMS-DEMO-ACTION-34'])
    expect(impact.quantitySummary).toMatchObject({ plannedQuantity: 2, shippedQuantity: 0 })
    const options = optionsFor('SHARED'), count = 仓库执行记录.value.length
    expect(执行仓配会话动作(row, '截单', { ...options, 版本表: { 'OMS-DEMO-ACTION-33': impact.versions['OMS-DEMO-ACTION-33']! } }).success).toBe(false)
    expect(取得出库截单影响范围(row, true).blocker).not.toBe('')
    expect(执行仓配会话动作(row, '截单', { ...options, 批量: true }).success).toBe(false)
    expect(row.attempts).toHaveLength(0)
    expect(执行仓配会话动作(row, '截单', options).success).toBe(true)
    await nextTick()
    expect(row.status).toBe('取消中'); expect(仓库执行记录.value.length).toBe(count)
    for (const no of ['OMS-DEMO-ACTION-33', 'OMS-DEMO-ACTION-34']) {
      const source = 共享订单.value.find(item => item.systemOrderNo === no)!
      expect(source.processingStatus).toBe('待发货')
      expect(source.operationLogs.some(log => log.operationType === '截单' && log.content.includes('OMS-DEMO-ACTION-33') && log.content.includes('OMS-DEMO-ACTION-34'))).toBe(true)
    }
  })

  it('预检后任一来源版本变化在发送前拒绝，保持仓库事实、操作记录和接口尝试', () => {
    const row = rowFor('SHARED'), options = optionsFor('SHARED'), before = 深复制(row)
    订单版本.value['OMS-DEMO-ACTION-34'] = 当前版本('OMS-DEMO-ACTION-34') + 1
    const result = 执行仓配会话动作(row, '截单', options)
    expect(result.success).toBe(false); expect(result.reason).toContain('已变化')
    expect(row).toEqual(before)
    expect(仓库执行记录.value.find(item => item.出库单号 === row.no)!.状态).toBe('待出库')
  })

  it('未知、部分出库、取消中、已取消及不支持能力均阻断，独立样例不伪造关联或仓库能力', () => {
    for (const suffix of ['11', '13', '14', '15', '16', '29', '30']) {
      const row = rowFor(suffix), before = 深复制(row)
      expect(仓配会话操作拦截(row, '截单')).not.toBe('')
      expect(执行仓配会话动作(row, '截单', optionsFor(suffix)).success).toBe(false)
      expect(row).toEqual(before)
    }
    const samples = 仓库会话单据.value.filter(row => !row.id.startsWith('shared-')), count = 仓库执行记录.value.length
    expect(samples).toHaveLength(14)
    expect(new Set(samples.map(row => row.provider)).size).toBe(5)
    for (const row of samples) {
      expect(仓配会话操作拦截(row, '截单')).toContain('关联订单')
      expect(执行仓配会话动作(row, '截单', { 截单原因: '停止发货', 确认全部来源: true, 版本表: Object.fromEntries(取得出库详情(row).sourceOrders.map(source => [source.systemOrderNo, 1])) }).success).toBe(false)
    }
    expect(仓库执行记录.value.length).toBe(count)
  })

  it('未知零数量、缺少阶段能力及来源范围或账号变化不能绕过截单预检', () => {
    const row = rowFor('12'), source = 共享订单.value.find(item => item.systemOrderNo === 'OMS-DEMO-ACTION-12')!, evidence = 操作核查证据.value[source.systemOrderNo]!
    row.outboundDetail!.quantitySummary.shippedQuantity = null; row.shipped = 0
    expect(仓配会话操作拦截(row, '截单')).toContain('零出库')
    row.outboundDetail!.quantitySummary.shippedQuantity = 0
    Reflect.deleteProperty(evidence, '零出库已核实')
    expect(仓配会话操作拦截(row, '截单')).toContain('零出库')
    evidence.零出库已核实 = true; evidence.截单阶段可撤 = undefined
    expect(仓配会话操作拦截(row, '截单')).toContain('截单能力')
    evidence.截单阶段可撤 = true
    row.outboundDetail!.sourceOrders = []
    expect(取得出库截单影响范围(row).sourceOrders.map(item => item.systemOrderNo)).toEqual([source.systemOrderNo])
    expect(仓配会话操作拦截(row, '截单')).toContain('来源范围已变化')
    row.outboundDetail!.sourceOrders = 深复制(创建仓库执行投影(仓库执行记录.value.find(item => item.出库单号 === row.no)!).outboundDetail!.sourceOrders)
    source.fulfillmentOrders[0]!.route.warehouseAccount = '其他仓库账号'
    expect(仓配会话操作拦截(row, '截单')).toContain('快照与来源关联不一致')
  })

  it('仓库拒绝取消保留待出库事实，平台取消中的来源可止发但仍保留OMS异常', async () => {
    const refused = rowFor('26')
    expect(执行仓配会话动作(refused, '截单', optionsFor('26')).success).toBe(true)
    expect(执行仓配会话动作(refused, '查询结果').success).toBe(true)
    await nextTick()
    expect(refused.status).toBe('待出库'); expect(refused.reason).toContain('拒绝')
    expect(取得出库详情(refused).quantitySummary.shippedQuantity).toBe(0)
    const cancel = rowFor('20'), order = 共享订单.value.find(item => item.systemOrderNo === 'OMS-DEMO-ACTION-20')!
    expect(order.processingStatus).toBe('异常')
    expect(执行仓配会话动作(cancel, '截单', optionsFor('20')).success).toBe(true)
    expect(执行仓配会话动作(cancel, '查询结果').success).toBe(true)
    await nextTick()
    expect(cancel.status).toBe('已取消'); expect(order.processingStatus).toBe('异常')
    expect(仓配会话操作拦截(cancel, '重新提交')).not.toBe('')
  })
})
