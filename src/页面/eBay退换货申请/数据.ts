import { reactive } from 'vue'
import { emptyReturnDetail, formatMinor, parseMoney, syncReturn, type ReturnAddress, type ReturnRecord } from './模型'
export const returnShops = [
  { value: 'shop-us', label: '演示店铺-US' }, { value: 'demo-outdoor-uk', label: '户外精选店 UK' },
  { value: 'demo-parts-us', label: '汽配专营店 US' }, { value: 'demo-new-us', label: '生活精选新店 US' },
  { value: 'demo-read-failed', label: '来源读取失败演示店' },
]

export function createReturnData(): ReturnRecord[] {
  const base: ReturnRecord = {
    id: 'DEMO-RT-001', shopId: 'shop-us', shopName: '演示店铺-US', site: '美国', marketplaceId: 'EBAY_US', orderNo: 'DEMO-ORDER-1001', buyerId: 'buyer_demo_01',
    title: '折叠收纳置物架 · 白色', sku: 'HOME-RACK-01', quantity: 1, category: '家居', reason: '商品与描述不符', reasonCode: 'NOT_AS_DESCRIBED',
    state: 'RETURN_REQUESTED', status: 'RETURN_REQUESTED', currency: 'USD', estimatedRefund: 49.9, actualRefund: null, createdAt: '2026-10-28T03:20:00Z', deadline: '2026-10-31T07:59:59Z',
    options: ['SELLER_APPROVE_REQUEST', 'SELLER_DECLINE_REQUEST', 'SELLER_OFFER_RETURNS', 'SELLER_OFFER_PARTIAL_REFUND', 'SELLER_SEND_MESSAGE'], eligibilityKnown: true,
    escalation: { eligible: false, start: null, end: null }, caseId: null, caseStatus: null,
    shipping: '尚未安排退货', tracking: null, keepItem: false, received: false, returnType: 'MONEY_BACK', outcome: 'idle', pendingAction: null, pendingText: '', pendingAmount: null,
    updatedAt: '2026-10-29T01:30:00Z', lastSyncedAt: '2026-10-29T01:30:00Z', orderProducts: null, outbounds: null,
    notes: [], logs: [], history: [{ at: '2026-10-28T03:20:00Z', author: '买家', text: 'The shelf is smaller than described. I would like to return it for a refund.' }],
  }
  const make = (number: number, patch: Partial<ReturnRecord>): ReturnRecord => ({ ...structuredClone(base), id: `DEMO-RT-${String(number).padStart(3, '0')}`, orderNo: `DEMO-ORDER-${1000 + number}`, buyerId: `buyer_demo_r${String(number).padStart(2, '0')}`, ...patch })
  const records = [base,
    make(2, { shopId: 'demo-outdoor-uk', shopName: '户外精选店 UK', site: '英国', marketplaceId: 'EBAY_GB', title: '露营折叠椅 · 深绿', sku: 'OUT-CHAIR-02', category: '户外', currency: 'GBP', estimatedRefund: 36.8, reason: '改变主意', reasonCode: 'CHANGED_MIND', state: 'ITEM_SHIPPED', status: 'ITEM_SHIPPED', shipping: '买家已寄回 · 运输中', tracking: 'DEMO-RETURN-002', options: ['SELLER_SEND_MESSAGE'], deadline: null }),
    make(3, { title: '桌面阅读灯 · 暖白', sku: 'HOME-LAMP-03', reason: '商品无法正常使用', reasonCode: 'DEFECTIVE_ITEM', state: 'ITEM_DELIVERED', status: 'ITEM_DELIVERED', estimatedRefund: 29.5, received: true, shipping: '退货已送达', tracking: 'DEMO-RETURN-003', options: ['SELLER_ISSUE_REFUND', 'SELLER_SEND_MESSAGE'], deadline: '2026-10-30T07:59:59Z', notes: [{ at: '2026-10-29T01:00:00Z', text: '已核对退货签收信息，等待退款处理。', author: '客服02' }] }),
    make(4, { shopId: 'demo-parts-us', shopName: '汽配专营店 US', title: '车载收纳盒 · 黑色', sku: 'AUTO-BOX-04', category: '汽配', state: 'ITEM_KEPT', estimatedRefund: 12.9, keepItem: true, shipping: '无需寄回', options: ['SELLER_ISSUE_REFUND', 'SELLER_SEND_MESSAGE'], reason: '到货破损', reasonCode: 'ARRIVED_DAMAGED' }),
    make(5, { title: '厨房储物罐 · 三件套', sku: 'KIT-JAR-05', category: '厨具', state: 'ITEM_SHIPPED', status: 'ITEM_SHIPPED', shipping: '买家已寄回 · 送达待核实', tracking: 'DEMO-RETURN-005', options: ['SELLER_SEND_MESSAGE', 'SELLER_ESCALATE'], escalation: { eligible: true, start: '2026-10-28T00:00:00Z', end: '2026-11-20T23:59:59Z' }, createdAt: '2026-10-18T02:30:00Z', deadline: '2026-11-20T23:59:59Z', history: [{ at: '2026-10-18T02:30:00Z', author: '买家', text: 'I have returned the item. Please check the parcel.' }] }),
    make(6, { shopId: 'demo-outdoor-uk', shopName: '户外精选店 UK', site: '英国', marketplaceId: 'EBAY_GB', title: '防水野餐垫 · 蓝色', sku: 'OUT-MAT-06', category: '户外', currency: 'GBP', state: 'ITEM_DELIVERED', status: 'ESCALATED', caseId: 'DEMO-CASE-006', caseStatus: '等待 eBay 处理', options: [], received: true, shipping: '退货已送达', tracking: 'DEMO-RETURN-006', deadline: null, createdAt: '2026-10-16T08:40:00Z' }),
    make(7, { title: '桌面理线盒 · 灰色', sku: 'HOME-CABLE-07', state: 'CLOSED', status: 'CLOSED', actualRefund: 49.9, shipping: '退货已送达', received: true, options: [], deadline: null, createdAt: '2026-10-12T06:20:00Z', outcome: 'confirmed' }),
    make(8, { title: '宠物饮水器 · 透明', sku: 'PET-WATER-08', category: '宠物用品', state: 'ITEM_KEPT', keepItem: true, shipping: '无需寄回', options: ['SELLER_ISSUE_REFUND'], outcome: 'unknown', pendingAction: 'refund', logs: [{ at: '2026-10-29T01:20:00Z', text: '发起退款后响应超时，结果待核查；请勿重复退款' }] }),
    make(9, { title: '旅行收纳袋 · 六件套', sku: 'TRAVEL-BAG-09', category: '旅行用品', state: 'UNKNOWN', status: 'UNKNOWN', eligibilityKnown: false, options: [], deadline: null }),
    make(10, { title: '可折叠露营桌', state: 'RMA_PENDING', status: 'WAITING_FOR_RMA', options: ['SELLER_PROVIDE_RMA', 'SELLER_SEND_MESSAGE'], shipping: '待提供退货授权编号' }),
    make(11, { title: '桌面阅读灯 · 退回安排', state: 'RETURN_LABEL_PENDING', status: 'WAITING_FOR_RETURN_LABEL', options: ['SELLER_PROVIDE_LABEL', 'SELLER_SEND_MESSAGE'], shipping: '待提供退货面单' }),
    make(12, { title: '厨房收纳篮', state: 'ITEM_SHIPPED', status: 'ITEM_SHIPPED', options: ['SELLER_MARK_AS_RECEIVED', 'SELLER_SEND_MESSAGE'], shipping: '物流显示已送达，待卖家确认', tracking: 'DEMO-RET-TRACK-012' }),
    make(13, { title: '便携保温杯', state: 'REFUND_FAILED', status: 'ITEM_DELIVERED', options: ['SELLER_RETRY_REFUND', 'SELLER_SEND_MESSAGE'], received: true, shipping: '已退回，退款失败待核实' }),
    make(14, { title: '旅行收纳包 · 留言核查', outcome: 'unknown', pendingAction: 'message', pendingText: 'Please keep the packaging.', mock: { resolve: 'success' } }),
    make(15, { title: '宠物食盆 · 退款核查', state: 'ITEM_KEPT', keepItem: true, options: ['SELLER_ISSUE_REFUND', 'SELLER_SEND_MESSAGE'], outcome: 'unknown', pendingAction: 'refund', mock: { resolve: 'failed' } }),
    make(16, { title: '户外折叠凳 · 提交拒绝', options: ['SELLER_SEND_MESSAGE'], mock: { submit: 'failed', error: '平台明确拒绝本次留言，请刷新当前资格后重试（虚构回执）' } }),
    make(17, { title: '收纳箱 · 部分读取失败', mock: { readFailure: 'detail' } }),
    make(18, { title: '宠物旅行垫 · 自动批准', mock: { externalEvent: 'autoApprove' } }),
    make(19, { title: '厨房分隔板 · 买家接受报价', state: 'PARTIAL_REFUND_REQUESTED', status: 'PARTIAL_REFUND_REQUESTED', options: ['SELLER_SEND_MESSAGE'], deadline: null, mock: { externalEvent: 'buyerAccept' } }),
    make(20, { title: '桌面支架 · 平台自动退款', state: 'AUTO_REFUND_INITIATED', status: 'ITEM_DELIVERED', options: [], received: true, mock: { externalEvent: 'autoRefund' } }),
    make(21, { title: '旅行收纳夹 · 买家关闭', mock: { externalEvent: 'buyerClose' } }),
    make(22, { title: '来源内容受限商品', options: [], eligibilityKnown: false }),
  ]
  const buyerAddress: ReturnAddress = { name: 'DEMO Buyer', addressLine1: '100 Example Road', addressLine2: 'Unit A', city: 'Demo City', stateOrProvince: 'CA', postalCode: '00000', country: 'US' }
  const sellerAddress: ReturnAddress = { name: 'DEMO Returns', addressLine1: '200 Sample Avenue', city: 'Demo Return City', stateOrProvince: 'CA', postalCode: '00000', country: 'US' }
  for (const [index, row] of records.entries()) {
    const detail = emptyReturnDetail(), digits = parseMoney(String(row.estimatedRefund ?? ''), row.currency), amount = digits === null ? null : { currency: row.currency, value: formatMinor(digits, row.currency) }
    detail.currentType = row.returnType; detail.buyerComment = row.history.find(entry => entry.author === '买家')?.text || 'I would like help with this return.'
    detail.itemId = `DEMO-ITEM-${index + 1}`; detail.transactionId = `DEMO-TXN-${index + 1}`
    detail.buyerAddress = structuredClone(buyerAddress); detail.orderAddress = index < 3 ? { ...buyerAddress, addressLine2: 'Original order: Unit B' } : null; detail.sellerAddress = row.keepItem ? null : structuredClone(sellerAddress)
    if (row.marketplaceId === 'EBAY_GB') { detail.buyerAddress.country = 'GB'; detail.buyerAddress.stateOrProvince = ''; detail.buyerAddress.postalCode = 'DEMO'; if (detail.orderAddress) detail.orderAddress.country = 'GB'; if (detail.sellerAddress) detail.sellerAddress.country = 'GB' }
    detail.rmaRequired = index === 9; detail.rmaNumber = index === 10 ? 'DEMO-RMA-011' : null; detail.shippingPayer = 'SELLER'
    detail.sellerDue = row.deadline ? { activity: index === 9 ? 'SELLER_PROVIDE_RMA' : index === 10 ? 'SELLER_PROVIDE_LABEL' : row.received || row.keepItem ? 'SELLER_ISSUE_REFUND' : 'SELLER_APPROVE_REQUEST', at: row.deadline } : null
    if (row.state === 'PARTIAL_REFUND_REQUESTED') detail.buyerDue = { activity: 'REMINDER_BUYER_TO_RESPOND_RE_OFFER', at: '2026-11-10T23:59:59Z' }
    detail.availableActions = row.options.map(actionType => ({ actionType }))
    detail.refund.sellerEstimated = amount; detail.refund.buyerEstimated = amount
    detail.refund.itemsComplete = !!amount
    detail.refund.partialOfferLimit = amount; detail.refund.partialOfferLimitVerified = !!amount; detail.refund.partialOfferLimitSource = '虚构已核验报价额度；不是平台直接返回字段，生产来源待联调'
    if (amount) detail.refund.items = [{ refundFeeType: 'PURCHASE_PRICE', label: '商品价款', currency: row.currency, estimated: amount.value, min: amount.value, max: amount.value, optional: false }, { refundFeeType: 'RETURN_SHIPPING', label: '退回运费', currency: row.currency, estimated: '3.00', min: '0.00', max: '3.00', optional: true }]
    if (row.actualRefund !== null) { detail.refund.sellerActual = { value: row.actualRefund.toFixed(2), currency: row.currency }; detail.refund.buyerActual = detail.refund.sellerActual; detail.refund.status = 'SUCCESS'; detail.refund.issuedAt = '2026-10-25T04:20:00Z'; detail.closeInfo = { at: '2026-10-25T04:25:00Z', reason: 'FULL_REFUNDED', buyerReason: '', buyerComment: '' } }
    if (row.tracking) detail.shipments = [{ shipmentId: `DEMO-SHIPMENT-${index + 1}`, carrierEnum: 'USPS', carrierName: 'USPS', trackingNumber: row.tracking, deliveryStatus: row.received ? 'DELIVERED' : 'IN_TRANSIT', actualShipDate: '2026-10-25T04:20:00Z', actualDeliveryDate: row.received ? '2026-10-28T04:20:00Z' : null, markAsReceived: row.received, originAddress: structuredClone(detail.buyerAddress), destinationAddress: structuredClone(detail.sellerAddress), scans: [{ at: '2026-10-25T04:20:00Z', description: '包裹已由承运商收取（虚构轨迹）', location: 'DEMO' }], readStatus: 'success' }]
    for (const key of ['summary', 'detail', 'files', 'tracking'] as const) detail.readStatus[key] = { status: row.eligibilityKnown ? 'success' : 'unknown', succeededAt: row.lastSyncedAt, attemptedAt: row.lastSyncedAt, error: '' }
    detail.eligibilityVersion = 1; row.detail = detail
  }
  records[0]!.detail!.refund.buyerEstimated = { value: '54.90', currency: 'USD' }
  records[0]!.detail!.refund.items = [{ refundFeeType: 'PURCHASE_PRICE', label: '商品价款', currency: 'USD', estimated: '44.90', min: '44.90', max: '44.90', optional: false }, { refundFeeType: 'ORIGINAL_SHIPPING', label: '原发货运费', currency: 'USD', estimated: '5.00', min: '5.00', max: '5.00', optional: false }, { refundFeeType: 'RETURN_SHIPPING', label: '退回运费', currency: 'USD', estimated: '3.00', min: '0.00', max: '3.00', optional: true }]
  const picture = (n: number) => `${import.meta.env.BASE_URL}demo-return-proof-${n}.png`
  records[0]!.detail!.files = [
    { fileId: 'DEMO-BUYER-FILE-1', fileName: '商品整体.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED', fileStatus: 'PUBLISHED', submitter: 'BUYER', creationDate: '2026-10-28T03:21:00Z', previewUrl: picture(1), demo: true },
    { fileId: 'DEMO-BUYER-FILE-2', fileName: '商品破损处.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED', fileStatus: 'PUBLISHED', submitter: 'BUYER', creationDate: '2026-10-28T03:22:00Z', previewUrl: picture(2), demo: true },
    { fileId: 'DEMO-BUYER-FILE-3', fileName: '已移除图片.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED', fileStatus: 'DELETED', submitter: 'BUYER', creationDate: '2026-10-28T03:23:00Z', demo: true },
    { fileId: 'DEMO-SELLER-FILE-1', fileName: '卖家补充材料.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED', fileStatus: 'CREATED', submitter: 'SELLER', creationDate: '2026-10-28T04:21:00Z', previewUrl: picture(1), demo: true },
    { fileId: 'DEMO-EBAY-FILE-1', fileName: '平台材料.png', fileFormat: 'PNG', filePurpose: 'REFUND_RELATED', fileStatus: 'PUBLISHED', submitter: 'EBAY', creationDate: '2026-10-28T04:22:00Z', previewUrl: picture(2), demo: true },
  ]
  records[2]!.detail!.shipments.push({ ...structuredClone(records[2]!.detail!.shipments[0]!), shipmentId: 'DEMO-SHIPMENT-3-B', trackingNumber: 'DEMO-RETURN-003-B' })
  records[2]!.mock = { refundResult: { status: 'SUCCESS', sellerActual: { value: '29.50', currency: 'USD' }, buyerActual: { value: '29.50', currency: 'USD' }, actualItems: [{ refundFeeType: 'PURCHASE_PRICE', amount: { value: '29.50', currency: 'USD' } }], issuedAt: '2026-10-30T08:00:00Z', initiator: 'SELLER_INITIATED', state: 'CLOSED', returnStatus: 'CLOSED', closeAt: '2026-10-30T08:01:00Z', closeReason: 'FULL_REFUNDED' } }
  records[3]!.mock = { refundResult: { status: 'FAILED', sellerActual: null, buyerActual: null, actualItems: [], issuedAt: null, initiator: 'SELLER_INITIATED', state: 'REFUND_FAILED', returnStatus: 'RETURN_REQUESTED', error: '平台退款执行失败，请前往平台核实重试资格（虚构回执）' } }
  records[12]!.detail!.refund.status = 'FAILED'
  records[16]!.detail!.readStatus.detail.status = 'failed'; records[16]!.detail!.readStatus.detail.error = '详情读取失败，保留上次资料'
  records[19]!.detail!.refund.recoup = '平台自动退款后将向卖家追偿（虚构来源资料）'
  records[19]!.detail!.refund.moneyMovements = [{ id: 'DEMO-MOVE-020', type: 'AUTO_REFUND', status: 'PENDING', amount: null, actualAmount: null, requestedAmount: { value: '49.90', currency: 'USD' }, at: '2026-10-29T06:00:00Z' }]
  records[19]!.mock!.refundResult = { status: 'SUCCESS', sellerActual: { value: '45.00', currency: 'USD' }, buyerActual: { value: '49.90', currency: 'USD' }, actualItems: [{ refundFeeType: 'PURCHASE_PRICE', amount: { value: '49.90', currency: 'USD' } }], issuedAt: '2026-10-30T08:00:00Z', initiator: 'AUTO_REFUND', state: 'CLOSED', returnStatus: 'CLOSED', closeAt: '2026-10-30T08:01:00Z', closeReason: 'AUTO_REFUNDED' }
  records[21]!.detail!.contentOnHold = true; records[21]!.detail!.buyerComment = ''; records[21]!.detail!.buyerAddress = null; records[21]!.detail!.orderAddress = null
  records[21]!.detail!.holdInfo = { status: 'HOLD_CREATION_SUCCESS', reason: '', until: null }
  // 明确的固定虚构整单资料；本次退货仅覆盖该商品的部分数量。
  for (const [index, row] of records.slice(0, 3).entries()) {
    row.systemOrderNo = `OMS-DEMO-RET-${String(index + 1).padStart(3, '0')}`
    row.platformOrderStatus = 'FULFILLED'; row.omsStatus = '已发货'
    row.warehouse = index === 1 ? '万邑通 · 英国仓' : '谷仓 · 美国西仓'
    row.orderChannel = index === 1 ? '英国标准配送' : '美国标准配送'
    row.orderProducts = [{ title: row.title, sku: row.sku, quantity: 2 }, { title: '折叠收纳配件包', sku: `DEMO-RET-ACCESSORY-${index + 1}`, quantity: 1 }]
    row.shipped = 3
    const outbound = (suffix: string, warehouse: string, account: string, externalNo: string) => ({ outboundId: `shared-CK-DEMO-RET-${String(index + 1).padStart(3, '0')}${suffix}`, no: `CK-DEMO-RET-${String(index + 1).padStart(3, '0')}${suffix}`, externalNo, status: '已出库', warehouse, account, channel: row.orderChannel!, channelCode: index === 1 ? 'DEMO-RET-UK-STD' : 'DEMO-RET-US-STD', tracking: `DEMO-ORIGINAL-SHIP-${index + 1}${suffix}`, shippedAt: '2026-10-10T05:00:00Z' })
    row.outbounds = index === 1 ? [outbound('-A', '万邑通 · 英国仓', 'DEMO 万邑通账号', 'WINIT-DEMO-RET-002-A'), outbound('-B', '4PX · 英国仓', 'DEMO 4PX账号', '4PX-DEMO-RET-002-B')] : [outbound('', '谷仓 · 美国西仓', 'DEMO 谷仓账号', `GC-DEMO-RET-${String(index + 1).padStart(3, '0')}`)]
  }
  return records
}
export const returnSession = reactive({ records: createReturnData() })
export function resetReturnSession() { returnSession.records = createReturnData() }
export function syncReturnList(records: ReturnRecord[], shopIds: string[], now = new Date().toISOString()): { status: 'success' | 'partial' | 'failed'; message: string; succeeded: number; failed: number; added: number } {
  const scope = returnShops.filter(shop => !shopIds.length || shopIds.includes(shop.value)); let succeeded = 0, failed = 0, added = 0
  for (const shop of scope) {
    if (shop.value === 'demo-read-failed') { failed++; continue }
    if (shop.value === 'demo-new-us' && !records.some(row => row.shopId === shop.value)) {
      const first = createReturnData()[0]!
      first.id = 'DEMO-RT-NEW-001'; first.shopId = shop.value; first.shopName = shop.label; first.orderNo = 'DEMO-NEW-ORDER-001'; first.buyerId = 'demo_new_buyer'; first.systemOrderNo = undefined; first.outbounds = null; first.orderProducts = null; first.detail!.files = []; first.detail!.orderAddress = null; records.push(first); added++
    }
    for (const row of records.filter(item => item.shopId === shop.value)) { const result = syncReturn(row, now); if (result.status === 'success') succeeded++; else failed++ }
  }
  const status = failed ? succeeded || added ? 'partial' : 'failed' : 'success'
  return { status, succeeded, failed, added, message: `已刷新 ${succeeded} 条申请，新增 ${added} 条${failed ? `，${failed} 项来源读取未完整成功` : ''}` }
}
