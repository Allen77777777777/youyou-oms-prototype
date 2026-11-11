import { computed } from 'vue'
import { handlerNames } from '@/组件/客服处理人/处理人'
import { getConversationHandlerIds } from '../eBay站内信/会话处理人'
import { getReviewHandlerIds, getBuyerFeedbackHandlerIds } from '../eBay评价/评价处理人'
import { getCancelHandlerIds } from '../eBay取消订单申请/处理人'
import { getReturnHandlerIds } from '../eBay退换货申请/处理人'
import { getDisputeHandlerIds } from '../eBay纠纷/处理人'
import { ebayOrderSession } from '../eBay订单/会话'
import { 共享订单 } from '../订单处理/演示会话'
import { mailSession, findBusinessMessage } from '../eBay站内信/会话'
import { getMessageBodyText } from '../eBay站内信/邮箱模型'
import { reviewSession } from '../eBay评价/会话'
import { getReviewDisplay, isEffectiveReview, getBuyerFeedbackResult, getBuyerFeedbackBlockedReason } from '../eBay评价/模型'
import { reviewCommentLabels, reviewHandlingLabels } from '../eBay评价/数据'
import { getAwaitingReviewOrders } from '../eBay评价/未收到评价会话'
import { cancellationSession } from '../eBay取消订单申请/会话'
import { stateNames as cancelStates, statusNames as cancelStatuses } from '../eBay取消订单申请/模型'
import { returnSession } from '../eBay退换货申请/数据'
import { inReturnQueue, isReturnClosed, isEscalated, returnPlatformPresentation } from '../eBay退换货申请/模型'
import { disputeRecords } from '../eBay纠纷/模型'
import { tickets, isTicketClosed, type TicketSource } from '../工单管理/会话'
import { ticketViewTimeToUtc } from '../工单管理/时间存储'
import { afterSaleRecords, canViewAfterSale } from '../售后单管理/会话'
import { buildBuyerProfile, type BuyerIdentity, type BuyerRecord } from './模型'

const sourceKey = (kind: string, shopId: string, id: string) => JSON.stringify([kind, shopId, id])
const unique = <T>(rows: T[]) => rows.length === 1 ? rows[0] : undefined
const shortText = (value: string) => Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, 160).join('')
const ticketInstant = (value?: string) => { try { return value ? ticketViewTimeToUtc(value) : undefined } catch { return undefined } }
const handler = (ids: readonly string[]) => ({ label: '处理人' as const, value: handlerNames(ids) })

/** 工单来源需唯一定位原对象；无来源工单、通知、缺失或跨店错误不能归入买家。 */
export function resolveTicketBuyer(source?: TicketSource): { shopId: string; buyerId: string } | undefined {
  if (!source?.shopId || !source.id) return
  const { shopId, id, kind, contextId } = source
  let buyerId: string | undefined
  switch (kind) {
    case 'message': {
      const result = findBusinessMessage(shopId, contextId || '', id)
      if (result?.conversation.source === 'buyer') buyerId = result.conversation.buyerId
      break
    }
    case 'review': buyerId = unique(reviewSession.reviews.filter(row => row.shopId === shopId && row.id === id))?.buyerId; break
    case 'cancel': buyerId = unique(cancellationSession.records.filter(row => row.shopId === shopId && row.cancelId === id))?.buyer; break
    case 'return': buyerId = unique(returnSession.records.filter(row => row.shopId === shopId && row.id === id))?.buyerId; break
    case 'dispute': buyerId = unique(disputeRecords.value.filter(row => row.shopId === shopId && row.id === id && row.kind === (contextId || 'EBAY_CASE')))?.buyer; break
  }
  return buyerId?.trim() ? { shopId, buyerId } : undefined
}

/** 只复用既有明确的虚构身份映射。禁止因 buyerId 恰好同名而扩大可见店铺。 */
export function getBuyerIdentities(): BuyerIdentity[] {
  const identities: BuyerIdentity[] = []
  for (const conversation of mailSession.conversations) {
    const scope = conversation.buyerDataScope
    if (conversation.source !== 'buyer' || !scope?.buyerKey.trim()) continue
    identities.push({ shopId: conversation.shopId, buyerId: conversation.buyerId, buyerKey: scope.buyerKey, shopIds: [...scope.shopIds] })
    for (const order of mailSession.orders) {
      if (order.buyerKey !== scope.buyerKey) continue
      identities.push({ shopId: order.shopId, buyerId: order.buyerId, buyerKey: scope.buyerKey, shopIds: [...scope.shopIds] })
    }
  }
  return identities
}

/** 各模块仍拥有原始事实；本函数只读取，不初始化原单、不执行同步、不设置已读。 */
export function getBuyerRecords(): BuyerRecord[] {
  const rows: BuyerRecord[] = []
  const orders = new Map<string, BuyerRecord>()
  // 专业订单优先，同店同平台订单仅形成一行；OMS 的实际状态随后补入。
  for (const order of ebayOrderSession.value) {
    const key = sourceKey('order', order.sellerId, order.orderId)
    orders.set(key, { key, category: 'orders', kind: 'order', typeLabel: 'eBay订单', shopId: order.sellerId, shopName: order.store,
      buyerId: order.buyerUsername, number: order.orderId, summary: order.items.map(item => item.title).join('、'),
      status: `平台：${({ NOT_STARTED: '未开始履约', IN_PROGRESS: '部分履约', FULFILLED: '已履约' } as Record<string, string>)[order.fulfillmentStatus] || order.fulfillmentStatus}${order.oms.processingStatus ? ` · OMS：${order.oms.processingStatus}` : ''}`,
      occurredAt: order.creationDate, updatedAt: order.sync.lastSuccess, pending: false, amount: order.pricing.total,
      location: { name: 'oms-ebay-order-detail', params: { sellerId: order.sellerId, orderId: order.orderId } } })
  }
  for (const order of 共享订单.value) {
    if (order.platformCode !== 'eBay' || !order.buyerExternalId || !order.storeId || !order.platformOrderNo) continue
    const key = sourceKey('order', order.storeId, order.platformOrderId || order.platformOrderNo)
    const existing = orders.get(key) || [...orders.values()].find(row => row.shopId === order.storeId && row.number === order.platformOrderNo)
    if (existing) {
      if (existing.buyerId === order.buyerExternalId) existing.status = `${existing.status.split(' · OMS：')[0]}${order.processingStatus ? ` · OMS：${order.processingStatus}` : ''}`
      continue
    }
    orders.set(key, { key, category: 'orders', kind: 'order', typeLabel: 'eBay订单', shopId: order.storeId, shopName: order.storeName,
      buyerId: order.buyerExternalId, number: order.platformOrderNo, summary: order.items.map(item => item.systemItemName || item.platformItemTitle || item.platformSku || item.systemSku || '').filter(Boolean).join('、'),
      status: [order.platformOrderStatus ? `平台：${order.platformOrderStatus}` : '', order.processingStatus ? `OMS：${order.processingStatus}` : ''].filter(Boolean).join(' · ') || '状态待核实',
      occurredAt: order.orderedAt, updatedAt: order.lastSyncedAt, pending: false, amount: order.amount.orderAmount,
      location: { name: 'oms-all-order-detail', params: { systemOrderNo: order.systemOrderNo } } })
  }
  for (const order of getAwaitingReviewOrders()) {
    if (order.platform !== 'eBay') continue
    const key = sourceKey('order', order.shopId, order.orderNo)
    if ([...orders.values()].some(row => row.shopId === order.shopId && row.number === order.orderNo)) continue
    orders.set(key, { key, category: 'orders', kind: 'order', typeLabel: 'eBay订单', shopId: order.shopId, shopName: order.shopName, buyerId: order.buyerId,
      number: order.orderNo, summary: order.lines.map(line => line.title).join('、'), status: order.processingStatus || '状态待核实', pending: false,
      location: order.omsOrderId ? { name: 'oms-all-order-detail', params: { systemOrderNo: order.omsOrderId } } : null,
      relationLabel: order.omsOrderId ? undefined : '订单详情尚未关联' })
  }
  for (const order of mailSession.orders) {
    const key = sourceKey('order', order.shopId, order.orderNo)
    if ([...orders.values()].some(row => row.shopId === order.shopId && row.number === order.orderNo)) continue
    orders.set(key, { key, category: 'orders', kind: 'order', typeLabel: 'eBay订单', shopId: order.shopId, shopName: order.shopName || order.shopId,
      buyerId: order.buyerId, number: order.orderNo, summary: order.product.title, status: order.omsStatus, pending: false,
      amount: { value: order.amount, currency: order.currency }, location: null, relationLabel: '订单详情尚未关联' })
  }
  rows.push(...orders.values())
  for (const conversation of mailSession.conversations) {
    if (conversation.source !== 'buyer' || !conversation.buyerId) continue
    const latest = [...conversation.messages].reverse().find(message => message.kind !== 'note' && (message.kind !== 'outgoing' || message.delivery === 'success'))
    rows.push({ key: sourceKey('message', conversation.shopId, conversation.id), category: 'messages', kind: 'message', typeLabel: '站内信会话', shopId: conversation.shopId, shopName: conversation.shopName,
      buyerId: conversation.buyerId, number: conversation.id, summary: `${conversation.subject}${latest ? ` · ${shortText(getMessageBodyText(latest))}` : ''}`,
      status: ({ pending: '待处理', processed: '已处理', ignored: '已忽略' })[conversation.status], occurredAt: latest?.at, updatedAt: conversation.updatedAt,
      pending: conversation.status === 'pending', people: [handler(getConversationHandlerIds(conversation))],
      location: { name: 'oms-ebay-messages', query: { shopId: conversation.shopId, conversationId: conversation.id, ...(latest ? { messageId: latest.id } : {}) } } })
  }
  for (const row of cancellationSession.records) {
    rows.push({ key: sourceKey('cancel', row.shopId, row.cancelId), category: 'afterSales', kind: 'cancel', typeLabel: '取消订单申请', shopId: row.shopId, shopName: row.shop,
      buyerId: row.buyer, number: row.cancelId, summary: `${row.products.map(item => item.title).join('、')} · ${row.orderId}`,
      status: cancelStatuses[row.cancelStatus] || cancelStates[row.cancelState] || '阶段待核实', occurredAt: row.createdAt, updatedAt: row.lastSyncedAt,
      people: [handler(getCancelHandlerIds(row))],
      dueAt: row.cancelState === 'APPROVAL_PENDING' ? row.dueAt : undefined, pending: row.requestor === 'BUYER' && (row.cancelState === 'APPROVAL_PENDING' || ['submitted', 'unknown'].includes(row.submission)),
      location: { name: 'oms-ebay-cancellations', query: { shopId: row.shopId, cancelId: row.cancelId } } })
  }
  for (const row of returnSession.records) {
    const platform = returnPlatformPresentation(row)
    rows.push({ key: sourceKey('return', row.shopId, row.id), category: 'afterSales', kind: 'return', typeLabel: '退货退款申请', shopId: row.shopId, shopName: row.shopName,
      buyerId: row.buyerId, number: row.id, summary: `${row.title} · ${row.orderNo}`, status: `${platform.platformState} · ${platform.platformStatus}`,
      occurredAt: row.createdAt, updatedAt: row.lastSyncedAt, dueAt: inReturnQueue(row, 'response') ? row.deadline || undefined : undefined,
      pending: !isReturnClosed(row) && !isEscalated(row) && (inReturnQueue(row, 'response') || ['pending', 'unknown', 'failed'].includes(row.outcome)),
      people: [handler(getReturnHandlerIds(row))], relationLabel: row.caseId ? `已关联介入案件 ${row.caseId}` : undefined,
      location: { name: 'oms-ebay-return-detail', params: { shopId: row.shopId, returnId: row.id } } })
  }
  const disputeLabels = { INR_REQUEST: '未收到货请求', EBAY_CASE: 'eBay介入案件', PAYMENT_DISPUTE: '支付争议' }
  for (const row of disputeRecords.value) {
    const sellerDue = row.owner === '卖家' && !row.pending && (row.kind !== 'INR_REQUEST' || Boolean(row.inquiry?.primaryAction))
      && row.date && ['卖家处理期限', '卖家应答截止', '补证截止', '后续材料截止'].includes(row.date.label) ? row.date : undefined
    rows.push({ key: sourceKey(row.kind, row.shopId, row.id), category: 'afterSales', kind: row.kind, typeLabel: disputeLabels[row.kind], shopId: row.shopId, shopName: row.shopName,
      buyerId: row.buyer, number: row.id, summary: `${row.title} · ${row.orderId}`, status: row.statusText, occurredAt: row.createdAt, updatedAt: row.syncedAt,
      dueAt: sellerDue?.value, dueLabel: sellerDue?.label, pending: row.owner === '卖家' || Boolean(row.pending),
      people: [{ label: '当前应办方', value: row.owner }, handler(getDisputeHandlerIds(row))],
      relationLabel: row.links.length ? row.links.map(link => `关联${link.kind === 'RETURN' ? '退货申请' : disputeLabels[link.kind]} ${link.id}`).join('；') : undefined,
      location: { name: 'oms-ebay-dispute-detail', params: { shopId: row.shopId, kind: row.kind, recordId: row.id } } })
  }
  for (const row of afterSaleRecords.value) {
    if (!canViewAfterSale(row)) continue
    const source = unique(returnSession.records.filter(item => item.shopId === row.shopId && item.id === row.returnId))
    if (!source) continue
    rows.push({ key: sourceKey('afterSale', row.shopId, row.no), category: 'afterSales', kind: 'afterSale', typeLabel: `售后单 · ${row.kind}`, shopId: row.shopId, shopName: row.shopName,
      buyerId: source.buyerId, number: row.no, summary: row.items.map(item => item.title).join('、'), status: row.approval || row.executionResult,
      occurredAt: row.createdAt, updatedAt: row.reviewedAt || row.createdAt, pending: row.approval === '待审核',
      people: [{ label: '创建人', value: row.createdBy }],
      relationLabel: `来源退货申请 ${row.returnId}`, location: { name: 'oms-ebay-after-sale-orders', query: { documentNo: row.no } } })
  }
  for (const row of reviewSession.reviews) {
    const display = getReviewDisplay(row)
    rows.push({ key: sourceKey('review', row.shopId, row.id), category: 'reviews', kind: 'review', typeLabel: '收到的评价', shopId: row.shopId, shopName: row.shopName,
      buyerId: row.buyerId, number: row.id, summary: display.hidden ? '评价内容已隐藏' : `${row.title} · ${shortText(display.content)}`,
      status: `${reviewCommentLabels[row.commentType]} · ${reviewHandlingLabels[row.handlingStatus]}`, occurredAt: row.createdAt, updatedAt: reviewSession.lastSyncedAt,
      pending: isEffectiveReview(row) && row.commentType !== 'POSITIVE' && row.handlingStatus !== 'resolved', people: [handler(getReviewHandlerIds(row))],
      location: { name: 'oms-ebay-reviews', query: { shopId: row.shopId, reviewId: row.id } } })
  }
  for (const row of reviewSession.buyerFeedback) {
    const result = getBuyerFeedbackResult(row)
    rows.push({ key: sourceKey('buyerFeedback', row.shopId, row.id), category: 'reviews', kind: 'buyerFeedback', typeLabel: '给买家的好评', shopId: row.shopId, shopName: row.shopName,
      buyerId: row.buyerId, number: row.id, summary: `${row.title}${row.comment ? ` · ${shortText(row.comment.text)}` : ''}`, status: result.label,
      occurredAt: result.at || row.completedAt, updatedAt: reviewSession.lastSyncedAt, pending: result.status !== 'succeeded' && !getBuyerFeedbackBlockedReason(row),
      people: [handler(getBuyerFeedbackHandlerIds(row)), ...(row.comment?.by ? [{ label: '留评人' as const, value: row.comment.by }] : [])],
      location: { name: 'oms-ebay-reviews', query: { shopId: row.shopId, feedbackId: row.id } } })
  }
  for (const row of tickets.value) {
    const buyer = resolveTicketBuyer(row.source)
    if (!buyer || !row.source) continue
    rows.push({ key: sourceKey('ticket', buyer.shopId, row.id), category: 'tickets', kind: 'ticket', typeLabel: '工单', ...buyer, shopName: row.source.shopName,
      number: row.id, summary: row.title, status: row.status, occurredAt: ticketInstant(row.createdAt), updatedAt: ticketInstant(row.updatedAt),
      dueAt: isTicketClosed(row) ? undefined : ticketInstant(row.nextAt || row.dueAt), pending: !isTicketClosed(row), people: [{ label: '工单负责人', value: row.owner }],
      dueLabel: row.nextAt ? '下次跟进时间' : '工单完成期限',
      relationLabel: `来源 ${row.source.id}`, location: { name: 'oms-tickets', query: { ticketId: row.id } } })
  }
  return rows.filter(row => row.shopId && row.buyerId)
}

export function getBuyerProfile(shopId: string, buyerId: string) {
  // 旧专业订单样例只存掩码展示名；即使同店文本相同也不能据此识别账户。
  if (/[*•…]/.test(buyerId) || buyerId === '—') return buildBuyerProfile([], [], shopId, buyerId)
  const profile = buildBuyerProfile(getBuyerRecords(), getBuyerIdentities(), shopId, buyerId)
  const states = { not_synced: '尚未同步', failed: '读取失败', forbidden: '当前不可查看' }
  for (const order of mailSession.orders) {
    if (!profile.records.some(row => row.category === 'orders' && row.shopId === order.shopId && row.buyerId === order.buyerId && row.number === order.orderNo)) continue
    for (const [field, category, label] of [['afterSales', 'afterSales', '退货退款资料'], ['disputes', 'afterSales', '纠纷资料'], ['reviews', 'reviews', '评价资料']] as const) {
      const dataset = order[field]
      if (dataset.state === 'ready') continue
      const message = `部分关联${label}${states[dataset.state]}，当前记录不代表完整历史`
      if (!profile.coverageIssues.some(issue => issue.shopId === order.shopId && issue.category === category && issue.message === message)) profile.coverageIssues.push({ shopId: order.shopId, category, state: dataset.state, message })
    }
  }
  return profile
}
export function useBuyerProfile(shopId: () => string, buyerId: () => string) {
  return computed(() => getBuyerProfile(shopId(), buyerId()))
}
