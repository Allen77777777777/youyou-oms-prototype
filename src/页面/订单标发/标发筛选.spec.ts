import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 标发单 } from './标发逻辑'
import { 默认标发筛选, 命中标发筛选, 校验标发筛选, 排序标发单 } from './标发筛选'

const 来源 = { ...全渠道订单模拟数据[0]!, platformOrderNo: 'PLATFORM-B', platformCode: 'eBay' as const }
const 单: 标发单 = { no: 'CF-A', orderNo: 来源.systemOrderNo, fulfillmentNo: 'FL-C', status: '标发失败', tracking: 'TRACK-D', carrier: 'USPS', shippedAt: '2026-10-09 10:00:02 UTC+8', quantity: 1, lineId: 'LINE-A', idempotencyKey: 'KEY-A', pendingVerification: true, reason: '请求超时待核查', attempts: [] }

describe('标发列表统一筛选', () => {
  it('默认标发单号不混搜关联字段，平台订单号从同源订单读取', () => {
    const 筛选 = 默认标发筛选(); 筛选.keyword = 'TRACK-D'
    expect(命中标发筛选(单, 筛选, 来源)).toBe(false)
    筛选.searchType = 'tracking'; 筛选.searchMatch = 'exact'; expect(命中标发筛选(单, 筛选, 来源)).toBe(true)
    筛选.searchType = 'platformOrderNo'; 筛选.keyword = 'OTHER\nPLATFORM-B'; expect(命中标发筛选(单, 筛选, 来源)).toBe(true)
    expect(命中标发筛选(单, 筛选)).toBe(false)
  })

  it('平台多选与真实发货时间取交集，缺时不补造；同秒含边界', () => {
    const 筛选 = 默认标发筛选(); 筛选.platform = ['Temu', 'eBay']; 筛选.dates = ['2026-10-09 10:00:02', '2026-10-09 10:00:02']
    expect(命中标发筛选(单, 筛选, 来源)).toBe(true)
    expect(命中标发筛选({ ...单, shippedAt: '' }, 筛选, 来源)).toBe(false)
    筛选.dates = null; expect(命中标发筛选({ ...单, shippedAt: '' }, 筛选, 来源)).toBe(true)
    筛选.platform = ['Temu']; expect(命中标发筛选(单, 筛选, 来源)).toBe(false)
    筛选.searchMatch = 'exact'; 筛选.keyword = Array.from({ length: 1001 }, (_, i) => `NO-${i}`).join('\n')
    expect(校验标发筛选(筛选)).toContain('1000')
  })

  it('排序仅改变展示；缺发货时间末尾、默认保持原会话顺序且保留待核查保护', () => {
    const 列表 = [{ ...单, no: 'CF-B' }, { ...单, no: 'CF-A' }, { ...单, no: 'CF-Z', shippedAt: '' }]
    const 原值 = JSON.stringify(列表)
    expect(排序标发单(列表, { field: 'shippedAt', direction: 'desc' }).map(项 => 项.no)).toEqual(['CF-A', 'CF-B', 'CF-Z'])
    expect(排序标发单(列表, { field: '', direction: 'asc' }).map(项 => 项.no)).toEqual(['CF-B', 'CF-A', 'CF-Z'])
    expect(JSON.stringify(列表)).toBe(原值)
  })

  it('店铺按平台及稳定店铺ID隔离，同名店铺和失去关联的记录不能冒充命中', () => {
    const 筛选 = 默认标发筛选(); 筛选.store = [JSON.stringify([来源.platformCode, 来源.storeId])]
    expect(命中标发筛选(单, 筛选, 来源)).toBe(true)
    expect(命中标发筛选(单, 筛选, { ...来源, storeId: 'OTHER-ID' })).toBe(false)
    expect(命中标发筛选(单, 筛选, { ...来源, platformCode: 'Temu' })).toBe(false)
    expect(命中标发筛选(单, 筛选)).toBe(false)
  })
})
