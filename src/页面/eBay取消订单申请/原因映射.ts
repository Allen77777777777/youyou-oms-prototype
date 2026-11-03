// eBay Post-Order CancelReasonEnum；废弃码仅用于识别历史返回。
// https://developer.ebay.com/Devzone/post-order/types/CancelReasonEnum.html
export const cancelReasonNames = Object.freeze({
  ADDRESS_ISSUES: '收货地址存在问题',
  BUYER_ASKED_CANCEL: '买家要求取消（卖家代为发起）',
  BUYER_CANCEL_OR_ADDRESS_ISSUE: '买家要求取消或地址问题（已废弃）',
  FOUND_CHEAPER_PRICE: '找到更低价格',
  ORDER_MISTAKE: '买家误下单',
  ORDER_UNPAID: '买家未按时付款',
  OTHER: '其他原因（已废弃）',
  OUT_OF_STOCK_OR_CANNOT_FULFILL: '缺货或无法履约',
  PRICE_TOO_HIGH: '价格过高（已废弃）',
  UNKNOWN: '原因未知',
  WONT_ARRIVE_IN_TIME: '未在预计时间内送达',
  WRONG_PAYMENT_METHOD: '付款方式选错',
  WRONG_SHIPPING_ADDRESS: '收货地址填写错误',
  WRONG_SHIPPING_METHOD: '配送方式选错',
} as const)

/** 只按来源码投影显示；缺值和未知新码不沿用旧中文、不推定取消结果。 */
export function cancelReasonLabel(code?: string | null): string {
  const key = code?.trim()
  if (!key) return '—'
  return Object.prototype.hasOwnProperty.call(cancelReasonNames, key)
    ? cancelReasonNames[key as keyof typeof cancelReasonNames]
    : `原因待核实（${key}）`
}
