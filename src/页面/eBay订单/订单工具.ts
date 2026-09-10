import type { eBay订单, eBay订单筛选条件, 金额 } from './类型'

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

export function 订单检索文本(订单: eBay订单): string {
  return [
    订单.orderId,
    订单.salesRecordReference,
    订单.store,
    订单.buyerUsername,
    订单.oms.systemOrderNo,
    ...订单.items.flatMap((商品) => [商品.lineItemId, 商品.title, 商品.platformSku, 商品.systemSku, 商品.itemId]),
    ...订单.fulfillments.flatMap((履约) => [履约.fulfillmentId, 履约.trackingNumber]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

export function 筛选eBay订单(订单列表: eBay订单[], 条件: eBay订单筛选条件): eBay订单[] {
  const 关键词 = 条件.keyword.trim().toLocaleLowerCase()
  return 订单列表.filter((订单) => {
    if (关键词 && !订单检索文本(订单).includes(关键词)) return false
    if (条件.store && 订单.store !== 条件.store) return false
    if (条件.marketplace && !订单.purchaseMarketplaces.includes(条件.marketplace)) return false
    if (条件.fulfillmentStatus && 订单.fulfillmentStatus !== 条件.fulfillmentStatus) return false
    if (条件.dateRange?.length === 2) {
      const 时间值 = 条件.dateType === 'shipBy' ? 订单.shipBy : 订单.creationDate
      const 日期值 = 时间值?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      if (!日期值 || 日期值 < 条件.dateRange[0] || 日期值 > 条件.dateRange[1]) return false
    }
    if (条件.paymentStatus && 订单.paymentStatus !== 条件.paymentStatus) return false
    if (条件.cancelStatus && 订单.cancelStatus !== 条件.cancelStatus) return false
    if (条件.omsStatus && 订单.oms.processingStatus !== 条件.omsStatus) return false
    if (条件.syncStatus && 订单.sync.status !== 条件.syncStatus) return false
    return true
  })
}
