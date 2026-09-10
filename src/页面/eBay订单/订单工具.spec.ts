import { describe, expect, it } from 'vitest'

import { eBay订单模拟数据 } from './模拟数据'
import { 格式化eBay站点, 格式化列表时间, 获取状态说明, 计算商品单价, 筛选eBay订单 } from './订单工具'
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
    for (const 关键词 of ['EB-US-CA-1048', 'YY-CA-1048-US', '23890174012', '94***0031']) {
      expect(筛选eBay订单(eBay订单模拟数据, { ...默认条件(), keyword: 关键词 }).map((订单) => 订单.orderId)).toContain('15-10578-48261')
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
})
