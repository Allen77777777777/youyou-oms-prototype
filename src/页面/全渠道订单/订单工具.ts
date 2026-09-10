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

export type 状态语气 = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface 状态说明 {
  text: string
  tone: 状态语气
  helper?: string
  sourcePending?: boolean
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
  未接入: { text: '接口待接入', tone: 'neutral' },
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

export function 获取同步状态说明(状态: 同步状态): 状态说明 {
  return 同步状态字典[状态]
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

export function 订单检索文本(订单: 全渠道订单): string {
  return [
    订单.systemOrderNo,
    订单.platformOrderId,
    订单.platformOrderNo,
    订单.platformCode,
    订单.storeName,
    订单.buyerExternalId,
    ...订单.items.flatMap((商品) => [
      商品.externalLineId,
      商品.platformItemId,
      商品.platformSku,
      商品.systemSku,
      商品.platformItemTitle,
      商品.systemItemName,
    ]),
    ...订单.fulfillmentOrders.flatMap((履约单) => [
      履约单.fulfillmentOrderNo,
      履约单.trackingNumber,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

export function 筛选全渠道订单(
  订单列表: 全渠道订单[],
  条件: 全渠道订单筛选条件,
  快速范围: 快速视图 = '全部',
): 全渠道订单[] {
  const 关键词 = 条件.keyword.trim().toLocaleLowerCase()

  return 订单列表.filter((订单) => {
    if (快速范围 !== '全部' && 订单.fulfillmentMode !== 快速范围) return false
    if (关键词 && !订单检索文本(订单).includes(关键词)) return false
    if (条件.platform && 订单.platformCode !== 条件.platform) return false
    if (条件.store && 订单.storeName !== 条件.store) return false
    if (条件.processingStatus === '__EMPTY__' && 订单.processingStatus) return false
    if (条件.processingStatus && 条件.processingStatus !== '__EMPTY__' && 订单.processingStatus !== 条件.processingStatus) return false
    if (条件.dateRange?.length === 2) {
      const 时间值 = 订单[条件.dateType]
      const 日期值 = 时间值?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      if (!日期值 || 日期值 < 条件.dateRange[0] || 日期值 > 条件.dateRange[1]) return false
    }
    if (条件.platformStatus === '__NOT_INTEGRATED__' && 订单.platformCode === 'eBay') return false
    if (条件.platformStatus && 条件.platformStatus !== '__NOT_INTEGRATED__' && 订单.platformOrderStatus !== 条件.platformStatus) return false
    if (条件.syncStatus && 订单.sync.status !== 条件.syncStatus) return false
    if (条件.skuStatus && !订单.items.some((商品) => 商品.skuResolutionStatus === 条件.skuStatus)) return false
    if (条件.countryCode && 订单.address.countryCode !== 条件.countryCode) return false
    return true
  })
}
