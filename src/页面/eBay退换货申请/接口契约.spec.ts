import { describe, expect, it } from 'vitest'
import { createReturnData } from './数据'
import { apiMoney, applyReturnFull, applyReturnSummary, buildReturnRequest, createReturnActionDraft, getReturnBlockedReason, parseMoney, parseReturnFull, parseReturnSummary, safePlatformUrl } from './模型'

describe('Post-Order退货请求和读取合同', () => {
  it('按最小货币单位合计，0.10+0.20准确构造0.30，拒绝指数及未知精度', () => {
    const row = createReturnData()[2]!
    row.detail!.refund.items = [{ refundFeeType: 'PURCHASE_PRICE', label: '商品价款', estimated: '0.10', min: '0.00', max: '1.00', currency: 'USD', optional: false }, { refundFeeType: 'ORIGINAL_SHIPPING', label: '原运费', estimated: '0.20', min: '0.00', max: '1.00', currency: 'USD', optional: false }]
    const result = buildReturnRequest(row, 'refund', createReturnActionDraft(row, 'refund'))
    expect(result.error).toBe(''); expect(result.request?.body.refundDetail).toMatchObject({ totalAmount: { value: 0.3, currency: 'USD' } })
    expect(parseMoney('1e2', 'USD')).toBeNull(); expect(parseMoney('1.001', 'USD')).toBeNull(); expect(parseMoney('10.1', 'JPY')).toBeNull(); expect(apiMoney('1', 'FUTURE')).toBeNull()
  })
  it('退款总额来自本次选中费用，optional默认不选，预计汇总不参与请求', () => {
    const row = createReturnData()[0]!, draft = createReturnActionDraft(row, 'refund')
    row.estimatedRefund = 9999; row.detail!.refund.sellerEstimated = { value: '9999.00', currency: 'USD' }
    expect(draft.refundItems.filter(item => item.selected)).toHaveLength(2)
    const body = buildReturnRequest(row, 'refund', draft).request!.body
    expect(body.refundDetail).toMatchObject({ totalAmount: { value: 49.9, currency: 'USD' } }); expect(body).not.toHaveProperty('relistItem')
    draft.refundItems[0]!.value = '0.01'; expect(buildReturnRequest(row, 'refund', draft).error).toContain('上下限')
  })
  it('decide参数与留言/收货分开，留言不带附件、keepOriginalItem或退款参数', () => {
    const row = createReturnData()[0]!, draft = createReturnActionDraft(row, 'partial')
    draft.text = 'Offer'; draft.partialAmount = '10.00'; draft.keepOriginalItem = true
    expect(buildReturnRequest(row, 'partial', draft).request!.body).toEqual({ comments: { content: 'Offer' }, decision: 'OFFER_PARTIAL_REFUND', partialRefundAmount: { value: 10, currency: 'USD' }, keepOriginalItem: true })
    expect(buildReturnRequest(row, 'message', draft).request!.body).toEqual({ message: { content: 'Offer' } })
    expect(buildReturnRequest(row, 'receive', draft).request!.path).toMatch(/mark_as_received$/)
    draft.rmaNumber = 'DEMO-RMA'; expect(buildReturnRequest(row, 'provideRma', draft).request!.body).toMatchObject({ decision: 'PROVIDE_RMA', RMANumber: 'DEMO-RMA', rMAProvided: true })
  })
  it('面单三分支按真实字段验证，不使用旧labelId与猜测端点', () => {
    const row = createReturnData()[10]!, draft = createReturnActionDraft(row, 'label')
    expect(buildReturnRequest(row, 'label', draft).error).toContain('上传')
    draft.label.labelAction = 'NO_LABEL'; expect(buildReturnRequest(row, 'label', draft).error).toContain('原因')
    draft.label.noLabelReason = 'REIMBURSE'; expect(buildReturnRequest(row, 'label', draft).request!.body).toEqual({ labelAction: 'NO_LABEL', noLabelReason: 'REIMBURSE' })
    draft.label.labelAction = 'MARK_AS_SENT'; draft.label.labelSentDate = '2026-10-29T06:00:00Z'; expect(buildReturnRequest(row, 'label', draft).request!.body).toMatchObject({ forwardShippingLabelProvided: true, labelSentDate: { value: '2026-10-29T06:00:00.000Z' } })
    draft.label.trackingNumber = 'DEMO-TRACK'; expect(buildReturnRequest(row, 'label', draft).error).toContain('承运商')
  })
  it('SUMMARY与FULL包装独立，状态/待办来自摘要，FULL不会抹掉摘要', () => {
    const row = createReturnData()[0]!
    const summary = { summary: { returnId: row.id, orderId: row.orderNo, buyerLoginName: row.buyerId, state: 'PARTIAL_REFUND_REQUESTED', status: 'PARTIAL_REFUND_REQUESTED', currentType: 'MONEY_BACK', creationInfo: { type: 'MONEY_BACK', comments: { content: 'Buyer comment' }, item: { itemId: row.detail!.itemId, transactionId: row.detail!.transactionId, returnQuantity: 1 } }, buyerResponseDue: { activityDue: 'BUYER_ACCEPTS_PARTIAL_REFUND', respondByDate: { value: '2026-11-10T00:00:00Z' } }, sellerAvailableOptions: [{ actionType: 'SELLER_SEND_MESSAGE' }] } }
    applyReturnSummary(row, summary); expect(row.deadline).toBeNull(); expect(row.detail!.buyerDue?.activity).toBe('BUYER_ACCEPTS_PARTIAL_REFUND')
    applyReturnFull(row, { detail: { marketplaceId: 'EBAY_US', buyerAddress: { name: 'Buyer', address: { addressLine1: 'Street A', country: 'US' } } } })
    expect(row.state).toBe('PARTIAL_REFUND_REQUESTED'); expect(row.options).toEqual(['SELLER_SEND_MESSAGE']); expect(row.detail!.buyerAddress?.addressLine1).toBe('Street A')
    expect(() => parseReturnSummary({ detail: {} })).toThrow('SUMMARY'); expect(() => parseReturnFull({ summary: {} })).toThrow('FULL')
  })
  it('从上传切换NO_LABEL时不提交隐藏运单或旧文件，残留不完整承运商不阻断', () => {
    const row = createReturnData()[10]!, draft = createReturnActionDraft(row, 'label')
    draft.label.fileId = 'OLD-FILE'; draft.label.trackingNumber = 'OLD-TRACKING'; draft.label.carrierEnum = ''; draft.label.labelSentDate = '2026-10-29T06:00:00Z'
    draft.label.labelAction = 'NO_LABEL'; draft.label.noLabelReason = 'WORK_WITH_BUYER'
    const result = buildReturnRequest(row, 'label', draft)
    expect(result.error).toBe(''); expect(result.request?.body).toEqual({ labelAction: 'NO_LABEL', noLabelReason: 'WORK_WITH_BUYER' })
    draft.label.carrierEnum = 'USPS'; expect(buildReturnRequest(row, 'label', draft).request?.body).toEqual(result.request?.body)
  })
  it('不完整退款分项不能静默丢弃后退款；报价额度没有根据预计字段自动产生', () => {
    const row = createReturnData()[2]!, money = { value: 10, currency: 'USD' }
    applyReturnFull(row, { detail: { refundInfo: { estimatedRefundDetail: { itemizedRefundDetails: [{ refundFeeType: 'PURCHASE_PRICE', estimatedAmount: money, minAmount: money, maxAmount: money }, { refundFeeType: 'ORIGINAL_SHIPPING', estimatedAmount: money }] } } } })
    expect(row.detail!.refund.items).toHaveLength(1); expect(row.detail!.refund.itemsComplete).toBe(false)
    expect(getReturnBlockedReason(row, 'refund')).toContain('金额尚未确认')
    const parsed = parseReturnSummary({ summary: { returnId: 'DEMO', sellerTotalRefund: { estimatedRefundAmount: money } } })
    expect(parsed).not.toHaveProperty('partialOfferLimit')
  })
  it('hold与关闭字段不猜来源，图片文件严格按提交方，历史保留活动', () => {
    const parsed = parseReturnFull({ detail: { returnContentOnHold: true, holdInfo: { holdStatus: 'ON_HOLD', holdReleaseDate: { value: '2026-11-01T00:00:00Z' } }, closeInfo: { returnCloseReason: 'REFUNDED', returnCloseDate: { value: '2026-10-30T00:00:00Z' } }, files: [{ fileId: 'FILE', submitter: 'EBAY', fileStatus: 'PUBLISHED', filePurpose: 'LABEL_RELATED' }], responseHistory: [{ activity: 'EBAY_RULE_AUTO_APPROVE', author: 'EBAY', creationDate: { value: '2026-10-29T00:00:00Z' }, notes: { content: 'Automatically approved' } }] } })
    expect(parsed.holdInfo?.until).toBe('2026-11-01T00:00:00Z'); expect(parsed.holdInfo?.reason).toBe(''); expect(parsed.files[0]?.submitter).toBe('EBAY'); expect(parsed.history[0]?.activity).toBe('EBAY_RULE_AUTO_APPROVE')
  })
  it('平台链接只能使用来源可信HTTPS eBay域，不造缺失入口', () => {
    expect(safePlatformUrl(undefined)).toBeNull(); expect(safePlatformUrl('javascript:alert(1)')).toBeNull(); expect(safePlatformUrl('https://ebay.com.bad.example/')).toBeNull(); expect(safePlatformUrl('https://www.ebay.com/')).toBe('https://www.ebay.com/')
  })
  it('资金交易区分请求额与实际额，不将多笔交易合计成退款总额', () => {
    const row = createReturnData()[0]!
    applyReturnFull(row, { detail: { moneyMovementInfo: [{ externalPaymentId: 'EXTERNAL-DEMO', moneyMovementType: 'AUTO_REFUND', status: 'PENDING', creationDate: { value: '2026-10-30T00:00:00Z' }, requestedAmount: { value: 12, currency: 'USD' } }], payoutRecoupInfo: { amountToRecoup: { value: 9, currency: 'USD' }, payoutId: 123 }, refundInfo: { provisionalRefund: { refundProvided: true, refundReversed: false } } } })
    expect(row.detail!.refund.moneyMovements[0]).toMatchObject({ id: 'EXTERNAL-DEMO', type: 'AUTO_REFUND', status: 'PENDING', requestedAmount: { value: '12.00', currency: 'USD' }, amount: null, actualAmount: null })
    expect(row.detail!.refund.recoup).toContain('USD 9.00'); expect(row.detail!.refund.provisional).toContain('已发放'); expect(row.actualRefund).toBeNull()
  })
  it('SUMMARY与FULL交易行冲突拒绝覆盖，失败后禁止处理；匹配来源可合并', () => {
    const row = createReturnData()[0]!, itemId = row.detail!.itemId
    expect(() => applyReturnFull(row, { detail: { itemDetail: { itemId: 'OTHER-ITEM' } } })).toThrow('交易身份冲突')
    expect(row.detail!.itemId).toBe(itemId); expect(row.eligibilityKnown).toBe(false); expect(row.detail!.readStatus.detail.status).toBe('failed')
    const second = createReturnData()[0]!
    expect(() => applyReturnSummary(second, { summary: { returnId: second.id, orderId: second.orderNo, creationInfo: { item: { itemId, transactionId: 'OTHER-TXN' } } } })).toThrow('交易身份冲突')
    const third = createReturnData()[0]!
    applyReturnFull(third, { detail: { itemDetail: { itemId, transactionId: third.detail!.transactionId } } }, '2026-10-30T00:00:00Z', { shopId: third.shopId, returnId: third.id })
    expect(third.detail!.itemId).toBe(itemId)
    expect(() => applyReturnFull(third, { detail: { itemDetail: { itemId } } }, '2026-10-30T00:00:00Z', { shopId: 'OTHER-SHOP', returnId: third.id })).toThrow('请求上下文')
  })
})
