import { describe, expect, it } from 'vitest'

import { eBay订单模拟数据 } from './模拟数据'
import { 格式化eBay站点, 格式化列表时间, 获取状态说明, 计算商品单价, 筛选eBay订单, 校验eBay订单筛选, 排序eBay订单 } from './订单工具'
import type { eBay订单筛选条件 } from './类型'

const 默认条件 = (): eBay订单筛选条件 => ({
  keyword: '',
  store: '',
  marketplace: '',
  fulfillmentStatus: '',
  dateType: 'creationDate',
  dateRange: [],
  paymentStatus: '',
  cancelStatus: '',
  omsStatus: '',
  syncStatus: '',
})

describe('eBay订单专业列表', () => {
  it('可以用平台 SKU、系统 SKU、fulfillment ID 和跟踪号检索', () => {
    for (const [searchType, 关键词] of [['platformSku', 'EB-US-CA-1048'], ['systemSku', 'YY-CA-1048-US'], ['fulfillmentId', '23890174012'], ['trackingNumber', '94***0031']]) {
      expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), searchType, keyword: 关键词! }).map((订单) => 订单.orderId)).toContain('15-10578-48261')
    }
  })

  it('保留未关联系统订单的 eBay 专业订单', () => {
    const 结果 = 筛选eBay订单(eBay订单模拟数据, 默认条件())
    expect(结果.some((订单) => 订单.orderId === '21-09741-66320')).toBe(true)
  })

  it('站点使用受控字典显示国家或地区二字码，未知值保留原值', () => {
    expect(格式化eBay站点('EBAY_US')).toBe('US')
    expect(格式化eBay站点('EBAY_GB')).toBe('GB')
    expect(格式化eBay站点('EBAY_MOTORS_US')).toBe('US')
    expect(格式化eBay站点('EBAY_UNKNOWN')).toBe('EBAY_UNKNOWN')
  })

  it('列表时间使用紧凑格式且保留来源时区', () => {
    expect(格式化列表时间('2026-09-08 11:24:18 UTC-7')).toBe('09-08 11:24 UTC-7')
    expect(格式化列表时间('2026-09-10 17:00 UTC+2')).toBe('09-10 17:00 UTC+2')
    expect(格式化列表时间()).toBe('—')
  })

  it('可以按下单时间或最晚发货时间筛选日期范围', () => {
    expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), dateRange: ['2026-09-09', '2026-09-09'] })).toHaveLength(2)
    expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), dateType: 'shipBy', dateRange: ['2026-09-11', '2026-09-11'] }).map((订单) => 订单.orderId)).toEqual(['24-77190-55018'])
  })

  it('从折扣前订单行金额精确计算商品单价', () => {
    expect(计算商品单价({ currency: 'USD', value: '169.90' }, 2)).toEqual({ currency: 'USD', value: '84.95' })
    expect(计算商品单价({ currency: 'USD', value: '10.00' }, 3)).toEqual({ currency: 'USD', value: '3.33333333' })
  })

  it('分别筛选履约、付款和取消状态', () => {
    expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), fulfillmentStatus: 'FULFILLED' })).toHaveLength(2)
    expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), paymentStatus: 'FULLY_REFUNDED' })).toHaveLength(1)
    expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), cancelStatus: 'CANCELED' })).toHaveLength(1)
  })

  it('未知枚举保留平台原值并标记待核查', () => {
    expect(获取状态说明('payment', 'REVIEW_REQUIRED')).toEqual({ text: 'REVIEW_REQUIRED', tone: 'warning', unknown: true })
  })

  it('店铺、站点和三个独立状态支持OR，不同维度保持AND', () => {
    const 第一单 = eBay订单模拟数据[0]!
    const 条件 = { ...默认条件(), store: [第一单.store, 'other'], marketplace: ['EBAY_US', 'EBAY_DE'], paymentStatus: ['PAID', 'FAILED'], cancelStatus: ['NONE_REQUESTED', 'CANCELED'] }
    expect(筛选eBay订单([第一单], 条件)).toEqual([第一单])
    expect(筛选eBay订单([第一单], { ...条件, paymentStatus: ['PENDING', 'FAILED'] })).toEqual([])
    expect(筛选eBay订单([第一单], { ...条件, marketplace: ['EBAY_AU'] })).toEqual([])
  })

  it('默认仅查平台订单号，字段模糊与多值精确不混搜', () => {
    const 订单 = eBay订单模拟数据[0]!
    expect(筛选eBay订单([订单], { ...默认条件(), keyword: 订单.oms.systemOrderNo! })).toEqual([])
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'systemOrderNo', searchMatch: 'exact', keyword: `other\n${订单.oms.systemOrderNo}` })).toEqual([订单])
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'systemOrderNo', searchMatch: 'exact', keyword: 订单.oms.systemOrderNo!.toLowerCase() })).toEqual([])
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'systemOrderNo', keyword: `other\n${订单.oms.systemOrderNo}` })).toEqual([])
  })

  it('商品文字不跨商品拼接，名称精确保留空格且SKU精确区分大小写', () => {
    const 基础 = eBay订单模拟数据[0]!
    const 订单 = { ...基础, items: [
      { ...基础.items[0]!, title: 'Auto Brake Rotor', platformSku: 'SKU-A' },
      { ...基础.items[0]!, title: 'Rear Cover', platformSku: 'SKU-B' },
    ] }
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'title', searchMatch: 'exact', keyword: 'auto brake rotor\nother' })).toEqual([订单])
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'title', keyword: 'Rotor Rear' })).toEqual([])
    expect(筛选eBay订单([订单], { ...默认条件(), searchType: 'platformSku', searchMatch: 'exact', keyword: 'sku-a' })).toEqual([])
  })

  it('秒级范围按各单站点当地墙钟匹配，切换北京时区使用同一绝对瞬间', () => {
    const 订单 = { ...eBay订单模拟数据[0]!, creationDate: '2026-09-09T06:24:18.800Z', purchaseMarketplaces: ['EBAY_US'] }
    const 条件 = { ...默认条件(), dateRange: ['2026-09-08 23:24:18', '2026-09-08 23:24:18'] }
    expect(筛选eBay订单([订单], 条件, 'site')).toEqual([订单])
    expect(筛选eBay订单([订单], 条件, 'beijing')).toEqual([])
    expect(筛选eBay订单([订单], { ...条件, dateRange: ['2026-09-09 14:24:18', '2026-09-09 14:24:18'] }, 'beijing')).toEqual([订单])
    expect(筛选eBay订单([{ ...订单, creationDate: '2026-09-09T06:24:19Z' }], 条件, 'site')).toEqual([])
    expect(筛选eBay订单([{ ...订单, purchaseMarketplaces: ['EBAY_US', 'EBAY_DE'] }], 条件, 'site')).toEqual([])
    expect(筛选eBay订单([{ ...订单, creationDate: '2026-09-09 06:24:18' }], 条件, 'beijing')).toEqual([])
  })

  it('非法/倒置日期及超1000精确搜索阻断，未知站点仍在无日期结果中保留', () => {
    const 条件 = { ...默认条件(), searchMatch: 'exact' as const, keyword: Array.from({ length: 1001 }, (_, i) => `ID-${i}`).join('\n') }
    expect(校验eBay订单筛选(条件)).toContain('1000')
    expect(校验eBay订单筛选({ ...默认条件(), dateRange: ['2026-02-30 00:00:00', '2026-03-01 00:00:00'] })).toBeTruthy()
    expect(校验eBay订单筛选({ ...默认条件(), dateRange: ['2026-09-09 00:00:01', '2026-09-09 00:00:00'] })).toBeTruthy()
    const 订单 = { ...eBay订单模拟数据[0]!, purchaseMarketplaces: ['EBAY_UNKNOWN'] }
    expect(筛选eBay订单([订单], 默认条件(), 'site')).toEqual([订单])
  })

  it('时间排序使用绝对瞬间，不按站点文字顺序，缺失/非法末尾且不修改来源', () => {
    const 基础 = eBay订单模拟数据[0]!
    const 数据 = ['2026-10-09 01:00:00 UTC+8', '2026-10-08 18:00:00 UTC-7', undefined, 'invalid'].map((时间, i) => ({
      ...基础, orderId: `S${i}`, creationDate: 时间!, shipBy: 时间,
    }))
    for (const field of ['creationDate', 'shipBy']) {
      expect(排序eBay订单(数据, { field, direction: 'asc' }).map(项 => 项.orderId)).toEqual(['S0', 'S1', 'S2', 'S3'])
      expect(排序eBay订单(数据, { field, direction: 'desc' }).map(项 => 项.orderId)).toEqual(['S1', 'S0', 'S2', 'S3'])
    }
    expect(排序eBay订单(数据, { field: '', direction: 'desc' })).toEqual(数据)
    expect(数据.map(项 => 项.orderId)).toEqual(['S0', 'S1', 'S2', 'S3'])
  })
})
