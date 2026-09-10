import { describe, expect, it } from 'vitest'

import { 全渠道订单模拟数据 } from './模拟数据'
import {
  格式化列表时间,
  格式化金额,
  获取OMS状态说明,
  获取平台状态说明,
  获取路由摘要,
  筛选全渠道订单,
} from './订单工具'
import type { 全渠道订单筛选条件 } from './类型'

const 默认条件 = (): 全渠道订单筛选条件 => ({
  keyword: '',
  platform: '',
  store: '',
  processingStatus: '',
  dateType: 'orderedAt',
  dateRange: [],
  platformStatus: '',
  syncStatus: '',
  skuStatus: '',
  countryCode: '',
})

describe('全渠道订单通用列表', () => {
  it('支持系统单号、平台单号、平台 SKU、系统 SKU、履约单号和跟踪号检索', () => {
    for (const 关键词 of [
      'OMS260909000184',
      '15-10578-48261',
      'EB-US-CA-1048',
      'YY-CA-1048-US',
      'FL260909000072',
      '94***0031',
    ]) {
      const 结果 = 筛选全渠道订单(全渠道订单模拟数据, { ...默认条件(), keyword: 关键词 })
      expect(结果.map((订单) => 订单.systemOrderNo)).toContain('OMS260909000184')
    }
  })

  it('按履约模式区分自配送与平台履约', () => {
    expect(筛选全渠道订单(全渠道订单模拟数据, 默认条件(), '自配送')).toHaveLength(7)
    expect(筛选全渠道订单(全渠道订单模拟数据, 默认条件(), '平台履约')).toHaveLength(1)
  })

  it('处理状态为空时区分等待准入与平台履约不适用', () => {
    const 空状态订单 = 筛选全渠道订单(全渠道订单模拟数据, {
      ...默认条件(),
      processingStatus: '__EMPTY__',
    })
    expect(空状态订单).toHaveLength(2)

    const 等待准入 = 空状态订单.find((订单) => 订单.fulfillmentMode === '自配送')!
    const 平台履约 = 空状态订单.find((订单) => 订单.fulfillmentMode === '平台履约')!
    expect(获取OMS状态说明(等待准入).text).toBe('未进入处理')
    expect(获取OMS状态说明(等待准入).helper).toContain('付款证据')
    expect(获取OMS状态说明(平台履约).text).toBe('不适用')
  })

  it('未接入平台使用明确占位且不保留虚构平台状态', () => {
    const Temu订单 = 全渠道订单模拟数据.find((订单) => 订单.platformCode === 'Temu')!
    expect(获取平台状态说明(Temu订单)).toMatchObject({
      text: '状态映射待接入',
      tone: 'neutral',
      sourcePending: true,
    })
    expect(Temu订单.platformOrderStatus).toBeUndefined()
    expect(Temu订单.sync.status).toBe('未接入')

    const 占位订单 = 筛选全渠道订单(全渠道订单模拟数据, {
      ...默认条件(),
      platformStatus: '__NOT_INTEGRATED__',
    })
    expect(占位订单).toHaveLength(6)
    expect(占位订单.every((订单) => 订单.platformCode !== 'eBay')).toBe(true)
  })

  it('eBay 已确认状态映射不标记来源待确认', () => {
    const eBay订单 = 全渠道订单模拟数据.find((订单) => 订单.systemOrderNo === 'OMS260909000184')!
    expect(获取平台状态说明(eBay订单)).toEqual({ text: 'IN_PROGRESS', tone: 'info' })
  })

  it('跨仓拆单按当前有效履约单聚合多仓多渠道', () => {
    const 拆单订单 = 全渠道订单模拟数据.find((订单) => 订单.platformCode === 'OZON')!
    const 摘要 = 获取路由摘要(拆单订单)
    expect(摘要.count).toBe(2)
    expect(摘要.aggregated).toBe(true)
    expect(摘要.warehouses).toContain('西邮波兰仓')
    expect(摘要.warehouses).toContain('出口易德国仓')
  })

  it('可以按日期范围和 SKU 解析结果筛选', () => {
    expect(筛选全渠道订单(全渠道订单模拟数据, {
      ...默认条件(),
      dateRange: ['2026-09-10', '2026-09-10'],
    })).toHaveLength(3)

    expect(筛选全渠道订单(全渠道订单模拟数据, {
      ...默认条件(),
      skuStatus: '查询失败',
    }).map((订单) => 订单.platformCode)).toEqual(['TikTok Shop'])
  })

  it('时间保留来源时区，金额统一显示币种和两位小数', () => {
    expect(格式化列表时间('2026-09-10 16:00 UTC-5')).toBe('09-10 16:00 UTC-5')
    expect(格式化金额({ currency: 'JPY', value: '9200' })).toBe('JPY 9,200.00')
  })
})
