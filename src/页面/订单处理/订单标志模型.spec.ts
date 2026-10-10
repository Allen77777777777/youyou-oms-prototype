import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 计算订单标志, 合并来源订单标志, type 订单标志证据 } from './订单标志模型'

function order() { return structuredClone(全渠道订单模拟数据[0]!) }
function evidence(changes: Partial<订单标志证据> = {}): 订单标志证据 {
  const source = order()
  return { systemOrderNo: source.systemOrderNo, storeId: source.storeId, platformOrderId: source.platformOrderId!, revision: 1, sourceVersion: 'flags-demo-v1', reliable: true, complete: true, ...changes }
}
const codes = (flags: ReturnType<typeof 计算订单标志>) => flags.map(flag => flag.code)

describe('订单标志的同源只读投影', () => {
  it('买家留言仅判断非空、不改正文、不读取系统备注或原因；未接入平台不套用', () => {
    const source = order(), before = JSON.stringify(source)
    expect(codes(计算订单标志(source))).toEqual(['BUYER_NOTE'])
    expect(JSON.stringify(source)).toBe(before)
    source.address.buyerMessage = ' \n\t '
    source.blockReason = '退款中、取消中、有站内信'
    source.tags = ['REFUND', 'CANCEL', 'EBAY_MESSAGE']
    expect(计算订单标志(source)).toEqual([])
    source.platformCode = 'Temu'
    source.address.buyerMessage = 'Please call me'
    expect(计算订单标志(source, [evidence({ paymentStatus: 'FULLY_REFUNDED' })])).toEqual([])
  })
  it('订单、店铺或稳定平台标识不匹配、不可靠及不完整证据均不串单', () => {
    for (const change of [{ systemOrderNo: 'other' }, { storeId: 'other' }, { platformOrderId: 'other' }, { reliable: false }, { complete: false }, { sourceVersion: '' }]) {
      expect(codes(计算订单标志(order(), [evidence({ paymentStatus: 'FULLY_REFUNDED', cancelState: 'CANCELED', ...change })]))).toEqual(['BUYER_NOTE'])
    }
  })
  it('退款与取消仅根据明确状态，多个退款按身份和最新可靠版本取事实', () => {
    const source = order()
    source.address.buyerMessage = undefined
    expect(计算订单标志(source, [evidence({ paymentStatus: 'PENDING', cancelState: 'UNKNOWN', refunds: [{ refundId: 'failed', refundStatus: 'FAILED', revision: 1, reliable: true }, { refundId: 'no-status', revision: 1, reliable: true }] })])).toEqual([])
    const facts = evidence({ paymentStatus: 'PARTIALLY_REFUNDED', cancelState: 'IN_PROGRESS', refunds: [
      { refundId: 'refund-a', refundStatus: 'PENDING', revision: 1, reliable: true },
      { refundId: 'refund-a', refundStatus: 'REFUNDED', revision: 2, reliable: true },
      { refundId: 'refund-b', refundStatus: 'PENDING', revision: 1, reliable: true },
    ] })
    const flags = 计算订单标志(source, [facts])
    expect(codes(flags)).toEqual(['REFUND', 'CANCEL'])
    expect(flags[0]?.reason).toContain('部分已退款')
    expect(flags[0]?.reason).toContain('已退款事实')
    expect(flags[0]?.reason).toContain('退款中事实')
    const latestFailed = evidence({ refunds: [{ refundId: 'refund-a', refundStatus: 'PENDING', revision: 1, reliable: true }, { refundId: 'refund-a', refundStatus: 'FAILED', revision: 2, reliable: true }] })
    expect(计算订单标志(source, [latestFailed])).toEqual([])
  })
  it('信需有效买家入站和明确三键关联；已读或已回复不移除、重复消息不重复标志', () => {
    const identity = evidence()
    const valid = { messageId: 'message-a', direction: 'BUYER_INBOUND' as const, valid: true, linkedOrder: identity, read: true, replied: true }
    const facts = evidence({ messages: [valid, { ...valid }, { ...valid, messageId: 'outbound', direction: 'SELLER_OUTBOUND' }, { ...valid, messageId: 'system', direction: 'SYSTEM' }, { ...valid, messageId: 'other-order', linkedOrder: { ...identity, platformOrderId: 'other' } }, { ...valid, messageId: 'invalid', valid: false }] })
    const flags = 计算订单标志(order(), [facts])
    expect(codes(flags)).toEqual(['EBAY_MESSAGE', 'BUYER_NOTE'])
    expect(flags[0]?.reason).toContain('1 条')
  })
  it('只读展示以最近完整可靠证据为准；旧版本不覆盖，冲突版本不任取首条', () => {
    const source = order()
    source.address.buyerMessage = undefined
    const old = evidence({ paymentStatus: 'FULLY_REFUNDED', cancelState: 'CANCELED' })
    const newest = evidence({ revision: 2, sourceVersion: 'flags-demo-v2', paymentStatus: 'PAID', cancelState: 'NONE_REQUESTED' })
    expect(计算订单标志(source, [newest, old])).toEqual([])
    expect(codes(计算订单标志(source, [old, { ...newest, complete: false }]))).toEqual(['REFUND', 'CANCEL'])
    expect(计算订单标志(source, [old, { ...old, cancelState: 'NONE_REQUESTED' }])).toEqual([])
  })
  it('多个商品或履约不推断合拆；只有显式成功且对应当前有效方案才展示', () => {
    const source = order()
    source.address.buyerMessage = undefined
    const fulfillment = source.fulfillmentOrders[0]!
    expect(计算订单标志(source)).toEqual([])
    const fact = { code: 'SPLIT' as const, operationId: 'split-demo-a', operationSuccess: true, active: true, fulfillmentOrderNo: fulfillment.fulfillmentOrderNo, sourceOrderNos: [source.systemOrderNo] }
    expect(codes(计算订单标志(source, [evidence({ fulfillmentFacts: [fact] })]))).toEqual(['SPLIT'])
    expect(计算订单标志(source, [evidence({ fulfillmentFacts: [{ ...fact, operationSuccess: false }] })])).toEqual([])
    expect(计算订单标志(source, [evidence({ fulfillmentFacts: [{ ...fact, fulfillmentOrderNo: 'other' }] })])).toEqual([])
    expect(计算订单标志(source, [evidence({ fulfillmentFacts: [{ ...fact, code: 'MERGED' }] })])).toEqual([])
  })
  it('多个来源只聚合展示、同标志一次且按固定顺序，保留全部命中来源', () => {
    const a = order(), b = order()
    b.systemOrderNo = 'OMS-DEMO-FLAG-B'
    b.platformOrderId = 'DEMO-FLAG-B'
    const aFlags = 计算订单标志(a, [evidence({ cancelState: 'IN_PROGRESS' })])
    const bFlags = 计算订单标志(b, [evidence({ systemOrderNo: b.systemOrderNo, platformOrderId: b.platformOrderId, paymentStatus: 'FULLY_REFUNDED' })])
    const before = JSON.stringify([aFlags, bFlags, a, b])
    const merged = 合并来源订单标志([bFlags, aFlags, aFlags])
    expect(codes(merged)).toEqual(['REFUND', 'CANCEL', 'BUYER_NOTE'])
    expect(merged.find(flag => flag.code === 'BUYER_NOTE')?.sourceOrderNos).toEqual([b.systemOrderNo, a.systemOrderNo])
    expect(JSON.stringify([aFlags, bFlags, a, b])).toBe(before)
  })
})
