import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 共享订单 } from '../订单处理/演示会话'
import { mailSession } from '../eBay站内信/会话'
import { demoMailRecipient } from '../eBay站内信/申请收件身份'
import type { DisputeRecord } from './类型'

// 独立的虚构已发货订单和来信。打开纠纷时只补齐当前样例，金额及物流取自订单样例。
const fixtures = [
  { orderNo: 'DEMO-UK-ORDER-101', suffix: '101', buyer: 'demo_buyer_101', title: '便携营灯 · 雾蓝', sku: 'OUT-LIGHT-BL', amount: '23.90', tracking: 'DEMO-GB-TRK-101' },
  { orderNo: 'DEMO-UK-ORDER-102', suffix: '102', buyer: 'demo_buyer_102', title: '不锈钢保温壶 · 银色', sku: 'KIT-POT-SV', amount: '31.50', tracking: 'DEMO-GB-TRK-102' },
  { orderNo: 'DEMO-UK-ORDER-104', suffix: '104', buyer: 'demo_buyer_104', title: '咖啡滤杯 · 陶瓷', sku: 'KIT-CUP-02', amount: '28.40', tracking: 'DEMO-GB-TRK-104' },
  { orderNo: 'DEMO-UK-ORDER-113', suffix: '113', buyer: 'demo_buyer_113', title: '充电营灯', sku: 'OUT-LAMP-13', amount: '24.00', tracking: 'DEMO-GB-TRK-113A' },
] as const
type Fixture = typeof fixtures[number]
const shopId = 'demo-outdoor-uk'
const shopName = '户外精选店 UK'
const route: 订单路由 = { warehouseProvider: '万邑通', warehouse: '万邑通英国仓', warehouseAccount: '万邑通 · 英国主体', shippingChannel: 'Royal Mail Tracked', shippingChannelCode: 'DEMO-RM-TRACKED', labelMode: '仓配一体' }

function createOrder(f: Fixture): 全渠道订单 {
  const systemOrderNo = 'OMS-DEMO-DS-' + f.suffix
  const payment = f.suffix === '104' || f.suffix === '113'
  const externalLineId = payment ? 'DEMO-LINE-' + f.suffix + '-1' : 'DEMO-DS-LINE-' + f.suffix
  const price = { value: f.amount, currency: 'GBP' }
  const shippedAt = '2026-10-28T10:15:00Z'
  const order: 全渠道订单 = {
    systemOrderNo, platformCode: 'eBay', storeId: shopId, storeName: shopName, platformOrderId: f.orderNo,
    platformOrderNo: f.orderNo, platformOrderStatus: 'FULFILLED', buyerExternalId: f.buyer,
    orderType: '线上订单', fulfillmentMode: '自配送', processingStatus: '已发货', defaultRoute: { ...route },
    orderedAt: '2026-10-27T11:30:00Z', paidAt: '2026-10-27T11:31:00Z', createdAt: '2026-10-27T11:33:00Z',
    lastSyncedAt: shippedAt, fulfillmentCompletedAt: shippedAt, shipByLabel: '—', urgency: '正常',
    address: { fullName: 'D***', countryCode: 'GB', city: 'Demo City', addressLine1: '*** Demo Road' },
    amount: { orderAmount: price }, tags: [], reviews: [], operationLogs: [],
    sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: shippedAt, lastSuccess: shippedAt, message: '' },
    items: [{ externalLineId, platformItemId: 'DEMO-ITEM-' + f.suffix, platformItemTitle: f.title, platformSku: 'UK-' + f.sku, orderedQuantity: 1,
      systemSku: f.sku, systemItemName: f.title, skuResolutionStatus: '成功', fulfillableQuantity: 1,
      currencyCode: 'GBP', unitPrice: { ...price }, itemTotal: { ...price } }],
    fulfillmentOrders: [{ fulfillmentOrderNo: 'FL-DEMO-DS-' + f.suffix, status: '已发货', isActive: true,
      route: { ...route }, plannedQuantity: 1, shippedQuantity: 1, shippedAt, trackingNumber: f.tracking,
      items: [{ orderNo: systemOrderNo, externalLineId, quantity: 1 }] }],
  }
  if (f.suffix === '113') {
    for (const [index, title, sku, value, suffix] of [[2, '配套挂架', 'OUT-RACK-13', '8.40', 'B'], [3, '防雨罩', 'OUT-COVER-13', '6.00', 'C']] as const) {
      const lineId = 'DEMO-LINE-113-' + index
      const unitPrice = { value, currency: 'GBP' }
      order.items.push({ ...order.items[0]!, externalLineId: lineId, platformItemId: 'DEMO-ITEM-113-' + suffix, platformItemTitle: title,
        systemItemName: title, systemSku: sku, platformSku: 'UK-' + sku, unitPrice, itemTotal: { ...unitPrice } })
      order.fulfillmentOrders.push({ ...order.fulfillmentOrders[0]!, fulfillmentOrderNo: 'FL-DEMO-DS-113-' + index,
        trackingNumber: 'DEMO-GB-TRK-113' + suffix, items: [{ orderNo: systemOrderNo, externalLineId: lineId, quantity: 1 }] })
    }
    order.amount.orderAmount = { value: '38.40', currency: 'GBP' }
  }
  return order
}

/** 明确的演示收件身份；未列入的店铺 / 买家保持待核实。 */
const recipients = [
  ...['101', '102', '103', '104', '106', '108', '109', '110', '111', '113'].map(id => demoMailRecipient(shopId, 'demo_buyer_' + id)),
  demoMailRecipient('shop-us', 'demo_buyer_107'),
]
export function disputeDemoRecipient(shop: string, buyer: string) {
  return recipients.find(recipient => recipient.shopId === shop && recipient.sourceBuyerId === buyer)
}

const readonlyOrders = fixtures.map(createOrder)
/** 列表及跨模块读取只使用已定义的演示原单，不向全渠道订单或站内信添加数据。 */
export function disputeHandlerOrderCandidates(row: DisputeRecord, orders: readonly 全渠道订单[]): readonly 全渠道订单[] {
  const sample = readonlyOrders.find(order => order.storeId === row.shopId && order.platformOrderId === row.orderId && order.buyerExternalId === row.buyer)
  if (!sample || orders.some(order => order.systemOrderNo === sample.systemOrderNo || (order.platformCode === 'eBay' &&
    order.storeId === row.shopId && (order.platformOrderId === row.orderId || order.platformOrderNo === row.orderId)))) return orders
  return [sample]
}

export function initializeDisputeFixture(row: DisputeRecord, area?: 'order' | 'mail') {
  if (row.shopId !== shopId) return
  const f = fixtures.find(item => item.orderNo === row.orderId && item.buyer === row.buyer)
  if (!f) return
  const systemOrderNo = 'OMS-DEMO-DS-' + f.suffix
  if (area !== 'mail' && !共享订单.value.some(item => item.systemOrderNo === systemOrderNo ||
      (item.platformCode === 'eBay' && item.storeId === shopId && (item.platformOrderNo === f.orderNo || item.platformOrderId === f.orderNo)))) {
    共享订单.value.push(createOrder(f))
  }
  if (area === 'order' || f.suffix !== '101') return
  const id = 'DEMO-MAIL-DS-101'
  if (mailSession.conversations.some(c => c.id === id)) return
  const at = '2026-11-04T09:10:00Z'
  mailSession.conversations.push({
    id, source: 'buyer', shopId, shopName, buyerId: f.buyer, subject: 'Could you check the delivery?',
    unread: true, flagged: false, assignee: '', status: 'pending', updatedAt: at, canReply: true,
    association: 'none', relatedOrderIds: [], sendScenario: 'success',
    messages: [{ id: 'DEMO-MSG-DS-101', kind: 'incoming', sender: f.buyer, at,
      body: 'I have checked with my neighbours and the parcel is still missing. Do you have an update from the carrier?' }],
  })
}
