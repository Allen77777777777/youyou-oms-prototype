import { 命中字段搜索, 命中时间范围, 校验字段搜索, 校验时间范围 } from '@/组件/筛选/筛选工具'
import type { BuyerFeedbackRecord, ReviewActionResult, ReviewComment, ReviewRecord } from './类型'

export interface AwaitingReviewLine {
  id: string
  orderLineItemId: string
  listingId: string
  title: string
  sku: string
  platformSku: string
  quantity: number
  association: 'confirmed' | 'unknown'
  /** 只读展示投影，仅此交易行存在已确认的 eBay 自动评价。 */
  automatedOnly?: boolean
}
export interface AwaitingReviewOrder {
  id: string
  /** 仅共享 OMS 订单提供可验证的详情身份，独立样例不冒充共享订单。 */
  omsOrderId?: string
  omsOrderNo: string
  shopId: string
  shopName: string
  buyerId: string
  orderNo: string
  platform: string
  processingStatus: string
  shippedAt: string
  /** 当前有效履约准确关联的仓库执行状态；缺失时为空，不由 OMS 处理状态推导。 */
  outboundStatuses: string[]
  trackingNumbers: string[]
  /** 指该交易历史收到评价的覆盖，不是最近一次接口是否成功。 */
  coverage: 'complete' | 'incomplete' | 'unknown'
  association: 'confirmed' | 'unknown'
  lines: AwaitingReviewLine[]
  notes: ReviewComment[]
}
export type AwaitingSellerFeedbackState = 'sent' | 'not_sent' | 'partial' | 'unknown'
export interface AwaitingReviewRow extends AwaitingReviewOrder {
  status: 'unreviewed' | 'check'
  missingLines: AwaitingReviewLine[]
  reviewedLineCount: number
  unreviewedLineCount: number
  totalLineCount: number
  automatedOnly: boolean
  sellerFeedbackState: AwaitingSellerFeedbackState
  sellerFeedbackLabel: string
  blockedReason?: string
}
export interface AwaitingReviewFilters {
  shopIds: string[]
  status: 'unreviewed' | 'check' | 'all'
  automated: 'all' | 'only' | 'none'
  outboundStatuses: string[]
  sellerFeedback: 'all' | AwaitingSellerFeedbackState
  dateRange: [string, string] | []
  minDays: string
  maxDays: string
  field: 'orderNo' | 'buyerId' | 'sku' | 'platformSku' | 'title'
  mode: 'contains' | 'exact'
  query: string
}

/** 原型与虚构发货快照统一采用固定评审基准；生产应传入当前北京时间。 */
export const AWAITING_REVIEW_NOW = '2026-10-29T12:00:00+08:00'
/** 物流查询尚未对接，页面及导出始终使用占位，不以出库或跟踪号推导轨迹。 */
export const AWAITING_LOGISTICS_PLACEHOLDER = '待接入'
const isPresent = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const lineKey = (shopId: string, lineId: string) => JSON.stringify([shopId, lineId])
function timestamp(value: string): number {
  const normalized = value.replace(' UTC+8', '+08:00').replace(' ', 'T')
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? Date.parse(normalized) : NaN
}
function beijingDay(value: string): string {
  const time = timestamp(value)
  return Number.isFinite(time) ? new Date(time + 8 * 3_600_000).toISOString().slice(0, 10) : ''
}
export function getAwaitingShippedDays(order: Pick<AwaitingReviewOrder, 'shippedAt'>, now = AWAITING_REVIEW_NOW): number | undefined {
  const shipped = timestamp(order.shippedAt), current = timestamp(now)
  if (!Number.isFinite(shipped) || !Number.isFinite(current) || shipped > current) return undefined
  return Math.round((Date.parse(`${beijingDay(now)}T00:00:00Z`) - Date.parse(`${beijingDay(order.shippedAt)}T00:00:00Z`)) / 86_400_000)
}

export function createAwaitingReviewFilters(): AwaitingReviewFilters {
  return { shopIds: [], status: 'unreviewed', automated: 'all', outboundStatuses: [], sellerFeedback: 'all', dateRange: ['2026-09-30', '2026-10-29'], minDays: '', maxDays: '', field: 'orderNo', mode: 'contains', query: '' }
}

function sellerFeedback(order: AwaitingReviewOrder, lines: AwaitingReviewLine[], records: BuyerFeedbackRecord[]): { sellerFeedbackState: AwaitingSellerFeedbackState; sellerFeedbackLabel: string } {
  const statuses = lines.map(line => {
    const matches = records.filter(record => record.shopId === order.shopId && record.orderLineItemId === line.orderLineItemId)
    if (line.association !== 'confirmed' || !isPresent(line.orderLineItemId) || matches.length !== 1 || matches[0]!.buyerId !== order.buyerId) return 'unknown'
    return matches[0]!.status === 'sent' ? 'sent' : 'not_sent'
  })
  const state: AwaitingSellerFeedbackState = !statuses.length || statuses.includes('unknown') ? 'unknown' : statuses.every(status => status === 'sent') ? 'sent' : statuses.every(status => status === 'not_sent') ? 'not_sent' : 'partial'
  return { sellerFeedbackState: state, sellerFeedbackLabel: { sent: '已给好评', not_sent: '未给好评', partial: '部分已给好评', unknown: '待核对' }[state] }
}

/** 买家曾经主动评价即排除；有效评价统计的状态集合不能用于判定“从未评价”。 */
export function projectAwaitingReviewOrders(orders: AwaitingReviewOrder[], reviews: ReviewRecord[], buyerFeedback: BuyerFeedbackRecord[], now = AWAITING_REVIEW_NOW): AwaitingReviewRow[] {
  const eligible = orders.filter(order => order.platform === 'eBay' && order.processingStatus === '已发货')
  const rowIds = new Map<string, number>(), lineOwners = new Map<string, number>()
  for (const order of eligible) {
    rowIds.set(order.id, (rowIds.get(order.id) ?? 0) + 1)
    for (const line of order.lines) if (isPresent(line.orderLineItemId)) {
      const key = lineKey(order.shopId, line.orderLineItemId)
      lineOwners.set(key, (lineOwners.get(key) ?? 0) + 1)
    }
  }
  const result: AwaitingReviewRow[] = []
  for (const order of eligible) {
    const reasons = new Set<string>()
    if (![order.id, order.shopId, order.buyerId, order.orderNo].every(isPresent) || rowIds.get(order.id) !== 1) reasons.add('订单身份缺失或重复')
    if (order.association !== 'confirmed') reasons.add('订单与评价交易关联尚未确认')
    if (order.coverage !== 'complete') reasons.add(order.coverage === 'incomplete' ? '历史评价采集尚未完整完成' : '历史评价覆盖尚未核实')
    if (getAwaitingShippedDays(order, now) === undefined) reasons.add('发货时间缺失、无明确时区或晚于当前时间')
    if (!order.lines.length) reasons.add('订单商品行缺失')
    if (order.lines.some((line, index) => order.lines.findIndex(item => item.id === line.id) !== index)) reasons.add('商品行标识重复')
    let reviewedLineCount = 0, automatedCount = 0
    const missingLines: AwaitingReviewLine[] = []
    for (const line of order.lines) {
      let uncertain = false
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) { reasons.add('商品数量无效'); uncertain = true }
      if (line.association !== 'confirmed' || ![line.id, line.orderLineItemId, line.listingId].every(isPresent)) {
        reasons.add('商品与 Feedback 交易行映射尚未确认'); uncertain = true
      }
      if (isPresent(line.orderLineItemId) && lineOwners.get(lineKey(order.shopId, line.orderLineItemId)) !== 1) {
        reasons.add('同店铺交易行关联不唯一'); uncertain = true
      }
      const matches = isPresent(line.orderLineItemId) ? reviews.filter(review => review.shopId === order.shopId && review.orderLineItemId === line.orderLineItemId) : []
      if (matches.some(review => review.listingId !== line.listingId)) { reasons.add('评价商品与订单商品身份不一致'); uncertain = true }
      if (matches.some(review => review.automated !== true && review.automated !== false)) { reasons.add('评价来源尚未核实'); uncertain = true }
      if (matches.some(review => review.automated === false && review.buyerId !== order.buyerId)) { reasons.add('评价买家与订单买家不一致'); uncertain = true }
      const ids = matches.map(review => review.id)
      if (ids.some((id, index) => ids.indexOf(id) !== index)) { reasons.add('平台评价标识重复，需核查来源'); uncertain = true }
      if (!uncertain && matches.some(review => review.automated === false && review.buyerId === order.buyerId)) {
        reviewedLineCount++; continue
      }
      const automatedOnly = !uncertain && matches.some(review => review.automated === true)
      missingLines.push({ ...line, automatedOnly })
      if (automatedOnly) automatedCount++
    }
    // 已确认全部曾有主动评价时无需等待，也不因历史隐藏或撤回重新进入。
    if (order.lines.length && !missingLines.length) continue
    const status = reasons.size ? 'check' : 'unreviewed'
    result.push({ ...order, status, missingLines, reviewedLineCount, unreviewedLineCount: missingLines.length, totalLineCount: order.lines.length, automatedOnly: automatedCount > 0,
      ...sellerFeedback(order, missingLines, buyerFeedback), blockedReason: status === 'check' ? [...reasons].join('；') : undefined })
  }
  return result
}

export function validateAwaitingReviewFilters(filters: AwaitingReviewFilters): string | undefined {
  const common = 校验时间范围(filters.dateRange) || 校验字段搜索(filters.query, filters.mode, filters.field === 'title' ? 'text' : 'identifier')
  if (common) return common
  if (![filters.minDays, filters.maxDays].every(value => value === '' || /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))) return '发货天数请输入大于或等于0的整数'
  if (filters.minDays !== '' && filters.maxDays !== '' && Number(filters.minDays) > Number(filters.maxDays)) return '最小发货天数不能大于最大天数'
  return undefined
}

export function filterAwaitingReviewOrders(rows: AwaitingReviewRow[], filters: AwaitingReviewFilters, now = AWAITING_REVIEW_NOW): AwaitingReviewRow[] {
  if (validateAwaitingReviewFilters(filters)) return []
  return rows.map(row => {
    if (!['sku', 'platformSku', 'title'].includes(filters.field) || !filters.query.trim()) return row
    const field = filters.field as 'sku' | 'platformSku' | 'title'
    return { ...row, missingLines: row.missingLines.filter(line => 命中字段搜索(line[field], filters.query, filters.mode, field === 'title' ? 'text' : 'identifier')) }
  }).filter(row => {
    if (filters.status !== 'all' && row.status !== filters.status || filters.shopIds.length && !filters.shopIds.includes(row.shopId)) return false
    if (filters.automated === 'only' && !row.automatedOnly || filters.automated === 'none' && row.automatedOnly) return false
    if (filters.outboundStatuses.length && !row.outboundStatuses.some(status => filters.outboundStatuses.includes(status))) return false
    if (filters.sellerFeedback !== 'all' && filters.sellerFeedback !== row.sellerFeedbackState) return false
    if (filters.dateRange.length && !命中时间范围(row.shippedAt.replace(' UTC+8', '+08:00').replace(' ', 'T'), filters.dateRange)) return false
    const days = getAwaitingShippedDays(row, now)
    if (filters.minDays !== '' && (days === undefined || days < Number(filters.minDays))) return false
    if (filters.maxDays !== '' && (days === undefined || days > Number(filters.maxDays))) return false
    if (!filters.query.trim()) return true
    const values = filters.field === 'orderNo' ? [row.orderNo] : filters.field === 'buyerId' ? [row.buyerId] : row.missingLines.map(line => line[filters.field as 'sku' | 'platformSku' | 'title'])
    return values.some(value => 命中字段搜索(value, filters.query, filters.mode, filters.field === 'title' ? 'text' : 'identifier'))
  }).sort((a, b) => (Number.isFinite(timestamp(b.shippedAt)) ? timestamp(b.shippedAt) : 0) - (Number.isFinite(timestamp(a.shippedAt)) ? timestamp(a.shippedAt) : 0) || a.id.localeCompare(b.id))
}

export function addAwaitingReviewNote(order: AwaitingReviewOrder, text: string, by = '客服01', at = new Date().toISOString()): ReviewActionResult {
  const content = text.trim()
  if (!content) return { ok: false, message: '请输入备注内容' }
  if (Array.from(content).length > 1000) return { ok: false, message: '备注最多1000个字符' }
  order.notes.push({ text: content, by, at })
  return { ok: true, message: '备注已保存' }
}

const csvCell = (value: string | number) => `"${String(value).replace(/^[\s]*[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`
export function exportAwaitingReviewCsv(rows: AwaitingReviewRow[], now = AWAITING_REVIEW_NOW): string {
  const values: (string | number)[][] = [['店铺', '买家ID', '平台订单号', 'OMS订单号', '发货时间', '发货天数', '出库状态', '物流轨迹状态', '评价跟踪状态', '待核对原因', '平台自动评价', '是否已给买家好评', '商品名称', '系统SKU', '平台SKU', 'Feedback交易行ID', '商品数量', '最新备注', '数据性质']]
  for (const row of rows) {
    // 缺少商品行的核对订单仍导出订单事实与原因，商品单元格留空，不补造商品。
    const lines: (AwaitingReviewLine | undefined)[] = row.missingLines.length ? row.missingLines : row.status === 'check' ? [undefined] : []
    for (const line of lines) values.push([row.shopName, row.buyerId, row.orderNo, row.omsOrderNo, row.shippedAt, getAwaitingShippedDays(row, now) ?? '', row.outboundStatuses.join('、'), AWAITING_LOGISTICS_PLACEHOLDER, row.status === 'check' ? '待核对' : '未收到买家评价', row.blockedReason ?? '', line?.automatedOnly ? '仅平台自动评价' : row.status === 'check' ? '待核对' : '暂无评价', row.sellerFeedbackLabel, line?.title ?? '', line?.sku ?? '', line?.platformSku ?? '', line?.orderLineItemId ?? '', line?.quantity ?? '', row.notes.slice(-1)[0]?.text ?? '', '虚构原型评审数据'])
  }
  return '\uFEFF' + values.map(row => row.map(csvCell).join(',')).join('\r\n')
}
