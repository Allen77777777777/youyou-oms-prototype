import { describe, expect, it } from 'vitest'
import { 创建仓配样例 } from './仓配模型'
import { 默认仓配筛选, 命中仓配筛选, 校验仓配筛选, 排序仓配单据 } from './仓配筛选'

describe('仓配工作台统一筛选', () => {
  it.each(['仓库', '物流'] as const)('%s 默认只搜本页业务单号，关联编号须指定字段并可多行精确 OR', 类型 => {
    const 单 = { ...创建仓配样例(类型)[0]!, no: 'BUSINESS-A', order: 'OMS-B', tracking: 'TRACK-C' }
    const 筛选 = 默认仓配筛选(); 筛选.keyword = 'OMS-B'
    expect(命中仓配筛选(单, 筛选)).toBe(false)
    筛选.searchType = 'order'; 筛选.searchMatch = 'exact'; 筛选.keyword = 'OTHER\nOMS-B\nOMS-B'
    expect(命中仓配筛选(单, 筛选)).toBe(true)
    筛选.searchType = 'tracking'
    expect(命中仓配筛选(单, 筛选)).toBe(false)
  })

  it('服务商和处理关注字段内 OR、字段间 AND，待核查不是明确失败', () => {
    const 单 = { ...创建仓配样例('仓库')[0]!, provider: '4PX', awaitingCheck: true, reason: '外部结果待核查' }
    const 筛选 = 默认仓配筛选(); 筛选.provider = ['万邑通', '4PX']; 筛选.review = ['待核查', '明确失败']
    expect(命中仓配筛选(单, 筛选)).toBe(true)
    筛选.provider = ['万邑通']; expect(命中仓配筛选(单, 筛选)).toBe(false)
    筛选.provider = []; 筛选.review = ['明确失败']; expect(命中仓配筛选(单, 筛选)).toBe(false)
  })

  it('来源明确 UTC+8 时包含起止秒，非法区间和超过 1000 项不应用', () => {
    const 单 = { ...创建仓配样例('仓库')[0]!, createdAt: '2026-10-09 10:00:02' }
    const 筛选 = 默认仓配筛选(); 筛选.dates = ['2026-10-09 10:00:02', '2026-10-09 10:00:02']
    expect(命中仓配筛选(单, 筛选)).toBe(true)
    expect(命中仓配筛选({ ...单, createdAt: '2026-10-09T02:00:02.999Z' }, 筛选)).toBe(true)
    expect(命中仓配筛选({ ...单, createdAt: '2026-10-09 10:00:03' }, 筛选)).toBe(false)
    筛选.dates.reverse(); 筛选.dates[0] = '2026-10-09 10:00:03'; expect(校验仓配筛选(筛选)).toBeTruthy()
    筛选.dates = null; 筛选.searchMatch = 'exact'; 筛选.keyword = Array.from({ length: 1001 }, (_, i) => `NO-${i}`).join('\n')
    expect(校验仓配筛选(筛选)).toContain('1000')
  })

  it('默认顺序和展示排序不改原数组、状态、实际数量及接口记录', () => {
    const 样例 = 创建仓配样例('仓库')[0]!
    const 单据 = [{ ...样例, id: 'B', createdAt: '2026-10-09 12:00:00' }, { ...样例, id: 'A', createdAt: '2026-10-09 12:00:00' }, { ...样例, id: 'Z', createdAt: '' }]
    const 原值 = JSON.stringify(单据)
    expect(排序仓配单据(单据, { field: '', direction: 'desc' }).map(单 => 单.id)).toEqual(['B', 'A', 'Z'])
    expect(排序仓配单据(单据, { field: 'createdAt', direction: 'desc' }).map(单 => 单.id)).toEqual(['A', 'B', 'Z'])
    expect(JSON.stringify(单据)).toBe(原值)
  })
})
