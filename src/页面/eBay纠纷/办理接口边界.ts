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

const hubDomains: Record<string, string> = {
  英国: 'www.ebay.co.uk', 美国: 'www.ebay.com', 德国: 'www.ebay.de', 澳大利亚: 'www.ebay.com.au',
  法国: 'www.ebay.fr', 意大利: 'www.ebay.it', 西班牙: 'www.ebay.es', 加拿大: 'www.ebay.ca',
  GB: 'www.ebay.co.uk', US: 'www.ebay.com', DE: 'www.ebay.de', AU: 'www.ebay.com.au',
  FR: 'www.ebay.fr', IT: 'www.ebay.it', ES: 'www.ebay.es', CA: 'www.ebay.ca',
}
export function sellerHubFor(site: string): string | undefined {
  const domain = hubDomains[site.trim()]
  return domain ? `https://${domain}/sh/resolutions` : undefined
}

/** 仅导航已核实的本店原订单，不生成标发单、不修改履约或争议证据。 */
export function disputeShippingLocation(row: DisputeRecord, orders: readonly 全渠道订单[]) {
  if (row.kind !== 'PAYMENT_DISPUTE' || !row.payment?.details?.requests.some(req => req.type === 'PROOF_OF_DELIVERY')) return
  const order = resolveDisputeOrder(row, orders)
  if (!order) return
  return { path: '/oms/self-fulfillment/shipping-confirmation', query: { systemOrderNo: order.systemOrderNo } }
}
