import { describe, expect, it } from 'vitest'
import { createDemoData } from './数据'
import { buildStatistics, createDefaultFilter, detailOrderLines, detailRecords } from './模型'
import { createEvidenceCsv, createLineCsv, createReasonSkuCsv, createRecordCsv, createSummaryCsv, csvCell, formatTime, rateText } from './展示工具'
import { buildBacklog, buildReasonRows, collectCostEvidence } from './分析工具'
import { demoExchangeQuote } from './汇率换算'

describe('售后统计导出与展示', () => {
  it('转义公式、换行和引号，保留文本而不执行公式', () => {
    expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"')
    expect(csvCell('甲,乙\n丙')).toBe('"甲,乙\n丙"')
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"')
  })
  it('跨北京午夜归日且无偏移时间不猜测，无分母不显示0%', () => {
    expect(formatTime('2026-10-01T16:01:00Z')).toBe('2026-10-02 00:01')
    expect(formatTime('2026-10-02T00:01:00')).toBe('—')
    expect(rateText(null)).toBe('—')
    expect(rateText(0)).toBe('0.00%')
  })
  it('下钻导出完整集合且不带未选店铺记录，保留元信息与虚构边界', () => {
    const data = createDemoData(), filter = { ...createDefaultFilter(), shopIds: ['stat-us'] }
    const result = buildStatistics(data, filter)
    const records = detailRecords(data, result.records.map(r => r.internalId))
    const csv = createRecordCsv(data, records, filter, '美国店全部售后')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    for (const row of records) expect(csv).toContain(row.no)
    for (const row of data.records.filter(r => r.shopId !== 'stat-us')) expect(csv).not.toContain(row.no)
    expect(csv).toContain('Asia/Shanghai')
    expect(csv).toContain('本地独立虚构')
    expect(csv).toContain('售后建单批次')
  })
  it('成本汇总导出保持原币、未知空值和回收独立', () => {
    const data = createDemoData(), filter = createDefaultFilter(), result = buildStatistics(data, filter)
    const csv = createSummaryCsv(data, result, filter, 'cost', 'customer')
    expect(csv).toContain('"币种"')
    expect(csv).toContain('"USD"')
    expect(csv).toContain('"GBP"')
    expect(csv).toContain('"EUR"')
    expect(csv).toContain('"关联售后凭证全额·已确认费用回收"')
    expect(csv).toContain('"—"')
  })
  it('SKU分母导出可核对完整商品行，不按当前分页截断', () => {
    const data = createDemoData(), filter = createDefaultFilter(), result = buildStatistics(data, filter)
    const row = result.skuRows.find(r => r.soldLineCount > 0)!
    const lines = detailOrderLines(data, row.denominatorLineIds)
    const csv = createLineCsv(data, lines, filter, 'SKU分母')
    expect(lines.length).toBe(row.soldLineCount)
    for (const line of lines) expect(csv).toContain(`"${line.id}"`)
    expect(csv).toContain('SKU订单创建批次')
    expect(csv).toContain('仅已满观察期商品行')
  })
  it('费用核实导出采用凭证结论，不被原始完整标志覆盖', () => {
    const data = createDemoData(), filter = createDefaultFilter()
    const pending = data.records.find(r => r.costs.some(c => c.status === 'pending'))!
    pending.costCoverage = 'complete'
    const result = buildStatistics(data, filter)
    expect(result.summary.unknownCostRecordIds).toContain(pending.internalId)
    const csv = createRecordCsv(data, [pending], filter, '费用待核实')
    const recordLine = csv.split('\r\n').find(line => line.startsWith(`"${pending.no}",`))!
    expect(recordLine.endsWith('"待核实"')).toBe(true)
  })
  it('客户导出保留店铺，跨店同名客户可分别识别', () => {
    const data = createDemoData(), filter = createDefaultFilter(), result = buildStatistics(data, filter)
    const csv = createSummaryCsv(data, result, filter, 'handling', 'customer')
    expect(csv).toContain('"客户","店铺"')
    for (const shop of data.shops) expect(csv).toContain(shop.name)
  })
  it('成本币种筛选作用于实际金额行，凭证全额与SKU份额分别导出', () => {
    const data = createDemoData(), record = structuredClone(data.records[0]!)
    const lines = data.orderLines.filter(line => line.shopId === record.shopId && line.orderId === record.orderId)
    record.items = lines.map(line => ({ orderLineId: line.id, sku: line.sku, title: line.title, quantity: 1, linkage: 'verified' as const, problem: '运输破损' }))
    record.costs = [{ evidenceId: 'EXPORT-USD', kind: '卖家退款承担', value: '30.00', currency: 'USD', status: 'confirmed', at: '2026-10-02T10:00:00Z', source: '已核实凭证', allocations: [{ orderLineId: lines[0]!.id, value: '10.00' }, { orderLineId: lines[1]!.id, value: '20.00' }] },
      { evidenceId: 'EXPORT-EUR', kind: '其他费用', value: '99.00', currency: 'EUR', status: 'confirmed', at: '2026-10-02T10:00:00Z', source: '已核实凭证' }]
    data.records = [record]
    const filter = { ...createDefaultFilter(), sku: lines[0]!.sku! }, result = buildStatistics(data, filter)
    const csv = createSummaryCsv(data, result, filter, 'cost', 'customer', { currency: 'USD' })
    expect(csv).toContain('"关联售后凭证全额·已确认支出"')
    expect(csv).toContain('"所选SKU已确认已分摊支出"')
    expect(csv).toContain('"USD","30.00","—","—","10.00","0"')
    expect(csv).not.toContain('"EUR"')
    const evidenceCsv = createEvidenceCsv(data, collectCostEvidence(data, result.records, filter.sku), filter, '本次凭证', { currency: 'USD' })
    expect(evidenceCsv).toContain('"EXPORT-USD"')
    expect(evidenceCsv).not.toContain('"EXPORT-EUR"')
    expect(evidenceCsv).toContain('"USD","30.00","已确认","10.00","已核实"')
    expect(evidenceCsv).toContain('Asia/Shanghai')
    expect(evidenceCsv).toContain('本地独立虚构')
  })
  it('原因大类导出只保留命中原因及单据，逐层SKU导出保留完整条件', () => {
    const data = createDemoData(), filter = { ...createDefaultFilter(), shopIds: ['stat-uk'] }, result = buildStatistics(data, filter)
    const reasons = buildReasonRows(data, result.records, '产品相关')
    expect(reasons.length).toBeGreaterThan(0)
    const csv = createSummaryCsv(data, result, filter, 'problems', 'customer', { reasonCategory: '产品相关' })
    expect(csv).toContain('"原始售后原因","分析大类"')
    expect(csv).toContain('"已确认可归因成本（原币）"')
    expect(csv).not.toContain('"运输破损"')
    const ids = new Set(reasons.flatMap(reason => reason.recordIds))
    const recordsCsv = createRecordCsv(data, result.records, filter, '产品相关售后单', { reasonCategory: '产品相关' })
    for (const record of result.records) expect(recordsCsv.includes(`"${record.no}"`)).toBe(ids.has(record.internalId))
    const skuCsv = createReasonSkuCsv(data, reasons[0]!, filter, { reasonCategory: '产品相关' })
    expect(skuCsv).toContain('"原始售后原因"')
    expect(skuCsv).toContain('"店铺范围","优优英国生活店"')
    expect(skuCsv).toContain('"售后原因分析大类","产品相关"')
    expect(skuCsv).toContain('Asia/Shanghai')
    expect(skuCsv).toContain('本地独立虚构')
    expect(skuCsv).toContain(reasons[0]!.skus[0]!.sku)
  })
  it('SKU导出保留完整已排序及最低样本后的列表，不恢复原集合', () => {
    const data = createDemoData(), filter = createDefaultFilter(), result = buildStatistics(data, filter)
    const selected = result.skuRows.slice(0, 2).reverse()
    const csv = createSummaryCsv(data, result, filter, 'sku', 'customer', { skuRows: selected })
    const lines = csv.split('\r\n').filter(line => selected.some(row => line.startsWith(`"${row.sku}",`)))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(`"${selected[0]!.sku}"`)
    expect(lines[1]).toContain(`"${selected[1]!.sku}"`)
    for (const row of result.skuRows.slice(2)) expect(csv).not.toContain(`"${row.sku}","${row.title}"`)
    expect(csv).not.toContain('"售后建单批次"')
  })
  it('登记重发和内部已完成不导出为成功，无证据与明确失败分别保留', () => {
    const data = createDemoData(), filter = createDefaultFilter(), record = structuredClone(data.records[0]!)
    record.method = '重发'; record.status = '已完成'; record.results = []; data.records = [record]
    const empty = createRecordCsv(data, [record], filter, '核对执行')
    expect(empty).toContain('"登记处理方式"')
    expect(empty).toContain('"未取得可靠执行证据"')
    expect(empty).not.toContain('重发·已确认成功')
    record.results = [{ id: 'EXPORT-FAILED', kind: 'refund', outcome: 'failed', at: '2026-10-02T10:00:00Z', source: '平台退款结果', reference: 'REFUND-FAILED' }]
    const failed = createRecordCsv(data, [record], filter, '核对执行')
    expect(failed).toContain('退款·明确失败 1笔')
    expect(failed).not.toContain('重发·已确认成功')
  })
  it('客服汇总期间表与积压分开，积压导出不会被极窄办理期间截断', () => {
    const data = createDemoData(), filter = { ...createDefaultFilter(), startDate: '2026-10-31', endDate: '2026-10-31' }
    const result = buildStatistics(data, filter), backlog = buildBacklog(data, filter)
    const csv = createSummaryCsv(data, result, filter, 'handling', 'staff')
    expect(csv).toContain('"办理期间","2026-10-31 至 2026-10-31"')
    expect(csv).toContain('"当前积压","截至资料时点；不受建单及办理日期限制"')
    for (const record of backlog.records) expect(csv).toContain(`"${record.no}"`)
    const evidenceCsv = createRecordCsv(data, backlog.records, filter, '当前积压', { dateMode: 'backlog' })
    expect(evidenceCsv).toContain('"统计时间","截至资料时点的当前积压；不受建单及办理日期限制"')
    expect(evidenceCsv).not.toContain('"售后建单批次"')
    expect(evidenceCsv).not.toContain('"办理期间"')
  })
  it('展示USD包含EUR来源并实际折算，凭证保留原币与精确汇率追溯', () => {
    const data = createDemoData(), record = structuredClone(data.records[0]!)
    record.costs = ['USD', 'EUR'].map(currency => ({ evidenceId: `FX-${currency}`, kind: '卖家退款承担' as const, value: '1.00', currency, status: 'confirmed' as const, at: '2026-10-02T10:00:00Z', source: '核实费用原件' }))
    data.records = [record]
    const filter = createDefaultFilter(), result = buildStatistics(data, filter)
    // displayCurrency优先：旧currency参数即使仍存在，也不能筛掉EUR来源。
    const options = { currency: 'USD', displayCurrency: 'USD', exchangeQuote: demoExchangeQuote }
    const csv = createSummaryCsv(data, result, filter, 'cost', 'customer', options)
    expect(csv).toContain('"展示币种","USD"')
    expect(csv).toContain('"USD","2.08","—","—","未筛选SKU"')
    const evidence = createEvidenceCsv(data, collectCostEvidence(data, result.records), filter, '换算凭证', options)
    expect(evidence).toContain('"FX-USD"')
    expect(evidence).toContain('"FX-EUR"')
    expect(evidence).toContain('"EUR","1.00","USD","1.08","已确认"')
    expect(evidence).toContain('"13","12"')
    expect(evidence).toContain('"是，金额采用精确比值计算"')
    expect(evidence).toContain(demoExchangeQuote.id)
    expect(evidence).toContain(demoExchangeQuote.source)
    expect(evidence).toContain('2026-11-09 10:00')
    expect(record.costs.map(cost => cost.value)).toEqual(['1.00', '1.00'])
  })
  it('缺少EUR汇率时完整支出导出—，不把可换算USD部分冒充合计', () => {
    const data = createDemoData(), record = structuredClone(data.records[0]!)
    record.costs = ['USD', 'EUR'].map(currency => ({ evidenceId: `FX-${currency}`, kind: '卖家退款承担' as const, value: '1.00', currency, status: 'confirmed' as const, at: '2026-10-02T10:00:00Z', source: '核实费用原件' }))
    data.records = [record]
    const quote = structuredClone(demoExchangeQuote); delete quote.rates.EUR
    const options = { displayCurrency: 'USD', exchangeQuote: quote }, filter = createDefaultFilter(), result = buildStatistics(data, filter)
    const csv = createSummaryCsv(data, result, filter, 'cost', 'customer', options)
    expect(csv).toContain('"USD","—","—","—","未筛选SKU"')
    expect(csv).not.toContain('"USD","1.00","—","—","未筛选SKU"')
    expect(csv).toContain('缺少EUR的有效正汇率')
    const evidence = createEvidenceCsv(data, collectCostEvidence(data, result.records), filter, '缺率凭证', options)
    expect(evidence).toContain('"EUR","1.00","USD","—","已确认"')
    expect(evidence).toContain('"USD","1.00","USD","1.00","已确认"')
    expect(evidence).toContain('缺少EUR的有效正汇率')
  })
  it('SKU及原因按各笔核实份额折算再合计，与凭证舍入一致', () => {
    const data = createDemoData(), record = structuredClone(data.records[0]!), item = record.items[0]!
    record.costs = [1, 2].map(index => ({ evidenceId: `FX-PART-${index}`, kind: '卖家退款承担' as const, value: '0.01', currency: 'EUR', status: 'confirmed' as const, at: '2026-10-02T10:00:00Z', source: '核实费用原件', allocations: [{ orderLineId: item.orderLineId!, value: '0.01' }] }))
    data.records = [record]
    const quote = structuredClone(demoExchangeQuote); quote.rates.EUR = '1.5'
    const filter = { ...createDefaultFilter(), sku: item.sku! }, result = buildStatistics(data, filter), options = { displayCurrency: 'CNY', exchangeQuote: quote }
    const row = result.skuRows.find(sku => sku.sku === item.sku)!
    const sku = createSummaryCsv(data, result, filter, 'sku', 'customer', { ...options, skuRows: [row] })
    const skuLine = sku.split('\r\n').find(line => line.startsWith(`"${item.sku}",`))!
    expect(skuLine).toContain('"0.04"')
    expect(skuLine).not.toContain('"0.03"')
    const reasons = createSummaryCsv(data, result, filter, 'problems', 'customer', options)
    const reasonLine = reasons.split('\r\n').find(line => line.startsWith('"运输破损","履约物流"'))!
    expect(reasonLine).toContain('"0.04"')
    const evidence = createEvidenceCsv(data, collectCostEvidence(data, result.records, filter.sku), filter, '份额换算', options)
    const proofLines = evidence.split('\r\n').filter(line => line.startsWith('"FX-PART-'))
    expect(proofLines).toHaveLength(2)
    for (const line of proofLines) expect(line).toContain('"EUR","0.01","CNY","0.02","已确认","0.01","0.02"')
  })
})
