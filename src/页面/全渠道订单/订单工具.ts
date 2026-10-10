import type {
  全渠道订单,
  全渠道订单筛选条件,
  快速视图,
  金额,
  订单路由,
  订单处理状态,
  SKU解析状态,
  同步状态,
} from './类型'
import { 命中多选, 命中字段搜索, 命中时间范围, 校验字段搜索, 校验时间范围, 排序列表, 读取排序时刻, type 列表排序条件 } from '@/组件/筛选/筛选工具'

export const 全渠道搜索字段: { value: string; label: string; kind?: 'identifier' | 'text' }[] = [
  { value: 'platformOrderNo', label: '平台订单号' },
  { value: 'systemOrderNo', label: '系统订单号' },
  { value: 'platformOrderId', label: '平台订单 ID' },
  { value: 'fulfillmentOrderNo', label: '履约单号' },
  { value: 'trackingNumber', label: '跟踪号' },
  { value: 'buyerExternalId', label: '买家账号', kind: 'text' },
  { value: 'platformSku', label: '平台 SKU' },
  { value: 'systemSku', label: '系统 SKU' },
  { value: 'platformItemId', label: '平台商品 ID' },
  { value: 'externalLineId', label: '平台订单行 ID' },
  { value: 'platformItemTitle', label: '平台商品名称', kind: 'text' },
  { value: 'systemItemName', label: '系统商品名称', kind: 'text' },
]

export function 校验全渠道订单筛选(条件: 全渠道订单筛选条件): string | undefined {
  const 字段 = 全渠道搜索字段.find(项 => 项.value === (条件.searchType ?? 'platformOrderNo'))
  if (!字段) return '请选择有效的搜索字段'
  if (!['orderedAt', 'shipByAt', 'lastSyncedAt'].includes(条件.dateType)) return '请选择有效的日期类型'
  return 校验字段搜索(条件.keyword, 条件.searchMatch ?? 'contains', 字段.kind) ?? 校验时间范围(条件.dateRange)
}

export function 排序全渠道订单(订单: 全渠道订单[], 条件: 列表排序条件): 全渠道订单[] {
  if (!['orderedAt', 'shipByAt', 'lastSyncedAt'].includes(条件.field)) return [...订单]
  return 排序列表(订单, 项 => 读取排序时刻(项[条件.field as 全渠道订单筛选条件['dateType']]), 条件.direction, 项 => 项.systemOrderNo)
}

export type 状态语气 = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface 状态说明 {
  text: string
  tone: 状态语气
  helper?: string
  sourcePending?: boolean
}

/** 查询方案来自浏览器存储，恢复时只接受可识别的字段和值。 */
export function 规范化筛选条件(来源: unknown): 全渠道订单筛选条件 {
  const 值 = 来源 && typeof 来源 === 'object' ? 来源 as Record<string, unknown> : {}
  const 文本 = (键: string) => typeof 值[键] === 'string' ? 值[键] as string : ''
  const 多选 = (键: string) => Array.isArray(值[键]) ? [...new Set((值[键] as unknown[]).filter((项): 项 is string => typeof 项 === 'string'))] : 文本(键)
  const 日期 = 值.dateRange
  const 有效日期 = Array.isArray(日期) && 日期.length === 2 && 日期.every((项) => typeof 项 === 'string')
    && !校验时间范围(日期)
  return {
    keyword: 文本('keyword'),
    searchType: 全渠道搜索字段.some(项 => 项.value === 值.searchType) ? 值.searchType as string : 'platformOrderNo',
    searchMatch: 值.searchMatch === 'exact' ? 'exact' : 'contains',
    platform: 多选('platform'), store: 多选('store'), processingStatus: 多选('processingStatus'),
    dateType: 值.dateType === 'shipByAt' || 值.dateType === 'lastSyncedAt' ? 值.dateType : 'orderedAt',
    dateRange: 有效日期 ? [日期[0] as string, 日期[1] as string] : [],
    platformStatus: 多选('platformStatus'), syncStatus: 多选('syncStatus'),
    skuStatus: 多选('skuStatus'), countryCode: 多选('countryCode'),
  }
}

const OMS状态语气: Record<订单处理状态, 状态语气> = {
  待审核: 'warning',
  待推单: 'info',
  待发货: 'info',
  已发货: 'success',
  异常: 'danger',
  不发货: 'neutral',
}

const 同步状态字典: Record<同步状态, 状态说明> = {
  已同步: { text: '同步正常', tone: 'success' },
  同步中: { text: '同步中', tone: 'info' },
  同步失败: { text: '同步失败', tone: 'danger' },
  待同步: { text: '待同步', tone: 'warning' },
}

const SKU状态字典: Record<SKU解析状态, 状态说明> = {
  成功: { text: '映射成功', tone: 'success' },
  待解析: { text: '待解析', tone: 'info' },
  缺失: { text: '映射缺失', tone: 'warning' },
  冲突: { text: '映射冲突', tone: 'danger' },
  失效: { text: '映射失效', tone: 'danger' },
  查询失败: { text: '查询失败', tone: 'danger' },
}

const 平台简称: Record<全渠道订单['platformCode'], string> = {
  eBay: 'EB',
  Temu: 'TM',
  'Mercado Libre': 'ML',
  Coupang: 'CP',
  OZON: 'OZ',
  'TikTok Shop': 'TK',
  Rakuten: 'RT',
}

export function 格式化金额(金额值?: 金额): string {
  if (!金额值) return '—'
  const 数值 = Number(金额值.value)
  if (!Number.isFinite(数值)) return 金额值.currency + ' ' + 金额值.value
  return 金额值.currency + ' ' + 数值.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function 格式化列表时间(原始时间?: string): string {
  if (!原始时间) return '—'
  const 匹配结果 = 原始时间.match(/^\d{4}-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?(?:\s+(.+))?$/)
  if (!匹配结果) return 原始时间
  const 月 = 匹配结果[1]
  const 日 = 匹配结果[2]
  const 时分 = 匹配结果[3]
  const 时区 = 匹配结果[4]
  return 月 + '-' + 日 + ' ' + 时分 + (时区 ? ' ' + 时区 : '')
}

export function 获取平台简称(订单: 全渠道订单): string {
  return 平台简称[订单.platformCode]
}

export function 获取订单商品数量(订单: 全渠道订单): number {
  return 订单.items.reduce((总数, 商品) => 总数 + 商品.orderedQuantity, 0)
}

export function 获取OMS状态说明(订单: 全渠道订单): 状态说明 {
  if (订单.processingStatus) {
    return {
      text: 订单.processingStatus,
      tone: OMS状态语气[订单.processingStatus],
      helper: 订单.blockReason || 订单.noShipmentReason,
    }
  }

  if (订单.fulfillmentMode === '平台履约') {
    return {
      text: '不适用',
      tone: 'neutral',
      helper: '平台履约订单不进入 OMS 自配送处理状态机',
    }
  }

  return {
    text: '未进入处理',
    tone: 'warning',
    helper: 订单.admissionReason || '准入原因口径待确认',
    sourcePending: true,
  }
}

export function 获取平台状态说明(订单: 全渠道订单): 状态说明 {
  if (订单.platformCode !== 'eBay') return {
    text: '状态映射待接入',
    tone: 'neutral',
    helper: '该平台订单接口尚未对接，当前为原型占位，不写入平台状态字段',
    sourcePending: true,
  }

  if (!订单.platformOrderStatus) return { text: '未返回', tone: 'neutral' }

  const eBay状态: Record<string, 状态说明> = {
    NOT_STARTED: { text: 'NOT_STARTED', tone: 'neutral' },
    IN_PROGRESS: { text: 'IN_PROGRESS', tone: 'info' },
    FULFILLED: { text: 'FULFILLED', tone: 'success' },
  }
  return eBay状态[订单.platformOrderStatus] ?? {
    text: 订单.platformOrderStatus,
    tone: 'warning',
    helper: '已接入平台返回了未登记枚举，需保留原值并核查',
    sourcePending: true,
  }
}

export function 获取同步状态说明(状态?: 同步状态): 状态说明 {
  return 状态 ? 同步状态字典[状态] : { text: '—', tone: 'neutral' }
}

export function 获取SKU状态说明(状态: SKU解析状态): 状态说明 {
  return SKU状态字典[状态]
}

export function 获取审核状态语气(状态: string): 状态语气 {
  if (状态 === '已通过') return 'success'
  if (状态 === '已拦截' || 状态 === '已拒绝') return 'danger'
  if (状态 === '审核中') return 'info'
  return 'warning'
}

function 去重路由(路由列表: 订单路由[]): 订单路由[] {
  const 已见 = new Set<string>()
  return 路由列表.filter((路由) => {
    const 键 = [路由.warehouse, 路由.shippingChannel, 路由.labelMode].join('|')
    if (已见.has(键)) return false
    已见.add(键)
    return true
  })
}

export function 获取当前路由(订单: 全渠道订单): 订单路由[] {
  const 当前履约路由 = 订单.fulfillmentOrders
    .filter((履约单) => 履约单.isActive)
    .map((履约单) => 履约单.route)

  if (当前履约路由.length) return 去重路由(当前履约路由)
  return 订单.defaultRoute ? [订单.defaultRoute] : []
}

export function 获取路由摘要(订单: 全渠道订单): {
  warehouses: string
  channels: string
  count: number
  aggregated: boolean
} {
  const 路由列表 = 获取当前路由(订单)
  return {
    warehouses: [...new Set(路由列表.map((路由) => 路由.warehouse))].join('、') || '尚未形成路由',
    channels: [...new Set(路由列表.map((路由) => 路由.shippingChannel))].join('、') || '—',
    count: 路由列表.length,
    aggregated: 路由列表.length > 1,
  }
}

export function 筛选全渠道订单(
  订单列表: 全渠道订单[],
  条件: 全渠道订单筛选条件,
  快速范围: 快速视图 = '全部',
): 全渠道订单[] {
  if (校验全渠道订单筛选(条件)) return []
  const 搜索字段 = 条件.searchType ?? 'platformOrderNo'
  const 字段配置 = 全渠道搜索字段.find(项 => 项.value === 搜索字段)!
  const 商品字段 = ['platformSku', 'systemSku', 'platformItemId', 'externalLineId', 'platformItemTitle', 'systemItemName'].includes(搜索字段)
  const 搜索 = (值: string | undefined | string[]) => 命中字段搜索(值, 条件.keyword, 条件.searchMatch ?? 'contains', 字段配置.kind)

  return 订单列表.filter((订单) => {
    if (快速范围 !== '全部' && 订单.fulfillmentMode !== 快速范围) return false
    if (!命中多选(条件.platform, 订单.platformCode)) return false
    // 页面以稳定 storeId 查询；兼容旧调用按 storeName 传入的标量。
    if (Array.isArray(条件.store) ? !命中多选(条件.store, 订单.storeId) : !命中多选(条件.store, 订单.storeName)) return false
    if (!命中多选(条件.processingStatus, 订单.processingStatus || '__EMPTY__')) return false
    if (!命中时间范围(订单[条件.dateType], 条件.dateRange)) return false
    if (!命中多选(条件.platformStatus, 订单.platformCode === 'eBay' ? 订单.platformOrderStatus : '__NOT_INTEGRATED__')) return false
    if (!命中多选(条件.syncStatus, 订单.sync.status)) return false
    if (!命中多选(条件.countryCode, 订单.address.countryCode)) return false
    if ((条件.skuStatus.length || (商品字段 && 条件.keyword.trim())) && !订单.items.some(商品 => 命中多选(条件.skuStatus, 商品.skuResolutionStatus)
      && (!商品字段 || 搜索(商品[搜索字段 as keyof typeof 商品] as string | undefined)))) return false
    if (!商品字段) {
      const 值 = 搜索字段 === 'fulfillmentOrderNo' || 搜索字段 === 'trackingNumber'
        ? 订单.fulfillmentOrders.map(履约单 => 履约单[搜索字段])
        : 订单[搜索字段 as keyof 全渠道订单] as string | undefined
      if (!搜索(Array.isArray(值) ? 值.filter((项): 项 is string => Boolean(项)) : 值)) return false
    }
    return true
  })
}
