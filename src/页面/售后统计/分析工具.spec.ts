import { describe, expect, it } from 'vitest'
import { buildBacklog, buildCurrencyRows, buildExecutionRows, buildReasonRows, collectCostEvidence, collectExecutionEvidence, getReasonCategory, reasonCategories } from './分析工具'
import { buildStatistics, createDefaultFilter } from './模型'
import { createDemoData } from './数据'
import type { AfterSaleRecord, CostEvidence, DataSet, ExecutionEvidence } from './类型'

function fixture(): DataSet {
  const record: AfterSaleRecord = { internalId: 'as-1', no: 'AS-1', shopId: 's1', origin: '平台售后', scenario: '退货退款申请', method: '全额退款',
    orderId: 'order-1', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-11-06T10:00:00Z', status: '待处理', ownerId: 'person-1',
    items: [{ orderLineId: 'line-a', sku: 'SKU-A', title: '商品A', quantity: 1, problem: '运输破损', linkage: 'verified' },
      { orderLineId: 'line-b', sku: 'SKU-B', title: '商品B', quantity: 1, problem: '功能异常', linkage: 'verified' }], costs: [], actions: [], costCoverage: 'unknown' }
  return { asOf: '2026-11-06T10:00:00Z', records: [record], shops: [{ id: 's1', name: '店铺一', site: '美国' }], staff: [{ id: 'person-1', name: '人员一' }], coverage: [],
    orderLines: [{ id: 'line-a', shopId: 's1', orderId: 'order-1', orderNo: 'ORDER-1', sku: 'SKU-A', title: '商品A', quantity: 1, createdAt: '2026-09-01T10:00:00Z', valid: true },
      { id: 'line-b', shopId: 's1', orderId: 'order-1', orderNo: 'ORDER-1', sku: 'SKU-B', title: '商品B', quantity: 1, createdAt: '2026-09-01T10:00:00Z', valid: true }] }
}
function copyRecord(data: DataSet, id = 'as-2'): AfterSaleRecord { const row = structuredClone(data.records[0]!); row.internalId = id; row.no = id.toUpperCase(); data.records.push(row); return row }
const proof = (extra: Partial<CostEvidence> = {}): CostEvidence => ({ evidenceId: 'proof-1', kind: '卖家退款承担', value: '30.00', currency: 'USD', status: 'confirmed', at: '2026-10-02T10:00:00Z', source: '费用凭证',
  allocations: [{ orderLineId: 'line-a', value: '10.00' }, { orderLineId: 'line-b', value: '20.00' }], ...extra })
const resultProof = (extra: Partial<ExecutionEvidence> = {}): ExecutionEvidence => ({ id: 'result-1', kind: 'refund', outcome: 'success', at: '2026-10-02T10:00:00Z', source: '平台独立退款结果', reference: 'REFUND-1', ...extra })

describe('售后原因分类与商品范围', () => {
  it('显式覆盖22项现有原因，未知原文保留且归待归类', () => {
    const reasons = ['平台退款', '质量问题', '未收到', '破损', '分开发货', '不合适', '描述不符', '发错货', '缺货', '少件', '买家平台退款', '无理由退货', '仓库退回', '退快递费', '少配件', '退差价', '派送失败退回了', '客户抱怨物流问题', '退货已签收', '修改好评', '客户要取消', '运费太贵']
    expect(reasons.every(reason => getReasonCategory(reason) !== '待归类')).toBe(true)
    expect(reasonCategories).toEqual(['全部', '产品相关', '描述相关', '履约物流', '买家意愿', '业务处理', '待归类'])
    const data = fixture(); data.records[0]!.items[0]!.problem = '  尚未确认的新原因  '
    const rows = buildReasonRows(data, data.records, '待归类', 'SKU-A')
    expect(rows[0]).toMatchObject({ name: '  尚未确认的新原因  ', category: '待归类', count: 1 })
    expect(data.records[0]!.items[0]!.problem).toBe('  尚未确认的新原因  ')
  })
  it('SKU筛选只取本次命中商品的原因，不带出同单其他SKU原因', () => {
    const data = fixture()
    expect(buildReasonRows(data, data.records, '全部', ' SKU-A ').map(row => row.name)).toEqual(['运输破损'])
    expect(buildReasonRows(data, data.records, '产品相关', 'SKU-A')).toEqual([])
    expect(buildReasonRows(data, data.records, '产品相关', 'SKU-B')[0]!.skus[0]!.sku).toBe('SKU-B')
  })
  it('同单重复商品明细不刷单量，未知SKU不虚构商品身份，跨店同订单分别计数', () => {
    const data = fixture(); data.records[0]!.items.push(structuredClone(data.records[0]!.items[0]!))
    const second = copyRecord(data); second.shopId = 's2'; second.items[0]!.linkage = 'unknown'; second.items[2]!.linkage = 'unknown'
    const row = buildReasonRows(data, data.records).find(item => item.name === '运输破损')!
    expect(row.count).toBe(2); expect(row.orderCount).toBe(2); expect(row.skuCount).toBe(1)
    expect(row.skus[0]!.count).toBe(1); expect(row.skus[0]!.recordIds).toEqual(['as-1'])
  })
  it('筛选SKU或分析分类隐藏其他原因后，不把多原因同笔费用复制归给可见原因', () => {
    const data = fixture(); data.records[0]!.costs = [proof()]
    expect(buildReasonRows(data, data.records, '履约物流', 'SKU-A')[0]!.confirmedCosts).toEqual([])
    expect(buildReasonRows(data, data.records, '产品相关', 'SKU-B')[0]!.confirmedCosts).toEqual([])
    // 即使本单已只有一个原因，筛选外共享同凭证的另一单有不同原因，仍不可归因。
    const other = copyRecord(data); other.items = [{ ...other.items[0]!, problem: '功能异常' }]
    data.records[0]!.items.forEach(item => item.problem = '运输破损')
    expect(buildReasonRows(data, [data.records[0]!], '履约物流', 'SKU-A')[0]!.confirmedCosts).toEqual([])
  })
  it('只有整笔凭证全部引用商品都属唯一原始原因时归因；SKU筛选仅计核实份额且排除回收待核实', () => {
    const data = fixture(); data.records[0]!.items.forEach(item => item.problem = '运输破损')
    data.records[0]!.costs = [proof(), proof({ evidenceId: 'pending', status: 'pending' }), proof({ evidenceId: 'recovery', kind: '费用回收' })]
    expect(buildReasonRows(data, data.records)[0]!.confirmedCosts).toEqual([{ currency: 'USD', value: '30.00', evidenceCount: 1, components: [{ value: '30.00', currency: 'USD' }] }])
    expect(buildReasonRows(data, data.records, '全部', 'SKU-A')[0]!.confirmedCosts).toEqual([{ currency: 'USD', value: '10.00', evidenceCount: 1, components: [{ value: '10.00', currency: 'USD' }] }])
    data.records[0]!.costs[0]!.allocations = undefined
    expect(buildReasonRows(data, data.records)[0]!.confirmedCosts[0]!.value).toBe('30.00')
    expect(buildReasonRows(data, data.records, '全部', 'SKU-A')[0]!.confirmedCosts).toEqual([])
    const incompleteReference = copyRecord(data); incompleteReference.items = []
    expect(buildReasonRows(data, [data.records[0]!])[0]!.confirmedCosts).toEqual([])
  })
})

describe('费用凭证核验与本次SKU份额', () => {
  it('完整核验凭证后只取指定SKU份额，整笔关联金额与SKU分摊分别保留', () => {
    const data = fixture(); data.records[0]!.costs = [proof(), proof()]; copyRecord(data)
    const evidence = collectCostEvidence(data, [data.records[0]!], 'SKU-A')
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ value: '30.00', allocatedValue: '10.00', allocationValid: true, recordIds: ['as-1'] })
    expect(buildCurrencyRows(evidence)).toEqual([{ currency: 'USD', confirmed: '30.00', recovery: null, pending: null, allocated: '10.00', unallocatedCount: 0 }])
    expect(collectCostEvidence(data, data.records)[0]!.allocatedValue).toBe('30.00')
  })
  it('筛选外同店相同凭证冲突仍整笔排除，不能用已选子集放过冲突', () => {
    const data = fixture(); data.records[0]!.costs = [proof()]
    const other = copyRecord(data); other.costs[0]!.value = '40.00'
    expect(collectCostEvidence(data, [data.records[0]!])).toEqual([])
  })
  it('费用来源、日期冲突及缺来源在摘要、项目构成、凭证明细和待核实范围保持一致', () => {
    for (const variant of ['source', 'at', 'missing-source'] as const) {
      const data = fixture(); data.records[0]!.costs = [proof()]; data.records[0]!.costCoverage = 'complete'
      const second = copyRecord(data)
      if (variant === 'source') second.costs[0]!.source = '另一来源'
      else if (variant === 'at') second.costs[0]!.at = '2026-10-03T10:00:00Z'
      else second.costs[0]!.source = ''
      const result = buildStatistics(data, createDefaultFilter()), evidence = collectCostEvidence(data, result.records)
      expect(result.summary.confirmedCosts).toEqual([]); expect(result.costRows).toEqual([])
      expect(evidence).toEqual([]); expect(buildCurrencyRows(evidence)).toEqual([])
      expect(result.summary.unknownCostRecordIds).toEqual(['as-1', 'as-2'])
      expect(result.issues.some(issue => issue.includes('凭证内容冲突'))).toBe(true)
    }
  })
  it('同一费用时刻的UTC与带偏移表达不制造冲突，各展示层金额一致', () => {
    const data = fixture(); data.records[0]!.costs = [proof()]
    const second = copyRecord(data); second.costs[0]!.at = '2026-10-02T18:00:00+08:00'
    const result = buildStatistics(data, createDefaultFilter()), evidence = collectCostEvidence(data, result.records)
    expect(result.summary.confirmedCosts[0]!.value).toBe('30.00')
    expect(result.costRows[0]!.confirmed).toBe('30.00')
    expect(buildCurrencyRows(evidence)[0]!.confirmed).toBe('30.00')
    expect(evidence).toHaveLength(1)
  })
  it('分摊不足、重复行、异币和同店原订单关联错误均不分摊，保留有效原币凭证', () => {
    const invalidAllocations = [
      [{ orderLineId: 'line-a', value: '29.99' }],
      [{ orderLineId: 'line-a', value: '10.00' }, { orderLineId: 'line-a', value: '20.00' }],
      [{ orderLineId: 'line-a', value: '30.00', currency: 'EUR' }],
      [{ orderLineId: 'other-line', value: '30.00' }],
    ]
    for (const allocations of invalidAllocations) {
      const data = fixture(); data.records[0]!.costs = [proof({ allocations })]
      const evidence = collectCostEvidence(data, data.records, 'SKU-A')
      expect(evidence[0]).toMatchObject({ value: '30.00', allocatedValue: null, allocationValid: false })
      expect(buildCurrencyRows(evidence)[0]).toMatchObject({ confirmed: '30.00', allocated: null, unallocatedCount: 1 })
    }
    const data = fixture(); data.records[0]!.costs = [proof()]; data.orderLines[0]!.shopId = 'other-shop'
    expect(collectCostEvidence(data, data.records)[0]!.allocationValid).toBe(false)
    data.orderLines[0]!.shopId = 's1'; data.orderLines[0]!.orderId = 'other-order'
    expect(collectCostEvidence(data, data.records)[0]!.allocationValid).toBe(false)
  })
  it('即使来源分摊标记存在，未知商品或有冲突的订单行都不能形成可信份额', () => {
    const data = fixture(); data.records[0]!.costs = [proof()]; data.records[0]!.items[0]!.linkage = 'unknown'
    expect(collectCostEvidence(data, data.records)[0]!.allocationValid).toBe(false)
    data.records[0]!.items[0]!.linkage = 'verified'
    data.orderLines.push({ ...data.orderLines[0]!, sku: 'OTHER-SKU' })
    expect(collectCostEvidence(data, data.records)[0]!.allocationValid).toBe(false)
  })
  it('币种分别精确相加，确认分摊排除pending和回收；零金额与缺依据区分', () => {
    const data = fixture(); data.records[0]!.costs = [
      proof({ value: '0.10', allocations: [{ orderLineId: 'line-a', value: '0.10' }] }),
      proof({ evidenceId: 'p2', value: '0.20', allocations: [{ orderLineId: 'line-a', value: '0.20' }] }),
      proof({ evidenceId: 'p3', status: 'pending' }), proof({ evidenceId: 'p4', kind: '费用回收' }),
      proof({ evidenceId: 'p5', value: '0.00', currency: 'EUR', allocations: [{ orderLineId: 'line-a', value: '0.00' }] }),
    ]
    const rows = buildCurrencyRows(collectCostEvidence(data, data.records, 'SKU-A'))
    expect(rows.find(row => row.currency === 'USD')).toMatchObject({ confirmed: '0.30', pending: '30.00', recovery: '30.00', allocated: '0.30' })
    expect(rows.find(row => row.currency === 'EUR')).toMatchObject({ confirmed: '0.00', pending: null, recovery: null, allocated: '0.00' })
  })
  it('非法、未来和来源冲突凭证不混入当前依据，相同ID跨店仍独立', () => {
    const data = fixture(); data.records[0]!.costs = [proof(), proof({ evidenceId: 'future', at: '2026-12-01T10:00:00Z' }), proof({ evidenceId: 'invalid', at: '2026-10-02 10:00:00' })]
    const other = copyRecord(data); other.shopId = 's2'; other.costs = [proof({ allocations: undefined })]
    expect(collectCostEvidence(data, data.records)).toHaveLength(2)
    other.shopId = 's1'; other.costs[0]!.source = '另一份来源'
    expect(collectCostEvidence(data, [data.records[0]!])).toEqual([])
  })
})

describe('独立业务执行结果', () => {
  it('登记方式、内部完成及人工成功动作都不能推导执行成功', () => {
    const data = fixture(); data.records[0]!.status = '已完成'
    data.records[0]!.actions = [{ id: 'a1', at: '2026-10-02T10:00:00Z', actorId: 'person-1', source: 'human', outcome: 'success', label: '办理成功' }]
    expect(collectExecutionEvidence(data, data.records)).toEqual([])
    expect(buildExecutionRows(data, data.records).every(row => row.count === 0)).toBe(true)
  })
  it('相同证据跨单引用仅计一次，关联单据保留；同号跨店独立', () => {
    const data = fixture(); data.records[0]!.results = [resultProof(), resultProof()]; copyRecord(data)
    let evidence = collectExecutionEvidence(data, data.records)
    expect(evidence).toHaveLength(1); expect(evidence[0]!.recordIds).toEqual(['as-1', 'as-2'])
    expect(buildExecutionRows(data, data.records).find(row => row.kind === 'refund' && row.outcome === 'success')!.count).toBe(1)
    data.records[1]!.shopId = 's2'; evidence = collectExecutionEvidence(data, data.records)
    expect(evidence).toHaveLength(2)
  })
  it('同店筛选外冲突、非法日期及未来结果不当作成功', () => {
    const data = fixture(); data.records[0]!.results = [resultProof(), resultProof({ id: 'future', at: '2026-12-01T10:00:00Z' }), resultProof({ id: 'invalid', at: '2026-10-02 10:00:00' })]
    expect(collectExecutionEvidence(data, data.records).map(row => row.id)).toEqual(['result-1'])
    const other = copyRecord(data); other.results = [resultProof({ outcome: 'failed' })]
    expect(collectExecutionEvidence(data, [data.records[0]!])).toEqual([])
    expect(buildExecutionRows(data, data.records).every(row => row.count === 0)).toBe(true)
  })
  it('成功失败未知各自保留，演示资料有缺失且不被办理状态填补', () => {
    const data = createDemoData(), rows = buildExecutionRows(data, data.records)
    expect(rows.find(row => row.kind === 'refund' && row.outcome === 'success')!.count).toBe(1)
    expect(rows.find(row => row.kind === 'return' && row.outcome === 'success')!.count).toBe(1)
    expect(rows.some(row => row.outcome === 'failed' && row.count > 0)).toBe(true)
    expect(rows.some(row => row.outcome === 'unknown' && row.count > 0)).toBe(true)
    expect(data.records.some(row => row.status === '已完成' && !row.results?.length)).toBe(true)
  })
})

describe('当前积压与建单龄', () => {
  it('不受任何期间日期截断，仍遵守店铺场景方式SKU范围和当前版本', () => {
    const data = fixture(), outside = copyRecord(data); outside.shopId = 's2'
    const result = buildBacklog(data, { ...createDefaultFilter(), startDate: '2026-12-01', endDate: '2026-12-31', cohortStartDate: '2026-12-01', cohortEndDate: '2026-12-31', shopIds: ['s1'], sku: 'SKU-A' })
    expect(result.allIds).toEqual(['as-1'])
    expect(buildBacklog(data, { ...createDefaultFilter(), methods: ['重发'] }).records).toEqual([])
    data.records[0]!.status = '已完成'
    expect(buildBacklog(data, { ...createDefaultFilter(), shopIds: ['s1'] }).records).toEqual([])
  })
  it('按建单至截至时点的完整自然天分组，不借最后动作重置单龄', () => {
    const data = fixture(); data.records = []
    for (const days of [0, 2, 3, 7, 8, 15, 16, 30, 31]) {
      const base = fixture().records[0]!, createdAt = new Date(Date.parse(data.asOf) - days * 86400000).toISOString()
      data.records.push({ ...base, internalId: `as-${days}`, no: `AS-${days}`, createdAt, actions: [{ id: `a-${days}`, source: 'human', outcome: 'success', actorId: 'person-1', at: data.asOf, label: '今天已办理' }] })
    }
    const result = buildBacklog(data, createDefaultFilter())
    expect(result.ageRows.map(row => row.count)).toEqual([2, 2, 2, 2, 1, 0])
    expect(result.ageRows.flatMap(row => row.recordIds)).toHaveLength(result.allIds.length)
    expect(result.records[0]!.internalId).toBe('as-31')
  })
  it('仅可靠已过期限判超期，缺负责人不按动作人补；未知负责人ID不冒称无人负责', () => {
    const data = fixture(), row = data.records[0]!
    row.dueAt = '2026-11-06T09:59:59.999Z'; delete row.ownerId
    const second = copyRecord(data); second.dueAt = '2026-11-06T10:00:00Z'; second.ownerId = 'unknown-person'
    const third = copyRecord(data, 'as-3'); third.dueAt = '2026-11-06 09:00:00'; third.ownerId = 'person-1'
    const result = buildBacklog(data, createDefaultFilter())
    expect(result.overdueIds).toEqual(['as-1']); expect(result.unownedIds).toEqual(['as-1'])
  })
})
