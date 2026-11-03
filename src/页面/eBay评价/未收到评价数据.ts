import { createBuyerFeedback, createReviews, reviewShops } from './数据'
import type { AwaitingReviewLine, AwaitingReviewOrder } from './未收到评价模型'

const products = [
  { title: '折叠收纳箱', sku: 'DEMO-STORAGE-01', platformSku: 'EBAY-STORAGE-01' },
  { title: '瑜伽训练垫', sku: 'DEMO-YOGA-02', platformSku: 'EBAY-YOGA-02' },
  { title: 'LED 桌面阅读灯', sku: 'DEMO-LAMP-03', platformSku: 'EBAY-LAMP-03' },
  { title: '不锈钢保温杯', sku: 'DEMO-CUP-04', platformSku: 'EBAY-CUP-04' },
  { title: '宠物梳毛刷', sku: 'DEMO-PET-05', platformSku: 'EBAY-PET-05' },
  { title: '车载手机支架', sku: 'DEMO-HOLDER-06', platformSku: 'EBAY-HOLDER-06' },
]
const at = (days: number) => new Date(Date.UTC(2026, 9, 29 - days, 2, 30)).toISOString()
function line(id: string, index = 0): AwaitingReviewLine {
  return { id, orderLineItemId: `DEMO-AWAIT-FEEDBACK-${id}`, listingId: `DEMO-AWAIT-ITEM-${id}`, ...products[index % products.length]!, quantity: 1, association: 'confirmed' }
}
function order(index: number, patch: Partial<AwaitingReviewOrder> = {}): AwaitingReviewOrder {
  const suffix = String(index).padStart(3, '0'), shop = reviewShops[(index - 1) % reviewShops.length]!
  return { id: `AWAIT-DEMO-${suffix}`, omsOrderNo: `OMS-DEMO-AWAIT-${suffix}`, shopId: shop.value, shopName: shop.label, buyerId: `await_buyer_demo_${suffix}`, orderNo: `DEMO-AWAIT-${suffix}`, platform: 'eBay', processingStatus: '已发货', shippedAt: at(2 + index % 22), outboundStatuses: ['已出库'], trackingNumbers: [`DEMO-AWAIT-TRACK-${suffix}`], coverage: 'complete', association: 'confirmed', lines: [line(suffix, index - 1)], notes: [], ...patch }
}

/** 跨类目虚构来源；明确关联项由 OMS 演示工厂生成同身份及商品的完整共享订单。 */
export function createAwaitingReviewOrders(): AwaitingReviewOrder[] {
  const orders = Array.from({ length: 22 }, (_, index) => order(index + 1))
  orders[0]!.lines.push(line('001-B', 1))
  orders[0]!.notes.push({ text: '仓库已完成出库，后续按需要回访。', by: '客服02', at: '2026-10-28T09:20:00+08:00' })
  const reviews = createReviews(), existingBuyerFeedback = createBuyerFeedback()
  const auto = reviews[2]!, partial = reviews[3]!
  const reviewLine = (review: typeof auto): AwaitingReviewLine => ({ id: `SOURCE-${review.id}`, orderLineItemId: review.orderLineItemId, listingId: review.listingId, title: review.title, sku: review.sku, platformSku: review.platformSku, quantity: 1, association: 'confirmed' })
  orders.push(order(30, { id: 'AWAIT-DEMO-AUTO', shopId: auto.shopId, shopName: auto.shopName, buyerId: auto.buyerId, orderNo: auto.orderNo, lines: [reviewLine(auto)], shippedAt: at(8) }))
  orders.push(order(31, { id: 'AWAIT-DEMO-PARTIAL', shopId: partial.shopId, shopName: partial.shopName, buyerId: partial.buyerId, orderNo: partial.orderNo, lines: [reviewLine(partial), line('PARTIAL-B', 0), line('PARTIAL-C', 3)], shippedAt: at(9) }))
  for (const index of [7, 10, 14]) {
    const received = reviews[index]!
    orders.push(order(40 + index, { id: `AWAIT-DEMO-RECEIVED-${received.id}`, shopId: received.shopId, shopName: received.shopName, buyerId: received.buyerId, orderNo: received.orderNo, lines: [reviewLine(received)] }))
  }
  // 同一交易行的已有卖家好评只用于展示卖家方向结果，不推断买家评价。
  for (const index of [0, 10, 11]) {
    const feedback = existingBuyerFeedback[index]!
    orders.push(order(60 + index, { id: `AWAIT-DEMO-GIVEN-${index}`, shopId: feedback.shopId, shopName: feedback.shopName, buyerId: feedback.buyerId, orderNo: feedback.orderNo, lines: [{ ...line(`GIVEN-${index}`, index), orderLineItemId: feedback.orderLineItemId, title: feedback.title, sku: feedback.sku }], shippedAt: at(index + 3) }))
  }
  orders.push(order(80, { id: 'AWAIT-DEMO-COVERAGE', coverage: 'incomplete', shippedAt: at(4) }))
  orders.push(order(81, { id: 'AWAIT-DEMO-ASSOCIATION', association: 'unknown', lines: [{ ...line('UNKNOWN', 4), orderLineItemId: '', association: 'unknown' }], shippedAt: at(5) }))
  for (const source of orders) if (source.association === 'confirmed') source.omsOrderId = source.omsOrderNo
  return orders
}
