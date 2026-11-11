import { describe, expect, it } from 'vitest'
import { createReturnData } from './数据'
import { applyReturnFull, applyReturnLabelResponse, applyReturnSummary, applyReturnTracking, buildReturnRequest, createReturnActionDraft, getReturnBlockedReason, parseReturnFull, parseReturnHistoryAttributes, parseReturnSummary, prepareReturnAction, readMoney, returnReasonText, submitPreparedReturnAction, syncReturn, type ReturnRecord } from './模型'

const now = '2026-11-03T02:00:00Z'
const amount = (value: number | string, currency = 'USD') => ({ value, currency })
const summary = (row: ReturnRecord, patch: Record<string, unknown> = {}) => ({ summary: {
  returnId: row.id, orderId: row.orderNo, buyerLoginName: row.buyerId, state: 'RETURN_REQUESTED', status: 'RETURN_REQUESTED', currentType: 'MONEY_BACK',
  creationInfo: { type: 'MONEY_BACK', reason: 'NO_LONGER_NEED_ITEM', reasonType: 'REMORSE', item: { itemId: row.detail!.itemId, transactionId: row.detail!.transactionId, returnQuantity: 1 } },
  sellerAvailableOptions: [{ actionType: 'SELLER_APPROVE_REQUEST' }, { actionType: 'SELLER_SEND_MESSAGE' }], ...patch,
} })
const item = (row: ReturnRecord, patch: Record<string, unknown> = {}) => ({ itemId: row.detail!.itemId, transactionId: row.detail!.transactionId, itemTitle: '来自当前申请的标题', returnQuantity: 1, ...patch })

describe('退货API遗漏字段补齐契约', () => {
  it('保留来源换汇元数据，写请求仍只用本次金额与币种', () => {
    const money = readMoney({ ...amount('10.00'), convertedFromValue: 9.27, convertedFromCurrency: 'EUR', exchangeRate: '1.07874865' })
    expect(money).toEqual({ value: '10.00', currency: 'USD', convertedFromValue: '9.27', convertedFromCurrency: 'EUR', exchangeRate: '1.07874865' })
    const row = createReturnData()[0]!, draft = createReturnActionDraft(row, 'partial')
    row.detail!.refund.partialOfferLimit = money; row.detail!.refund.partialOfferLimitVerified = true; draft.partialAmount = '5.00'
    expect(buildReturnRequest(row, 'partial', draft).request?.body.partialRefundAmount).toEqual({ value: 5, currency: 'USD' })
  })

  it('原因码变化同步中文，大类不冒充具体原因，未知原因保留原码', () => {
    const row = createReturnData()[0]!
    applyReturnSummary(row, summary(row), now)
    expect(row).toMatchObject({ reasonCode: 'NO_LONGER_NEED_ITEM', reasonType: 'REMORSE', reason: '不再需要商品' })
    const changed = summary(row); changed.summary.creationInfo.reason = 'FUTURE_REASON'
    applyReturnSummary(row, changed, now)
    expect(row.reason).toBe('原因待核实（FUTURE_REASON）')
    expect(returnReasonText('')).toBe('—')
    expect(returnReasonText('DOES_NOT_FIT')).toContain('车辆')
  })

  it('FULL更新申请商品资料；商品级隐藏清除旧标题图片，不改独立订单商品', () => {
    const row = createReturnData()[0]!, orderProducts = structuredClone(row.orderProducts)
    applyReturnFull(row, { detail: { itemDetail: item(row, { itemPrice: amount(13.45), transactionDate: { value: '2026-10-01T01:00:00Z' }, itemPicUrl: 'https://example.test/item.png', itemOnHold: false }) } }, now)
    expect(row.title).toBe('来自当前申请的标题'); expect(row.detail!.itemPrice?.value).toBe('13.45'); expect(row.detail!.transactionDate).toBe('2026-10-01T01:00:00Z')
    applyReturnFull(row, { detail: { returnContentOnHold: false, itemDetail: item(row, { itemTitle: '不应再展示', itemPicUrl: 'https://example.test/hidden.png', itemOnHold: true }) } }, now)
    expect(row.detail!.contentOnHold).toBe(false); expect(row.detail!.itemOnHold).toBe(true)
    expect(row.title).toBe(''); expect(row.detail!.itemTitle).toBeNull(); expect(row.detail!.itemPicture).toBeNull()
    expect(row.orderProducts).toEqual(orderProducts)
  })

  it('分别保存SUMMARY/FULL数量，冲突时保留两来源并阻断写入，来源修复才解除', () => {
    const row = createReturnData()[0]!
    applyReturnSummary(row, summary(row), now)
    applyReturnFull(row, { detail: { itemDetail: item(row, { returnQuantity: 2 }) } }, now)
    expect(row.detail).toMatchObject({ summaryQuantity: 1, fullQuantity: 2, quantityConflict: true })
    expect(row.quantity).toBeNull(); expect(getReturnBlockedReason(row, 'message', now)).toContain('数量不一致')
    applyReturnFull(row, { detail: { itemDetail: item(row, { returnQuantity: 1 }) } }, now)
    expect(row.quantity).toBe(1); expect(row.detail!.quantityConflict).toBe(false)
    expect(getReturnBlockedReason(row, 'message', now)).toBe('')
  })

  it('两来源都未给有效数量时不沿用旧数量，不将0或小数当有效申请量', () => {
    const row = createReturnData()[0]!
    const missing = summary(row); delete (missing.summary.creationInfo.item as { returnQuantity?: number }).returnQuantity
    applyReturnSummary(row, missing, now)
    applyReturnFull(row, { detail: { itemDetail: item(row, { returnQuantity: undefined }) } }, now)
    expect(row.quantity).toBeNull(); expect(getReturnBlockedReason(row, 'message', now)).toContain('数量尚未核实')
    expect(parseReturnSummary(summary(row, { creationInfo: { item: { returnQuantity: 1.5 } } })).quantity).toBeNull()
    expect(parseReturnFull({ detail: { itemDetail: { returnQuantity: 0 } } }).quantity).toBeNull()
  })

  it('当前诉求优先于初始诉求，未知当前值不兜底；缺失才沿用初始', () => {
    const row = createReturnData()[0]!
    row.detail!.currentType = 'FUTURE_TYPE'
    expect(getReturnBlockedReason(row, 'approve', now)).toContain('不支持')
    row.detail!.currentType = ''
    expect(getReturnBlockedReason(row, 'approve', now)).toBe('')
    expect(parseReturnSummary(summary(row)).escalation.eligible).toBeNull()
  })

  it('实际退款金额、手续费返还、净扣款与资金来源独立保存，不互相补值', () => {
    const parsed = parseReturnFull({ detail: { refundInfo: { actualRefundDetail: { refundStatus: 'SUCCESS', actualRefund: {
      totalAmount: amount(10), feeCreditAmount: amount(1.2), itemizedRefundDetail: [{ refundFeeType: 'PURCHASE_PRICE', refundAmount: amount(8) }, { refundFeeType: 'ORIGINAL_SHIPPING', refundAmount: amount(2) }],
    }, netChargeAmount: amount(8.5, 'EUR'), fundings: [{ amount: amount(8.5, 'EUR'), date: { value: now }, fundingStatus: 'SUCCESS', fundingSource: { type: 'CREDIT_CARD', brand: 'VISA', memo: '来源备注' } }] } } } })
    expect(parsed.actualTotal?.value).toBe('10.00'); expect(parsed.feeCreditAmount?.value).toBe('1.20'); expect(parsed.netChargeAmount).toEqual({ value: '8.50', currency: 'EUR' })
    expect(parsed.actualItemsComplete).toBe(true); expect(parsed.actualTotalMatches).toBe(true); expect(parsed.integrityIssues).toEqual([])
    expect(parsed.fundings[0]).toMatchObject({ at: now, fundingStatus: 'SUCCESS', fundingSource: { type: 'CREDIT_CARD', brand: 'VISA', memo: '来源备注' } })
    expect(parsed.outstanding).toBeNull()
  })

  it('坏分项或合计矛盾显示核查依据，不改写平台成功状态或来源实际总额', () => {
    const row = createReturnData()[2]!
    applyReturnFull(row, { detail: { itemDetail: item(row), refundInfo: { actualRefundDetail: { refundStatus: 'SUCCESS', actualRefund: { totalAmount: amount(10), itemizedRefundDetail: [{ refundFeeType: 'PURCHASE_PRICE', refundAmount: amount(8) }] } } } } }, now)
    expect(row.detail!.refund).toMatchObject({ status: 'SUCCESS', actualTotalMatches: false, actualTotal: { value: '10.00' } })
    expect(row.detail!.refund.integrityIssues?.join()).toContain('合计不一致')
    const invalid = parseReturnFull({ detail: { refundInfo: { actualRefundDetail: { actualRefund: { totalAmount: amount(10), itemizedRefundDetail: [{ refundFeeType: 'PURCHASE_PRICE', refundAmount: amount(10) }, { refundFeeType: 'OTHER', refundAmount: { value: 'bad', currency: 'USD' } }] } } } } })
    expect(invalid.actualItemsComplete).toBe(false); expect(invalid.actualTotalMatches).toBeNull(); expect(invalid.integrityIssues.length).toBeGreaterThan(0)
  })

  it('Hold与退货面单费用按真实子字段读取，不把预计解除当已解除', () => {
    const parsed = parseReturnFull({ detail: { holdInfo: { holdCreationDate: { value: now }, holdReleaseDate: { value: '2026-11-10T00:00:00Z' }, holdStatus: 'HOLD_CREATION_SUCCESS', holdReferenceId: 'HOLD-DEMO', holdTransactionId: 'HOLD-TXN-DEMO' }, returnShipmentInfo: { shippingLabelCost: { totalAmount: amount(4), itemizedReturnShippingCost: [{ returnShippingCostType: 'LABEL_COST', amount: amount(4) }] } } } })
    expect(parsed.holdInfo).toMatchObject({ createdAt: now, until: '2026-11-10T00:00:00Z', referenceId: 'HOLD-DEMO', transactionId: 'HOLD-TXN-DEMO' })
    expect(parsed.shippingLabelCost).toEqual({ totalAmount: { value: '4.00', currency: 'USD' }, itemizedCosts: [{ costType: 'LABEL_COST', amount: { value: '4.00', currency: 'USD' } }] })
  })

  it('运输预计区间、提供方、错误及面单状态分别保存，缺失布尔值保留未知', () => {
    const parsed = parseReturnFull({ detail: { returnShipmentInfo: { shipmentTracking: { shipmentId: 'DEMO-SHIP', carrierUsed: 'USPS', trackingNumber: 'DEMO-T', minDeliveryEstimate: { value: now }, maxDeliveryEstimate: { value: '2026-11-05T00:00:00Z' }, errorCode: 'SOURCE-ERROR', shippingMethod: 'SELLER_LABEL', shippedBy: 'BUYER', labelId: 'DEMO-LABEL', labelDate: { value: now }, labelAvailableUntilDate: '2026-11-10', labelPrintExpired: false, labelVoidExpired: true } } } })
    expect(parsed.shipments[0]).toMatchObject({ carrierUsed: 'USPS', minDeliveryEstimate: now, maxDeliveryEstimate: '2026-11-05T00:00:00Z', errorCode: 'SOURCE-ERROR', labelPrintExpired: false, labelVoidExpired: true, active: null, shippedBy: 'BUYER', labelId: 'DEMO-LABEL' })
    expect(parsed.shipments[0]!.actualDeliveryDate).toBeNull()
  })

  it('轨迹按店铺/Return/承运商/运单精确落入一条退回物流，拒绝响应串单', () => {
    const row = createReturnData()[2]!, before = structuredClone(row.detail!.shipments[1])
    const shipment = row.detail!.shipments[0]!, context = { shopId: row.shopId, returnId: row.id, carrierUsed: shipment.carrierUsed || shipment.carrierEnum, trackingNumber: shipment.trackingNumber }
    applyReturnTracking(row, { carrierUsed: context.carrierUsed, trackingNumber: context.trackingNumber, trackingStatus: 'DELIVERED', scanHistory: [{ eventTime: { value: now }, eventDesc: '来源签收', eventCode: 'DELIVERED', eventStatus: 'DELIVERED', eventCity: 'DEMO', eventPostalCode: '00000', eventStateOrProvince: 'CA' }] }, context, now)
    expect(shipment.trackingStatus).toBe('DELIVERED'); expect(shipment.scans[0]).toMatchObject({ at: now, description: '来源签收', eventCode: 'DELIVERED', location: 'DEMO, CA, 00000' })
    expect(row.detail!.shipments[1]).toEqual(before)
    expect(() => applyReturnTracking(row, { carrierUsed: 'OTHER', trackingNumber: context.trackingNumber }, context, now)).toThrow('响应承运商')
    expect(shipment.readStatus).toBe('failed'); expect(shipment.scans[0]!.description).toBe('来源签收')
    expect(shipment.trackingRead?.succeededAt).toBe(now)
    expect(() => applyReturnTracking(row, {}, { ...context, shopId: 'OTHER' }, now)).toThrow('上下文')
  })

  it('相同跟踪号的多条候选不取首条，FULL成功也不洗掉独立轨迹失败', () => {
    const row = createReturnData()[0]!
    const value = { shipmentId: 'DEMO-SHIP', carrierUsed: 'USPS', trackingNumber: 'DEMO-T' }
    applyReturnFull(row, { detail: { itemDetail: item(row), returnShipmentInfo: { shipmentTracking: value } } }, now)
    const context = { shopId: row.shopId, returnId: row.id, carrierUsed: 'USPS', trackingNumber: 'DEMO-T' }
    expect(() => applyReturnTracking(row, { carrierUsed: 'WRONG', trackingNumber: 'DEMO-T' }, context, now)).toThrow()
    applyReturnFull(row, { detail: { itemDetail: item(row), returnShipmentInfo: { shipmentTracking: value } } }, now)
    expect(row.detail!.shipments[0]!.readStatus).toBe('failed')
    row.detail!.shipments.push({ ...structuredClone(row.detail!.shipments[0]!), shipmentId: 'SECOND' })
    expect(() => applyReturnTracking(row, { carrierUsed: 'USPS', trackingNumber: 'DEMO-T' }, context, now)).toThrow('唯一匹配')
  })

  it('面单响应独立保存与回读失败，不虚构新物流、发布文件或平台阶段', () => {
    const row = createReturnData()[0]!, state = row.state, files = row.detail!.files.length, shipments = row.detail!.shipments.length
    const context = { shopId: row.shopId, returnId: row.id }, receipt = { labelId: 'LABEL-DEMO', labelData: '来源面单文字，不是base64', labelURL: 'https://example.test/label', trackingNumber: 'DEMO-LABEL-T' }
    applyReturnLabelResponse(row, receipt, context, now)
    expect(row.detail!.labelResponse).toEqual(receipt); expect(row.detail!.labelRead?.status).toBe('success')
    expect(row.state).toBe(state); expect(row.detail!.files).toHaveLength(files); expect(row.detail!.shipments).toHaveLength(shipments)
    expect(() => applyReturnLabelResponse(row, { errors: [{ errorId: 'DEMO' }] }, context, now)).toThrow('面单响应')
    expect(row.detail!.labelRead).toMatchObject({ status: 'failed', succeededAt: now }); expect(row.detail!.labelResponse).toEqual(receipt)
  })

  it('历史属性保留原值并结构化，不把报价、扣减或交易引用当已退款', () => {
    const attrs = { keepOriginalItem: true, partialRefundAmount: amount(5), refundDeductionType: { refundDeductionAmount: amount(1), refundDeductionPercentage: 10 }, RMA: 'RMA-DEMO', moneyMovementRef: { idref: 'MOVEMENT-DEMO' }, updatedTrackingNumber: 'DEMO-RETURN', sellerReturnAddress: { name: 'DEMO', address: { addressLine1: 'EXAMPLE' } }, futureField: '保留' }
    const parsed = parseReturnHistoryAttributes(attrs)
    expect(parsed).toMatchObject({ keepOriginalItem: true, partialRefundAmount: { value: '5.00' }, refundDeductionType: { amount: { value: '1.00' }, percentage: 10 }, rmaNumber: 'RMA-DEMO', moneyMovementRef: 'MOVEMENT-DEMO' })
    const full = parseReturnFull({ detail: { responseHistory: [{ activity: 'SELLER_APPROVE_REQUEST', author: 'SELLER', creationDate: { value: now }, notes: '允许保留', toState: 'ITEM_KEPT', attributes: attrs }] } })
    expect(full.history[0]!.attributes).toEqual(attrs); expect(full.history[0]!.parsedAttributes).toEqual(parsed); expect(full.actualTotal).toBeNull()
  })

  it('免退事实只接当前平台阶段或适用最新明确历史，矛盾则未知且不授予资格', () => {
    const row = createReturnData()[0]!
    applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [{ activity: 'BUYER_SEND_MESSAGE', author: 'BUYER', creationDate: { value: now }, toState: 'ITEM_KEPT', attributes: { keepOriginalItem: true } }] } }, now)
    expect(row.detail!.keepItemInfo?.value).toBeNull(); expect(row.keepItem).toBe(false)
    applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [{ activity: 'SELLER_APPROVE_REQUEST', author: 'SELLER', creationDate: { value: now }, toState: 'ITEM_KEPT', attributes: { keepOriginalItem: true } }] } }, now)
    expect(row.detail!.keepItemInfo).toMatchObject({ value: true, source: 'history' })
    row.options = []; expect(getReturnBlockedReason(row, 'refund', now)).toContain('不支持此操作')
    row.state = 'ITEM_SHIPPED'
    applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [{ activity: 'SELLER_APPROVE_REQUEST', author: 'SELLER', creationDate: { value: now }, toState: 'ITEM_KEPT', attributes: { keepOriginalItem: true } }] } }, now)
    expect(row.detail!.keepItemInfo).toMatchObject({ value: null, source: 'conflict' }); expect(row.keepItem).toBe(false)
  })

  it('本地演示回查按已冻结请求记录结构化商品安排；选择与提交阶段不提前变事实', () => {
    const row = createReturnData()[0]!, draft = createReturnActionDraft(row, 'approve'); draft.keepOriginalItem = true
    const prepared = prepareReturnAction(row, 'approve', draft, now).prepared!
    expect(submitPreparedReturnAction(row, prepared, now)).toBe(''); expect(row.keepItem).toBe(false)
    syncReturn(row, now)
    expect(row.detail!.keepItemInfo).toMatchObject({ value: true, source: 'state' })
    expect(row.history[row.history.length - 1]).toMatchObject({ author: 'SELLER', fromState: 'RETURN_REQUESTED', toState: 'ITEM_KEPT', attributes: { keepOriginalItem: true }, parsedAttributes: { keepOriginalItem: true } })
  })
  it('免退历史按可信绝对时刻选择最新项，无偏移或无效日期不制造安排事实', () => {
    const row = createReturnData()[0]!
    const history = (at: string, keepOriginalItem: boolean) => ({ activity: 'SELLER_APPROVE_REQUEST', author: 'SELLER', creationDate: { value: at },
      toState: keepOriginalItem ? 'ITEM_KEPT' : 'ITEM_READY_TO_SHIP', attributes: { keepOriginalItem } })
    for (const value of ['2026-11-06T14:30:00', '2026-11-06', '2026-11-06T14:30:00-00:00', '2026-02-30T14:30:00Z']) {
      applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [history(value, true)] } }, now)
      expect(row.detail!.keepItemInfo).toMatchObject({ value: null, source: 'unknown' })
    }
    applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [history('2026-11-06T14:30:00+08:00', true), history('2026-11-06T07:00:00Z', false)] } }, now)
    expect(row.detail!.keepItemInfo).toMatchObject({ value: false, source: 'history' })
    row.state = 'ITEM_KEPT'
    applyReturnFull(row, { detail: { itemDetail: item(row), responseHistory: [history('invalid', false)] } }, now)
    expect(row.detail!.keepItemInfo).toMatchObject({ value: true, source: 'state' })
  })

  it('资金演示回执缺失新增字段时清除旧值，不从本次草稿或预计退款补齐', () => {
    const row = createReturnData()[2]!, refund = row.detail!.refund
    refund.actualTotal = { value: '999.00', currency: 'USD' }; refund.netChargeAmount = { value: '888.00', currency: 'EUR' }; refund.feeCreditAmount = { value: '77.00', currency: 'USD' }; refund.fundings = [{ amount: { value: '888.00', currency: 'EUR' }, at: now, fundingStatus: 'SUCCESS', fundingSource: null }]
    row.mock = { refundResult: { status: 'SUCCESS', sellerActual: { value: '5.00', currency: 'USD' }, buyerActual: { value: '5.00', currency: 'USD' }, actualItems: [{ refundFeeType: 'PURCHASE_PRICE', amount: { value: '5.00', currency: 'USD' } }], issuedAt: now, initiator: 'SELLER_INITIATED', state: 'CLOSED', returnStatus: 'CLOSED' } }
    row.pendingRequest = { method: 'POST', path: '/post-order/v2/return/DEMO/issue_refund', body: {} }; refund.status = 'PENDING'
    syncReturn(row, now)
    expect(refund.status).toBe('SUCCESS'); expect(refund.actualTotal).toBeNull(); expect(refund.netChargeAmount).toBeNull(); expect(refund.feeCreditAmount).toBeNull(); expect(refund.fundings).toEqual([])
    expect(refund.actualItems[0]!.amount.value).toBe('5.00')
  })
})
