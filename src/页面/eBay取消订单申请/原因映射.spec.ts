import { describe, expect, it } from 'vitest'
import { cancelReasonLabel, cancelReasonNames } from './原因映射'

const expectedReasons = {
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
}

describe('eBay取消原因中文映射', () => {
  it('完整覆盖14个官方原因码，包括3个废弃历史值', () => {
    expect(cancelReasonNames).toEqual(expectedReasons)
    for (const [code, label] of Object.entries(expectedReasons)) expect(cancelReasonLabel(code)).toBe(label)
  })

  it('平台UNKNOWN与没有返回原因分开显示', () => {
    expect(cancelReasonLabel('UNKNOWN')).toBe('原因未知')
    for (const code of [undefined, null, '', ' \t\n ']) expect(cancelReasonLabel(code)).toBe('—')
  })

  it('只为展示去首尾空白，不改写来源原码', () => {
    const record = { reasonCode: '  WRONG_PAYMENT_METHOD  ' }
    expect(cancelReasonLabel(record.reasonCode)).toBe('付款方式选错')
    expect(record.reasonCode).toBe('  WRONG_PAYMENT_METHOD  ')
  })

  it('未知新码保留可核查原值，不误用其他原因或对象继承属性', () => {
    for (const code of ['NEW_CANCEL_REASON', 'order_mistake', 'toString', '__proto__']) {
      expect(cancelReasonLabel(code)).toBe(`原因待核实（${code}）`)
    }
    expect(cancelReasonLabel('  NEW_CANCEL_REASON  ')).toBe('原因待核实（NEW_CANCEL_REASON）')
  })
})
