import { describe, expect, it } from 'vitest'
import {
  agingBandKey, agingBands, agingIssues, agingRecords, defaultFilters, filterAgingRecords, groupAgingDetails,
  latestSnapshotDate, qualityQuantities, quantityText, snapshotFailures, summarizeAgingRecords, validateAgingFilters,
  type AgingRecord,
} from './库龄模型'

const row = (id: string, changes: Partial<AgingRecord> = {}): AgingRecord => ({ ...agingRecords[0]!, id, issues: [], ...changes })

describe('三方仓库龄按质量展示来源数量', () => {
  it('良品和不良品只落入对应一列，另一列留空，真零及精确原值不改变', () => {
    for (const quantity of ['0', '3', '0.000001', '9007199254740993.000001', '-2', '待核验', null]) {
      expect(qualityQuantities(row('good', { quality: '良品', onHandQty: quantity }))).toEqual({ goodQty: quantity, defectiveQty: null })
      expect(qualityQuantities(row('defective', { quality: '不良品', onHandQty: quantity }))).toEqual({ goodQty: null, defectiveQty: quantity })
    }
  })

  it('未知、缺失和未适配的来源质量码不猜映射、不填零', () => {
    for (const quality of ['', '未知', '次品', '良品 ', 'G', 'E', 'R', 'B']) {
      const source = row('unknown-quality', { quality, onHandQty: '12' })
      const before = JSON.stringify(source)
      expect(qualityQuantities(source)).toEqual({ goodQty: null, defectiveQty: null })
      expect(JSON.stringify(source)).toBe(before)
    }
  })

  it('按质量分开的来源行仍保持独立 SKU 组，不因展示两列合并同批次', () => {
    const records = [row('good', { quality: '良品', onHandQty: '3' }), row('bad', { quality: '不良品', onHandQty: '5' })]
    const groups = groupAgingDetails(records)
    expect(groups).toHaveLength(2)
    expect(groups.map(group => group.children.map(qualityQuantities))).toEqual([
      [{ goodQty: '3', defectiveQty: null }], [{ goodQty: null, defectiveQty: '5' }],
    ])
    expect(records.map(record => record.onHandQty)).toEqual(['3', '5'])
  })
})

describe('三方仓库龄来源明细及双视图', () => {
  it('同组两条 45 天数量 3、5 保留两行，分段汇总为 8；同批次不同委托单不去重', () => {
    const records = [row('a'), row('b', { consignmentNo: 'DEMO-CN-002', serialNo: '1', onHandQty: '5' })]
    const summaries = summarizeAgingRecords(records)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.recordIds).toEqual(['a', 'b'])
    expect(summaries[0]!.bands.age31to60).toBe('8')
    expect(summaries[0]!.onHandQty).toBe('8')
    expect(records[0]!.batchNo).toBe(records[1]!.batchNo)
  })

  it('候选边界包含两端，每个合法来源天数只落入一个分段', () => {
    const cases: [number, string][] = [[0, 'age0to30'], [30, 'age0to30'], [31, 'age31to60'], [60, 'age31to60'], [61, 'age61to90'], [90, 'age61to90'], [91, 'age91to180'], [180, 'age91to180'], [181, 'age181to365'], [365, 'age181to365'], [366, 'age366plus'], [1500, 'age366plus']]
    for (const [days, key] of cases) {
      expect(agingBandKey(row(String(days), { agingDays: days }))).toBe(key)
      expect(agingBands.filter(band => days >= band.min && days <= band.max)).toHaveLength(1)
    }
  })

  it('逐一隔离日期、组织、服务商、账号、仓库、来源客户、仓库 SKU、质量和单位', () => {
    const base = row('base')
    const changes: Partial<AgingRecord>[] = [
      { snapshotDate: '2026-09-22' }, { organization: '演示组织乙' }, { provider: '演示其他服务商' },
      { accountId: 'demo-other-account' }, { warehouseId: 'demo-other-warehouse' }, { sourceCustomer: 'DEMO-OTHER-CUSTOMER' },
      { warehouseSku: 'WH-DEMO-OTHER' }, { quality: '不良品' }, { unit: '箱' },
    ]
    expect(summarizeAgingRecords([base, ...changes.map((change, i) => row(String(i), change))])).toHaveLength(10)
    expect(summarizeAgingRecords([base, row('different-system-sku', { systemSku: 'DEMO-OTHER' })])).toHaveLength(1)
  })

  it('数量精确求和，不把 0.1 + 0.2 变为浮点尾数或舍入大数', () => {
    const sum = (values: string[]) => summarizeAgingRecords(values.map((value, i) => row(String(i), { onHandQty: value })))[0]!.bands.age31to60
    expect(sum(['0.1', '0.2'])).toBe('0.3')
    expect(sum(['100.00', '0.00'])).toBe('100')
    expect(sum(['9007199254740993.000001', '0.000009'])).toBe('9007199254740993.00001')
    expect(sum(['0.000', '0'])).toBe('0')
  })

  it('库龄未提供的有效数量独立归类；来源零保持为零', () => {
    const summary = summarizeAgingRecords([row('unknown', { agingDays: null, onHandQty: '7' }), row('zero', { agingDays: 0, onHandQty: '0' })])[0]!
    expect(summary.unknownQty).toBe('7')
    expect(summary.bands.age0to30).toBe('0')
    expect(summary.bands.age31to60).toBe('0')
    expect(quantityText(null)).toBe('—')
    expect(quantityText('0')).toBe('0')
  })

  it('缺失与非法数量不按零计入分段；相关段和总量为空，其他正常段保留', () => {
    for (const quantity of [null, '-2', '不合法']) {
      const summary = summarizeAgingRecords([row('valid', { agingDays: 10, onHandQty: '5' }), row('bad', { agingDays: 45, onHandQty: quantity })])[0]!
      expect(summary.bands.age0to30).toBe('5')
      expect(summary.bands.age31to60).toBeNull()
      expect(summary.onHandQty).toBeNull()
      expect(summary.issues).toContain(quantity === null ? '数量不完整' : '数量异常')
    }
  })

  it('负数、小数天和非有限天数保持原值，不落入整数分段或库龄未提供', () => {
    for (const days of [-1, 30.5, Infinity, NaN]) {
      const record = row('invalid-age', { agingDays: days, onHandQty: '9' })
      const summary = summarizeAgingRecords([record])[0]!
      expect(agingBandKey(record)).toBe('invalid')
      expect(summary.unknownQty).toBe('0')
      expect(Object.values(summary.bands).every(value => value === '0')).toBe(true)
      expect(summary.onHandQty).toBeNull()
      expect(summary.issues).toContain('库龄异常')
      expect(Object.is(record.agingDays, days)).toBe(true)
    }
  })

  it('重复来源、分批不完整、身份冲突及未知单位不输出可信汇总', () => {
    const unsafe: Partial<AgingRecord>[] = [
      { summaryBlocked: true, issues: ['重复来源待核验'] },
      { summaryBlocked: true, issues: ['分批读取不完整'] },
      { summaryBlocked: true, issues: ['身份冲突'] },
      { mapping: '映射冲突' },
      { unit: '' },
    ]
    for (const change of unsafe) {
      const summary = summarizeAgingRecords([row('unsafe', change)])[0]!
      expect(summary.summaryBlocked).toBe(true)
      expect(summary.onHandQty).toBeNull()
      expect(summary.unknownQty).toBeNull()
      expect(Object.values(summary.bands).every(value => value === null)).toBe(true)
      expect(summary.issues).toContain('汇总待核验')
    }
  })

  it('分组键按结构编码，标识包含分隔符也不能串组', () => {
    expect(summarizeAgingRecords([
      row('a', { accountId: 'a|b', warehouseId: 'c' }),
      row('b', { accountId: 'a', warehouseId: 'b|c' }),
    ])).toHaveLength(2)
  })
})

describe('三方仓库龄 SKU 主行与批次展开', () => {
  it('同仓库 SKU 的匹配来源行归为一组，同批次不同委托单保留两行且主行没有数量或库龄', () => {
    const records = [row('a'), row('b', { consignmentNo: 'DEMO-CN-002', serialNo: '1', onHandQty: '5' })]
    const groups = groupAgingDetails(records)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.detailCount).toBe(2)
    expect(groups[0]!.children).toEqual(records)
    expect(groups[0]!.children.map(child => child.onHandQty)).toEqual(['3', '5'])
    expect(groups[0]!).not.toHaveProperty('onHandQty')
    expect(groups[0]!).not.toHaveProperty('agingDays')
    expect(groups[0]!).not.toHaveProperty('bands')
    expect(groups[0]!).not.toHaveProperty('maxValidAge')
  })

  it('展开分组保持九个身份维度隔离；相同系统 SKU 不合并不同仓库 SKU', () => {
    const changes: Partial<AgingRecord>[] = [
      { snapshotDate: '2026-09-22' }, { organization: '演示组织乙' }, { provider: '演示其他服务商' },
      { accountId: 'demo-other-account' }, { warehouseId: 'demo-other-warehouse' }, { sourceCustomer: 'DEMO-OTHER-CUSTOMER' },
      { warehouseSku: 'WH-DEMO-OTHER' }, { quality: '不良品' }, { unit: '箱' },
    ]
    const groups = groupAgingDetails([row('base'), ...changes.map((change, i) => row(String(i), change))])
    expect(groups).toHaveLength(10)
    expect(groups.every(group => group.detailCount === 1)).toBe(true)
    expect(new Set(groups.map(group => group.id)).size).toBe(10)
    expect(groupAgingDetails([row('a'), row('b', { systemSku: 'DEMO-OTHER-SYSTEM-SKU' })])).toHaveLength(1)
  })

  it('筛选作用于来源行后分组，匹配条数只包含命中明细，不补回该 SKU 的其他批次', () => {
    const records = [row('a', { batchNo: 'BATCH-A', agingDays: 45 }), row('b', { batchNo: 'BATCH-B', agingDays: 60 }), row('c', { batchNo: 'BATCH-A', agingDays: 90 })]
    const filtered = filterAgingRecords(records, { ...defaultFilters(), batchNo: 'BATCH-A', maxAge: '60' })
    const groups = groupAgingDetails(filtered)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.detailCount).toBe(1)
    expect(groups[0]!.children.map(child => child.id)).toEqual(['a'])
    expect(groupAgingDetails(filterAgingRecords(records, { ...defaultFilters(), batchNo: 'BATCH-NOT-FOUND' }))).toEqual([])
  })

  it('主行按组内最大有效来源库龄排序；子行按来源库龄排序，零有效且空值与异常值后置', () => {
    const records = [
      row('missing', { warehouseSku: 'MISSING', agingDays: null }),
      row('medium', { warehouseSku: 'MEDIUM', agingDays: 45 }),
      row('old-small', { warehouseSku: 'OLD', agingDays: 2 }),
      row('decimal', { warehouseSku: 'INVALID', agingDays: 999.5 }),
      row('old-missing', { warehouseSku: 'OLD', agingDays: null }),
      row('old-large', { warehouseSku: 'OLD', agingDays: 366 }),
      row('zero', { warehouseSku: 'ZERO', agingDays: 0 }),
      row('old-invalid', { warehouseSku: 'OLD', agingDays: -1 }),
    ]
    const groups = groupAgingDetails(records)
    expect(groups.map(group => group.warehouseSku)).toEqual(['OLD', 'MEDIUM', 'ZERO', 'MISSING', 'INVALID'])
    expect(groups[0]!.children.map(child => child.id)).toEqual(['old-large', 'old-small', 'old-missing', 'old-invalid'])
  })

  it('重复待核验和非法原值完整留在子行，主行提示取并集；展开与翻页不会改变来源记录', () => {
    const records = [row('missing', { agingDays: null, onHandQty: null }), row('duplicate-a', { onHandQty: '-2', issues: ['重复来源待核验'], summaryBlocked: true }), row('duplicate-b', { onHandQty: '-2', issues: ['重复来源待核验'], summaryBlocked: true })]
    const before = JSON.stringify(records)
    const groups = groupAgingDetails(records)
    expect(groups[0]!.detailCount).toBe(3)
    expect(groups[0]!.issues).toEqual(expect.arrayContaining(['库龄未提供', '数量不完整', '重复来源待核验', '数量异常']))
    expect(groups[0]!.issues.filter(issue => issue === '重复来源待核验')).toHaveLength(1)
    expect(groups[0]!.children.find(child => child.id === 'duplicate-a')).toBe(records[1])
    expect(groups.slice(0, 1)[0]!.children).toHaveLength(3)
    expect(JSON.stringify(records)).toBe(before)
    expect(groupAgingDetails([...records].reverse())[0]!.id).toBe(groups[0]!.id)
  })
})

describe('三方仓库龄日期及查询', () => {
  it('默认读取所选范围最近有数据日期，显式选择无记录日期不跨日补齐', () => {
    const filters = { ...defaultFilters(), accounts: ['demo-4px-d'] }
    const records = filterAgingRecords(agingRecords, filters)
    expect(records).toHaveLength(1)
    expect(records[0]!.snapshotDate).toBe('2026-09-22')
    expect(filterAgingRecords(agingRecords, { ...filters, snapshotDate: '2026-09-23' })).toEqual([])
    expect(latestSnapshotDate([])).toBe('')
    expect(snapshotFailures.some(failure => failure.accountId === 'demo-4px-d' && failure.snapshotDate === '2026-09-23')).toBe(true)
  })

  it('历史快照保持原库龄和数量；跨日重试不会回填漏采日', () => {
    const history = filterAgingRecords(agingRecords, { ...defaultFilters(), accounts: ['demo-4px-a'], snapshotDate: '2026-09-22', keywordType: 'warehouseSku', keyword: 'WH-DEMO-0001' })
    expect(history.map(record => record.agingDays)).toEqual([44, 44])
    expect(summarizeAgingRecords(history)[0]!.bands.age31to60).toBe('9')
    const retries = { ...defaultFilters(), accounts: ['demo-4px-c'] }
    expect(filterAgingRecords(agingRecords, { ...retries, snapshotDate: '2026-09-22' })).toEqual([])
    expect(filterAgingRecords(agingRecords, { ...retries, snapshotDate: '2026-09-23' })[0]!.agingDays).toBe(122)
    expect(filterAgingRecords(agingRecords, { ...retries, snapshotDate: '2026-09-21' })[0]!.agingDays).toBe(120)
  })

  it('SKU 精确批量查询与组合条件取交集，商品名称包含查询', () => {
    const filters = { ...defaultFilters(), keywordType: 'warehouseSku' as const, keyword: 'WH-DEMO-0001\nWH-DEMO-BOUNDARY\nWH-DEMO-0001', accounts: ['demo-4px-a'], warehouses: ['demo-4px-bh'], quality: '良品' }
    const result = filterAgingRecords(agingRecords, filters)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(record => ['WH-DEMO-0001', 'WH-DEMO-BOUNDARY'].includes(record.warehouseSku) && record.accountId === 'demo-4px-a' && record.warehouseId === 'demo-4px-bh' && record.quality === '良品')).toBe(true)
    expect(filterAgingRecords(agingRecords, { ...defaultFilters(), keyword: 'DEMO-BRK' })).toEqual([])
    expect(filterAgingRecords(agingRecords, { ...defaultFilters(), keywordType: 'name', keyword: '刹车' }).every(record => record.name.includes('刹车'))).toBe(true)
  })

  it('没有系统映射时仍能按前导零仓库 SKU 查到，不复制仓库 SKU 到系统 SKU', () => {
    const result = filterAgingRecords(agingRecords, { ...defaultFilters(), keywordType: 'warehouseSku', keyword: '00000901' })
    expect(result).toHaveLength(1)
    expect(result[0]!.systemSku).toBe('')
    expect(agingIssues(result[0]!)).toContain('未映射')
  })

  it('默认合法库龄降序，空值和异常值在末尾；库龄范围不包含异常原值', () => {
    const records = [row('empty', { agingDays: null }), row('negative', { agingDays: -1 }), row('decimal', { agingDays: 30.5 }), row('small', { agingDays: 0 }), row('big', { agingDays: 366 }), row('middle', { agingDays: 30 })]
    expect(filterAgingRecords(records, defaultFilters()).map(record => record.id)).toEqual(['big', 'middle', 'small', 'empty', 'negative', 'decimal'])
    expect(filterAgingRecords(records, { ...defaultFilters(), minAge: '0', maxAge: '30' }).map(record => record.id)).toEqual(['middle', 'small'])
  })

  it('拒绝非法天数范围与超过 200 个 SKU', () => {
    expect(validateAgingFilters({ ...defaultFilters(), minAge: '-1' })).not.toBe('')
    expect(validateAgingFilters({ ...defaultFilters(), maxAge: '30.5' })).not.toBe('')
    expect(validateAgingFilters({ ...defaultFilters(), minAge: '61', maxAge: '30' })).not.toBe('')
    expect(validateAgingFilters({ ...defaultFilters(), keyword: Array.from({ length: 201 }, (_, i) => String(i)).join('\n') })).not.toBe('')
    expect(validateAgingFilters({ ...defaultFilters(), minAge: '0', maxAge: '30' })).toBe('')
  })

  it('查询、分段和页面刷新式重复读取不改来源行、日期或更新时刻', () => {
    const before = JSON.stringify(agingRecords)
    const first = filterAgingRecords(agingRecords, defaultFilters())
    summarizeAgingRecords(first)
    expect(filterAgingRecords(agingRecords, defaultFilters())).toEqual(first)
    expect(JSON.stringify(agingRecords)).toBe(before)
  })
})
