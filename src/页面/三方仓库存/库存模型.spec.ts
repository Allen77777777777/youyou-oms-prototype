import { describe, expect, it } from 'vitest'
import { 库存样例, 初始筛选, 查询库存, 校验筛选, 数量文本, type 库存记录 } from './库存模型'
import { 导出数据, 生成库存工作簿 } from './库存导出'

describe('三方仓库存原始来源与查询', () => {
  it('零库存筛选不包含未取得的值，并保留负数原值', () => {
    const rows = 查询库存(库存样例, { ...初始筛选(), operator: 'eq', minimum: '0' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.quantities.available === 0)).toBe(true)
    expect(rows.some(r => r.id === 库存样例[10]!.id)).toBe(false)
    expect(数量文本(库存样例[8]!, 'available')).toBe('-1')
    expect(数量文本(库存样例[10]!, 'available')).toBe('—')
  })
  it('同仓库 SKU 按账号隔离，系统 SKU 一对多保持原记录', () => {
    const f = { ...初始筛选(), keywordType: 'warehouseSku' as const, keyword: 库存样例[0]!.warehouseSku }
    expect(查询库存(库存样例, f)).toHaveLength(2)
    const filtered = 查询库存(库存样例, { ...f, accounts: [库存样例[5]!.accountId] })
    expect(filtered.map(r => r.id)).toEqual([库存样例[5]!.id])
    const system = 查询库存(库存样例, { ...初始筛选(), keyword: 'DEMO-BRK-001' })
    expect(system.length).toBeGreaterThan(1)
    expect(new Set(system.map(r => r.id)).size).toBe(system.length)
  })
  it('批量精确匹配且组合条件取交集', () => {
    const rows = 查询库存(库存样例, { ...初始筛选(), keyword: 'DEMO-BRK-001\nDEMO-FLT-002', providers: ['4PX'] })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.provider === '4PX' && ['DEMO-BRK-001', 'DEMO-FLT-002'].includes(r.systemSku))).toBe(true)
    expect(查询库存(库存样例, { ...初始筛选(), keyword: 'DEMO-BRK' })).toEqual([])
  })
  it('以 UTC+8 自然日完整查询，不丢失结束日期内的记录', () => {
    const make = (at: string): 库存记录 => ({ ...库存样例[0]!, updatedAt: at })
    const rows = [make('2026-09-22T15:59:59Z'), make('2026-09-22T16:00:00Z'), make('2026-09-23T15:59:59Z'), make('2026-09-23T16:00:00Z')]
    expect(查询库存(rows, { ...初始筛选(), dates: ['2026-09-23', '2026-09-23'] })).toEqual(rows.slice(1, 3))
  })
  it('拒绝非法数量区间及超限 SKU，未映射仍可按仓库 SKU 查到', () => {
    expect(校验筛选({ ...初始筛选(), operator: 'range', minimum: '10', maximum: '2' })).not.toBe('')
    expect(校验筛选({ ...初始筛选(), keyword: Array.from({ length: 201 }, (_, i) => `sku-${i}`).join('\n') })).not.toBe('')
    expect(查询库存(库存样例, { ...初始筛选(), keywordType: 'warehouseSku', keyword: 库存样例[1]!.warehouseSku })[0]?.mapping).toBe('未映射')
  })
})

describe('库存导出', () => {
  it('查询与导出不改变来源数据，导出空值不补零、单位不换算', () => {
    const original = JSON.stringify(库存样例)
    const selected = [库存样例[6]!, 库存样例[10]!]
    const rows = 导出数据(selected, '2026-09-23T04:00:00Z')
    expect(rows).toHaveLength(3)
    expect(rows[1]![6]).toBe('箱')
    expect(rows[2]![7]).toBeNull()
    expect(rows[2]![8]).toBe('未取得')
    生成库存工作簿(selected, '2026-09-23T04:00:00Z')
    expect(JSON.stringify(库存样例)).toBe(original)
  })
  it('工作簿为 ZIP 容器，危险开头与前导零 SKU 使用文本单元格', () => {
    const data = 生成库存工作簿([{ ...库存样例[0]!, systemSku: '001234', name: '=1+1<&' }], '2026-09-23T04:00:00Z')
    expect([...data.slice(0, 4)]).toEqual([80, 75, 3, 4])
    const xml = new TextDecoder().decode(data)
    expect(xml).toContain('t="inlineStr"><is><t xml:space="preserve">001234')
    expect(xml).toContain('=1+1&lt;&amp;')
    expect(xml).not.toContain('<f>')
  })
})
