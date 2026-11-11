import { getSkuHandlerIds } from '@/组件/客服处理人/处理人'
import type { ReviewSkuLink } from './类型'
import type { BuyerFeedbackRecord, BuyerFeedbackSendSource, ReviewCommentType, ReviewReasonCategory, ReviewRecord } from './类型'
import { buyerFeedbackTemplates } from '../消息模板管理/评价模板数据'
export { buyerFeedbackTemplates } from '../消息模板管理/评价模板数据'

// 所有记录均为虚构评审资料；不调用、也不持久化到 eBay。
export const REVIEW_TODAY = '2026-10-29'
export const reviewShops = [
  { value: 'shop-us', label: '演示店铺-US' },
  { value: 'shop-uk', label: '演示店铺-UK' },
  { value: 'shop-de', label: '演示店铺-DE' },
  { value: 'shop-au', label: '演示店铺-AU' },
]
export const reviewOwners = ['客服01', '客服02', '客服03']
export const reviewReasons = ['车型适配', '商品质量', '描述不符', '漏发错发', '运输破损', '配送延迟', '服务沟通', '其他']
export function createReviewReasons(): ReviewReasonCategory[] {
  return reviewReasons.map((name, index) => ({ id: `review-reason-${index + 1}`, name, builtin: true, enabled: true, used: true }))
}
export const reviewCommentLabels = { POSITIVE: '好评', NEUTRAL: '中评', NEGATIVE: '差评' } as const
export const reviewHandlingLabels = { pending: '待处理', processing: '处理中', resolved: '已处理' } as const
export const reviewPlatformLabels = {
  ENTERED: '有效', WITHDRAWN: '已撤回', HIDDEN: '已隐藏', REVISED: '已被修改',
  REVISION_OPEN: '改评申请中', REVISION_DECLINED_OR_EXPIRED: '改评拒绝或过期',
} as const

const products = [
  { title: '刹车片套装', sku: 'DEMO-BP-01', english: 'Demo Brake Pad Kit' },
  { title: '车门把手', sku: 'DEMO-DH-02', english: 'Demo Exterior Door Handle' },
  { title: '空气滤芯', sku: 'DEMO-AF-04', english: 'Demo Air Filter' },
  { title: '后视镜盖', sku: 'DEMO-MC-07', english: 'Demo Mirror Cover' },
  { title: '点火线圈', sku: 'DEMO-IC-05', english: 'Demo Ignition Coil' },
  { title: '雨刷套装', sku: 'DEMO-WB-06', english: 'Demo Wiper Blade Set' },
]
/** 这些虚构交易行的关联由样例明确提供。缺少该证据的历史记录不按展示 SKU 自动派人。 */
function verifiedItem(row: ReviewRecord | BuyerFeedbackRecord): ReviewSkuLink {
  const { shopId, buyerId, orderLineItemId, sku } = row
  return { shopId, buyerId, orderLineItemId, sku, handlerIds: getSkuHandlerIds([sku]) }
}
const negativeTexts = [
  ['The part does not fit my vehicle. I need help checking the model.', '配件不适配我的车辆，需要协助核对车型。', '车型适配'],
  ['The package arrived later than expected. Please check the delivery.', '包裹晚于预期送达，请核查配送情况。', '配送延迟'],
  ['The item was damaged when I opened the box.', '开箱时发现商品有破损。', '运输破损'],
  ['One piece was missing from the kit.', '套装中缺少一个零件。', '漏发错发'],
  ['The finish does not match the listing description.', '商品表面处理与刊登描述不一致。', '描述不符'],
  ['The item stopped working after installation.', '安装后商品无法正常工作。', '商品质量'],
  ['I have not received a clear answer about my order yet.', '关于订单问题，我还没有收到清楚的答复。', '服务沟通'],
]

function isoAt(dayOffset: number, hour = 10): string {
  const date = new Date(Date.UTC(2026, 9, 29 - dayOffset, hour - 8, 20))
  return date.toISOString()
}

export function createReviews(): ReviewRecord[] {
  const records = Array.from({ length: 48 }, (_, index): ReviewRecord => {
    const suffix = String(index + 1).padStart(3, '0')
    const shop = reviewShops[index % reviewShops.length]!
    const product = products[index % products.length]!
    const commentType: ReviewCommentType = index % 7 === 0 ? 'NEGATIVE' : index % 5 === 0 ? 'NEUTRAL' : 'POSITIVE'
    const issue = negativeTexts[index % negativeTexts.length]!
    const automated = commentType === 'POSITIVE' && index % 4 === 2
    const createdAt = isoAt(Math.floor(index / 2), 9 + index % 8)
    const isIssue = commentType !== 'POSITIVE'
    const handlingStatus = !isIssue || index % 3 === 2 ? 'resolved' : index % 3 === 1 ? 'processing' : 'pending'
    const record: ReviewRecord = {
      id: `REV-DEMO-${suffix}`, shopId: shop.value, shopName: shop.label, buyerId: `feedback_demo_${suffix}`,
      orderLineItemId: `DEMO-LINE-${suffix}`, orderNo: `DEMO-EBAY-${suffix}`,
      title: product.title, sku: product.sku, platformSku: `EBAY-${product.sku}`, listingId: `DEMO-ITEM-${String(index % 6 + 1).padStart(3, '0')}`,
      commentType, content: automated ? 'This seller successfully completed an order.' : isIssue ? issue[0]! : 'Exactly as described. The part arrived safely and works well. Thank you!',
      translation: automated ? '卖家已成功完成本次交易。' : isIssue ? issue[1]! : '与描述一致，配件完好送达并可正常使用。谢谢！',
      createdAt, automated, platformState: 'ENTERED', handlingStatus,
      reason: isIssue && index % 3 !== 0 ? issue[2]! : '',
      notes: [], logs: [{ id: `log-${suffix}-sync`, at: createdAt, by: '系统', action: '同步评价', detail: '虚构评价样例已载入。' }],
      eligibleForRevision: isIssue,
      logistics: { warehouse: ['万邑通-演示美西仓', '谷仓-演示英国仓', '4PX-演示德国仓', '西邮-演示澳洲仓'][index % 4]!, channel: ['演示标准配送', '演示经济配送'][index % 2]!, trackingNumber: `DEMO-TRACK-FB-${suffix}`, status: index % 7 === 0 ? '已签收，待核对' : '已签收' },
      afterSalesSummary: isIssue ? '尚无已确认关联的售后或纠纷资料' : '尚无已确认关联的售后或纠纷资料',
    }
    if (isIssue && handlingStatus !== 'pending' && index % 2 === 0) {
      record.reply = { text: 'Thank you for your feedback. We are following up with you to resolve this issue.', at: isoAt(Math.max(0, Math.floor(index / 2) - 1), 15), by: '客服01' }
    }
    if (isIssue && handlingStatus === 'resolved') record.notes.push({ text: '已核对买家问题并完成本次跟进，平台评价类型保持原值。', at: isoAt(Math.max(0, Math.floor(index / 2) - 1), 16), by: '客服02' })
    return record
  })

  // 仅这条样例与既有站内信的 order-01/conv-01 精确一致；不冒充 OMS 订单 ID。
  Object.assign(records[0]!, {
    id: 'REV-DEMO-01', shopId: 'shop-us', shopName: '演示店铺-US', buyerId: 'buyer_demo_01',
    orderId: 'order-01', orderNo: 'DEMO-1001', orderLineItemId: 'DEMO-MAIL-LINE-01', conversationId: 'conv-01',
    commentType: 'NEUTRAL', content: 'The part does not fit my vehicle. I have opened a return request.',
    translation: '商品适配不符合预期，我已发起退货申请。', createdAt: '2026-10-26T18:10:00+08:00',
    handlingStatus: 'pending', reason: '车型适配',
    logistics: { warehouse: '—', channel: 'UPS', trackingNumber: 'DEMO-TRACK-01', status: '已签收' },
    afterSalesSummary: 'RET-DEMO-01 · 退货申请待卖家处理',
  })
  records[1]!.commentType = 'NEGATIVE'
  records[1]!.content = 'The package arrived later than expected. Please check the delivery.'
  records[1]!.translation = '包裹晚于预期送达，请核查配送情况。'
  records[1]!.handlingStatus = 'processing'
  records[1]!.reason = '配送延迟'
  records[1]!.eligibleForRevision = true
  records[1]!.followup = { text: 'The parcel has now arrived. I am checking the item.', at: '2026-10-29T12:00:00+08:00', by: records[1]!.buyerId }

  records[7]!.platformState = 'WITHDRAWN'
  records[10]!.platformState = 'HIDDEN'
  records[14]!.platformState = 'REVISED'
  records[20]!.platformState = 'REVISION_OPEN'
  records[20]!.eligibleForRevision = false
  records[21]!.platformState = 'REVISION_DECLINED_OR_EXPIRED'
  records[21]!.eligibleForRevision = false
  for (const item of [records[7]!, records[10]!, records[14]!]) item.eligibleForRevision = false
  // 两条超过默认最近30天的样例用于验证历史筛选。
  records[46]!.createdAt = '2026-09-20T08:30:00+08:00'
  records[47]!.createdAt = '2026-09-25T16:20:00+08:00'
  records[46]!.eligibleForRevision = false
  records[47]!.eligibleForRevision = false
  for (const row of records) row.skuLink = verifiedItem(row)
  return records
}

export function createBuyerFeedback(): BuyerFeedbackRecord[] {
  const records: BuyerFeedbackRecord[] = Array.from({ length: 14 }, (_, index) => {
    const shop = reviewShops[index % reviewShops.length]!, product = products[index % products.length]!
    const suffix = String(index + 1).padStart(3, '0'), sent = index >= 10
    const sendSource: BuyerFeedbackSendSource | undefined = sent ? (['manual', 'automation', 'external', 'unknown'] as const)[index - 10] : undefined
    const automationRuleName = sendSource === 'automation' ? '付款后自动好评' : undefined
    return {
      id: `BUYER-FB-DEMO-${suffix}`, shopId: shop.value, shopName: shop.label, buyerId: `leave_demo_${suffix}`,
      orderNo: `DEMO-LEAVE-${suffix}`, orderLineItemId: `DEMO-LEAVE-LINE-${suffix}`, title: product.title, sku: product.sku,
      completedAt: index === 9 ? '2026-07-01T08:00:00+08:00' : isoAt(3 + index, 11),
      eligible: index !== 9 && !sent, ineligibleReason: index === 9 ? '交易完成已超过90天，当前不可留评' : sent ? '已给买家留评' : undefined,
      status: sent ? 'sent' : 'pending',
      sendSource, automationRuleName,
      comment: sent ? { text: 'Thank you for your purchase. We appreciate your business!', at: isoAt(index - 4, 14), by: sendSource === 'automation' ? '自动规则' : sendSource === 'external' ? '外部系统' : sendSource === 'unknown' ? '未知' : '客服02' } : undefined,
    }
  })
  // 单独追加双向关系样例，原14条独立留评资料保持原样。
  const reviews = createReviews()
  for (const [index, sourceIndex] of [0, 1, 3].entries()) {
    const review = reviews[sourceIndex]!, sent = index === 2
    const text = buyerFeedbackTemplates[index]!.text
    const attemptedAt = '2026-10-28T08:30:00+08:00'
    records.push({
      id: `BUYER-FB-LINKED-${index + 1}`, shopId: review.shopId, shopName: review.shopName,
      buyerId: review.buyerId, orderNo: review.orderNo, orderLineItemId: review.orderLineItemId,
      title: review.title, sku: review.sku, completedAt: '2026-10-24T08:00:00+08:00',
      eligible: !sent, ineligibleReason: sent ? '已给买家留评' : undefined, status: sent ? 'sent' : 'pending',
      comment: sent ? { text, at: attemptedAt, by: '客服02' } : undefined,
      sendSource: index === 0 ? undefined : 'manual',
      simulateFailureOnce: index === 0 ? true : undefined,
      attempts: index === 0 ? [] : [{
        id: `buyer-attempt-linked-${index + 1}`, at: attemptedAt, by: '客服02', text,
        outcome: sent ? 'succeeded' : 'failed',
        code: sent ? undefined : 'DEMO_REQUEST_REJECTED',
        message: sent ? '给买家留评成功（本地模拟）' : '平台明确拒绝本次请求（本地模拟），请核对留评内容后再次提交。',
        sendSource: 'manual',
      }],
    })
  }
  for (const row of records) row.skuLink = verifiedItem(row)
  return records
}
