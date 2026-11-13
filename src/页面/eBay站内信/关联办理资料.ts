import type { RouteLocationRaw } from 'vue-router'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { mailSession } from './会话'
import { getMessageOrders } from './消息订单'
import type { ContextRecord, Conversation, RelatedOrder } from './类型'
import { tickets, isTicketClosed, sourceLabels, type Ticket, type TicketSource } from '../工单管理/会话'
import { ticketViewTimeToUtc } from '../工单管理/时间存储'
import { returnSession } from '../eBay退换货申请/数据'
import { returnPlatformPresentation, type ReturnRecord } from '../eBay退换货申请/模型'
import { afterSaleRecords, afterSaleFacts, canViewAfterSale, type AfterSaleRecord } from '../售后单管理/会话'
import { 共享订单 } from '../订单处理/演示会话'
import { reviewSession } from '../eBay评价/会话'
import { cancellationSession } from '../eBay取消订单申请/会话'
import { disputeRecords } from '../eBay纠纷/模型'

export interface RelatedTicketSummary {
  id: string
  title: string
  owner: string
  status: Ticket['status']
  sourceLabel: string
  sourceId: string
  timeLabel?: '下次跟进' | '完成期限'
  /** 已确认的工单北京视图转换为 UTC，再由展示层统一输出北京时间。 */
  time?: string
  timeIssue?: string
  location: RouteLocationRaw
}
export interface RelatedAfterSaleSummary {
  no: string
  kind: AfterSaleRecord['kind']
  approval: AfterSaleRecord['approval']
  executionResult: string
  quantity: number
  amount?: AfterSaleRecord['amount']
  amountLabel: '报价金额' | '拟退金额'
  actualAmount?: AfterSaleRecord['actualAmount']
  approvedReturnQty?: number
  receivedQty?: number
  manualOrderNo?: string
  manualStatus?: string
  manualIssue?: string
  packages: Array<{ no: string; status: string; shippedQuantity: number; trackingNumber?: string }>
  location: RouteLocationRaw
  manualLocation?: RouteLocationRaw
}
export interface RelatedReturnProgress {
  returnId: string
  title: string
  reason: string
  quantity: number | null
  platformState: string
  platformStatus: string
  platformReadNote: string
  updatedAt: string
  location: RouteLocationRaw
  internalRecords: RelatedAfterSaleSummary[]
}

function only<T>(rows: readonly T[]): T | undefined { return rows.length === 1 ? rows[0] : undefined }
function sourceMatchesOrder(source: { shopId: string; orderNo: string; buyerId: string }, order: RelatedOrder): boolean {
  return Boolean(source.orderNo.trim() && source.shopId === order.shopId && source.orderNo === order.orderNo && source.buyerId === order.buyerId)
}
function isMessageSource(source: TicketSource, conversation: Conversation): boolean {
  if (source.kind !== 'message' || source.shopId !== conversation.shopId || source.contextId !== conversation.id || conversation.source !== 'buyer') return false
  const message = only(conversation.messages.filter(row => row.id === source.id))
  return Boolean(message && (message.kind === 'incoming' || message.kind === 'outgoing' && message.delivery === 'success'))
}

/** 从真实来源对象取订单身份，不解析说明文字，不把同买家的所有任务归入本单。 */
function sourceBelongsToOrder(source: TicketSource, order: RelatedOrder): boolean {
  if (!source.id || source.shopId !== order.shopId) return false
  switch (source.kind) {
    case 'message': {
      const conversation = only(mailSession.conversations.filter(row => row.shopId === source.shopId && row.id === source.contextId))
      if (!conversation || !isMessageSource(source, conversation)) return false
      const message = only(conversation.messages.filter(row => row.id === source.id))
      const associatedOrder = only(getMessageOrders(conversation, message, mailSession.orders))
      return Boolean(associatedOrder && sourceMatchesOrder(associatedOrder, order))
    }
    case 'return': {
      const row = only(returnSession.records.filter(row => row.shopId === source.shopId && row.id === source.id))
      return Boolean(row && sourceMatchesOrder(row, order))
    }
    case 'review': {
      const row = only(reviewSession.reviews.filter(row => row.shopId === source.shopId && row.id === source.id))
      return Boolean(row && sourceMatchesOrder(row, order))
    }
    case 'cancel': {
      const row = only(cancellationSession.records.filter(row => row.shopId === source.shopId && row.cancelId === source.id))
      return Boolean(row && sourceMatchesOrder({ shopId: row.shopId, orderNo: row.orderId, buyerId: row.buyer }, order))
    }
    case 'dispute': {
      // 工单来源约定以空 contextId 表示旧 Case。
      const kind = source.contextId || 'EBAY_CASE'
      const row = only(disputeRecords.value.filter(row => row.shopId === source.shopId && row.id === source.id && row.kind === kind))
      return Boolean(row && sourceMatchesOrder({ shopId: row.shopId, orderNo: row.orderId, buyerId: row.buyer }, order))
    }
  }
}
function ticketSummary(ticket: Ticket): RelatedTicketSummary {
  const value: RelatedTicketSummary = {
    id: ticket.id, title: ticket.title, owner: ticket.owner, status: ticket.status,
    sourceLabel: ticket.source ? sourceLabels[ticket.source.kind] : '', sourceId: ticket.source?.id || '',
    location: { name: 'oms-tickets', query: { ticketId: ticket.id } },
  }
  if (!isTicketClosed(ticket) && (ticket.nextAt || ticket.dueAt)) {
    value.timeLabel = ticket.nextAt ? '下次跟进' : '完成期限'
    try { value.time = ticketViewTimeToUtc(ticket.nextAt || ticket.dueAt) }
    catch { value.timeIssue = '时间待核实' }
  }
  return value
}

/** 历史订单只读浏览时传 undefined 会话，即不带入当前会话工单。 */
export function getRelatedTicketGroups(conversation?: Conversation, order?: RelatedOrder): { conversation: RelatedTicketSummary[]; order: RelatedTicketSummary[] } {
  const result: { conversation: RelatedTicketSummary[]; order: RelatedTicketSummary[] } = { conversation: [], order: [] }
  const uniqueTickets = tickets.value.filter(ticket => tickets.value.filter(row => row.id === ticket.id).length === 1)
  for (const ticket of uniqueTickets) {
    const source = ticket.source
    if (!source) continue
    if (conversation && isMessageSource(source, conversation)) result.conversation.push(ticketSummary(ticket))
    else if (order && sourceBelongsToOrder(source, order)) result.order.push(ticketSummary(ticket))
  }
  // 待处理在前，其余按稳定编号；不因不可信时间重排为紧急。
  const compare = (a: RelatedTicketSummary, b: RelatedTicketSummary) => Number(['已完成', '已放弃'].includes(a.status)) - Number(['已完成', '已放弃'].includes(b.status)) || a.id.localeCompare(b.id)
  result.conversation.sort(compare)
  result.order.sort(compare)
  return result
}

function afterSaleSummary(record: AfterSaleRecord): RelatedAfterSaleSummary {
  const facts = afterSaleFacts(record)
  const summary: RelatedAfterSaleSummary = {
    no: record.no, kind: record.kind, approval: record.approval,
    executionResult: record.executionResult || '执行结果待核实', quantity: record.items.reduce((n, item) => n + item.quantity, 0),
    amount: record.amount, amountLabel: record.actionLabel?.includes('报价') ? '报价金额' : '拟退金额', actualAmount: record.actualAmount,
    approvedReturnQty: facts.approvedReturnQty, receivedQty: facts.receivedQty, packages: [],
    location: { name: 'oms-ebay-after-sale-orders', query: { documentNo: record.no } },
  }
  if (record.kind !== '重发') return summary
  summary.manualOrderNo = record.manualOrderNo
  if (!record.manualOrderNo) return summary
  const order = only(共享订单.value.filter(row => row.systemOrderNo === record.manualOrderNo))
  if (!record.systemOrderNo?.trim() || !order || order.platformCode !== '手工' || order.manualOrder?.afterSaleNo !== record.no
    || order.manualOrder.scenario !== '售后补寄' || order.manualOrder.originalOrderNo !== record.systemOrderNo) {
    summary.manualIssue = '重发订单关联待核实'
    return summary
  }
  summary.manualStatus = order.processingStatus || '处理状态待核实'
  summary.manualLocation = { name: 'oms-all-order-detail', params: { systemOrderNo: order.systemOrderNo } }
  summary.packages = order.fulfillmentOrders.filter(row => row.isActive).map(row => ({ no: row.fulfillmentOrderNo,
    status: row.status, shippedQuantity: row.shippedQuantity, trackingNumber: row.trackingNumber }))
  return summary
}

/** 只读共享 Return 与内部售后单。查阅不初始化、不刷新、不提交或推进任何原单。 */
export function getOrderReturnProgress(order?: RelatedOrder): RelatedReturnProgress[] {
  if (!order?.shopId || !order.orderNo?.trim() || !order.buyerId || order.afterSales.state !== 'ready') return []
  const matches = returnSession.records.filter(row => sourceMatchesOrder(row, order))
  return matches.filter(row => returnSession.records.filter(other => other.shopId === row.shopId && other.id === row.id).length === 1)
    .map((row: ReturnRecord): RelatedReturnProgress => ({
      returnId: row.id,
      // 与原申请一致，不从历史申请缓存恢复平台已经隐藏的商品或申请内容。
      title: row.detail?.contentOnHold || row.detail?.itemOnHold === true ? '平台已隐藏商品内容' : row.title,
      reason: row.detail?.contentOnHold || row.detail?.itemOnHold === true ? '' : row.reason,
      quantity: row.quantity,
      ...returnPlatformPresentation(row), updatedAt: row.lastSyncedAt,
      location: { name: 'oms-ebay-return-detail', params: { shopId: row.shopId, returnId: row.id } },
      internalRecords: afterSaleRecords.value.filter(record => record.shopId === row.shopId && record.returnId === row.id
        && record.orderNo === order.orderNo && canViewAfterSale(record)
        && afterSaleRecords.value.filter(other => other.no === record.no).length === 1)
        .sort((a, b) => (读取排序时刻(a.createdAt) ?? 0) - (读取排序时刻(b.createdAt) ?? 0) || a.no.localeCompare(b.no))
        .map(afterSaleSummary),
    })).sort((a, b) => (读取排序时刻(b.updatedAt) ?? 0) - (读取排序时刻(a.updatedAt) ?? 0) || a.returnId.localeCompare(b.returnId))
}

/** 共享申请只替换显式绑定且可靠核实的同笔摘要，其余既有资料完整保留。 */
export function getOrderAfterSalesContext(order?: RelatedOrder): { returns: RelatedReturnProgress[]; records: ContextRecord[]; count: number | null } {
  if (!order || order.afterSales.state !== 'ready') return { returns: [], records: [], count: null }
  const returns = getOrderReturnProgress(order)
  const returnIds = new Set(returns.map(row => row.returnId))
  const records = order.afterSales.records.filter(record => !record.returnId || !returnIds.has(record.returnId))
  return { returns, records, count: returns.length + records.length }
}
