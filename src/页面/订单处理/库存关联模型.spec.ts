import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 查询订单关联库存, 取得最大库龄, 取得库存查询范围, 关联数量文本, 关联演示数据, type 关联库龄来源, type 关联快照, type 关联来源身份 } from './库存关联模型'
import { 数量定义 } from '../三方仓库存/库存模型'
import type { 作业行 } from './展示工具'

function sampleRow(): 作业行 {
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.processingStatus = '待审核'
  order.fulfillmentOrders = []
  return { key: order.systemOrderNo, order, stage: '待审核' }
}
function ageSample() {
  const records = structuredClone(关联演示数据.aging.filter(row => row.warehouseSku === 'LINK-DEMO-CA-W1' && row.warehouseId === 'order-demo-winit-west' && row.quality === '良品'))
  const identity: 关联来源身份 = records[0]!
  const snapshots: 关联快照[] = [{ ...identity, date: '2026-09-23', complete: true }]
  return { identity, records, snapshots }
}

describe('订单仓库库存只读关联', () => {
  it('同服务商账号同仓库 SKU 展示多仓，默认仓仅标记；质量分行，数量不合并，原输入不变', () => {
    const row = sampleRow(), before = JSON.stringify(row)
    const results = 查询订单关联库存(row)
    const product = results.filter(item => item.systemSku === 'YY-CA-1048-US')
    expect(product.map(item => item.availableText)).toEqual(['128', '10', '64', '0'])
    expect(new Set(product.map(item => item.warehouseSku))).toEqual(new Set(['LINK-DEMO-CA-W1']))
    expect(new Set(product.map(item => item.scope?.warehouse))).toEqual(new Set(['万邑通美西仓', '万邑通美东仓', '万邑通加拿大仓']))
    expect(product.filter(item => item.routeWarehouse).map(item => item.scope?.warehouse)).toEqual(['万邑通美西仓', '万邑通美西仓'])
    expect(product.map(item => item.aging.text)).toEqual(['240 天', '60 天', '85 天', '未取得'])
    expect(results.every(item => item.scope?.provider === '万邑通')).toBe(true)
    expect(JSON.stringify(row)).toBe(before)
  })
  it('扩展仓库仍隔离组织、账号和服务商；其他仓无需重复建 SKU 映射', () => {
    const row = sampleRow(), data = structuredClone(关联演示数据)
    const anchor = data.scopes[0]!
    data.scopes.push(...[{ organization: 'other-org' }, { accountId: 'other-account' }, { provider: 'other-provider' }].map((change, index) => ({ ...anchor, ...change, id: `foreign-${index}`, warehouseId: `foreign-${index}`, warehouse: `其他仓-${index}` })))
    const range = 取得库存查询范围(row, data.scopes)
    expect(range.scopes.map(scope => scope.id)).toEqual(['order-demo-winit', 'order-demo-winit-east', 'order-demo-winit-ca'])
    expect(data.mappings.some(mapping => mapping.scopeId === 'order-demo-winit-east')).toBe(false)
    expect(查询订单关联库存(row, data).find(source => source.scope?.id === 'order-demo-winit-east' && source.systemSku === 'YY-CA-1048-US')?.availableText).toBe('64')
    row.order.defaultRoute!.warehouse = '未核实仓库'
    expect(取得库存查询范围(row, data.scopes).scopes).toEqual([])
    row.order.defaultRoute!.warehouse = anchor.warehouse
    data.scopes.push({ ...anchor, id: 'same-name-other-org', organization: 'other-org', accountId: 'foreign-account' })
    expect(取得库存查询范围(row, data.scopes).scopes).toEqual([])
    expect(取得库存查询范围(row, data.scopes).reason).toBe('仓库账号归属待核实')
  })
  it('八项数量复用库存原值，缺失、零和负数不被反算或改写', () => {
    const row = sampleRow(), data = structuredClone(关联演示数据)
    data.inventory[0]!.quantities.unavailable = -2
    data.inventory[0]!.quantities.onHand = null
    const results = 查询订单关联库存(row, data), first = results[0]!
    expect(数量定义.map(d => 关联数量文本(first, d.key))).toEqual(['128', '12', '-2', '60', '—', '2', '4', '6'])
    expect(关联数量文本(results.find(source => source.scope?.id === 'order-demo-winit-ca')!, 'available')).toBe('0')
    expect(data.inventory[0]!.quantities.onHand).toBeNull()
    first.inventory = undefined
    expect(数量定义.every(d => 关联数量文本(first, d.key) === '—')).toBe(true)
  })
  it('履约用实际路由，来源订单商品只作为候选；未分仓明确候选范围', () => {
    const row = sampleRow()
    row.fulfillment = { fulfillmentOrderNo: 'FL-LINK-DEMO', status: '待执行', isActive: true, route: { ...row.order.defaultRoute!, warehouse: '谷仓美东仓', warehouseProvider: '谷仓', warehouseAccount: '谷仓 · 北美主体' }, plannedQuantity: 1, shippedQuantity: 0 }
    row.stage = '待推单'
    expect(取得库存查询范围(row).itemScopeNote).toContain('不能作为本次履约商品')
    expect(查询订单关联库存(row).find(item => item.systemSku === 'YY-CA-1048-US')?.availableText).toBe('56')
    row.fulfillment = undefined
    row.stage = '待审核'
    row.order.defaultRoute = undefined
    expect(取得库存查询范围(row).candidates).toBe(true)
    expect(new Set(查询订单关联库存(row).map(item => item.scope?.provider)).size).toBeGreaterThan(1)
  })
  it('缺失 SKU、映射缺失、库存缺失及缺失可用数不变为零', () => {
    const row = sampleRow()
    row.order.items[0]!.systemSku = undefined
    expect(查询订单关联库存(row)[0]?.mappingText).toBe('未匹配系统 SKU')
    row.order.items[0]!.systemSku = 'NO-MAPPING'
    expect(查询订单关联库存(row)[0]?.mappingText).toBe('未配置仓库 SKU 映射')
    row.order.items = [row.order.items[1]!]
    expect(查询订单关联库存(row)[0]?.inventoryReason).toContain('尚未取得库存')
    const data = structuredClone(关联演示数据)
    data.inventory[0]!.quantities.available = null
    row.order.items = [structuredClone(全渠道订单模拟数据[0]!.items[0]!)]
    expect(查询订单关联库存(row, data)[0]?.availableText).toBe('未取得')
  })
  it('异常和不发货无有效履约时默认方案不冒充实际执行仓库', () => {
    const row = sampleRow()
    for (const stage of ['异常', '不发货'] as const) {
      row.stage = stage
      expect(取得库存查询范围(row).mode).toBe('订单首次／默认仓库')
      row.order.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-ACTIVE-DEMO', status: '待执行', isActive: true, route: row.order.defaultRoute!, plannedQuantity: 1, shippedQuantity: 0 }]
      expect(取得库存查询范围(row).mode).toBe('订单当前有效执行仓库')
      row.order.fulfillmentOrders[0]!.isActive = false
      expect(取得库存查询范围(row).mode).toBe('订单首次／默认仓库')
      row.order.fulfillmentOrders = []
    }
  })
})

describe('最大库龄来源完整性', () => {
  it('只在同来源同最近完整日期取正数量批次 MAX，不跨质量、单位、账号或日期', () => {
    const { identity, records, snapshots } = ageSample()
    const other: 关联库龄来源[] = [
      { ...records[0]!, id: 'old', sourceRecordKey: 'old', snapshotDate: '2026-09-22', agingDays: 900 },
      ...[{ accountId: 'other' }, { quality: '不良品' }, { unit: '箱' }, { sourceCustomer: 'other' }, { organization: 'other' }, { warehouseId: 'other' }].map((change, index) => ({ ...records[0]!, ...change, id: `other-${index}`, sourceRecordKey: `other-${index}`, agingDays: 800 })),
      { ...records[0]!, id: 'zero', sourceRecordKey: 'zero', agingDays: 999, onHandQty: '0.000' },
    ]
    const result = 取得最大库龄(identity, [...records, ...other], [...snapshots, { ...identity, date: '2026-09-24', complete: false }])
    expect(result.text).toBe('240 天')
    expect(result.snapshotDate).toBe('2026-09-23')
    expect(result.reason).toContain('较新采集未完成')
  })
  it('未知、非法、重复或不完整批次阻断整个 MAX，不仅排除问题行', () => {
    const { identity, records, snapshots } = ageSample()
    for (const change of [{ agingDays: null }, { agingDays: -1 }, { onHandQty: null }, { onHandQty: '-1' }, { summaryBlocked: true }, { sourceRecordKey: records[0]!.sourceRecordKey }]) {
      const rows = [records[0]!, { ...records[1]!, ...change }]
      expect(取得最大库龄(identity, rows, snapshots).status).toBe('待核实')
    }
    expect(取得最大库龄(identity, records, [{ ...snapshots[0]!, complete: false }]).status).toBe('待核实')
  })
  it('最新完整日期存在问题时不回退发布旧日 MAX，只有零库存不默认最大库龄 0', () => {
    const { identity, records, snapshots } = ageSample()
    const rows = [...records, { ...records[0]!, id: 'new-unknown', sourceRecordKey: 'new-unknown', snapshotDate: '2026-09-24', agingDays: null }]
    const result = 取得最大库龄(identity, rows, [...snapshots, { ...identity, date: '2026-09-24', complete: true }])
    expect(result.status).toBe('待核实')
    expect(result.snapshotDate).toBe('2026-09-24')
    expect(取得最大库龄(identity, records.map(row => ({ ...row, onHandQty: '0' })), snapshots).text).toBe('未取得')
  })
})
