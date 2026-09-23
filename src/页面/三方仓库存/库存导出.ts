import { 数量定义, 空值说明, 时间文本, 数据提示, type 库存记录 } from './库存模型'

// 最小 OOXML 工作簿：文本显式 inlineStr，数字保留数值，空值留空；无公式与宏。
const xml = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function 列名(n: number): string { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }
export function 导出数据(rows: 库存记录[], at: string): (string | number | null)[][] {
  return [['系统 SKU', '仓库 SKU', '商品名称', '服务商', '仓库账号', '仓库', '库存单位', ...数量定义.flatMap(d => [d.label, `${d.label}说明`]), '来源数据时间（UTC+8）', '最近成功更新时间（UTC+8）', '数据提示', '导出时间（UTC+8）', '数据性质'],
    ...rows.map(r => [r.systemSku, r.warehouseSku, r.name, r.provider, r.account, r.warehouse, r.unit, ...数量定义.flatMap(d => [r.quantities[d.key], r.quantities[d.key] === null ? 空值说明(r, d.key) : r.quantities[d.key]! < 0 ? '数量异常' : '']), 时间文本(r.sourceAt), 时间文本(r.updatedAt), 数据提示(r).join('；'), 时间文本(at), '虚构原型数据'])]
}
function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0
  const put16 = (a: Uint8Array, p: number, n: number) => new DataView(a.buffer).setUint16(p, n, true)
  const put32 = (a: Uint8Array, p: number, n: number) => new DataView(a.buffer).setUint32(p, n, true)
  for (const [name, body] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(body); let crc = 0xffffffff
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
    crc = (crc ^ 0xffffffff) >>> 0
    const h = new Uint8Array(30 + filename.length + data.length); put32(h, 0, 0x04034b50); put16(h, 4, 20); put32(h, 14, crc); put32(h, 18, data.length); put32(h, 22, data.length); put16(h, 26, filename.length); h.set(filename, 30); h.set(data, 30 + filename.length)
    const c = new Uint8Array(46 + filename.length); put32(c, 0, 0x02014b50); put16(c, 4, 20); put16(c, 6, 20); put32(c, 16, crc); put32(c, 20, data.length); put32(c, 24, data.length); put16(c, 28, filename.length); put32(c, 42, offset); c.set(filename, 46)
    local.push(h); central.push(c); offset += h.length
  }
  const end = new Uint8Array(22), centralSize = central.reduce((s, a) => s + a.length, 0); put32(end, 0, 0x06054b50); put16(end, 8, central.length); put16(end, 10, central.length); put32(end, 12, centralSize); put32(end, 16, offset)
  const out = new Uint8Array(offset + centralSize + end.length); let pos = 0; for (const a of [...local, ...central, end]) { out.set(a, pos); pos += a.length } return out
}
export function 生成库存工作簿(rows: 库存记录[], at: string): Uint8Array {
  const cells = 导出数据(rows, at).map((row, i) => `<row r="${i + 1}">${row.map((v, j) => v === null ? '' : typeof v === 'number' ? `<c r="${列名(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${列名(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="三方仓库存" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`,
  })
}
