import { describe, expect, it } from 'vitest'
import { agingExportData, createAgingWorkbook } from './库龄导出'
import { agingBands, agingRecords, summarizeAgingRecords, type AgingRecord } from './库龄模型'

const exportedAt = '2026-09-23T04:00:00Z'
const record = (changes: Partial<AgingRecord> = {}): AgingRecord => ({ ...agingRecords[0]!, issues: [], ...changes })

function valuesByHeader(data: ReturnType<typeof agingExportData>, rowIndex = 1) {
  return Object.fromEntries(data[0]!.map((header, index) => [String(header), data[rowIndex]![index]]))
}

function worksheet(data: Uint8Array): Document {
  // 读取 ZIP 的 stored 条目，再解析真实 worksheet，避免只在整包中模糊匹配。
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const decoder = new TextDecoder()
  let position = 0
  while (view.getUint32(position, true) === 0x04034b50) {
    const compression = view.getUint16(position + 8, true)
    const length = view.getUint32(position + 18, true)
    const nameLength = view.getUint16(position + 26, true)
    const extraLength = view.getUint16(position + 28, true)
    const name = decoder.decode(data.subarray(position + 30, position + 30 + nameLength))
    const bodyStart = position + 30 + nameLength + extraLength
    expect(compression).toBe(0)
    if (name === 'xl/worksheets/sheet1.xml') {
      const doc = new DOMParser().parseFromString(decoder.decode(data.subarray(bodyStart, bodyStart + length)), 'text/xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      return doc
    }
    position = bodyStart + length
  }
  throw new Error('工作簿缺少 worksheet')
}

function columnName(index: number): string {
  let name = ''
  for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name
  return name
}

function sheetCell(doc: Document, headers: (string | number | null)[], name: string, row = 2) {
  const index = headers.indexOf(name)
  expect(index).toBeGreaterThanOrEqual(0)
  return doc.querySelector(`c[r="${columnName(index)}${row}"]`)
}

describe('三方仓库龄导出', () => {
  it('明细保留来源行、同批次不同委托单、快照定义和 UTC+8 时间', () => {
    const rows = [record({ consignmentNo: '000001', onHandQty: '3' }), record({ id: 'second', consignmentNo: '000002', onHandQty: '5' })]
    const data = agingExportData('detail', rows, exportedAt)
    const first = valuesByHeader(data)
    expect(data).toHaveLength(3)
    expect(first['批次号']).toBe('000045')
    expect(first['入库委托单号']).toBe('000001')
    expect(valuesByHeader(data, 2)['入库委托单号']).toBe('000002')
    expect(first['在库数量（良品）']).toBe('3')
    expect(first['在库数量（不良品）']).toBeNull()
    expect(first['快照日期']).toBe('2026-09-23')
    expect(first['最近成功更新时间（UTC+8）']).toBe('2026-09-23 10:30:00')
    expect(first['导出时间（UTC+8）']).toBe('2026-09-23 12:00:00')
    expect(first['上架时间（UTC+8）']).toBeNull()
    expect(first['快照日期定义']).toContain('实际查询海外仓接口当天')
    expect(first['视图']).toBe('批次明细')
    expect(first['数据性质']).toBe('虚构原型数据')
    expect(data[0]).not.toContain('导出序号')
    expect(data[0]).not.toContain('生产日期')
    expect(data[0]).not.toContain('在库数量')
    expect(data[0]).not.toContain('数据提示')
    expect(data[0]).not.toContain('数据说明')
  })

  it('汇总导出包含分组及分段列，不生成跨仓合计，不发布待核验分段', () => {
    const summary = summarizeAgingRecords([
      record({ onHandQty: '3' }), record({ id: 'second', onHandQty: '5' }),
      record({ id: 'other', warehouseId: 'other-warehouse', warehouse: '另一演示仓', onHandQty: '10' }),
      record({ id: 'blocked', warehouseSku: 'BLOCKED', summaryBlocked: true, issues: ['重复来源待核验'] }),
    ])
    const data = agingExportData('summary', summary, exportedAt)
    expect(data).toHaveLength(4)
    expect(valuesByHeader(data)['31～60 天数量']).toBe('8')
    expect(valuesByHeader(data, 2)['31～60 天数量']).toBe('10')
    const blocked = valuesByHeader(data, 3)
    for (const band of agingBands) expect(blocked[`${band.label}数量`]).toBeNull()
    expect(blocked['库龄未提供数量']).toBeNull()
    expect(summary[2]!.issues).toContain('汇总待核验')
    expect(data[0]).toContain('来源客户代码')
    expect(data[0]).toContain('库存单位')
    expect(data[0]).not.toContain('批次号')
    expect(data[0]).not.toContain('跨仓合计')
    expect(data[0]).not.toContain('数据提示')
    expect(data[0]).not.toContain('数据说明')
    expect(valuesByHeader(data)['分段规则']).toContain('评审提案')
  })

  it('质量数量缺失留空，真零和非法原值只落入对应质量列，不新增提示列', () => {
    const rows = [
      record({ onHandQty: null, agingDays: null, unit: '' }),
      record({ onHandQty: '0', agingDays: 0 }),
      record({ quality: '不良品', onHandQty: '-2', agingDays: 30.5 }),
      record({ onHandQty: '待核验', agingDays: -1 }),
      record({ quality: '不良品', onHandQty: '0', agingDays: 0 }),
    ]
    const data = agingExportData('detail', rows, exportedAt)
    const first = valuesByHeader(data)
    expect(first['在库数量（良品）']).toBeNull()
    expect(first['在库数量（不良品）']).toBeNull()
    expect(first['库龄天数']).toBeNull()
    expect(first['库存单位']).toBe('单位未提供')
    expect(data[0]).not.toContain('数据提示')
    expect(valuesByHeader(data, 3)['库龄天数']).toBe(30.5)
    const doc = worksheet(createAgingWorkbook('detail', rows, exportedAt))
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 2)).toBeNull()
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 2)).toBeNull()
    expect(sheetCell(doc, data[0]!, '库龄天数', 2)).toBeNull()
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 3)?.querySelector('v')?.textContent).toBe('0')
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 3)).toBeNull()
    expect(sheetCell(doc, data[0]!, '库龄天数', 3)?.querySelector('v')?.textContent).toBe('0')
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 4)).toBeNull()
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 4)?.querySelector('v')?.textContent).toBe('-2')
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 5)?.getAttribute('t')).toBe('inlineStr')
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 5)?.textContent).toBe('待核验')
    expect(sheetCell(doc, data[0]!, '在库数量（良品）', 6)).toBeNull()
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 6)?.querySelector('v')?.textContent).toBe('0')
  })

  it('未知或未适配质量保留原分类，两数量列空白且原始数量不变', () => {
    const rows = ['', '未知', '次品', 'G', 'E', 'R', 'B'].map(quality => record({ quality, onHandQty: '12.001' }))
    const before = JSON.stringify(rows)
    const data = agingExportData('detail', rows, exportedAt)
    const doc = worksheet(createAgingWorkbook('detail', rows, exportedAt))
    rows.forEach((source, index) => {
      const values = valuesByHeader(data, index + 1)
      expect(values['库存质量']).toBe(source.quality || null)
      expect(values['在库数量（良品）']).toBeNull()
      expect(values['在库数量（不良品）']).toBeNull()
      expect(sheetCell(doc, data[0]!, '在库数量（良品）', index + 2)).toBeNull()
      expect(sheetCell(doc, data[0]!, '在库数量（不良品）', index + 2)).toBeNull()
    })
    expect(JSON.stringify(rows)).toBe(before)
  })

  it('SKU、批次和客户代码为文本；精确小数直接写入，超出 Excel 精度时保留文本', () => {
    const rows = [
      record({ systemSku: '001234', warehouseSku: '00000901', sourceCustomer: '00012', batchNo: '000045', name: '=1+1<&', onHandQty: '1234567890.12345' }),
      record({ quality: '不良品', onHandQty: '12345678901234567890.123456' }),
      record({ quality: '不良品', onHandQty: '0.125' }),
    ]
    const data = agingExportData('detail', rows, exportedAt)
    const workbook = createAgingWorkbook('detail', rows, exportedAt)
    expect([...workbook.slice(0, 4)]).toEqual([80, 75, 3, 4])
    const doc = worksheet(workbook)
    for (const name of ['系统 SKU', '仓库 SKU', '批次号', '来源客户代码']) {
      expect(sheetCell(doc, data[0]!, name)?.getAttribute('t')).toBe('inlineStr')
      expect(sheetCell(doc, data[0]!, name)?.textContent).toBe(valuesByHeader(data)[name])
    }
    expect(sheetCell(doc, data[0]!, '在库数量（良品）')?.querySelector('v')?.textContent).toBe('1234567890.12345')
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 3)?.getAttribute('t')).toBe('inlineStr')
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 3)?.textContent).toBe('12345678901234567890.123456')
    expect(sheetCell(doc, data[0]!, '在库数量（不良品）', 4)?.querySelector('v')?.textContent).toBe('0.125')
    expect(sheetCell(doc, data[0]!, '商品名称')?.textContent).toBe('=1+1<&')
    expect(doc.querySelector('f')).toBeNull()
    expect(doc.querySelector('pane')?.getAttribute('state')).toBe('frozen')
  })

  it('冻结本次导出内容，后续来源值、分类与分段变化不混入已生成结果', () => {
    const source = record({ onHandQty: '3' })
    const detailData = agingExportData('detail', [source], exportedAt)
    const summary = summarizeAgingRecords([source])
    const summaryData = agingExportData('summary', summary, exportedAt)
    const before = JSON.stringify({ source, summary })
    createAgingWorkbook('summary', summary, exportedAt)
    expect(JSON.stringify({ source, summary })).toBe(before)
    source.onHandQty = '999'
    source.quality = '不良品'
    source.snapshotDate = '2026-09-24'
    source.issues.push('新的同步提示')
    summary[0]!.bands.age31to60 = '999'
    summary[0]!.issues.push('新的同步提示')
    expect(valuesByHeader(detailData)['在库数量（良品）']).toBe('3')
    expect(valuesByHeader(detailData)['在库数量（不良品）']).toBeNull()
    expect(valuesByHeader(detailData)['快照日期']).toBe('2026-09-23')
    expect(valuesByHeader(summaryData)['31～60 天数量']).toBe('3')
    expect(summaryData[0]).not.toContain('数据提示')
  })
})
