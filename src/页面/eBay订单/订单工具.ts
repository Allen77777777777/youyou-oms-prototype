import { eBay查询墙钟, type eBay时区模式 } from './时间工具'
import type { eBay订单, eBay订单筛选条件, 金额 } from './类型'
import { 命中多选, 命中字段搜索, 命中时间范围, 校验字段搜索, 校验时间范围, 排序列表, 读取排序时刻, type 列表排序条件 } from '@/组件/筛选/筛选工具'

export const eBay搜索字段: { value: string; label: string; kind?: 'identifier' | 'text' }[] = [
  { value: 'platformOrderNo', label: '平台订单号' },
  { value: 'salesRecordReference', label: '销售记录号' },
  { value: 'systemOrderNo', label: '系统订单号' },
  { value: 'buyerUsername', label: '买家账号', kind: 'text' },
  { value: 'platformSku', label: '平台 SKU' },
  { value: 'systemSku', label: '系统 SKU' },
  { value: 'itemId', label: 'eBay Item ID' },
  { value: 'lineItemId', label: '订单行 ID' },
  { value: 'title', label: '商品名称', kind: 'text' },
  { value: 'fulfillmentId', label: '平台 fulfillment ID' },
  { value: 'trackingNumber', label: '跟踪号' },
  { value: 'fulfillmentNo', label: 'OMS 履约单号' },
  { value: 'confirmationNo', label: 'OMS 标发单号' },
]

export function 校验eBay订单筛选(条件: eBay订单筛选条件): string | undefined {
  const 字段 = eBay搜索字段.find(项 => 项.value === (条件.searchType ?? 'platformOrderNo'))
  if (!字段) return '请选择有效的搜索字段'
  if (!['creationDate', 'shipBy'].includes(条件.dateType)) return '请选择有效的日期类型'
  return 校验字段搜索(条件.keyword, 条件.searchMatch ?? 'contains', 字段.kind) ?? 校验时间范围(条件.dateRange)
}

export function 排序eBay订单(订单: eBay订单[], 条件: 列表排序条件): eBay订单[] {
  if (!['creationDate', 'shipBy'].includes(条件.field)) return [...订单]
  return 排序列表(订单, 项 => 读取排序时刻(项[条件.field as eBay订单筛选条件['dateType']]), 条件.direction, 项 => `${项.sellerId}/${项.orderId}`)
}

export type 状态语气 = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface 状态说明 {
  text: string
  tone: 状态语气
  unknown?: boolean
}

const eBay站点展示码: Record<string, string> = {
  EBAY_AT: 'AT',
  EBAY_AU: 'AU',
  EBAY_BE: 'BE',
  EBAY_CA: 'CA',
  EBAY_CH: 'CH',
  EBAY_DE: 'DE',
  EBAY_ES: 'ES',
  EBAY_FR: 'FR',
  EBAY_GB: 'GB',
  EBAY_HK: 'HK',
  EBAY_IE: 'IE',
  EBAY_IT: 'IT',
  EBAY_MOTORS_US: 'US',
  EBAY_MY: 'MY',
  EBAY_NL: 'NL',
  EBAY_PH: 'PH',
  EBAY_PL: 'PL',
  EBAY_SG: 'SG',
  EBAY_US: 'US',
}

const 状态字典: Record<string, Record<string, 状态说明>> = {
  fulfillment: {
    NOT_STARTED: { text: '未开始履约', tone: 'neutral' },
    IN_PROGRESS: { text: '部分履约中', tone: 'info' },
    FULFILLED: { text: '已履约', tone: 'success' },
  },
  payment: {
    FAILED: { text: '付款失败', tone: 'danger' },
    PENDING: { text: '付款处理中', tone: 'warning' },
    PAID: { text: '已付款', tone: 'success' },
    PARTIALLY_REFUNDED: { text: '部分退款', tone: 'warning' },
    FULLY_REFUNDED: { text: '全额退款', tone: 'neutral' },
  },
  cancel: {
    NONE_REQUESTED: { text: '无取消申请', tone: 'neutral' },
    IN_PROGRESS: { text: '取消处理中', tone: 'warning' },
    CANCELED: { text: '已取消', tone: 'neutral' },
  },
  sync: {
    已同步: { text: '更新正常', tone: 'success' },
    同步中: { text: '更新中', tone: 'info' },
    同步失败: { text: '更新失败', tone: 'danger' },
    待同步: { text: '待更新', tone: 'warning' },
  },
  oms: {
    待审核: { text: '待审核', tone: 'warning' },
    待推单: { text: '待推单', tone: 'info' },
    待发货: { text: '待发货', tone: 'info' },
    已发货: { text: '已发货', tone: 'success' },
    异常: { text: '异常', tone: 'danger' },
    不发货: { text: '不发货', tone: 'neutral' },
  },
}

export function 获取状态说明(维度: 'fulfillment' | 'payment' | 'cancel' | 'sync' | 'oms', 原值?: string): 状态说明 {
  if (!原值) return { text: '—', tone: 'neutral' }
  return 状态字典[维度]?.[原值] ?? { text: 原值, tone: 'warning', unknown: true }
}

export function 格式化金额(金额值: 金额): string {
  const 数值 = Number(金额值.value)
  if (!Number.isFinite(数值)) return `${金额值.currency} ${金额值.value}`
  return `${金额值.currency} ${数值.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function 计算商品单价(行金额: 金额, 数量: number): 金额 {
  if (!Number.isInteger(数量) || 数量 <= 0) return 行金额

  const 匹配结果 = 行金额.value.match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
  if (!匹配结果) return 行金额

  const [, 符号, 整数部分, 小数部分 = ''] = 匹配结果
  const 精度 = Math.max(8, 小数部分.length)
  const 原始整数 = BigInt(`${整数部分}${小数部分}`)
  const 放大后整数 = 原始整数 * 10n ** BigInt(精度 - 小数部分.length)
  const 除数 = BigInt(数量)
  let 商 = 放大后整数 / 除数
  const 余数 = 放大后整数 % 除数
  if (余数 * 2n >= 除数) 商 += 1n

  const 数字串 = 商.toString().padStart(精度 + 1, '0')
  const 整数结果 = 数字串.slice(0, -精度)
  const 小数结果 = 数字串.slice(-精度).replace(/0+$/, '').padEnd(2, '0')
  const 是否负数 = 符号 === '-' && 商 !== 0n
  return {
    currency: 行金额.currency,
    value: `${是否负数 ? '-' : ''}${整数结果}.${小数结果}`,
  }
}

export function 金额非零(金额值?: 金额): boolean {
  if (!金额值) return false
  return !/^[+-]?0+(?:\.0+)?$/.test(金额值.value.trim())
}

export function 格式化eBay站点(平台原值: string): string {
  return eBay站点展示码[平台原值] ?? 平台原值
}

export function 格式化列表时间(平台时间?: string): string {
  if (!平台时间) return '—'
  const 匹配结果 = 平台时间.match(/^\d{4}-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?(?:\s+(.+))?$/)
  if (!匹配结果) return 平台时间
  const [, 月, 日, 时分, 时区] = 匹配结果
  return 月 + '-' + 日 + ' ' + 时分 + (时区 ? ' ' + 时区 : '')
}

export function 订单商品数量(订单: eBay订单): number {
  return 订单.items.reduce((总数, 商品) => 总数 + 商品.quantity, 0)
}

export function 筛选eBay订单(订单列表: eBay订单[], 条件: eBay订单筛选条件, 时区模式: eBay时区模式 = 'site'): eBay订单[] {
  if (校验eBay订单筛选(条件)) return []
  const 搜索字段 = 条件.searchType ?? 'platformOrderNo'
  const 字段配置 = eBay搜索字段.find(项 => 项.value === 搜索字段)!
  const 搜索 = (值: string | undefined | string[]) => 命中字段搜索(值, 条件.keyword, 条件.searchMatch ?? 'contains', 字段配置.kind)
  return 订单列表.filter((订单) => {
    if (!命中多选(条件.store, 订单.store)) return false
    if (条件.marketplace.length && !订单.purchaseMarketplaces.some(站点 => 命中多选(条件.marketplace, 站点))) return false
    if (!命中多选(条件.fulfillmentStatus, 订单.fulfillmentStatus)) return false
    if (条件.dateRange?.length) {
      const 查询墙钟 = eBay查询墙钟(条件.dateType === 'shipBy' ? 订单.shipBy : 订单.creationDate, 时区模式, 订单.purchaseMarketplaces)
      // 对比转换后的当地墙钟；公共校验仅处理日历及秒边界，不替代站点 IANA 时区。
      if (!命中时间范围(查询墙钟, 条件.dateRange, true)) return false
    }
    if (!命中多选(条件.paymentStatus, 订单.paymentStatus)) return false
    if (!命中多选(条件.cancelStatus, 订单.cancelStatus)) return false
    if (!命中多选(条件.omsStatus, 订单.oms.processingStatus)) return false
    if (!命中多选(条件.syncStatus, 订单.sync.status)) return false
    if (条件.keyword.trim() && ['platformSku', 'systemSku', 'itemId', 'lineItemId', 'title'].includes(搜索字段)) {
      if (!订单.items.some(商品 => 搜索(商品[搜索字段 as keyof typeof 商品] as string | undefined))) return false
    } else {
      const 值 = 搜索字段 === 'platformOrderNo' ? 订单.orderId
        : 搜索字段 === 'systemOrderNo' || 搜索字段 === 'fulfillmentNo' || 搜索字段 === 'confirmationNo' ? 订单.oms[搜索字段]
        : 搜索字段 === 'fulfillmentId' || 搜索字段 === 'trackingNumber' ? 订单.fulfillments.map(履约 => 履约[搜索字段]).filter((项): 项 is string => Boolean(项))
        : 订单[搜索字段 as keyof eBay订单] as string | undefined
      if (!搜索(值)) return false
    }
    return true
  })
}
