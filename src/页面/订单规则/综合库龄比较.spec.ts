import { describe, expect, it } from 'vitest'
import { agingRecords, type AgingRecord } from '../三方仓库龄/库龄模型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则渠道样例 } from './规则路由'
import type { 候选库龄资料 } from './库龄分仓'
import { 计算综合库龄 } from './综合库龄比较'

function 准备() {
  const 渠道 = 创建规则渠道样例().filter(项 => ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].includes(项.id))
  const 订单 = structuredClone(全渠道订单模拟数据[0]!)
  订单.items = ['SKU-A', 'SKU-B', 'SKU-A'].map((systemSku, index) => ({ ...订单.items[0]!, externalLineId: `DEMO-LINE-${index}`, systemSku, skuResolutionStatus: '成功', orderedQuantity: index + 2 }))
  const 资料: 候选库龄资料[] = 渠道.map((route, index) => ({
    scope: { providerId: route.providerId, accountId: route.accountId, warehouseId: route.warehouseId },
    organization: '演示组织甲', sourceCustomer: 'DEMO-CUSTOMER-A', snapshotDate: '2026-09-23',
    records: [5, 30, 7, 9].map((agingDays, i) => ({ ...agingRecords[0]!, id: `DEMO-AGE-${index}-${i}`, provider: route.provider, accountId: route.accountId, warehouseId: route.warehouseId,
      warehouseSku: i < 2 ? 'WH-A' : 'WH-B', systemSku: i < 2 ? 'SKU-A' : 'SKU-B', agingDays, issues: [] })),
  }))
  return { 订单, 渠道, 资料 }
}

describe('综合比价只读库龄指标', () => {
  it('最近批次逐SKU取最小、全批次逐SKU取最大；重复SKU和件数均不重复加权', () => {
    const { 订单, 渠道, 资料 } = 准备(), before = JSON.stringify({ 订单, 渠道, 资料 })
    const 最近 = 计算综合库龄(订单, 渠道, 资料, 'recent')
    expect(最近.gates).toEqual([])
    expect(最近.summaries.map(项 => 项.ageDays)).toEqual(['12', '12'])
    expect(最近.summaries[0]!.ageDetails.map(项 => [项.systemSku, 项.ageDays, 项.selectedRecordIds])).toEqual([
      ['SKU-A', '5', ['DEMO-AGE-0-0']], ['SKU-B', '7', ['DEMO-AGE-0-2']],
    ])
    expect(计算综合库龄(订单, 渠道, 资料, 'all').summaries.map(项 => 项.ageDays)).toEqual(['39', '39'])
    expect(JSON.stringify({ 订单, 渠道, 资料 })).toBe(before)
  })
  it('排除明确零库存及不良品；合法零天和小数正数量均保留', () => {
    const { 订单, 渠道, 资料 } = 准备()
    资料[0]!.records = 资料[0]!.records.map(项 => ({ ...项, agingDays: 0, onHandQty: '0.001' }))
    资料[0]!.records = [...资料[0]!.records,
      { ...资料[0]!.records[0]!, id: 'DEMO-ZERO', onHandQty: '0.000', agingDays: null },
      { ...资料[0]!.records[0]!, id: 'DEMO-DEFECTIVE', quality: '不良品', agingDays: 9000 },
    ]
    const result = 计算综合库龄(订单, 渠道, 资料, 'all')
    expect(result.gates).toEqual([])
    expect(result.summaries[0]!.ageDays).toBe('0')
    expect(result.summaries[0]!.ageDetails[0]!.recordIds).toEqual(['DEMO-AGE-0-0', 'DEMO-AGE-0-1'])
  })
  it.each([
    { agingDays: null }, { agingDays: -1 }, { agingDays: 1.5 }, { agingDays: Number.MAX_SAFE_INTEGER + 1 },
    { onHandQty: null }, { onHandQty: '-1' }, { unit: '' }, { quality: '未知' }, { mapping: '映射冲突' }, { summaryBlocked: true }, { issues: ['来源待核验'] },
  ] as Partial<AgingRecord>[])('有货来源%s不能默取剩余已知批次', changes => {
    const { 订单, 渠道, 资料 } = 准备()
    资料[0]!.records = 资料[0]!.records.map((项, index) => index ? 项 : { ...项, ...changes })
    const result = 计算综合库龄(订单, 渠道, 资料, 'recent')
    expect(result.gates.join()).toContain('资料缺失或待核验')
    expect(result.summaries).toHaveLength(1)
  })
  it('同SKU多个仓库SKU、单位冲突或重复来源ID均不按首行取值', () => {
    for (const change of [{ warehouseSku: 'WH-OTHER' }, { unit: '箱' }, { id: 'DEMO-AGE-0-0' }]) {
      const { 订单, 渠道, 资料 } = 准备()
      资料[0]!.records = 资料[0]!.records.map((项, index) => index === 1 ? { ...项, ...change } : 项)
      expect(计算综合库龄(订单, 渠道, 资料, 'all').gates.join()).toContain('资料缺失或待核验')
    }
  })
  it('同仓不同渠道只读取同一来源一次；来源重复则仍阻断', () => {
    const { 订单, 渠道, 资料 } = 准备()
    const 同仓渠道 = [渠道[0]!, { ...渠道[0]!, id: 'DEMO-SECOND-CHANNEL' }]
    expect(计算综合库龄(订单, 同仓渠道, 资料, 'all').summaries).toHaveLength(1)
    expect(计算综合库龄(订单, 同仓渠道, [...资料, 资料[0]!], 'all').gates.join()).toContain('唯一')
  })
  it('跨SKU重复的来源身份阻断整仓，不重复计入库龄合计', () => {
    const { 订单, 渠道, 资料 } = 准备()
    资料[0]!.records = 资料[0]!.records.map((项, index) => index === 2 ? { ...项, id: 'DEMO-AGE-0-0' } : 项)
    for (const mode of ['recent', 'all'] as const) {
      const result = 计算综合库龄(订单, 渠道, 资料, mode)
      expect(result.gates.join()).toContain('库龄来源身份重复')
      expect(result.summaries).toHaveLength(1)
      expect(result.summaries[0]!.warehouseKey).toContain(渠道[1]!.warehouseId)
    }
  })
  it('同一日期和组织才能跨仓比较，非法日历日期不能通过格式校验', () => {
    const { 订单, 渠道, 资料 } = 准备()
    资料[1]!.snapshotDate = '2026-02-30'
    expect(计算综合库龄(订单, 渠道, 资料, 'all').gates.join()).toContain('日期未核实')
    资料[1]!.snapshotDate = '2026-09-22'
    expect(计算综合库龄(订单, 渠道, 资料, 'all').gates.join()).toContain('日期不一致')
    资料[1]!.snapshotDate = '2026-09-23'; 资料[1]!.organization = '演示组织乙'
    expect(计算综合库龄(订单, 渠道, 资料, 'all').gates.join()).toContain('跨组织')
  })
  it('隔离账号、仓库、来源客户、组织和其他日期的外部明细', () => {
    const { 订单, 渠道, 资料 } = 准备()
    for (const changes of [{ accountId: 'OTHER' }, { warehouseId: 'OTHER' }, { sourceCustomer: 'OTHER' }, { organization: 'OTHER' }, { snapshotDate: '2026-09-22' }]) {
      资料[0]!.records = [...资料[0]!.records, { ...资料[0]!.records[0]!, id: `DEMO-FOREIGN-${JSON.stringify(changes)}`, agingDays: 9999, ...changes }]
    }
    expect(计算综合库龄(订单, 渠道, 资料, 'all').summaries[0]!.ageDays).toBe('39')
  })
  it('逐SKU来源安全整数累加后可超过Number范围，结果保留精确十进制字符串', () => {
    const { 订单, 渠道, 资料 } = 准备()
    资料.forEach(项 => { 项.records = 项.records.map(行 => ({ ...行, agingDays: Number.MAX_SAFE_INTEGER })) })
    expect(计算综合库龄(订单, 渠道, 资料, 'all').summaries[0]!.ageDays).toBe('18014398509481982')
  })
})
