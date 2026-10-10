import { describe, expect, it } from 'vitest'
import { 中文快捷日期范围, 命中多选, 命中字段搜索, 校验字段搜索, 校验时间范围, 命中时间范围, 读取排序时刻, 解析搜索值, 排序列表 } from './筛选工具'

describe('公共列表筛选工具', () => {
  it('分类兼容标量与多选，空集合不限，明确匹配完整身份', () => {
    expect(命中多选([], undefined)).toBe(true)
    expect(命中多选(['店铺甲', '店铺乙'], '店铺乙')).toBe(true)
    expect(命中多选('店铺甲', '店铺甲')).toBe(true)
    expect(命中多选(['店铺甲'], '店铺')).toBe(false)
  })
  it('精确名称保留词内空格和大小写等价去重，标识符保留大小写', () => {
    expect(解析搜索值('Brake Rotor\nbrake rotor; Auto Part', 'text')).toEqual(['Brake Rotor', 'Auto Part'])
    expect(解析搜索值('SKU-a SKU-A\nSKU-a')).toEqual(['SKU-a', 'SKU-A'])
    expect(命中字段搜索('BRAKE ROTOR', 'Brake Rotor\nAuto Part', 'exact', 'text')).toBe(true)
    expect(命中字段搜索('SKU-A', 'SKU-a', 'exact')).toBe(false)
    expect(命中字段搜索(['SKU-A', 'SKU-B'], 'sku-a', 'contains')).toBe(true)
  })
  it('1000去重项边界与非法模式不产生隐式截断', () => {
    const 内容 = Array.from({ length: 1000 }, (_, i) => `SKU-${i}`).join('\n')
    expect(校验字段搜索(内容, 'exact')).toBeUndefined()
    expect(校验字段搜索(`${内容}\nSKU-1000`, 'exact')).toContain('1001')
    expect(命中字段搜索('SKU-1', `${内容}\nSKU-1000`, 'exact')).toBe(false)
    expect(校验字段搜索(';;;', 'exact')).toBeTruthy()
  })
  it('秒级北京时间含末端整秒，来源必须明确或显式允许样例墙钟', () => {
    const 范围 = ['2026-10-09 08:00:00', '2026-10-09 08:00:00']
    expect(命中时间范围('2026-10-09T00:00:00.999Z', 范围)).toBe(true)
    expect(命中时间范围('2026-10-09T00:00:01Z', 范围)).toBe(false)
    expect(命中时间范围('2026-10-09 08:00:00', 范围)).toBe(false)
    expect(命中时间范围('2026-10-09 08:00:00', 范围, true)).toBe(true)
    expect(读取排序时刻('2026-02-30 08:00:00', true)).toBeUndefined()
    expect(校验时间范围(['2026-10-09 08:00:01', '2026-10-09 08:00:00'])).toBeTruthy()
    expect(校验时间范围(['2026-10-09'])).toBeTruthy()
  })
  it('数值与文本排序未知始终最后，同值键稳定且不更改原行顺序', () => {
    const 行 = [{ id: 'b', value: 3 }, { id: 'a', value: 3 }, { id: 'c', value: 0 }, { id: 'd', value: null }, { id: 'e', value: NaN }]
    expect(排序列表(行, r => r.value, 'asc', r => r.id).map(r => r.id)).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(排序列表(行, r => r.value, 'desc', r => r.id).map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(行.map(r => r.id)).toEqual(['b', 'a', 'c', 'd', 'e'])
  })
  it('快捷自然日期用指定IANA时区判断今日，跨年与闰月运算完整', () => {
    const 提取 = (日期: Date) => `${日期.getFullYear()}-${日期.getMonth() + 1}-${日期.getDate()} ${日期.getHours()}:${日期.getMinutes()}:${日期.getSeconds()}`
    expect(中文快捷日期范围('今天', 'Asia/Shanghai', new Date('2026-01-01T00:30:00Z')).map(提取)).toEqual(['2026-1-1 0:0:0', '2026-1-1 23:59:59'])
    expect(中文快捷日期范围('今天', 'America/Los_Angeles', new Date('2026-01-01T00:30:00Z')).map(提取)).toEqual(['2025-12-31 0:0:0', '2025-12-31 23:59:59'])
    expect(中文快捷日期范围('上月', 'Asia/Shanghai', new Date('2024-03-01T00:00:00Z')).map(提取)).toEqual(['2024-2-1 0:0:0', '2024-2-29 23:59:59'])
    expect(中文快捷日期范围('最近2月', 'Asia/Shanghai', new Date('2026-01-09T00:00:00Z')).map(提取)).toEqual(['2025-12-1 0:0:0', '2026-1-9 23:59:59'])
  })
})
