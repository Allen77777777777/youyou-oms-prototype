import { beforeEach, describe, expect, it } from 'vitest'
import { resetReturnSession, returnSession } from '../eBay退换货申请/数据'
import { syncReturnWithSales } from '../eBay退换货申请/售后联动'
import { resolveReturnBuyerReply } from '../eBay退换货申请/售后回执证据'
import { afterSaleActors, afterSaleRecords, activeAfterSaleActor } from './会话'
import { initializeAfterSaleDemo } from './演示数据'

beforeEach(() => { resetReturnSession(); afterSaleRecords.value = []; activeAfterSaleActor.value = afterSaleActors[0]! })
describe('历史报价独立来源证据回填', () => {
  it.each(['先建单后同步', '先同步后建单'])('%s都按原报价办理标识更新同一售后单', order => {
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-019')!
    if (order === '先建单后同步') initializeAfterSaleDemo()
    syncReturnWithSales(source)
    if (order === '先同步后建单') initializeAfterSaleDemo()
    const quote = afterSaleRecords.value.find(record => record.requestId === 'seed-after-sale:DEMO-RT-019')!
    expect(quote.executionResult).toBe('买家已接受报价，退款处理中')
    expect(source.afterSaleBuyerReplies).toMatchObject([{ requestId: quote.requestId, decision: 'accepted' }])
    expect(source.afterSaleRefundNo).toBe(quote.no)
    expect(source.submissionAttempts).toBeUndefined()
    expect(quote.actualAmount).toBeUndefined()
    const count = quote.logs!.length
    syncReturnWithSales(source); initializeAfterSaleDemo()
    expect(afterSaleRecords.value.filter(record => record.returnId === source.id)).toHaveLength(1)
    expect(quote.logs).toHaveLength(count)
  })
  it.each(['缺少本笔标识', '其他报价标识'])('历史报价回复%s不按最新指针回填', scenario => {
    initializeAfterSaleDemo()
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-019')!
    if (scenario === '缺少本笔标识') delete source.mock!.externalRequestId
    else source.mock!.externalRequestId = 'ANOTHER-OFFER'
    syncReturnWithSales(source)
    const quote = afterSaleRecords.value.find(record => record.returnId === source.id)!
    expect(quote.executionResult).toBe('已报价，等待买家决定')
    expect(source.afterSaleBuyerReplies).toBeUndefined()
    expect(source.afterSaleRefundNo).toBeUndefined()
  })
  it.each(['pending', 'unknown'] as const)('历史报价A不能取代%s的新报价B成为当前办理', outcome => {
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-019')!
    source.submissionAttempts = [{ id: 'NEW-QUOTE-B', businessId: 'quote-B', action: '提出部分退款', operator: '客服01', outcome, requestSnapshot: { method: 'POST', path: '/decide', body: { decision: 'OFFER_PARTIAL_REFUND' } } }]
    expect(resolveReturnBuyerReply(source)).toMatchObject({ requestId: 'seed-after-sale:DEMO-RT-019', current: false })
  })
  it('同一本笔标识对应冲突历史报价凭证时不归属回复', () => {
    initializeAfterSaleDemo()
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-019')!
    source.afterSaleOfferEvidence!.push({ ...source.afterSaleOfferEvidence![0]!, sourceEventId: 'OTHER-OFFER' })
    syncReturnWithSales(source)
    expect(source.afterSaleBuyerReplies).toBeUndefined()
    expect(afterSaleRecords.value.find(record => record.returnId === source.id)?.executionResult).toBe('已报价，等待买家决定')
  })
})
