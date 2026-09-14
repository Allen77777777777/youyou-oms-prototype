import { describe, expect, it } from 'vitest'
import { eBay查询日期, 获取显示时区, 转换eBay时间 } from './时间工具'

describe('eBay 时区转换', () => {
  it('按同一个 UTC 瞬间转换北京与美国站点时间，正确跨日', () => {
    expect(转换eBay时间('2026-09-08 11:24:18 UTC-7', 'Asia/Shanghai')).toBe('2026-09-09 02:24:18 UTC+8')
    expect(转换eBay时间('2026-09-09T06:24:18Z', 'America/Los_Angeles')).toBe('2026-09-08 23:24:18 UTC-7')
  })
  it('使用事件日期的夏令时偏移，不固定加减小时', () => {
    expect(转换eBay时间('2026-01-10T12:00:00Z', 'America/Los_Angeles')).toBe('2026-01-10 04:00:00 UTC-8')
    expect(转换eBay时间('2026-07-10T12:00:00Z', 'America/Los_Angeles')).toBe('2026-07-10 05:00:00 UTC-7')
  })
  it('查询日期随显示时区变化，包含午夜边界', () => {
    expect(eBay查询日期('2026-09-08T16:00:00Z', 'beijing', ['EBAY_US'])).toBe('2026-09-09')
    expect(eBay查询日期('2026-09-08T16:00:00Z', 'site', ['EBAY_US'])).toBe('2026-09-08')
    expect(eBay查询日期('2026-09-08T15:59:59Z', 'beijing', ['EBAY_US'])).toBe('2026-09-08')
  })
  it('未知或冲突站点不猜测时区；缺失时间与无时区时间明确缺省', () => {
    expect(获取显示时区('site', ['EBAY_UNKNOWN'])).toBeUndefined()
    expect(获取显示时区('site', ['EBAY_US', 'EBAY_DE'])).toBeUndefined()
    expect(eBay查询日期('2026-09-08T16:00:00Z', 'site', ['EBAY_UNKNOWN'])).toBeUndefined()
    expect(转换eBay时间(undefined, 'Asia/Shanghai')).toBe('—')
    expect(转换eBay时间('2026-09-08 12:00', 'Asia/Shanghai')).toContain('时间格式待核查')
    expect(转换eBay时间('2026-09-08T16:00:00Z', undefined)).toContain('站点时区待配置')
  })
})
