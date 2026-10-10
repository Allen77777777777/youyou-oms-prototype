import { describe, expect, it } from 'vitest'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 作业行 } from './展示工具'
import type { 订单标志 } from './订单标志模型'
import { 默认订单处理筛选, 订单处理剩余发货时间选项, 解析批量编号, 解析精确搜索值, 校验订单处理筛选, 获取作业来源订单, 命中订单处理筛选, 排序订单处理作业, type 订单处理筛选条件, type 订单处理筛选上下文, type 订单处理日期类型 } from './筛选模型'

function 路由(覆盖: Partial<订单路由> = {}): 订单路由 {
  return { warehouse: '演示仓 A', warehouseProvider: '演示服务商', warehouseAccount: '演示账号 A', shippingChannel: '演示渠道 A', shippingChannelCode: 'CHANNEL-A', labelMode: '仓配一体', ...覆盖 }
}
function 订单(覆盖: Partial<全渠道订单> = {}): 全渠道订单 {
  const 原单 = structuredClone(全渠道订单模拟数据[0]!)
  return { ...原单, systemOrderNo: 'OMS-A', platformOrderNo: 'PLATFORM-A', platformOrderId: 'PLATFORM-ID-A', platformCode: 'eBay', storeId: 'store-a', storeName: '演示同名店', processingStatus: '待审核', fulfillmentMode: '自配送', defaultRoute: 路由(), fulfillmentOrders: [], orderedAt: '2026-10-09T00:00:00Z', paidAt: '2026-10-09T01:00:00Z', lastSyncedAt: '2026-10-09T02:00:00Z', shipByAt: '2026-10-10T10:00:00Z', urgency: '正常', buyerExternalId: 'Demo Buyer A', tags: [], operationLogs: [], reviews: [], address: { ...原单.address, countryCode: 'US', buyerMessage: '' }, items: [{ ...原单.items[0]!, platformSku: 'PL-SKU-A', systemSku: 'SYS-SKU-A', platformItemTitle: 'Auto Brake Rotor', systemItemName: '演示制动盘', skuResolutionStatus: '成功' }], ...覆盖 }
}
function 订单行(原单 = 订单(), stage: 作业行['stage'] = '待审核'): 作业行 { return { key: 原单.systemOrderNo, order: 原单, stage } }
function 履约行(原单: 全渠道订单, 编号 = 'FULFILLMENT-A'): 作业行 {
  原单.fulfillmentOrders = [{ fulfillmentOrderNo: 编号, status: '执行中', isActive: true, route: 路由(), plannedQuantity: 1, shippedQuantity: 0, trackingNumber: 'TRACK-A' }]
  return { key: 编号, order: 原单, fulfillment: 原单.fulfillmentOrders[0]!, stage: '待发货', execution: { 履约单号: 编号, 订单号: [原单.systemOrderNo], 出库单号: 'OUT-A', 外部仓库单号: 'WAREHOUSE-A', 状态: '待出库', 待核查: false, 原因: '', 更新时间: '2026-10-09T02:00:00Z' } }
}
function 条件(覆盖: Partial<订单处理筛选条件> = {}): 订单处理筛选条件 { return { ...默认订单处理筛选(), ...覆盖 } }
const 查询时刻 = Date.parse('2026-10-09T00:00:00Z')
function 上下文(orders: 全渠道订单[], 覆盖: Partial<订单处理筛选上下文> = {}): 订单处理筛选上下文 { return { orders, inventory: {}, flags: () => [], now: 查询时刻, ...覆盖 } }
function 命中(行: 作业行, 覆盖: Partial<订单处理筛选条件>, 环境 = 上下文([行.order])) { return 命中订单处理筛选(行, 条件(覆盖), 环境) }
const 买家留言标志: 订单标志 = { code: 'BUYER_NOTE', text: '言', name: '买家留言', tone: 'orange', reason: '演示来源', sourceOrderNos: ['OMS-B'] }

describe('统一查询输入与 1000 条上限', () => {
  it('默认平台订单号模糊匹配，分类数组及日期范围相互独立，不保留已删除的综合和商品组', () => {
    const 草稿 = 默认订单处理筛选()
    expect(草稿).toMatchObject({ searchType: 'platformOrderNo', searchMatch: 'contains', keyword: '', dateType: 'orderedAt', dateRange: null })
    expect(草稿).not.toHaveProperty('productType')
    expect(草稿).not.toHaveProperty('productKeyword')
    expect(草稿).not.toHaveProperty('sku')
    expect(草稿).not.toHaveProperty('urgency')
    for (const 键 of ['platform', 'store', 'warehouse', 'channel', 'country', 'flag', 'inventory', 'remainingShippingTime'] as const) {
      expect(草稿[键]).toEqual([])
      草稿[键].push('draft')
      expect(默认订单处理筛选()[键]).toEqual([])
    }
  })
  it('编号分隔去空去重且保留大小写，名称与买家 ID 保留词内空格', () => {
    expect(解析批量编号(' A-01,，B-02;C-03；D-04\nA-01\t a-01 ')).toEqual(['A-01', 'B-02', 'C-03', 'D-04', 'a-01'])
    expect(解析精确搜索值(' Auto Brake Rotor \nAUTO BRAKE ROTOR；Auto Wiper ', 'platformItemTitle')).toEqual(['Auto Brake Rotor', 'Auto Wiper'])
    expect(解析精确搜索值(' Demo Buyer A ; Demo Buyer B ', 'buyerExternalId')).toEqual(['Demo Buyer A', 'Demo Buyer B'])
    expect(解析精确搜索值(' SKU-A sku-a \n SKU-A', 'systemSku')).toEqual(['SKU-A', 'sku-a'])
  })
  it('精确上限按去重值计数，1000 条合法，1001 条拒绝且不截断', () => {
    const 值 = Array.from({ length: 1000 }, (_, i) => 'ORDER-' + i)
    expect(校验订单处理筛选(条件({ searchMatch: 'exact', keyword: 值.concat(值).join(',') }))).toBeUndefined()
    const 超限 = 条件({ searchMatch: 'exact', keyword: [...值, 'PLATFORM-A'].join(',') })
    expect(校验订单处理筛选(超限)).toContain('1001')
    expect(校验订单处理筛选(超限)).toContain('1000')
    expect(命中订单处理筛选(订单行(), 超限, 上下文([订单()]))).toBe(false)
    expect(校验订单处理筛选(条件({ searchMatch: 'contains', keyword: 超限.keyword }))).toBeUndefined()
    expect(校验订单处理筛选(条件({ searchType: 'platformItemTitle', searchMatch: 'exact', keyword: Array.from({ length: 1001 }, (_, i) => 'Product Name ' + i).join('\n') }))).toContain('1000')
  })
  it('已删除综合类型及未知匹配模式不可查询，纯分隔符不作为有效精确值', () => {
    expect(校验订单处理筛选(条件({ searchType: 'all' }))).toContain('搜索类型')
    expect(校验订单处理筛选(条件({ searchMatch: 'unsupported' as 'exact' }))).toContain('模糊或精确')
    expect(校验订单处理筛选(条件({ searchMatch: 'exact', keyword: ' ,；\n' }))).toContain('有效')
    expect(校验订单处理筛选(条件({ searchMatch: 'exact', keyword: '' }))).toBeUndefined()
  })
  it('非法日历、非法时分秒、不完整区间和倒序严格校验，旧日期仅输入仍兼容', () => {
    for (const 输入 of ['2026-02-29', '2026-10-09 24:00:00', '2026-10-09 08:60:00', '2026-10-09 08:00:60', '2026-10-9', '2026-10-09 08:00', '2026-10-09T08:00:00Z']) {
      expect(校验订单处理筛选(条件({ dateRange: [输入, '2026-10-10 12:00:00'] }))).toContain('时间无效')
    }
    expect(校验订单处理筛选(条件({ dateRange: ['2026-10-09 08:00:01', '2026-10-09 08:00:00'] }))).toContain('不能晚于')
    expect(校验订单处理筛选(条件({ dateRange: ['2026-10-09', ''] }))).toContain('完整')
    expect(校验订单处理筛选(条件({ dateRange: ['2026-10-09'] as unknown as [string, string] }))).toContain('完整')
    expect(校验订单处理筛选(条件({ dateRange: ['2028-02-29', '2028-02-29'] }))).toBeUndefined()
    expect(校验订单处理筛选(条件({ dateRange: ['2026-10-09 12:00:00', '2026-10-09'] }))).toBeUndefined()
  })
})

describe('多选分类与共享来源隔离', () => {
  it('同字段选项 OR、不同字段 AND，空选项不设限制', () => {
    const 行 = 订单行(), 环境 = 上下文([行.order], { flags: () => [买家留言标志] })
    const 组合: Partial<订单处理筛选条件> = { platform: ['Temu', 'eBay'], store: ['store-b', 'store-a'], warehouse: ['演示仓 B', '演示仓 A'], channel: ['CHANNEL-B', 'CHANNEL-A'], country: ['CA', 'US'], flag: ['REFUND', 'BUYER_NOTE'], inventory: ['不足', '充足'], remainingShippingTime: ['已超时', '不足36小时'] }
    expect(命中(行, 组合, 环境)).toBe(true)
    for (const [字段, 值] of [['platform', 'Temu'], ['store', 'store-b'], ['warehouse', '演示仓 B'], ['channel', 'CHANNEL-B'], ['country', 'CA'], ['flag', 'REFUND'], ['inventory', '不足'], ['remainingShippingTime', '不足24小时']] as const) {
      expect(命中(行, { ...组合, [字段]: [值] }, 环境)).toBe(false)
    }
    expect(命中(行, {}, 环境)).toBe(true)
  })
  it('非首来源完整命中即返回整张履约，多个候选值不跨来源拼接', () => {
    const A = 订单(), 行 = 履约行(A)
    const B = 订单({ systemOrderNo: 'OMS-B', platformCode: 'Temu', platformOrderNo: 'PLATFORM-B', storeId: 'store-b', shipByAt: '2026-10-09T10:00:00Z', urgency: '临期', fulfillmentOrders: structuredClone(A.fulfillmentOrders) })
    B.address.countryCode = 'CA'
    B.items[0]!.systemItemName = '演示雨刷'
    const 环境 = 上下文([A, B], { inventory: { 'OMS-B': '不足' }, flags: 单 => 单.systemOrderNo === 'OMS-B' ? [买家留言标志] : [] })
    expect(命中(行, { searchType: 'systemItemName', keyword: '雨刷', platform: ['eBay', 'Temu'], store: ['store-b'], country: ['CA'], inventory: ['不足'], remainingShippingTime: ['不足12小时'], flag: ['BUYER_NOTE'] }, 环境)).toBe(true)
    expect(命中(行, { platform: ['eBay'], store: ['store-b'] }, 环境)).toBe(false)
    expect(命中(行, { country: ['US'], searchMatch: 'exact', keyword: 'PLATFORM-B' }, 环境)).toBe(false)
    expect(命中(行, { store: ['store-a'], flag: ['BUYER_NOTE'] }, 环境)).toBe(false)
    expect(命中(行, { store: ['store-a'], inventory: ['不足'] }, 环境)).toBe(false)
    expect(命中(行, { store: ['store-a'], remainingShippingTime: ['不足12小时'] }, 环境)).toBe(false)
  })
  it('来源仅限当前有效履约并去重，不查询失效或无关联的来源', () => {
    const A = 订单(), 行 = 履约行(A)
    const B = 订单({ systemOrderNo: 'OMS-B', fulfillmentOrders: structuredClone(A.fulfillmentOrders) })
    const 失效 = 订单({ systemOrderNo: 'OMS-C', fulfillmentOrders: [{ ...structuredClone(行.fulfillment!), isActive: false }] })
    expect(获取作业来源订单(行, [A, B, B, 失效]).map(单 => 单.systemOrderNo)).toEqual(['OMS-A', 'OMS-B'])
    expect(命中(行, { searchType: 'systemOrderNo', keyword: 'OMS-B' }, 上下文([A, B]))).toBe(true)
    expect(命中(行, {}, 上下文([]))).toBe(false)
  })
  it('同名店仍按 ID 隔离，国家代码归一但不由其他地址信息补齐', () => {
    const 原单 = 订单({ storeId: 'store-b' }), 行 = 订单行(原单)
    expect(命中(行, { store: ['store-a'] })).toBe(false)
    expect(命中(行, { store: [原单.storeName] })).toBe(false)
    原单.address.countryCode = ' us '
    expect(命中(行, { store: ['store-a', 'store-b'], country: ['ca', 'US'] })).toBe(true)
    原单.address.countryCode = ''
    expect(命中(行, { country: ['US'] })).toBe(false)
    expect(命中(行, {})).toBe(true)
  })
  it('当前无标志可与其他标志 OR，标志投影不从 tags 或原因推测', () => {
    const 行 = 订单行(订单({ tags: ['BUYER_NOTE'], blockReason: '退款取消信言' }))
    expect(命中(行, { flag: ['NONE', 'REFUND'] })).toBe(true)
    expect(命中(行, { flag: ['BUYER_NOTE', 'REFUND'] })).toBe(false)
    const 环境 = 上下文([行.order], { flags: () => [买家留言标志] })
    expect(命中(行, { flag: ['NONE', 'BUYER_NOTE'] }, 环境)).toBe(true)
    expect(命中(行, { flag: ['NONE', 'REFUND'] }, 环境)).toBe(false)
  })
})

describe('多选仓库渠道保留同一路由约束', () => {
  it('多选可以命中其中任一完整路由，禁止跨两条路由凑仓库和渠道', () => {
    const 原单 = 订单({ processingStatus: '异常' }), 执行行 = 履约行(原单)
    原单.fulfillmentOrders.push({ ...structuredClone(执行行.fulfillment!), fulfillmentOrderNo: 'FULFILLMENT-B', route: 路由({ warehouse: '演示仓 B', shippingChannelCode: 'CHANNEL-B' }) })
    const 行 = 订单行(原单, '异常')
    expect(命中(行, { warehouse: ['演示仓 A', '演示仓 C'], channel: ['CHANNEL-B', 'CHANNEL-C'] })).toBe(false)
    expect(命中(行, { warehouse: ['演示仓 A', '演示仓 B'], channel: ['CHANNEL-B'] })).toBe(true)
  })
  it('待审核使用默认路由，执行主行用本次履约快照，不受其他履约和默认变化影响', () => {
    const 原单 = 订单(), 行 = 履约行(原单)
    原单.defaultRoute = 路由({ warehouse: '默认仓', shippingChannelCode: 'DEFAULT' })
    expect(命中(订单行(原单), { warehouse: ['默认仓'], channel: ['DEFAULT'] })).toBe(true)
    expect(命中(行, { warehouse: ['默认仓'], channel: ['DEFAULT'] })).toBe(false)
    expect(命中(行, { warehouse: ['演示仓 A'], channel: ['CHANNEL-A'] })).toBe(true)
    原单.fulfillmentOrders.push({ ...structuredClone(行.fulfillment!), fulfillmentOrderNo: 'OTHER', route: 路由({ warehouse: '演示仓 B', shippingChannelCode: 'CHANNEL-B' }) })
    expect(命中(行, { channel: ['CHANNEL-B'] })).toBe(false)
  })
  it('未分配可与具体值多选，缺失仓库和渠道仍须来自同一条路由', () => {
    const 原单 = 订单({ defaultRoute: undefined }), 行 = 订单行(原单)
    expect(命中(行, { warehouse: ['演示仓 A', 'UNASSIGNED'], channel: ['CHANNEL-A', 'UNASSIGNED'] })).toBe(true)
    expect(命中(行, { warehouse: ['演示仓 A'] })).toBe(false)
    原单.defaultRoute = 路由({ shippingChannelCode: '' })
    expect(命中(行, { warehouse: ['演示仓 A'], channel: ['UNASSIGNED'] })).toBe(true)
    expect(命中(行, { warehouse: ['UNASSIGNED'], channel: ['UNASSIGNED'] })).toBe(false)
  })
})

describe('剩余发货时间按查询时刻只读筛选', () => {
  function 剩余场景(毫秒: number) {
    const 行 = 订单行(订单({ shipByAt: new Date(查询时刻 + 毫秒).toISOString(), urgency: '无时限' }))
    return { 行, 环境: 上下文([行.order]) }
  }
  it('截止相等及过期均为已超时，截止前一毫秒仍命中所有不足阈值', () => {
    for (const 剩余 of [-1, 0, 1]) {
      const { 行, 环境 } = 剩余场景(剩余)
      expect(命中(行, { remainingShippingTime: ['已超时'] }, 环境)).toBe(剩余 <= 0)
      for (const 选项 of ['不足12小时', '不足24小时', '不足36小时', '不足48小时']) {
        expect(命中(行, { remainingShippingTime: [选项] }, 环境)).toBe(剩余 > 0)
      }
    }
  })
  it.each([12, 24, 36, 48])('不足 %s 小时为严格阈值，不使用显示倒计时的取整值', 小时 => {
    const 阈值 = 小时 * 3_600_000
    for (const 剩余 of [阈值 - 1, 阈值, 阈值 + 1]) {
      const { 行, 环境 } = 剩余场景(剩余)
      expect(命中(行, { remainingShippingTime: [`不足${小时}小时`] }, 环境)).toBe(剩余 < 阈值)
    }
  })
  it('恰好 48 小时不匹配六项，大于 48 小时严格匹配；空条件始终不限', () => {
    const { 行, 环境 } = 剩余场景(48 * 3_600_000)
    expect(命中(行, { remainingShippingTime: [...订单处理剩余发货时间选项] }, 环境)).toBe(false)
    expect(命中(行, { remainingShippingTime: [] }, 环境)).toBe(true)
    expect(命中(行, { remainingShippingTime: ['大于48小时'] }, { ...环境, now: 查询时刻 - 1 })).toBe(true)
    expect(命中(行, { remainingShippingTime: ['不足48小时'] }, { ...环境, now: 查询时刻 + 1 })).toBe(true)
  })
  it('累计不足阈值可重叠，多个选项 OR 且与店铺条件 AND，不使用原 urgency', () => {
    const { 行, 环境 } = 剩余场景(11 * 3_600_000)
    const 快照 = JSON.stringify(行)
    expect(命中(行, { remainingShippingTime: ['已超时', '不足12小时'] }, 环境)).toBe(true)
    expect(命中(行, { remainingShippingTime: ['不足48小时'] }, 环境)).toBe(true)
    expect(命中(行, { remainingShippingTime: ['已超时', '大于48小时'] }, 环境)).toBe(false)
    expect(命中(行, { remainingShippingTime: ['不足12小时'], store: ['store-b'] }, 环境)).toBe(false)
    expect(JSON.stringify(行)).toBe(快照)
    expect(行.order.urgency).toBe('无时限')
  })
  it('跨来源时区按真实截止匹配，缺失、不可靠时区和非法日期不补值', () => {
    const 行 = 订单行(订单({ shipByAt: '2026-10-09 11:00:00 UTC+2' })), 环境 = 上下文([行.order])
    expect(命中(行, { remainingShippingTime: ['不足12小时'] }, 环境)).toBe(true)
    for (const 截止 of [undefined, '', '—', '2026-10-09 11:00:00', '2026-10-09T11:00:00-00:00', '2026-02-30T11:00:00Z']) {
      行.order.shipByAt = 截止
      expect(命中(行, { remainingShippingTime: [...订单处理剩余发货时间选项] }, 环境)).toBe(false)
      expect(命中(行, { remainingShippingTime: [] }, 环境)).toBe(true)
    }
  })
  it('已发货及不发货的来源或作业行不命中时效选项，非法查询时刻也不推算', () => {
    const { 行, 环境 } = 剩余场景(1 * 3_600_000)
    for (const 终态 of ['已发货', '不发货'] as const) {
      行.order.processingStatus = 终态
      expect(命中(行, { remainingShippingTime: ['不足12小时'] }, 环境)).toBe(false)
      expect(命中(行, { remainingShippingTime: [] }, 环境)).toBe(true)
      行.order.processingStatus = '待审核'; 行.stage = 终态
      expect(命中(行, { remainingShippingTime: ['不足12小时'] }, 环境)).toBe(false)
      行.stage = '待审核'
    }
    expect(命中(行, { remainingShippingTime: [...订单处理剩余发货时间选项] }, { ...环境, now: Number.NaN })).toBe(false)
  })
  it('同一查询使用冻结时刻，只有换用新查询时刻才跨过截止边界', () => {
    const { 行, 环境 } = 剩余场景(1)
    const 条件值 = { remainingShippingTime: ['不足12小时'] }
    expect(命中(行, 条件值, 环境)).toBe(true)
    expect(命中(行, 条件值, { ...环境, now: 查询时刻 + 1 })).toBe(false)
    expect(命中(行, 条件值, 环境)).toBe(true)
    expect(命中(行, { remainingShippingTime: ['已超时'] }, { ...环境, now: 查询时刻 + 1 })).toBe(true)
  })
})

describe('统一字段模糊和精确匹配', () => {
  it('模糊匹配只读选定字段，包含单个完整关键词，不把分隔符变成 OR', () => {
    const 行 = 订单行()
    expect(命中(行, { keyword: 'platform-' })).toBe(true)
    expect(命中(行, { keyword: 'PLATFORM-A, OTHER' })).toBe(false)
    expect(命中(行, { keyword: 'SYS-SKU-A' })).toBe(false)
    expect(命中(行, { searchType: 'platformItemTitle', keyword: 'brake rotor' })).toBe(true)
    expect(命中(行, { searchType: 'buyerExternalId', keyword: ' buyer ' })).toBe(true)
    expect(命中(行, { searchType: 'systemSku', keyword: 'sku-a' })).toBe(true)
  })
  it('各编号精确 OR 查询保留大小写，不以子串或其他字段内容命中', () => {
    const 原单 = 订单(), 行 = 履约行(原单)
    for (const [searchType, keyword] of [['systemOrderNo', 'OMS-A'], ['platformOrderNo', 'PLATFORM-A'], ['fulfillmentOrderNo', 'FULFILLMENT-A'], ['warehouseOrderNo', 'OUT-A'], ['warehouseOrderNo', 'WAREHOUSE-A'], ['trackingNumber', 'TRACK-A']] as const) {
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: 'OTHER;\n' + keyword })).toBe(true)
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: keyword.toLowerCase() })).toBe(false)
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: keyword.slice(0, -1) })).toBe(false)
    }
    expect(命中(行, { searchType: 'systemOrderNo', searchMatch: 'exact', keyword: 'PLATFORM-A' })).toBe(false)
  })
  it('商品名和买家 ID 精确支持多行、内部空格及不区分大小写，禁止子串命中', () => {
    const 行 = 订单行()
    expect(命中(行, { searchType: 'platformItemTitle', searchMatch: 'exact', keyword: 'Auto Wiper\nauto brake rotor' })).toBe(true)
    expect(命中(行, { searchType: 'platformItemTitle', searchMatch: 'exact', keyword: 'Brake Rotor' })).toBe(false)
    expect(命中(行, { searchType: 'systemItemName', searchMatch: 'exact', keyword: '演示制动盘；演示雨刷' })).toBe(true)
    expect(命中(行, { searchType: 'buyerExternalId', searchMatch: 'exact', keyword: 'Other Buyer\ndemo buyer a' })).toBe(true)
    expect(命中(行, { searchType: 'buyerExternalId', searchMatch: 'exact', keyword: 'Buyer A' })).toBe(false)
  })
  it('SKU 精确保留大小写，同字段多值可 OR，不把模糊匹配改成多值 OR', () => {
    const 行 = 订单行()
    for (const [searchType, keyword] of [['platformSku', 'PL-SKU-A'], ['systemSku', 'SYS-SKU-A']] as const) {
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: 'OTHER\n' + keyword })).toBe(true)
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: keyword.toLowerCase() })).toBe(false)
      expect(命中(行, { searchType, searchMatch: 'exact', keyword: 'SKU-A' })).toBe(false)
      expect(命中(行, { searchType, searchMatch: 'contains', keyword: 'OTHER\n' + keyword })).toBe(false)
    }
  })
  it('删除解析状态筛选后仍可查询商品及 SKU，且不改变解析事实', () => {
    const 原单 = 订单(), 行 = 订单行(原单)
    原单.items.push({ ...structuredClone(原单.items[0]!), externalLineId: 'LINE-B', platformItemTitle: 'Auto Wiper', systemItemName: '演示雨刷', platformSku: 'PL-SKU-B', systemSku: undefined, skuResolutionStatus: '缺失' })
    const 原始事实 = JSON.stringify(原单.items)
    expect(命中(行, { searchType: 'platformItemTitle', keyword: 'Wiper' })).toBe(true)
    expect(命中(行, { searchType: 'platformSku', searchMatch: 'exact', keyword: 'PL-SKU-B' })).toBe(true)
    expect(命中(行, { searchType: 'systemSku', searchMatch: 'exact', keyword: 'SYS-SKU-A' })).toBe(true)
    expect(命中(行, { searchType: 'systemSku', searchMatch: 'exact', keyword: 'PL-SKU-B' })).toBe(false)
    expect(JSON.stringify(原单.items)).toBe(原始事实)
  })
  it('履约号和跟踪号仅查当前履约，订单行不从失效履约取得编号', () => {
    const 原单 = 订单(), 行 = 履约行(原单)
    原单.fulfillmentOrders.push({ ...structuredClone(行.fulfillment!), fulfillmentOrderNo: 'OTHER', trackingNumber: 'OTHER-TRACK' })
    原单.fulfillmentOrders.push({ ...structuredClone(行.fulfillment!), fulfillmentOrderNo: 'INACTIVE', trackingNumber: 'INACTIVE-TRACK', isActive: false })
    expect(命中(行, { searchType: 'trackingNumber', keyword: 'OTHER-TRACK' })).toBe(false)
    expect(命中(订单行(原单, '异常'), { searchType: 'trackingNumber', keyword: 'OTHER-TRACK' })).toBe(true)
    expect(命中(订单行(原单, '异常'), { searchType: 'trackingNumber', keyword: 'INACTIVE-TRACK' })).toBe(false)
  })
  it('订单行查询关联历史仓单，当前履约不串历史履约或另一来源执行', () => {
    const A = 订单(), 行 = 履约行(A), B = 订单({ systemOrderNo: 'OMS-B', storeId: 'store-b', fulfillmentOrders: structuredClone(A.fulfillmentOrders) })
    const 历史 = { ...structuredClone(行.execution!), 履约单号: 'HISTORY', 出库单号: 'HISTORY-OUT', 外部仓库单号: 'HISTORY-WAREHOUSE' }
    const B执行 = { ...structuredClone(行.execution!), 订单号: ['OMS-B'], 出库单号: 'B-OUT', 外部仓库单号: 'B-WAREHOUSE' }
    const 环境 = 上下文([A, B], { executions: [历史, B执行] })
    expect(命中(订单行(A, '异常'), { searchType: 'warehouseOrderNo', searchMatch: 'exact', keyword: 'HISTORY-OUT' }, 环境)).toBe(true)
    expect(命中(订单行(A, '不发货'), { searchType: 'warehouseOrderNo', keyword: 'history-warehouse' }, 环境)).toBe(true)
    expect(命中(行, { searchType: 'warehouseOrderNo', searchMatch: 'exact', keyword: 'HISTORY-OUT' }, 环境)).toBe(false)
    expect(命中(行, { store: ['store-b'], searchType: 'warehouseOrderNo', keyword: 'OUT-A' }, 环境)).toBe(false)
    expect(命中(行, { store: ['store-b'], searchType: 'warehouseOrderNo', keyword: 'B-OUT' }, 环境)).toBe(true)
  })
})

describe('北京时间到秒的范围', () => {
  it('包含起止秒，源时刻的亚秒值保留边界，不提前排除结束秒', () => {
    const 原单 = 订单(), 行 = 订单行(原单), 范围: Partial<订单处理筛选条件> = { dateRange: ['2026-10-09 08:00:00', '2026-10-09 08:00:01'] }
    for (const 时间 of ['2026-10-09T00:00:00Z', '2026-10-09T00:00:01.999Z', '2026-10-08T17:00:01-07:00', '2026-10-09 08:00:01 UTC+8']) {
      原单.orderedAt = 时间
      expect(命中(行, 范围)).toBe(true)
    }
    for (const 时间 of ['2026-10-08T23:59:59.999Z', '2026-10-09T00:00:02Z']) {
      原单.orderedAt = 时间
      expect(命中(行, 范围)).toBe(false)
    }
  })
  it('兼容日期仅输入为整天，次日零点排除', () => {
    const 原单 = 订单(), 行 = 订单行(原单), 范围: Partial<订单处理筛选条件> = { dateRange: ['2026-10-09', '2026-10-09'] }
    for (const 时间 of ['2026-10-08T16:00:00Z', '2026-10-09T15:59:59.999Z']) { 原单.orderedAt = 时间; expect(命中(行, 范围)).toBe(true) }
    for (const 时间 of ['2026-10-08T15:59:59.999Z', '2026-10-09T16:00:00Z']) { 原单.orderedAt = 时间; expect(命中(行, 范围)).toBe(false) }
  })
  it('缺值、非法来源和无时区不冒充命中，无范围时不追加付款准入门槛', () => {
    const 原单 = 订单(), 行 = 订单行(原单)
    for (const 时间 of [undefined, '', '2026-10-09 08:00:00', '2026-10-09T08:00:00', '2026-02-29T08:00:00Z', '2026-10-09T08:00:00-00:00']) {
      原单.paidAt = 时间
      expect(命中(行, { dateType: 'paidAt', dateRange: ['2026-10-09', '2026-10-09'] })).toBe(false)
      expect(命中(行, { dateType: 'paidAt' })).toBe(true)
    }
    expect(原单.processingStatus).toBe('待审核')
  })
  it('时间类型仅读取选定字段，不改写日期或已有 urgency', () => {
    const 原单 = 订单({ paidAt: '2026-10-10T01:00:00Z' }), 行 = 订单行(原单)
    const 范围: Partial<订单处理筛选条件> = { dateRange: ['2026-10-09', '2026-10-09'] }
    expect(命中(行, { ...范围, dateType: 'orderedAt' })).toBe(true)
    expect(命中(行, { ...范围, dateType: 'paidAt' })).toBe(false)
    expect(命中(行, { ...范围, dateType: 'lastSyncedAt' })).toBe(true)
    expect(命中(行, { ...范围, dateType: 'shipByAt' })).toBe(false)
    expect(原单.urgency).toBe('正常')
  })
})

describe('时间排序和只读边界', () => {
  it('各日期类型支持升降序，基于来源真实时刻处理跨时区顺序', () => {
    for (const 类型 of ['orderedAt', 'paidAt', 'shipByAt', 'lastSyncedAt'] as 订单处理日期类型[]) {
      const A = 订单行(订单({ systemOrderNo: 'A', [类型]: '2026-10-09T00:00:01Z' }))
      const B = 订单行(订单({ systemOrderNo: 'B', [类型]: '2026-10-08T17:00:00-07:00' }))
      expect(排序订单处理作业([A, B], 类型, 'asc').map(行 => 行.key)).toEqual(['B', 'A'])
      expect(排序订单处理作业([A, B], 类型, 'desc').map(行 => 行.key)).toEqual(['A', 'B'])
    }
  })
  it('缺失和非法时间在升降序都置后，同一时刻及缺值以主键稳定排序', () => {
    const A = 订单行(订单({ systemOrderNo: 'A', paidAt: '2026-10-09T00:00:00Z' }))
    const B = 订单行(订单({ systemOrderNo: 'B', paidAt: '2026-10-09 08:00:00 UTC+8' }))
    const C = 订单行(订单({ systemOrderNo: 'C', paidAt: undefined }))
    const D = 订单行(订单({ systemOrderNo: 'D', paidAt: '2026-10-09 08:00:00' }))
    for (const 方向 of ['asc', 'desc'] as const) expect(排序订单处理作业([D, B, C, A], 'paidAt', 方向).map(行 => 行.key)).toEqual(['A', 'B', 'C', 'D'])
  })
  it('排序使用行代表来源时间，不修改原数组或复制来源事实', () => {
    const A = 订单行(订单({ systemOrderNo: 'A', orderedAt: '2026-10-09T00:00:01Z' }))
    const B = 履约行(订单({ systemOrderNo: 'B', orderedAt: '2026-10-09T00:00:00Z' }), 'FULFILLMENT-B')
    const 输入 = [A, B], 原值 = JSON.stringify(输入)
    const 输出 = 排序订单处理作业(输入, 'orderedAt', 'asc')
    expect(输出).not.toBe(输入)
    expect(输出).toEqual([B, A])
    expect(输出[0]).toBe(B)
    expect(JSON.stringify(输入)).toBe(原值)
  })
  it('查询不修改六态、标志、执行快照、分类草稿或来源字段', () => {
    const 原单 = 订单(), 行 = 履约行(原单), 环境 = 上下文([原单], { flags: () => [买家留言标志] })
    const 筛选 = 条件({ flag: ['NONE', 'BUYER_NOTE'], warehouse: ['演示仓 A'], channel: ['CHANNEL-A'], dateRange: ['2026-10-09 08:00:00', '2026-10-09 08:00:00'] })
    const 原值 = JSON.stringify({ 原单, 行, 筛选, inventory: 环境.inventory })
    expect(命中订单处理筛选(行, 筛选, 环境)).toBe(true)
    expect(JSON.stringify({ 原单, 行, 筛选, inventory: 环境.inventory })).toBe(原值)
  })
})
