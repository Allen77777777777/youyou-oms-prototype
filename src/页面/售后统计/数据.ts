import type { AfterSaleRecord, CostEvidence, DataSet, ExecutionEvidence, Method, Scenario } from './类型'

export const STATISTICS_AS_OF = '2026-11-06T10:00:00Z'
const shops = [
  { id: 'stat-us', name: '优优美国综合店', site: '美国' },
  { id: 'stat-uk', name: '优优英国生活店', site: '英国' },
  { id: 'stat-de', name: '优优德国户外店', site: '德国' },
]
const staff = [{ id: 'stat-amy', name: '陈晓' }, { id: 'stat-lin', name: '林悦' }, { id: 'stat-zhou', name: '周宁' }, { id: 'stat-chen', name: '陈晨' }]
const products = [
  { sku: 'HOME-BOX-WH', title: '桌面收纳盒 · 奶白', problem: '运输破损' },
  { sku: 'AUTO-PUMP-12V', title: '车载充气泵 · 12V', problem: '功能异常' },
  { sku: 'PET-BOWL-BL', title: '宠物慢食碗 · 蓝色', problem: '尺寸不合适' },
  { sku: 'KIT-POT-SV', title: '不锈钢保温壶 · 银色', problem: '商品与描述不符' },
  { sku: 'HOME-LAMP-WH', title: '可调光台灯 · 白色', problem: '缺少配件' },
  { sku: 'TOY-BLOCK-80', title: '儿童积木套装 · 80粒', problem: '少件' },
  { sku: 'OUT-CHAIR-GN', title: '户外折叠椅 · 深绿', problem: '物流延误' },
  { sku: 'SPORT-BAND-3', title: '健身弹力带 · 三件套', problem: '买家改变主意' },
  { sku: 'GARDEN-LIGHT-4', title: '太阳能庭院灯 · 四件套', problem: '未收到商品' },
]
const cases: { scenario: Scenario; method: Method; problem?: string }[] = [
  { scenario: '退货退款申请', method: '仅退货', problem: '运输破损' },
  { scenario: '退货退款申请', method: '全额退款', problem: '运输破损' },
  { scenario: '取消申请', method: '取消订单', problem: '买家改变主意' },
  { scenario: '未收到货', method: '全额退款', problem: '未收到商品' },
  { scenario: 'eBay介入案件', method: '部分退款', problem: '商品与描述不符' },
  { scenario: '支付争议', method: '沟通处理', problem: '未授权付款' },
  { scenario: '中差评跟进', method: '部分退款', problem: '物流延误' },
  { scenario: '内部重发', method: '重发', problem: '功能异常' },
  { scenario: '主动退货退款', method: '退货退款', problem: '发错商品' },
  { scenario: '退货退款申请', method: '退货退款' },
  { scenario: '取消申请', method: '沟通处理', problem: '客户误下单' },
  { scenario: '内部重发', method: '重发', problem: '少件' },
  { scenario: '中差评跟进', method: '沟通处理', problem: '问题待归类' },
]
const iso = (day: number, hour = 3) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`
const addHours = (value: string, hours: number) => new Date(Date.parse(value) + hours * 3600000).toISOString()

/** 所有编号、人员、订单及资金凭证均为固定虚构样例。 */
export function createDemoData(): DataSet {
  const data: DataSet = { asOf: STATISTICS_AS_OF, shops: structuredClone(shops), staff: structuredClone(staff), records: [], orderLines: [], coverage: [] }
  for (let shopIndex = 0; shopIndex < shops.length; shopIndex++) {
    const shop = shops[shopIndex]!
    for (let lineIndex = 0; lineIndex < 26; lineIndex++) {
      const product = products[shopIndex * 3 + lineIndex % 3]!, number = String(lineIndex + 1).padStart(3, '0')
      data.orderLines.push({ id: `${shop.id}-line-${number}`, shopId: shop.id, orderId: `${shop.id}-order-${Math.floor(lineIndex / 2) + 1}`,
        orderNo: `DEMO-${shop.site}-${Math.floor(lineIndex / 2) + 1}`, customerId: `${shop.id}-buyer-${Math.floor(lineIndex / 2) % 7 + 1}`,
        sku: product.sku, title: product.title, quantity: lineIndex % 6 === 0 ? 2 : 1, valid: true,
        createdAt: lineIndex >= 24 ? '2026-10-25T02:00:00Z' : `2026-09-${String(10 + lineIndex % 20).padStart(2, '0')}T02:00:00Z` })
    }
    data.coverage.push({ shopId: shop.id, ordersComplete: shopIndex !== 2, afterSalesComplete: shopIndex !== 2,
      from: '2026-08-31T16:00:00Z', through: STATISTICS_AS_OF, note: shopIndex === 2 ? '德国店仅有已采集样例，缺全量订单及历史售后' : '评审样例中本观察批次的订单与售后资料完整' })
  }
  for (let index = 0; index < 28; index++) {
    const shopIndex = index === 1 ? 0 : index % 3, shop = shops[shopIndex]!, scenario = cases[index % cases.length]!
    const lineIndex = index === 1 ? 0 : Math.floor(index / 3)
    const line = data.orderLines.filter(item => item.shopId === shop.id)[lineIndex]!, actor = staff[index % staff.length]!
    const currency = ['USD', 'GBP', 'EUR'][shopIndex]!, no = `DEMO-AS-202610-${String(index + 1).padStart(3, '0')}`
    const createdAt = index === 26 ? '2026-09-20T03:00:00Z' : index === 27 ? '2026-11-03T03:00:00Z' : iso(index === 1 ? 6 : index % 25 + 1)
    const completed = index % 4 !== 0 && index < 26
    const internal = ['内部重发', '主动退货退款'].includes(scenario.scenario)
    const record: AfterSaleRecord = {
      internalId: `stat-record-${index + 1}`, no, shopId: shop.id, origin: internal ? '内部售后' : '平台售后', scenario: scenario.scenario, method: scenario.method,
      sourceId: index < 2 ? 'DEMO-RETURN-PAIR-001' : `${internal ? 'DEMO-INTERNAL' : 'DEMO-SOURCE'}-${index + 1}`,
      sourceType: scenario.scenario, rootSourceId: index < 2 ? 'DEMO-RETURN-PAIR-001' : undefined,
      orderId: line.orderId, orderNo: line.orderNo, customerId: line.customerId, customerName: `buyer_demo_${String(lineIndex % 7 + 1).padStart(2, '0')}`,
      createdAt, updatedAt: completed ? addHours(createdAt, 48 + index) : STATISTICS_AS_OF,
      status: index === 14 ? '待核实' : completed ? '已完成' : index % 8 === 0 ? '待处理' : '处理中',
      ownerId: staff[(index + 1) % staff.length]!.id, dueAt: completed ? undefined : index === 24 ? '2026-11-08T08:00:00Z' : '2026-11-05T08:00:00Z',
      items: [{ orderLineId: line.id, sku: line.sku, title: line.title, quantity: 1, problem: scenario.problem || products[shopIndex * 3 + lineIndex % 3]!.problem, linkage: 'verified' }],
      costs: [], costCoverage: 'unknown', actions: [{ id: `stat-action-${index + 1}`, at: addHours(createdAt, 4), actorId: actor.id, label: internal ? '核实并登记售后方案' : '按本次诉求完成办理', outcome: index === 14 ? 'unknown' : 'success', source: 'human' }],
      note: '已核对本次售后商品及问题，处理进展以本单记录为准。',
    }
    if (index % 6 !== 0) record.response = { evidenceId: `stat-response-${index + 1}`, startedAt: addHours(createdAt, -2), respondedAt: addHours(createdAt, 2 + index % 5), actorId: actor.id, human: true }
    if (completed) record.handling = { evidenceId: `stat-handling-${index + 1}`, startedAt: createdAt, endedAt: addHours(createdAt, 48 + index), closedBy: actor.id }
    const addCost = (kind: CostEvidence['kind'], value: string, allocated = true, status: CostEvidence['status'] = index % 5 === 0 ? 'pending' : 'confirmed') => {
      const cost: CostEvidence = { evidenceId: `stat-proof-${index + 1}-${record.costs.length + 1}`, kind, value, currency, status, at: addHours(createdAt, 12),
        source: status === 'confirmed' ? '已核实资金／费用凭证' : '费用申请待核实',
        note: kind === '卖家退款承担' ? '该笔资金凭证明列卖家实际承担金额。' : '费用凭证对应本次办理。',
        allocations: allocated ? [{ orderLineId: line.id, value }] : undefined }
      record.costs.push(cost)
    }
    if (['全额退款', '部分退款', '退货退款', '取消订单'].includes(record.method)) {
      addCost('卖家退款承担', record.method === '部分退款' ? '8.50' : (29 + index).toFixed(2), index % 4 !== 1)
      if (index % 3 === 1) addCost('费用回收', '2.30', false, 'confirmed')
    } else if (record.method === '重发') { addCost('重发商品成本', '12.80'); addCost('重发运费', '6.40', index % 2 === 0) }
    if (record.method === '退货退款') { addCost('退回运费', '4.90'); addCost('仓库处理费', '1.20') }
    if (record.scenario === '支付争议') addCost('平台争议费', '14.00', false, index === 5 ? 'pending' : 'confirmed')
    if (record.costs.length) record.costCoverage = index % 4 === 1 || record.costs.some(cost => cost.status === 'pending') ? 'partial' : 'complete'
    if (index === 0) record.note = '同一Return先接受退货，之后另建退款单；两张售后单、一条商品行、一次SKU售后涉及。无资金凭证不表示零费用。'
    if (index === 1) record.note = '与DEMO-AS-202610-001同申请、同订单商品行；两次独立办理。'
    if (index === 5) record.costs.push(structuredClone(record.costs[0]!))
    if (index === 7) {
      const second = data.orderLines.find(item => item.shopId === shop.id && item.orderId === line.orderId && item.id !== line.id)!
      record.items.push({ orderLineId: second.id, sku: second.sku, title: second.title, quantity: 1, problem: '缺少配件', linkage: 'verified' })
      // 多商品运费没有已核实的逐行拆分，保留在单据成本。
      for (const cost of record.costs) if (cost.kind === '重发运费') delete cost.allocations
    }
    if (index === 14) {
      record.items[0]!.linkage = 'unknown'; delete record.items[0]!.sku; delete record.items[0]!.orderLineId
      record.note = '来源商品身份尚待核实，单据保留；未知SKU单列，不按标题配对。'
      record.costs = []; record.costCoverage = 'unknown'
    }
    if (index === 23) { delete record.customerId; delete record.customerName; record.note = '客户稳定身份缺失，不计入已关联客户数。' }
    if (index === 24) { record.response = undefined; record.actions.push({ id: 'stat-auto-reply-25', at: addHours(createdAt, 1), label: '自动回复已发送', outcome: 'success', source: 'system' }) }
    if (index === 25) { record.handling = undefined; record.note = '当前结果已完成，但缺少可核实的完成时间，因此不计处理时长样本。' }
    data.records.push(record)
  }
  // 固定虚构业务执行原件；不从登记方式、已完成状态或人工动作成功派生。
  const results: { index: number; evidence: ExecutionEvidence }[] = [
    { index: 0, evidence: { id: 'stat-result-return-001', kind: 'return', outcome: 'success', at: '2026-10-03T04:00:00Z', source: '仓库退件签收凭证', reference: 'DEMO-RECEIPT-001' } },
    { index: 1, evidence: { id: 'stat-result-refund-002', kind: 'refund', outcome: 'success', at: '2026-10-07T04:00:00Z', source: '平台退款结果', reference: 'DEMO-REFUND-002' } },
    { index: 5, evidence: { id: 'stat-result-refund-006', kind: 'refund', outcome: 'failed', at: '2026-10-06T08:00:00Z', source: '平台退款结果', reference: 'DEMO-REFUND-006' } },
    { index: 7, evidence: { id: 'stat-result-reship-008', kind: 'reship', outcome: 'unknown', at: '2026-10-09T08:00:00Z', source: '仓库出库结果核查记录', reference: 'DEMO-OUTBOUND-008' } },
    { index: 8, evidence: { id: 'stat-result-return-009', kind: 'return', outcome: 'pending', at: '2026-10-10T08:00:00Z', source: '仓库退件处理记录', reference: 'DEMO-RECEIPT-009' } },
    { index: 11, evidence: { id: 'stat-result-reship-012', kind: 'reship', outcome: 'success', at: '2026-10-14T08:00:00Z', source: '仓库实际出库凭证', reference: 'DEMO-OUTBOUND-012' } },
    { index: 12, evidence: { id: 'stat-result-refund-013', kind: 'refund', outcome: 'unknown', at: '2026-10-13T08:00:00Z', source: '平台退款结果核查记录', reference: 'DEMO-REFUND-013' } },
    { index: 13, evidence: { id: 'stat-result-return-014', kind: 'return', outcome: 'failed', at: '2026-10-15T08:00:00Z', source: '仓库退件处理记录', reference: 'DEMO-RECEIPT-014' } },
  ]
  for (const { index, evidence } of results) data.records[index]!.results = [evidence]
  // 同一退件依据也关联后续退款单，按证据身份只计一次。
  data.records[1]!.results!.push(structuredClone(data.records[0]!.results![0]!))
  // 保留一张没有当前负责人依据的既有跨期积压，不按最近动作人补负责人。
  delete data.records[26]!.ownerId
  // 模拟重复下载同一内部单据，稳定主键去重后仍为28张。
  data.records.push(structuredClone(data.records[1]!))
  return data
}
export const demoData = createDemoData()
