import { describe, expect, it } from 'vitest'

import { 全渠道订单模拟数据 } from './模拟数据'
import {
  格式化列表时间,
  格式化金额,
  获取OMS状态说明,
  获取平台状态说明,
  获取路由摘要,
  筛选全渠道订单,
  规范化筛选条件,
  校验全渠道订单筛选,
  排序全渠道订单,
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
  it('损坏的查询方案不会将非文本关键词或未知日期字段带入筛选器', () => {
    const 条件 = 规范化筛选条件({ keyword: 42, dateType: '__proto__', dateRange: ['2026-09-12', '2026-09-10'], countryCode: { value: 'US' } })
    expect(条件.keyword).toBe('')
    expect(条件.dateType).toBe('orderedAt')
    expect(条件.dateRange).toEqual([])
    expect(() => 筛选全渠道订单(全渠道订单模拟数据, 条件)).not.toThrow()
  })

  it('支持系统单号、平台单号、平台 SKU、系统 SKU、履约单号和跟踪号检索', () => {
    for (const [searchType, 关键词] of [
      ['systemOrderNo', 'OMS260909000184'],
      ['platformOrderNo', '15-10578-48261'],
      ['platformSku', 'EB-US-CA-1048'],
      ['systemSku', 'YY-CA-1048-US'],
      ['fulfillmentOrderNo', 'FL260909000072'],
      ['trackingNumber', '94***0031'],
    ]) {
      const 结果 = 筛选全渠道订单(全渠道订单模拟数据, { ...默认条件(), searchType, keyword: 关键词! })
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
    expect(获取OMS状态说明(等待准入).helper).toContain('orderPaymentStatus')
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
    expect(Temu订单.sync.status).toBeUndefined()
    expect(Temu订单.tags).toEqual([])

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
    }).map(项 => 项.systemOrderNo)).toEqual(['OMS260910000219', 'OMS260910000184', 'OMS260910000233', 'OMS260910000241'])

    expect(筛选全渠道订单(全渠道订单模拟数据, {
      ...默认条件(),
      skuStatus: '查询失败',
    }).map((订单) => 订单.platformCode)).toEqual(['TikTok Shop'])
  })

  it('时间保留来源时区，金额统一显示币种和两位小数', () => {
    expect(格式化列表时间('2026-09-10 16:00 UTC-5')).toBe('09-10 16:00 UTC-5')
    expect(格式化金额({ currency: 'JPY', value: '9200' })).toBe('JPY 9,200.00')
  })

  it('分类同字段多值OR、字段间AND，店铺数组使用稳定ID且不串订单', () => {
    const 订单 = 全渠道订单模拟数据[0]!
    const 条件 = { ...默认条件(), platform: ['eBay', 'Temu'], store: [订单.storeId], processingStatus: ['待审核', '待发货'] }
    expect(筛选全渠道订单(全渠道订单模拟数据, 条件).map(项 => 项.systemOrderNo)).toEqual([订单.systemOrderNo])
    expect(筛选全渠道订单(全渠道订单模拟数据, { ...条件, store: [全渠道订单模拟数据.find(项 => 项.platformCode === 'OZON')!.storeId] })).toEqual([])
    expect(筛选全渠道订单(全渠道订单模拟数据, { ...默认条件(), processingStatus: ['__EMPTY__', '已发货'] }).every(项 => !项.processingStatus || 项.processingStatus === '已发货')).toBe(true)
  })

  it('选定单一字段搜索，模糊不分割多行，精确多值保留编号大小写', () => {
    const 订单 = 全渠道订单模拟数据[0]!
    expect(筛选全渠道订单([订单], { ...默认条件(), keyword: 订单.systemOrderNo })).toEqual([])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'systemOrderNo', keyword: 订单.systemOrderNo.toLowerCase() })).toEqual([订单])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'systemOrderNo', searchMatch: 'exact', keyword: `other\n${订单.systemOrderNo}` })).toEqual([订单])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'systemOrderNo', searchMatch: 'exact', keyword: 订单.systemOrderNo.toLowerCase() })).toEqual([])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'systemOrderNo', keyword: `other\n${订单.systemOrderNo}` })).toEqual([])
  })

  it('商品名称精确保留词内空格，搜索与SKU状态必须命中同一商品', () => {
    const 订单 = { ...全渠道订单模拟数据[0]!, items: [
      { ...全渠道订单模拟数据[0]!.items[0]!, platformItemTitle: 'Auto Brake Rotor', platformSku: 'SKU-A', skuResolutionStatus: '成功' as const },
      { ...全渠道订单模拟数据[0]!.items[0]!, platformItemTitle: 'Rear Cover', platformSku: 'SKU-B', skuResolutionStatus: '缺失' as const },
    ] }
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'platformItemTitle', searchMatch: 'exact', keyword: 'auto brake rotor\nother', skuStatus: ['成功', '冲突'] })).toEqual([订单])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'platformSku', keyword: 'SKU-A', skuStatus: ['缺失'] })).toEqual([])
    expect(筛选全渠道订单([订单], { ...默认条件(), searchType: 'platformSku', searchMatch: 'exact', keyword: 'sku-a' })).toEqual([])
  })

  it('北京时间起止秒含端点，无时区或非法来源不命中', () => {
    const 基础 = 全渠道订单模拟数据[0]!
    const 条件 = { ...默认条件(), dateRange: ['2026-10-09 12:00:00', '2026-10-09 12:00:01'] }
    const 订单 = ['2026-10-09T04:00:00Z', '2026-10-09T04:00:01.999Z', '2026-10-09T04:00:02Z', '2026-10-09 12:00:00', '2026-02-30T04:00:00Z'].map((orderedAt, i) => ({ ...基础, systemOrderNo: `TIME-${i}`, orderedAt }))
    expect(筛选全渠道订单(订单, 条件).map(项 => 项.systemOrderNo)).toEqual(['TIME-0', 'TIME-1'])
    expect(校验全渠道订单筛选({ ...条件, dateRange: ['2026-10-09 12:00:02', '2026-10-09 12:00:01'] })).toBeTruthy()
  })

  it('精确搜索1000项允许，1001项阻断，不截断搜索', () => {
    const 条件 = { ...默认条件(), searchMatch: 'exact' as const, keyword: Array.from({ length: 1000 }, (_, i) => `ID-${i}`).join('\n') }
    expect(校验全渠道订单筛选(条件)).toBeUndefined()
    expect(校验全渠道订单筛选({ ...条件, keyword: `${条件.keyword}\nID-1000` })).toContain('1000')
  })

  it('时间排序覆盖已有三个字段，缺失/非法始终末尾，同刻按稳定系统号，不修改原数组', () => {
    const 基础 = 全渠道订单模拟数据[0]!
    const 数据 = ['2026-10-09T01:00:00Z', '2026-10-09T00:00:00Z', undefined, 'invalid', '2026-10-09T00:00:00Z'].map((时间, i) => ({
      ...基础, systemOrderNo: `S${i}`, orderedAt: 时间!, shipByAt: 时间, lastSyncedAt: 时间!,
    }))
    for (const field of ['orderedAt', 'shipByAt', 'lastSyncedAt']) {
      expect(排序全渠道订单(数据, { field, direction: 'asc' }).map(项 => 项.systemOrderNo)).toEqual(['S1', 'S4', 'S0', 'S2', 'S3'])
      expect(排序全渠道订单(数据, { field, direction: 'desc' }).map(项 => 项.systemOrderNo)).toEqual(['S0', 'S1', 'S4', 'S2', 'S3'])
    }
    expect(排序全渠道订单(数据, { field: '', direction: 'desc' })).toEqual(数据)
    expect(数据.map(项 => 项.systemOrderNo)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4'])
  })
})
