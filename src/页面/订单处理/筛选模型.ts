import type { 全渠道订单, 订单商品行 } from '../全渠道订单/类型'
import type { 订单标志 } from './订单标志模型'
import type { 仓库执行 } from './演示会话'
import { 获取作业路由, type 作业行 } from './展示工具'
import { 解析来源时刻 } from './时间展示工具'

export type 订单处理日期类型 = 'orderedAt' | 'paidAt' | 'shipByAt' | 'lastSyncedAt'
export type 订单处理排序方向 = 'asc' | 'desc'
export type 订单处理商品搜索类型 = 'platformItemTitle' | 'systemItemName' | 'platformSku' | 'systemSku'
export interface 订单处理筛选条件 {
  keyword: string
  searchType: string
  searchMatch: 'contains' | 'exact'
  platform: string[]
  store: string[]
  warehouse: string[]
  channel: string[]
  country: string[]
  flag: string[]
  inventory: string[]
  remainingShippingTime: string[]
  dateType: 订单处理日期类型
  dateRange: null | [string, string]
}
export interface 订单处理筛选上下文 {
  orders: 全渠道订单[]
  inventory: Record<string, string>
  flags: (订单: 全渠道订单) => 订单标志[]
  executions?: 仓库执行[]
  /** 查询时冻结的当前时刻；不传时同一次匹配调用仅读取一次系统时间。 */
  now?: number
}

export const 编号搜索类型: string[] = ['platformOrderNo', 'systemOrderNo', 'fulfillmentOrderNo', 'warehouseOrderNo', 'trackingNumber']
export const 订单处理剩余发货时间选项 = ['已超时', '不足12小时', '不足24小时', '不足36小时', '不足48小时', '大于48小时'] as const
const 商品搜索类型: 订单处理商品搜索类型[] = ['platformItemTitle', 'systemItemName', 'platformSku', 'systemSku']
const 日期搜索类型: 订单处理日期类型[] = ['orderedAt', 'paidAt', 'shipByAt', 'lastSyncedAt']

export function 默认订单处理筛选(): 订单处理筛选条件 {
  return { keyword: '', searchType: 'platformOrderNo', searchMatch: 'contains', platform: [], store: [], warehouse: [], channel: [], country: [], flag: [], inventory: [], remainingShippingTime: [], dateType: 'orderedAt', dateRange: null }
}

/** 编号和 SKU 保留大小写及原始内容，支持换行与常用分隔符。 */
export function 解析批量编号(关键词: string): string[] {
  return [...new Set(关键词.split(/[,，;；\s]+/u).map(值 => 值.trim()).filter(Boolean))]
}

const 精确文本忽略大小写 = (类型: string) => ['platformItemTitle', 'systemItemName', 'buyerExternalId'].includes(类型)

/** 名称及买家 ID 保留词内空格；去重、计数和查询复用同一解析契约。 */
export function 解析精确搜索值(关键词: string, 搜索类型: string): string[] {
  if (!精确文本忽略大小写(搜索类型)) return 解析批量编号(关键词)
  const 值 = 关键词.split(/[,，;；\r\n]+/u).map(项 => 项.trim()).filter(Boolean)
  const 去重 = new Map<string, string>()
  for (const 项 of 值) if (!去重.has(项.toLocaleLowerCase())) 去重.set(项.toLocaleLowerCase(), 项)
  return [...去重.values()]
}

/** 控件值为北京时间墙上时间；结束边界覆盖输入的整个秒或兼容日期的整个末日。 */
function 查询时间边界(输入: string, 结束 = false): number | undefined {
  const 匹配 = 输入.trim().match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}:\d{2}))?$/)
  if (!匹配) return undefined
  const 时刻 = 解析来源时刻(`${匹配[1]}T${匹配[2] ?? '00:00:00'}+08:00`)
  return 时刻 === undefined ? undefined : 时刻 + (结束 ? 匹配[2] ? 1000 : 86_400_000 : 0)
}

export function 校验订单处理筛选(筛选: 订单处理筛选条件): string | undefined {
  if (!['buyerExternalId', ...编号搜索类型, ...商品搜索类型].includes(筛选.searchType)) return '请选择有效的搜索类型'
  if (!['contains', 'exact'].includes(筛选.searchMatch)) return '请选择模糊或精确匹配'
  if (!日期搜索类型.includes(筛选.dateType)) return '请选择有效的日期类型'
  if (筛选.searchMatch === 'exact') {
    const 数量 = 解析精确搜索值(筛选.keyword, 筛选.searchType).length
    if (数量 > 1000) return `已输入 ${数量} 个不同搜索值，单次最多查询 1000 个，请减少后再查询`
    if (筛选.keyword.trim() && !数量) return '请输入有效的精确搜索值'
  }
  if (筛选.dateRange !== null) {
    if (!Array.isArray(筛选.dateRange) || 筛选.dateRange.length !== 2 || 筛选.dateRange.some(时间 => typeof 时间 !== 'string' || !时间.trim())) return '请选择完整的起止时间'
    const 起始 = 查询时间边界(筛选.dateRange[0]), 结束 = 查询时间边界(筛选.dateRange[1], true)
    if (起始 === undefined || 结束 === undefined) return '时间无效，请选择有效的起止时间'
    if (起始 >= 结束) return '开始时间不能晚于结束时间'
  }
  return undefined
}

/** 履约主行只读取当前有效来源，不取第一张订单，不重复返回同一来源。 */
export function 获取作业来源订单(行: 作业行, 订单全集: 全渠道订单[]): 全渠道订单[] {
  if (!行.fulfillment) return [行.order]
  const 履约号 = 行.fulfillment.fulfillmentOrderNo
  const 来源 = 订单全集.filter(订单 => 订单.fulfillmentOrders.some(履约 => 履约.isActive && 履约.fulfillmentOrderNo === 履约号))
  return [...new Map(来源.map(订单 => [订单.systemOrderNo, 订单])).values()]
}

function 命中路由(行: 作业行, 筛选: 订单处理筛选条件): boolean {
  if (!筛选.warehouse.length && !筛选.channel.length) return true
  const 路由 = 获取作业路由(行)
  // 未分配也必须在同一个候选路由上成立，不能跨仓、跨渠道拼接条件。
  return (路由.length ? 路由 : [undefined]).some(项 => {
    const 仓库命中 = !筛选.warehouse.length || 筛选.warehouse.some(值 => 值 === 'UNASSIGNED' ? !项?.warehouse.trim() : 项?.warehouse === 值)
    const 渠道命中 = !筛选.channel.length || 筛选.channel.some(值 => 值 === 'UNASSIGNED' ? !项?.shippingChannelCode.trim() : 项?.shippingChannelCode === 值)
    return 仓库命中 && 渠道命中
  })
}

const 是商品搜索类型 = (类型: string): 类型 is 订单处理商品搜索类型 => 商品搜索类型.includes(类型 as 订单处理商品搜索类型)
const 命中多选 = (选项: string[], 原值: string | undefined) => !选项.length || (!!原值 && 选项.includes(原值))

function 命中文本(值: string | undefined, 筛选: 订单处理筛选条件): boolean {
  const 关键词 = 筛选.keyword.trim()
  if (!关键词) return true
  if (!值) return false
  if (筛选.searchMatch === 'contains') return 值.toLocaleLowerCase().includes(关键词.toLocaleLowerCase())
  const 搜索值 = 解析精确搜索值(关键词, 筛选.searchType)
  return 精确文本忽略大小写(筛选.searchType) ? 搜索值.some(项 => 项.toLocaleLowerCase() === 值.toLocaleLowerCase()) : 搜索值.includes(值)
}

function 命中商品(订单: 全渠道订单, 筛选: 订单处理筛选条件): boolean {
  if (!是商品搜索类型(筛选.searchType) || !筛选.keyword.trim()) return true
  const 类型 = 筛选.searchType
  return 订单.items.some((商品: 订单商品行) => 命中文本(商品[类型], 筛选))
}

/** 只读可靠截止时间；不足阈值可重叠，大于 48 小时不包含恰好 48 小时。 */
function 命中剩余发货时间(行: 作业行, 订单: 全渠道订单, 选项: string[], 当前时刻: number): boolean {
  if (!选项.length) return true
  if (行.stage === '已发货' || 行.stage === '不发货' || 订单.processingStatus === '已发货' || 订单.processingStatus === '不发货') return false
  const 截止时刻 = 解析来源时刻(订单.shipByAt)
  if (截止时刻 === undefined || !Number.isFinite(当前时刻)) return false
  const 剩余 = 截止时刻 - 当前时刻
  const 不足阈值: Record<string, number> = { '不足12小时': 12, '不足24小时': 24, '不足36小时': 36, '不足48小时': 48 }
  return 选项.some(值 => {
    if (值 === '已超时') return 剩余 <= 0
    if (值 === '大于48小时') return 剩余 > 48 * 3_600_000
    return 剩余 > 0 && 不足阈值[值] !== undefined && 剩余 < 不足阈值[值]! * 3_600_000
  })
}

function 关联履约(行: 作业行, 订单: 全渠道订单) {
  return 行.fulfillment ? [行.fulfillment] : 订单.fulfillmentOrders.filter(履约 => 履约.isActive)
}

function 关联执行(行: 作业行, 订单: 全渠道订单, 上下文: 订单处理筛选上下文): 仓库执行[] {
  const 执行 = [...(上下文.executions ?? []), ...(行.execution ? [行.execution] : [])]
    .filter(单 => 单.订单号.includes(订单.systemOrderNo) && (!行.fulfillment || 单.履约单号 === 行.fulfillment.fulfillmentOrderNo))
  return [...new Map(执行.map(单 => [JSON.stringify([单.履约单号, 单.出库单号, 单.外部仓库单号, [...单.订单号].sort()]), 单])).values()]
}

function 命中关键词(行: 作业行, 订单: 全渠道订单, 筛选: 订单处理筛选条件, 上下文: 订单处理筛选上下文): boolean {
  if (!筛选.keyword.trim() || 是商品搜索类型(筛选.searchType)) return true
  const 履约 = 关联履约(行, 订单)
  const 执行 = 关联执行(行, 订单, 上下文)
  if (编号搜索类型.includes(筛选.searchType)) {
    const 候选 = 筛选.searchType === 'systemOrderNo' ? [订单.systemOrderNo]
      : 筛选.searchType === 'platformOrderNo' ? [订单.platformOrderNo]
        : 筛选.searchType === 'fulfillmentOrderNo' ? 履约.map(项 => 项.fulfillmentOrderNo)
          : 筛选.searchType === 'trackingNumber' ? 履约.map(项 => 项.trackingNumber)
            : 执行.flatMap(单 => [单.出库单号, 单.外部仓库单号])
    return 候选.some(值 => 命中文本(值, 筛选))
  }
  return 筛选.searchType === 'buyerExternalId' && 命中文本(订单.buyerExternalId, 筛选)
}

function 命中来源订单(行: 作业行, 订单: 全渠道订单, 筛选: 订单处理筛选条件, 上下文: 订单处理筛选上下文, 当前时刻: number): boolean {
  if (!命中多选(筛选.platform, 订单.platformCode) || !命中多选(筛选.store, 订单.storeId)) return false
  if (!命中多选(筛选.country.map(国家 => 国家.trim().toUpperCase()), 订单.address.countryCode?.trim().toUpperCase())) return false
  if (!命中剩余发货时间(行, 订单, 筛选.remainingShippingTime, 当前时刻)) return false
  // 沿用现有虚构样例的缺省“充足”；这不是生产库存来源或审核通过依据。
  if (!命中多选(筛选.inventory, 上下文.inventory[订单.systemOrderNo] ?? '充足')) return false
  if (筛选.dateRange) {
    const 时刻 = 解析来源时刻(订单[筛选.dateType])
    const 起始 = 查询时间边界(筛选.dateRange[0])!, 结束 = 查询时间边界(筛选.dateRange[1], true)!
    if (时刻 === undefined || 时刻 < 起始 || 时刻 >= 结束) return false
  }
  if (筛选.flag.length) {
    const 标志 = 上下文.flags(订单)
    if (!筛选.flag.some(值 => 值 === 'NONE' ? !标志.length : 标志.some(项 => 项.code === 值))) return false
  }
  return 命中关键词(行, 订单, 筛选, 上下文) && 命中商品(订单, 筛选)
}

/** 查询只读投影；不同来源订单不能分别贡献条件拼出一个错误命中。 */
export function 命中订单处理筛选(行: 作业行, 筛选: 订单处理筛选条件, 上下文: 订单处理筛选上下文): boolean {
  if (校验订单处理筛选(筛选) || !命中路由(行, 筛选)) return false
  const 当前时刻 = 上下文.now ?? Date.now()
  return 获取作业来源订单(行, 上下文.orders).some(订单 => 命中来源订单(行, 订单, 筛选, 上下文, 当前时刻))
}

/** 按当前行代表来源的真实时刻排序；未知时间始终置后，同行时刻以稳定业务键打破平局。 */
export function 排序订单处理作业(行: 作业行[], 类型: 订单处理日期类型, 方向: 订单处理排序方向): 作业行[] {
  return 行.map(项 => ({ row: 项, time: 解析来源时刻(项.order[类型]) })).sort((甲, 乙) => {
    if (甲.time === undefined && 乙.time !== undefined) return 1
    if (甲.time !== undefined && 乙.time === undefined) return -1
    if (甲.time !== undefined && 乙.time !== undefined && 甲.time !== 乙.time) return (方向 === 'asc' ? 1 : -1) * (甲.time - 乙.time)
    return 甲.row.key.localeCompare(乙.row.key)
  }).map(项 => 项.row)
}
