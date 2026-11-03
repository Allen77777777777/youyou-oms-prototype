/** 仅接受来源提供的 HTTPS 平台页面，不根据 Return/Case 编号拼网址。 */
export function ebayActionUrl(value?: string | null): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && /(^|\.)ebay\.(com|co\.uk|de|fr|it|es|com\.au|ca|at|be|ie|nl|ch|pl|com\.hk|com\.sg|com\.my|ph)$/.test(url.hostname) ? url.href : ''
  } catch { return '' }
}

export function safeMediaUrl(value?: string | null): string {
  if (!value) return ''
  if (/^data:(image\/(png|jpeg|gif|bmp)|application\/pdf);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
}

export const activityLabels: Record<string, string> = {
  SELLER_APPROVE_REQUEST: '回应退货申请', SELLER_DECLINE_REQUEST: '拒绝退货', SELLER_OFFER_RETURNS: '提供退货方案',
  SELLER_OFFER_PARTIAL_REFUND: '提出部分退款', SELLER_PROVIDE_RMA: '提供退货授权', SELLER_PROVIDE_LABEL: '提供退货面单',
  SELLER_ISSUE_REFUND: '退款', SELLER_RETRY_REFUND: '退款重试', SELLER_MARK_AS_RECEIVED: '确认收到退货',
  SELLER_SEND_MESSAGE: '发送消息', SELLER_ESCALATE: '请求 eBay 介入', BUYER_ACCEPTS_PARTIAL_REFUND: '决定是否接受部分退款',
  BUYER_ACCEPTS_NON_PAYPAL_PARTIAL_REFUND: '决定是否接受部分退款', BUYER_MARK_RETURN_SHIPPED: '寄回商品',
  BUYER_PROVIDE_TRACKING_INFO: '提供退回物流', BUYER_PRINT_SHIPPING_LABEL: '打印退货面单', BUYER_SEND_MESSAGE: '发送消息',
  BUYER_CLOSE_RETURN: '买家关闭申请', BUYER_DECLINE_PARTIAL_REFUND: '买家拒绝报价', NOTIFIED_DELIVERED: '退货送达',
  EBAY_RULE_AUTO_APPROVE: '平台自动批准', SYSTEM_INITIATED_REFUND: '平台发起退款', SYSTEM_CLOSE_RETURN: '平台关闭申请',
}
export const activityText = (value?: string | null) => value ? activityLabels[value] || value : '待办内容待核实'
export const feeLabels: Record<string, string> = { PURCHASE_PRICE: '商品价款', ORIGINAL_SHIPPING: '原发货运费', RETURN_SHIPPING: '退回运费', OTHER: '其他费用', TAX: '税费' }
export const refundStatusLabels: Record<string, string> = { NOT_STARTED: '尚未发起', SUCCESS: '退款成功', PENDING: '退款处理中', REQUESTED: '已请求退款', FAILED: '退款失败', UNKNOWN: '退款结果待核查' }

/** 用户输入的是站点墙钟。拒绝夏令时缺失/重复时刻，不借用浏览器时区。 */
export function siteWallTimeToISO(value: string, zone?: string): string | null {
  if (!zone || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const raw = Date.parse(value + ':00Z')
  if (!Number.isFinite(raw)) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const matches: string[] = []
    for (let minutes = -840; minutes <= 840; minutes += 15) {
      const date = new Date(raw + minutes * 60000), parts = formatter.formatToParts(date)
      const part = (type: string) => parts.find(item => item.type === type)?.value || ''
      if (`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}` === value) matches.push(date.toISOString())
    }
    return matches.length === 1 ? matches[0]! : null
  } catch { return null }
}
