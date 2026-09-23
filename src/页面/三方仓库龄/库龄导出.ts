import { agingBands, qualityQuantities, type AgingRecord, type AgingSummary } from './库龄模型'

type ExportCell = string | number | null
type AgingView = 'summary' | 'detail'

const commonHeaders = ['快照日期', '服务商', '仓库账号', '仓库', '组织', '来源客户代码', '系统 SKU', '仓库 SKU', '商品名称', '规格', '库存质量', '库存单位']
const detailHeaders = ['批次号', '入库委托单号', '在库数量（良品）', '在库数量（不良品）', '库龄天数', '上架时间（UTC+8）', '失效日期']
const snapshotDefinition = '实际查询海外仓接口当天（Asia/Shanghai）；非仓库统计日期，查看历史不改变日期。'
const bandDefinition = '按来源库龄天数分段展示；当前区间及汇总规则为评审提案。'

function timeText(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date)
}

const optionalText = (value: string | null | undefined): string | null => value || null

/** 立即复制为标量单元格；调用完成后来源行、分段变化不影响本次导出。 */
export function agingExportData(view: AgingView, rows: AgingRecord[] | AgingSummary[], exportedAt: string): ExportCell[][] {
  const headers = [
    ...commonHeaders,
    ...(view === 'detail' ? detailHeaders : [...agingBands.map(band => `${band.label}数量`), '库龄未提供数量']),
    '最近成功更新时间（UTC+8）', '导出时间（UTC+8）', '视图', '数据性质', '快照日期定义',
    ...(view === 'summary' ? ['分段规则'] : []),
  ]
  return [headers, ...rows.map(row => {
    const identity: ExportCell[] = [
      row.snapshotDate, row.provider, row.account, row.warehouse, row.organization, row.sourceCustomer,
      optionalText(row.systemSku), row.warehouseSku, optionalText(row.name), optionalText(row.specification),
      optionalText(row.quality), row.unit || '单位未提供',
    ]
    let values: ExportCell[]
    if (view === 'detail') {
      const detail = row as AgingRecord
      const quantities = qualityQuantities(detail)
      values = [optionalText(detail.batchNo), optionalText(detail.consignmentNo), quantities.goodQty, quantities.defectiveQty,
        detail.agingDays, timeText(detail.putawayAt), optionalText(detail.expiryDate)]
    } else {
      const summary = row as AgingSummary
      values = [...agingBands.map(band => summary.summaryBlocked ? null : summary.bands[band.key] ?? null),
        summary.summaryBlocked ? null : summary.unknownQty]
    }
    return [...identity, ...values, timeText(row.updatedAt), timeText(exportedAt),
      view === 'detail' ? '批次明细' : '分段汇总', '虚构原型数据', snapshotDefinition,
      ...(view === 'summary' ? [bandDefinition] : [])]
  })]
}

// 最小 OOXML：代码均为文本，空值留空，不写入公式或宏。
const xmlEscape = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function columnName(index: number): string {
  let result = ''
  for (index++; index; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result
  return result
}

function excelNumber(value: ExportCell): string | null {
  if (value === null) return null
  const text = String(value)
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null
  // Excel 数值单元格只有 15 位有效数字；超出时按文本保留，避免读取时静默舍入。
  const significantDigits = text.replace('-', '').replace('.', '').replace(/^0+/, '').length
  return significantDigits <= 15 ? text : null
}

function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  const put16 = (array: Uint8Array, position: number, value: number) => new DataView(array.buffer).setUint16(position, value, true)
  const put32 = (array: Uint8Array, position: number, value: number) => new DataView(array.buffer).setUint32(position, value, true)
  for (const [name, body] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(body)
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    crc = (crc ^ 0xffffffff) >>> 0
    const header = new Uint8Array(30 + filename.length + data.length)
    put32(header, 0, 0x04034b50); put16(header, 4, 20); put32(header, 14, crc)
    put32(header, 18, data.length); put32(header, 22, data.length); put16(header, 26, filename.length)
    header.set(filename, 30); header.set(data, 30 + filename.length)
    const entry = new Uint8Array(46 + filename.length)
    put32(entry, 0, 0x02014b50); put16(entry, 4, 20); put16(entry, 6, 20); put32(entry, 16, crc)
    put32(entry, 20, data.length); put32(entry, 24, data.length); put16(entry, 28, filename.length)
    put32(entry, 42, offset); entry.set(filename, 46)
    local.push(header); central.push(entry); offset += header.length
  }
  const end = new Uint8Array(22), centralSize = central.reduce((sum, part) => sum + part.length, 0)
  put32(end, 0, 0x06054b50); put16(end, 8, central.length); put16(end, 10, central.length)
  put32(end, 12, centralSize); put32(end, 16, offset)
  const output = new Uint8Array(offset + centralSize + end.length)
  let position = 0
  for (const part of [...local, ...central, end]) { output.set(part, position); position += part.length }
  return output
}

export function createAgingWorkbook(view: AgingView, rows: AgingRecord[] | AgingSummary[], exportedAt: string): Uint8Array {
  const data = agingExportData(view, rows, exportedAt)
  const numericHeaders = new Set(['在库数量（良品）', '在库数量（不良品）', '库龄天数', '库龄未提供数量', ...agingBands.map(band => `${band.label}数量`)])
  const numericColumns = new Set(data[0]!.flatMap((header, index) => numericHeaders.has(String(header)) ? [index] : []))
  const cells = data.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    if (value === null) return ''
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`
    const numeric = rowIndex > 0 && numericColumns.has(columnIndex) ? excelNumber(value) : null
    return numeric !== null ? `<c r="${reference}"><v>${numeric}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`
  }).join('')}</row>`).join('')
  const sheetName = view === 'detail' ? '三方仓库龄批次明细' : '三方仓库龄分段汇总'
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${cells}</sheetData></worksheet>`,
  })
}
