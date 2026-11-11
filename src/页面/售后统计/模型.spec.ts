import { describe, expect, it } from 'vitest'
import { createDemoData } from './数据'
import { buildStatistics, createDefaultFilter, detailOrderLines, detailRecords, orderLineKey, parseMinor, parseTime, recordsForFilter, unverifiedCostRecordIds } from './模型'
import type { AfterSaleRecord, CostEvidence, DataSet } from './类型'

function fixture(): DataSet {
  const record: AfterSaleRecord = { internalId: 'as-1', no: 'AS-1', shopId: 's1', origin: '平台售后', scenario: '退货退款申请', method: '仅退货',
    sourceId: 'return-1', orderId: 'o1', orderNo: 'ORDER-1', customerId: 'buyer-1', customerName: '买家1', createdAt: '2026-09-05T02:00:00Z', updatedAt: '2026-10-02T02:00:00Z', status: '已完成', ownerId: 'staff-2',
    items: [{ orderLineId: 'l1', sku: 'SKU-A', title: '商品A', quantity: 1, problem: '运输破损', linkage: 'verified' }],
    costs: [], costCoverage: 'unknown', actions: [], handling: { evidenceId: 'h1', startedAt: '2026-09-05T02:00:00Z', endedAt: '2026-10-02T02:00:00Z', closedBy: 'staff-1' } }
  return { asOf: '2026-11-06T10:00:00Z', records: [record], shops: [{ id: 's1', name: '店铺1', site: '美国' }], staff: [{ id: 'staff-1', name: '操作人' }, { id: 'staff-2', name: '负责人' }],
    orderLines: [{ id: 'l1', shopId: 's1', orderId: 'o1', orderNo: 'ORDER-1', sku: 'SKU-A', title: '商品A', quantity: 1, createdAt: '2026-09-01T02:00:00Z', valid: true },
      { id: 'l2', shopId: 's1', orderId: 'o2', orderNo: 'ORDER-2', sku: 'SKU-A', title: '商品A', quantity: 2, createdAt: '2026-09-10T02:00:00Z', valid: true }],
    coverage: [{ shopId: 's1', ordersComplete: true, afterSalesComplete: true, from: '2026-08-01T00:00:00Z', through: '2026-11-06T10:00:00Z' }] }
}
const fullFilter = () => ({ ...createDefaultFilter(), startDate: '2026-09-01', endDate: '2026-10-31' })
function proof(id: string, value: string, extra: Partial<CostEvidence> = {}): CostEvidence { return { evidenceId: id, kind: '卖家退款承担', status: 'confirmed', value, currency: 'USD', at: '2026-10-02T03:00:00Z', source: '资金凭证', ...extra } }
function copyRecord(data: DataSet, id = 'as-2'): AfterSaleRecord { const row = structuredClone(data.records[0]!); row.internalId = id; row.no = id.toUpperCase(); data.records.push(row); return row }

describe('售后统计来源、筛选与时间', () => {
  it('完整虚构资料按内部单去重，同申请两次办理保留两张单', () => {
    const data = createDemoData(), result = buildStatistics(data, createDefaultFilter())
    expect(result.records).toHaveLength(26)
    expect(result.records.filter(row => row.sourceId === 'DEMO-RETURN-PAIR-001')).toHaveLength(2)
    expect(result.summary.orderCount).toBeLessThan(result.summary.recordCount)
    expect(result.summary.customerCount).toBeLessThan(result.summary.recordCount)
    expect(result.trend.reduce((sum, day) => sum + day.count, 0)).toBe(26)
  })
  it('北京首尾日包含毫秒，UTC前一天晚间正确归入次日', () => {
    const data = fixture(), first = data.records[0]!
    first.createdAt = '2026-09-30T16:00:00Z'
    const last = copyRecord(data); last.createdAt = '2026-10-31T15:59:59.999Z'; last.updatedAt = data.asOf
    const outside = copyRecord(data, 'outside'); outside.createdAt = '2026-10-31T16:00:00Z'; outside.updatedAt = data.asOf
    expect(recordsForFilter(data, createDefaultFilter()).map(row => row.internalId)).toEqual(['as-2', 'as-1'])
  })
  it('拒绝无偏移、未知偏移、非法日期、24时及非法日期区间', () => {
    for (const time of ['2026-11-06T12:00:00', '2026-11-06T12:00:00-00:00', '2026-02-30T12:00:00Z', '2026-11-06T24:00:00Z', '2026-11-06T12:00:00+14:30']) expect(parseTime(time)).toBeNull()
    expect(buildStatistics(fixture(), { ...fullFilter(), startDate: '2026-02-30' }).error).toBeTruthy()
  })
  it('精确SKU筛选仅去首尾空格，不按片段或标题误匹配', () => {
    expect(recordsForFilter(fixture(), { ...fullFilter(), sku: ' SKU-A ' })).toHaveLength(1)
    expect(recordsForFilter(fixture(), { ...fullFilter(), sku: 'SKU' })).toHaveLength(0)
    expect(recordsForFilter(fixture(), { ...fullFilter(), sku: 'sku-a' })).toHaveLength(0)
  })
  it('同号跨店订单和客户分别计数，缺失客户不造一个客户', () => {
    const data = fixture(), second = copyRecord(data); second.shopId = 's2'
    const unknown = copyRecord(data, 'as-3'); delete unknown.customerId; delete unknown.orderId
    const summary = buildStatistics(data, fullFilter()).summary
    expect(summary.orderCount).toBe(2); expect(summary.customerCount).toBe(2)
    expect(new Set(buildStatistics(data, fullFilter()).customerRows.map(row => row.shopId))).toEqual(new Set(['s1', 's2']))
  })
  it('未知客户逐单保留，客户当前未完成量限于本次建单批次', () => {
    const data = fixture(); delete data.records[0]!.customerId
    copyRecord(data)
    let result = buildStatistics(data, fullFilter())
    expect(result.customerRows).toHaveLength(2); expect(result.summary.customerCount).toBe(0)
    data.records[0]!.customerId = 'buyer-1'; data.records[1]!.customerId = 'buyer-1'
    data.records[1]!.createdAt = '2026-10-02T01:00:00Z'; data.records[1]!.status = '待处理'; data.records[0]!.status = '待处理'
    result = buildStatistics(data, createDefaultFilter())
    expect(result.customerRows).toHaveLength(1); expect(result.customerRows[0]!.currentPending).toBe(1)
    expect(result.customerRows[0]!.pendingRecordIds).toEqual(['as-2'])
  })
  it('只选截至时刻可用版本，未来快照不能泄露状态，非法更新时间待核实', () => {
    const data = fixture(); data.records[0]!.status = '待处理'
    const future = structuredClone(data.records[0]!); future.updatedAt = '2026-11-07T01:00:00Z'; future.status = '已完成'; data.records.push(future)
    expect(buildStatistics(data, fullFilter()).records[0]!.status).toBe('待处理')
    expect(detailRecords(data, ['as-1'])[0]!.status).toBe('待处理')
    data.records[0]!.updatedAt = '2026-11-06 12:00:00'
    const result = buildStatistics(data, fullFilter())
    expect(result.records).toHaveLength(0); expect(result.issues.some(message => message.includes('快照时间待核实'))).toBe(true)
  })
  it('店铺范围外的费用异常和身份诊断不进入筛选结果', () => {
    const data = fixture(), other = copyRecord(data); other.shopId = 's2'; other.costs = [proof('', '10.00')]; other.no = 'OTHER-SHOP'
    const result = buildStatistics(data, { ...fullFilter(), shopIds: ['s1'] })
    expect(result.records).toHaveLength(1); expect(result.issues.some(message => message.includes('OTHER-SHOP'))).toBe(false)
  })
})

describe('SKU订单批次与成熟发生率', () => {
  it('售后建单日期不截流分母/分子，同申请退货退款不翻倍', () => {
    const data = fixture(), second = copyRecord(data); second.method = '全额退款'; second.createdAt = '2026-09-20T02:00:00Z'
    const result = buildStatistics(data, createDefaultFilter()), sku = result.skuRows[0]!
    expect(result.records).toHaveLength(0)
    expect(sku.recordCount).toBe(2); expect(sku.soldLineCount).toBe(2); expect(sku.affectedLineCount).toBe(1); expect(sku.rate).toBe(0.5)
    expect(sku.denominatorLineIds).toEqual([orderLineKey('s1', 'l1'), orderLineKey('s1', 'l2')]); expect(sku.affectedLineIds).toEqual([orderLineKey('s1', 'l1')])
    expect(detailRecords(data, sku.recordIds)).toHaveLength(2)
  })
  it('来源/方式仅约束分子，不把零售后销售行排除在分母外', () => {
    const data = fixture(), second = copyRecord(data); second.origin = '内部售后'; second.method = '重发'
    const sku = buildStatistics(data, { ...fullFilter(), origins: ['内部售后'], methods: ['重发'] }).skuRows[0]!
    expect(sku.recordCount).toBe(1); expect(sku.soldLineCount).toBe(2); expect(sku.rate).toBe(0.5)
  })
  it('观察窗口左闭右开，创建后第30天的售后不入分子', () => {
    const data = fixture(); data.records[0]!.createdAt = '2026-10-01T02:00:00Z'
    expect(buildStatistics(data, fullFilter()).skuRows[0]!.affectedLineCount).toBe(0)
  })
  it('未成熟订单行单列观察中；没有成熟基数时不给0%误导', () => {
    const data = fixture(); data.orderLines.forEach(line => line.createdAt = '2026-10-25T02:00:00Z')
    const sku = buildStatistics(data, { ...fullFilter(), cohortStartDate: '2026-10-01', cohortEndDate: '2026-10-31' }).skuRows[0]!
    expect(sku.soldLineCount).toBe(0); expect(sku.observingLineCount).toBe(2); expect(sku.rate).toBeNull()
    expect(sku.observingLineIds).toEqual([orderLineKey('s1', 'l1'), orderLineKey('s1', 'l2')])
  })
  it('来源覆盖不全或订单行关联不可靠时隐藏率并保留未知SKU组', () => {
    const data = fixture(); data.coverage[0]!.afterSalesComplete = false
    expect(buildStatistics(data, fullFilter()).skuRows[0]!.rate).toBeNull()
    data.coverage[0]!.afterSalesComplete = true; data.records[0]!.items[0]!.linkage = 'unknown'
    const result = buildStatistics(data, fullFilter())
    expect(result.skuRows.find(row => row.sku === 'SKU-A')!.rate).toBeNull()
    expect(result.skuRows.find(row => row.sku === '未关联 SKU')!.recordCount).toBe(1)
  })
  it('重复采集商品行时，分母、下钻和完整导出集合使用同一去重原则', () => {
    const data = fixture(); data.orderLines.push(structuredClone(data.orderLines[0]!))
    const sku = buildStatistics(data, fullFilter()).skuRows[0]!
    expect(sku.soldLineCount).toBe(2)
    expect(detailOrderLines(data, sku.denominatorLineIds)).toHaveLength(2)
    expect(detailOrderLines(data, sku.affectedLineIds)).toHaveLength(sku.affectedLineCount)
  })
  it('跨店同裸商品行ID不串行，分子分母及观察中均用店铺复合键', () => {
    const data = fixture(), other = { ...data.orderLines[0]!, shopId: 's2', orderId: 'other-order' }
    data.orderLines.push(other)
    const onlyFirstShop = buildStatistics(data, { ...fullFilter(), shopIds: ['s1'] }).skuRows[0]!
    expect(detailOrderLines(data, onlyFirstShop.denominatorLineIds).every(line => line.shopId === 's1')).toBe(true)
    const all = buildStatistics(data, fullFilter()).skuRows[0]!
    expect(all.soldLineCount).toBe(3); expect(all.affectedLineCount).toBe(1)
    expect(detailOrderLines(data, all.denominatorLineIds)).toHaveLength(3)
    expect(detailOrderLines(data, all.affectedLineIds).map(line => line.shopId)).toEqual(['s1'])
    data.orderLines.forEach(line => line.createdAt = '2026-10-25T02:00:00Z')
    const observing = buildStatistics(data, { ...fullFilter(), cohortStartDate: '2026-10-01', cohortEndDate: '2026-10-31' }).skuRows[0]!
    expect(detailOrderLines(data, observing.observingLineIds)).toHaveLength(3)
    expect(detailOrderLines(data, ['l1'])).toHaveLength(0)
  })
})

describe('费用凭证、原币精度与归因', () => {
  it('按凭证身份去重且保留十进制精度，不因同申请多张单多算', () => {
    const data = fixture(); data.records[0]!.costs = [proof('p1', '0.10'), proof('p2', '0.20'), proof('p1', '0.10')]
    copyRecord(data)
    const result = buildStatistics(data, fullFilter())
    expect(result.summary.confirmedCosts).toEqual([{ currency: 'USD', value: '0.30', evidenceCount: 2, components: [{ currency: 'USD', value: '0.10' }, { currency: 'USD', value: '0.20' }] }])
    expect(result.costRows[0]!.confirmedCount).toBe(2)
    expect(parseMinor('9007199254740993.12', 'USD')).toBe(900719925474099312n)
    expect(parseMinor('0.001', 'USD')).toBeNull()
  })
  it('确认/待确认分开，回收单列，原币不相加，净支出只减已确认回收', () => {
    const data = fixture(); data.records[0]!.costs = [proof('p1', '20.00'), proof('p2', '8.00', { status: 'pending' }), proof('p3', '2.00', { kind: '费用回收' }), proof('p4', '5.00', { currency: 'GBP' })]
    const result = buildStatistics(data, fullFilter())
    expect(result.summary.confirmedCosts.map(row => row.value)).toEqual(['5.00', '20.00'])
    expect(result.summary.pendingCosts[0]!.value).toBe('8.00'); expect(result.summary.recoveries[0]!.value).toBe('2.00')
    expect(result.summary.netCosts.find(row => row.currency === 'USD')!.value).toBe('18.00')
    data.records[0]!.costCoverage = 'complete'
    const pendingResult = buildStatistics(data, fullFilter())
    expect(pendingResult.summary.unknownCostCount).toBe(1)
    expect(pendingResult.summary.unknownCostRecordIds).toEqual(['as-1'])
    expect(detailRecords(data, pendingResult.summary.unknownCostRecordIds)).toHaveLength(pendingResult.summary.unknownCostCount)
  })
  it('冲突凭证整笔排除，不能选首条或将两个值相加', () => {
    const data = fixture(); data.records[0]!.costs = [proof('p1', '20.00')]
    const second = copyRecord(data); second.costs[0]!.value = '30.00'
    const result = buildStatistics(data, fullFilter())
    expect(result.summary.confirmedCosts).toEqual([])
    expect(result.issues.some(message => message.includes('凭证内容冲突'))).toBe(true)
  })
  it('没有凭证是未知，未核实分摊不进入SKU金额，可靠分摊才计入', () => {
    const data = fixture(); expect(buildStatistics(data, fullFilter()).summary.unknownCostCount).toBe(1)
    data.records[0]!.costs = [proof('p1', '20.00')]
    let sku = buildStatistics(data, fullFilter()).skuRows.find(row => row.sku === 'SKU-A')!
    expect(sku.confirmedCosts).toEqual([]); expect(sku.unallocatedCount).toBe(1)
    data.records[0]!.costs[0]!.allocations = [{ orderLineId: 'l1', value: '20.00' }]
    sku = buildStatistics(data, fullFilter()).skuRows.find(row => row.sku === 'SKU-A')!
    expect(sku.confirmedCosts[0]!.value).toBe('20.00')
  })
  it('明细费用核实函数与汇总同源且不被建单期间截流', () => {
    const data = fixture(), row = data.records[0]!
    row.costCoverage = 'complete'; row.costs = [proof('p1', '20.00', { status: 'pending' })]
    expect(buildStatistics(data, createDefaultFilter()).records).toHaveLength(0)
    expect(unverifiedCostRecordIds(data, [row])).toEqual(['as-1'])
    expect(unverifiedCostRecordIds(data, [row])).toEqual(buildStatistics(data, fullFilter()).summary.unknownCostRecordIds)
    row.costs[0]!.status = 'confirmed'
    expect(unverifiedCostRecordIds(data, [row])).toEqual([])
    const duplicate = copyRecord(data); duplicate.costs[0]!.value = '30.00'
    expect(unverifiedCostRecordIds(data, [row])).toEqual(['as-1'])
    row.costs = []
    expect(unverifiedCostRecordIds(data, [row])).toEqual(['as-1'])
  })
  it('SKU分摊总和不符或指向非本单商品行时不分配金额', () => {
    const data = fixture(); data.records[0]!.costs = [proof('p1', '20.00', { allocations: [{ orderLineId: 'l2', value: '20.00' }] })]
    expect(buildStatistics(data, fullFilter()).skuRows[0]!.confirmedCosts).toEqual([])
    data.records[0]!.costs[0]!.allocations = [{ orderLineId: 'l1', value: '19.99' }]
    expect(buildStatistics(data, fullFilter()).skuRows[0]!.confirmedCosts).toEqual([])
  })
})

describe('处理人、客户、时长与问题', () => {
  it('操作人工作量按事件日期，负责人积压不受建单期间限制', () => {
    const data = fixture(), row = data.records[0]!
    row.status = '待处理'; row.handling = undefined; row.dueAt = '2026-11-05T01:00:00Z'
    row.actions = [{ id: 'action-1', at: '2026-10-02T01:00:00Z', actorId: 'staff-1', label: '核实方案', outcome: 'success', source: 'human' },
      { id: 'auto', at: '2026-10-02T01:00:00Z', actorId: 'staff-1', label: '自动回复', outcome: 'success', source: 'system' },
      { id: 'failed', at: '2026-10-02T01:00:00Z', actorId: 'staff-1', label: '发送失败', outcome: 'failed', source: 'human' }]
    const result = buildStatistics(data, createDefaultFilter())
    expect(result.records).toHaveLength(0)
    expect(result.staffRows.find(staff => staff.key === 'staff-1')!.actionCount).toBe(1)
    const owner = result.staffRows.find(staff => staff.key === 'staff-2')!
    expect(owner.actionCount).toBe(0); expect(owner.currentPending).toBe(1); expect(owner.overdueCount).toBe(1)
    expect(owner.pendingRecordIds).toEqual(['as-1'])
  })
  it('首响必须独立人工证据，自然时间含周末，缺失/逆序样本不计', () => {
    const data = fixture(), row = data.records[0]!
    row.response = { evidenceId: 'r1', startedAt: '2026-10-02T10:00:00Z', respondedAt: '2026-10-05T10:00:00Z', actorId: 'staff-1', human: true }
    let result = buildStatistics(data, fullFilter())
    expect(result.summary.firstResponseHours).toBe(72); expect(result.summary.responseSamples).toBe(1)
    row.response.human = false
    expect(buildStatistics(data, fullFilter()).summary.responseSamples).toBe(0)
    row.response.human = true; row.response.respondedAt = '2026-10-01T10:00:00Z'
    result = buildStatistics(data, fullFilter()); expect(result.summary.firstResponseHours).toBeNull()
    row.handling = undefined
    expect(buildStatistics(data, fullFilter()).summary.handlingSamples).toBe(0)
  })
  it('问题按单内去重，一单多个问题可分别涉及但费用不重复归因', () => {
    const data = fixture(), row = data.records[0]!
    row.items.push({ ...row.items[0]! }, { ...row.items[0]!, problem: '缺少配件' }); row.costs = [proof('p1', '10.00')]
    const result = buildStatistics(data, fullFilter())
    expect(result.problemRows).toHaveLength(2)
    expect(result.problemRows.every(problem => problem.count === 1 && problem.share === 1)).toBe(true)
    expect(result.problemRows.every(problem => problem.confirmedCosts.length === 0)).toBe(true)
  })
})
