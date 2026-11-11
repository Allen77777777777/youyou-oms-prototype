import { applyReturnTracking, parseReturnHistoryAttributes, type ReturnRecord } from './模型'

/** 评审用固定虚构来源字段；不反算真实平台金额或调用外部接口。 */
export function completeReturnFieldSamples(records: ReturnRecord[]): void {
  const itemPrices: Record<string, string> = { 'DEMO-RT-001': '44.90', 'DEMO-RT-002': '36.80', 'DEMO-RT-003': '29.50', 'DEMO-RT-004': '12.90', 'DEMO-RT-007': '44.90' }
  for (const row of records) {
    const detail = row.detail!
    row.reasonType = ['NO_LONGER_NEED_ITEM', 'ORDERED_WRONG_ITEM'].includes(row.reasonCode) ? 'REMORSE' : 'SNAD'
    detail.itemTitle = row.title
    detail.itemOnHold = false
    detail.summaryQuantity = row.quantity
    detail.fullQuantity = row.quantity
    detail.quantityConflict = false
    detail.itemPrice = itemPrices[row.id] ? { value: itemPrices[row.id]!, currency: row.currency } : null
    detail.transactionDate = '2026-10-10T03:15:00Z'
    detail.timeoutAt = row.state === 'CLOSED' ? null : '2026-11-20T08:00:00Z'
    detail.keepItemInfo = { value: row.keepItem ? true : null, source: row.keepItem ? 'state' : 'unknown', note: row.keepItem ? '平台当前状态为无需寄回' : '尚未取得当前商品安排结论' }
    detail.shippingLabelCost = row.tracking ? { totalAmount: { value: '4.20', currency: row.currency }, itemizedCosts: [{ costType: 'LABEL_COST', amount: { value: '3.50', currency: row.currency } }, { costType: 'INSURANCE', amount: { value: '0.50', currency: row.currency } }, { costType: 'SIGNATURE_CONFIRMATION_COST', amount: { value: '0.20', currency: row.currency } }] } : null
    for (const shipment of detail.shipments) {
      shipment.carrierUsed = shipment.carrierEnum
      shipment.minDeliveryEstimate = '2026-10-27T08:00:00Z'
      shipment.maxDeliveryEstimate = '2026-10-30T08:00:00Z'
      shipment.shippingMethod = 'Standard'
      shipment.shippedBy = 'BUYER'
      shipment.errorCode = ''
      shipment.labelId = `DEMO-LABEL-${shipment.shipmentId}`
      shipment.labelDate = '2026-10-24T08:00:00Z'
      shipment.labelAvailableUntilDate = '2026-11-15T08:00:00Z'
      shipment.labelPrintExpired = false
      shipment.labelVoidExpired = false
      shipment.trackingRead = { status: 'success', succeededAt: row.lastSyncedAt, attemptedAt: row.lastSyncedAt, error: '' }
    }
  }
  const first = records[0]!
  const rmaRow = records.find(row => row.id === 'DEMO-RT-010')!
  const purchasePrice = rmaRow.detail!.refund.items.find(item => item.refundFeeType === 'PURCHASE_PRICE')!
  rmaRow.detail!.refund.items = [{ ...purchasePrice, min: null, max: null, amountEditable: false, overwritableBySeller: false }]
  rmaRow.detail!.refund.itemsComplete = false
  first.detail!.itemPicture = `${import.meta.env.BASE_URL}退货申请商品示意.svg`
  first.detail!.itemPrice = { value: '44.90', currency: 'USD' }
  const returned = records[2]!
  Object.assign(returned.mock!.refundResult!, { actualTotal: { value: '29.50', currency: 'USD' }, netChargeAmount: { value: '29.50', currency: 'USD' }, fundings: [{ amount: { value: '29.50', currency: 'USD' }, at: '2026-10-30T08:00:00Z', fundingStatus: 'FUNDED', fundingSource: { type: 'AVAILABLE_FUNDS', brand: '', memo: '' } }] })
  returned.detail!.labelResponse = { labelId: 'DEMO-LABEL-003', labelURL: '', trackingNumber: 'DEMO-RETURN-003', labelData: 'DEMO RETURN LABEL\nDEMO-RETURN-003\nDEMO Returns · 200 Sample Avenue' }
  returned.detail!.labelRead = { status: 'success', succeededAt: returned.lastSyncedAt, attemptedAt: returned.lastSyncedAt, error: '' }
  for (const trackingNumber of ['DEMO-RETURN-003', 'DEMO-RETURN-003-B']) applyReturnTracking(returned, { carrierUsed: 'USPS', trackingNumber, trackingStatus: 'DELIVERED', scanHistory: [{ eventTime: { value: '2026-10-28T04:20:00Z' }, eventDesc: '承运商已送达退回地址', eventStatus: 'DELIVERED', eventCode: 'DEMO-DELIVERY', eventCity: 'Demo Return City', eventStateOrProvince: 'CA', eventPostalCode: '00000' }] }, { shopId: returned.shopId, returnId: returned.id, carrierUsed: 'USPS', trackingNumber }, returned.lastSyncedAt)
  returned.history[1]!.attributes = { keepOriginalItem: false, RMA: 'DEMO-RMA-003' }
  returned.history[2]!.attributes = { updatedTrackingNumber: 'DEMO-RETURN-003', sellerReturnAddress: { name: 'DEMO Returns', address: { addressLine1: '200 Sample Avenue', city: 'Demo Return City', stateOrProvince: 'CA', postalCode: '00000', country: 'US' } } }
  const caseRow = records[4]!
  caseRow.history[1]!.attributes = { keepOriginalItem: false, RMA: 'DEMO-RMA-005' }
  caseRow.history[2]!.attributes = { updatedTrackingNumber: 'DEMO-RETURN-005' }
  const closed = records[6]!, refund = closed.detail!.refund
  closed.detail!.buyerComment = 'I would like to return the cable organizer for a refund.'
  closed.history[0] = { at: closed.createdAt, author: 'BUYER', text: closed.detail!.buyerComment }
  refund.actualTotal = { value: '49.90', currency: 'USD' }
  refund.actualItems = [{ refundFeeType: 'PURCHASE_PRICE', amount: { value: '44.90', currency: 'USD' } }, { refundFeeType: 'ORIGINAL_SHIPPING', amount: { value: '5.00', currency: 'USD' } }]
  refund.actualItemsComplete = true
  refund.actualTotalMatches = true
  refund.integrityIssues = []
  refund.feeCreditAmount = { value: '1.50', currency: 'USD' }
  refund.netChargeAmount = { value: '354.29', currency: 'CNY', convertedFromValue: '49.90', convertedFromCurrency: 'USD', exchangeRate: '7.1' }
  refund.fundings = [{ amount: { value: '284.00', currency: 'CNY' }, at: '2026-10-25T04:20:00Z', fundingStatus: 'FUNDED', fundingSource: { type: 'AVAILABLE_FUNDS', brand: '', memo: '' } }, { amount: { value: '70.29', currency: 'CNY' }, at: '2026-10-25T04:20:02Z', fundingStatus: 'FUNDED', fundingSource: { type: 'CREDIT_CARD', brand: 'VISA', memo: '' } }]
  closed.history.push({ at: '2026-10-25T04:20:00Z', author: 'SELLER', activity: 'SELLER_ISSUE_REFUND', text: 'The refund has been issued.', attributes: { moneyMovementRef: { idref: 'DEMO-MOVE-007' } } })
  const offer = records[18]!
  offer.history.push({ at: '2026-10-29T03:00:00Z', author: 'SELLER', activity: 'SELLER_OFFER_PARTIAL_REFUND', text: 'Please review this offer.', attributes: { partialRefundAmount: { value: 10, currency: 'USD' }, refundDeductionType: { refundDeductionAmount: { value: 2, currency: 'USD' } } } })
  Object.assign(records[19]!.mock!.refundResult!, { actualTotal: { value: '49.90', currency: 'USD' }, netChargeAmount: { value: '45.00', currency: 'USD' }, feeCreditAmount: { value: '4.90', currency: 'USD' }, fundings: [{ amount: { value: '45.00', currency: 'USD' }, at: '2026-10-30T08:00:00Z', fundingStatus: 'FUNDED', fundingSource: { type: 'AVAILABLE_FUNDS', brand: '', memo: '' } }] })
  const restricted = records[21]!
  restricted.detail!.itemOnHold = true
  restricted.detail!.itemTitle = null
  restricted.detail!.itemPicture = null
  restricted.detail!.holdInfo = { ...restricted.detail!.holdInfo!, createdAt: '2026-10-29T04:00:00Z', until: '2026-11-06T04:00:00Z', referenceId: 'DEMO-HOLD-022', transactionId: 'DEMO-HOLD-TXN-022' }
  for (const row of records) for (const entry of row.history) if (entry.attributes) entry.parsedAttributes = parseReturnHistoryAttributes(entry.attributes)
}
