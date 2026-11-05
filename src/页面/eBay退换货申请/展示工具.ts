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
export const feeLabels: Record<string, string> = { PURCHASE_PRICE: '商品价款', ORIGINAL_SHIPPING: '原发货运费', RETURN_SHIPPING: '退回运费', OTHER: '其他费用', TAX: '税费', ITEM_TAX: '商品税费', ITEM_IMPORT_TAX: '进口税费' }
export const refundStatusLabels: Record<string, string> = { NOT_STARTED: '尚未发起', SUCCESS: '退款成功', PENDING: '退款处理中', REQUESTED: '已请求退款', FAILED: '退款失败', UNKNOWN: '退款结果待核查' }
export const returnTypeText = (value?: string | null): string => value ? ({ MONEY_BACK: '退货 / 退款', EXCHANGE: '换货（历史类型）', REPLACEMENT: '补发（历史类型）' } as Record<string,string>)[value] || value : '—'
export function reasonTypeText(value?: string | null): string {
  if (!value?.trim()) return '未提供'
  const names: Record<string,string> = { CANCEL: '发货后取消', INSTORE: '门店退货', REMORSE: '买家改变主意', SNAD: '商品与描述不符', UNKNOWN: '原因大类未知' }
  return `${names[value] || '原因类型待核实'}（${value}）`
}
export const booleanText = (value: boolean | null | undefined): string => value === true ? '是' : value === false ? '否' : '未提供'

/** 申请商品只取该来源图片；本地原创示意图使用固定资源，不接受任意相对路径。 */
export function returnItemPictureUrl(value?: string | null): string {
  if (value && ['退货申请商品示意.svg', '/退货申请商品示意.svg', './退货申请商品示意.svg', `${import.meta.env.BASE_URL}退货申请商品示意.svg`].includes(value)) return value
  const safe = safeMediaUrl(value)
  return safe.startsWith('data:application/pdf') ? '' : safe
}

/** 仅查看明确的HTTPS地址或带格式声明的数据URI，不猜测labelData编码或文件类型。 */
export function returnLabelMedia(value?: string | null): { url: string; kind: 'image' | 'pdf' | 'source' } | null {
  if (!value) return null
  const clean = value.trim(), source = safeMediaUrl(clean)
  if (source) return { url: source, kind: source.startsWith('data:image/') ? 'image' : source.startsWith('data:application/pdf') ? 'pdf' : 'source' }
  return null
}

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

/** 退货办理表单固定按北京时间解释输入，不读取站点或浏览器时区。 */
export function beijingWallTimeToISO(value: string): string | null {
  return siteWallTimeToISO(value, 'Asia/Shanghai')
}
