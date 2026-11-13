import type { ActionDraft, DisputeRecord, InquiryTracking } from './类型'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { resolveDisputeOrder } from './客服关联'

/** 承运商展示名称和请求代码分别保存，不从任意名称猜测平台代码。 */
export function normalizedInquiryTrackings(draft: ActionDraft): InquiryTracking[] {
  const entries = draft.trackings ?? [{ carrier: draft.carrier || '', tracking: draft.tracking || '' }]
  return entries.map(entry => {
    const result = { ...entry, carrier: entry.carrier.trim(), tracking: entry.tracking.trim() }
    if (entry.carrierCode !== undefined) result.carrierCode = entry.carrierCode.trim()
    if (entry.unsupportedCarrierName !== undefined) result.unsupportedCarrierName = entry.unsupportedCarrierName.trim()
    if (result.carrierCode === 'UNSUPPORTED') result.carrier = result.unsupportedCarrierName || ''
    return result
  })
}

/** 仅导航已核实的本店原订单，不生成标发单、不修改履约或争议证据。 */
export function disputeShippingLocation(row: DisputeRecord, orders: readonly 全渠道订单[]) {
  if (row.kind !== 'PAYMENT_DISPUTE' || !row.payment?.details?.requests.some(req => req.type === 'PROOF_OF_DELIVERY')) return
  const order = resolveDisputeOrder(row, orders)
  if (!order) return
  return { path: '/oms/self-fulfillment/shipping-confirmation', query: { systemOrderNo: order.systemOrderNo } }
}
