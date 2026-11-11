import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { disputePackageScope, resolveDisputeOrder } from './客服关联'
import type { DisputeRecord, InquiryDetails } from './类型'

export interface OriginalTracking {
  tracking: string
  carrier?: string
  carrierCode?: string
  unsupportedCarrierName?: string
}
function usable(value?: string): value is string {
  const text = value?.trim()
  return Boolean(text && !['-', '—', '待核实', '未知'].includes(text))
}

function confirmedCarrier(inquiry: InquiryDetails, tracking: string): string | undefined {
  const sources = [
    ...(inquiry.trackings ?? []),
    { tracking: inquiry.tracking, carrier: inquiry.carrier },
    ...(inquiry.providedInfo ?? []).filter(info => info.kind === 'TRACKING'),
  ]
  const names = new Set(sources.filter(info => info.tracking?.trim() === tracking)
    .map(info => info.carrier?.trim()).filter(usable))
  if (names.size === 1) return [...names][0]
}

function shippedDisputedItems(pack: 履约单摘要, order: 全渠道订单, lineIds: Set<string>): boolean {
  if (!pack.isActive || pack.status !== '已发货' || !Number.isFinite(pack.plannedQuantity) ||
      !Number.isFinite(pack.shippedQuantity) || pack.shippedQuantity <= 0 || pack.shippedQuantity > pack.plannedQuantity) return false
  if (pack.shippedQuantity === pack.plannedQuantity) return true
  // 部分出库仅有整包实发量时，包内全为本案行才能证明实发涉及本案商品。
  const lines = pack.items?.filter(item => item.quantity > 0)
  return !!lines?.length && lines.every(item => item.orderNo === order.systemOrderNo && lineIds.has(item.externalLineId))
}

export function originalTrackingOptions(row: DisputeRecord, orders: readonly 全渠道订单[]) {
  const inquiry = row.inquiry
  const order = resolveDisputeOrder(row, orders)
  if (row.kind !== 'INR_REQUEST' || !inquiry || !order) return []
  const lineIds = new Set(inquiry.lineItems?.map(line => line.orderLineId))
  return order.fulfillmentOrders.flatMap(pack => {
    const tracking = pack.trackingNumber?.trim()
    if (!usable(tracking) || !pack.fulfillmentOrderNo?.trim() || !shippedDisputedItems(pack, order, lineIds) ||
        disputePackageScope(row, order, pack) !== '含本纠纷订单行') return []
    // 包裹编号或跟踪号在当前有效履约中有冲突时，交客服另行核实。
    if (order.fulfillmentOrders.filter(other => other.isActive &&
        (other.fulfillmentOrderNo === pack.fulfillmentOrderNo || other.trackingNumber?.trim() === tracking)).length !== 1) return []
    const carrier = confirmedCarrier(inquiry, tracking)
    const matches = (inquiry.trackings ?? []).filter(info => info.tracking.trim() === tracking && info.carrierCode?.trim())
    const codes = new Set(matches.map(info => info.carrierCode!.trim()))
    const code = carrier && codes.size === 1 ? [...codes][0] : undefined
    const otherNames = new Set(matches.filter(info => info.carrierCode === 'UNSUPPORTED').map(info => info.unsupportedCarrierName?.trim()).filter(usable))
    return [{ fulfillmentNo: pack.fulfillmentOrderNo, warehouse: pack.route.warehouse,
      tracking, carrier, ...(code ? { carrierCode: code } : {}),
      ...(code === 'UNSUPPORTED' && otherNames.size === 1 ? { unsupportedCarrierName: [...otherNames][0] } : {}) }]
  })
}
