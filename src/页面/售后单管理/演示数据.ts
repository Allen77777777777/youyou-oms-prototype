import { returnSession } from '../eBay退换货申请/数据'
import { initializeReturnDemoContext } from '../eBay退换货申请/关联资料'
import { resolveReturnItem, resolveReturnOrder } from '../eBay退换货申请/关联导航'
import { 创建手工订单草稿, 手工订单路由 } from '../手工订单/模型'
import { 共享订单 } from '../订单处理/演示会话'
import { 路由仓库键 } from '../订单处理/仓库物流选择模型'
import { afterSaleActors, afterSaleRecords, createAfterSale, createPlatformAfterSale, updateAfterSaleResult, type AfterSaleInput, type AfterSaleKind, type AfterSaleRecord } from './会话'

function dateHistoricalSample(record: AfterSaleRecord, at: string) {
  const day = new Date(new Date(at).valueOf() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  record.createdAt = at
  record.no = record.no.replace(/^SH-\d{8}-/, `SH-${day}-`)
}

/** 同一申请可以有多份独立处置。初始化仅载入已发生的虚构样例。 */
export function initializeAfterSaleDemo(): void {
  initializeReturnDemoContext()
  const examples: [string, AfterSaleKind, string, string][] = [
    ['DEMO-RT-007', '全额退款', '系统售后补录', '退款成功'],
    ['DEMO-RT-019', '部分退款', '提出部分退款报价', '已报价，等待买家决定'],
    ['DEMO-RT-002', '退货', '接受退货 · 买家寄回', '买家已寄回'],
    ['DEMO-RT-003', '重发', '重发', '等待重发审核'],
  ]
  for (const [returnId, kind, actionLabel, resultText] of examples) {
    const source = returnSession.records.find(r => r.id === returnId)
    if (!source || !source.quantity) continue
    const requestId = 'seed-after-sale:' + returnId
    const existing = afterSaleRecords.value.find(r => r.requestId === requestId && r.shopId === source.shopId && r.returnId === source.id)
    if (existing) {
      if (kind === '部分退款' && !source.afterSaleOfferNo) source.afterSaleOfferNo = existing.no
      continue
    }
    const order = resolveReturnOrder(source, 共享订单.value)
    const line = resolveReturnItem(source, 共享订单.value)
    const platformLine = source.detail?.itemId && source.detail.transactionId ? JSON.stringify([source.detail.itemId, source.detail.transactionId]) : ''
    if (!line?.externalLineId && !platformLine) continue
    const input: AfterSaleInput = {
      requestId, kind, actionLabel, shopId: source.shopId, shopName: source.shopName,
      orderNo: source.orderNo, returnId, systemOrderNo: order?.systemOrderNo, platformReason: source.reason,
      items: [{ lineId: line?.externalLineId || platformLine, sku: line?.systemSku, title: source.title, quantity: source.quantity,
        reason: ({ '重发': '质量问题', '退货': '无理由退货', '部分退款': '退差价', '全额退款': '平台退款' })[kind] }],
    }
    if (kind === '重发') {
      // 此历史样例已经另行核实收件资料及渠道；新提交的重发由审核人核对、补齐。
      const route = 手工订单路由.value.find(r => r.shippingChannelId === 'DEMO-CF-CHANNEL-WYT')
      if (!order || !line?.systemSku || !route) continue
      const draft = 创建手工订单草稿()
      Object.assign(draft, { scenario: '售后补寄', originalOrderNo: order.systemOrderNo, reason: '与买家协商后重发原商品', storeId: source.shopId,
        warehouse: 路由仓库键(route), channel: route.shippingChannelCode, items: [{ systemSku: line.systemSku, quantity: source.quantity }],
        address: { fullName: '收件人 A', countryCode: 'US', stateProvince: 'CA', city: 'Example City', addressLine1: '100 Example Avenue', postalCode: '90000', telephone: '000-000-0000' } })
      input.reshipDraft = draft
    }
    if (kind === '部分退款') input.amount = { value: '10.00', currency: source.currency }
    const refund = source.detail?.refund
    const actual = kind === '全额退款' && refund?.status === 'SUCCESS' && refund.actualTotalMatches === true && !refund.integrityIssues?.length ? refund.actualTotal : null
    const created = kind === '全额退款' ? createPlatformAfterSale(input) : createAfterSale(input, afterSaleActors[0])
    if (!created.record) continue
    if (kind === '退货') created.record.approvedReturnQty = source.quantity
    if (kind === '全额退款' && refund?.issuedAt) dateHistoricalSample(created.record, refund.issuedAt)
    let observedResult = resultText
    if (kind === '部分退款' && !source.afterSaleOfferNo) {
      source.afterSaleOfferNo = created.record.no
      // 从申请列表先同步时，样例报价可能已经收到了买家答复。
      if (source.mock?.consumed && source.mock.externalEvent === 'buyerAccept') {
        source.afterSaleRefundNo ??= created.record.no
        observedResult = '买家已接受报价，退款处理中'
      } else if (source.mock?.consumed && source.mock.externalEvent === 'buyerDecline') {
        observedResult = '买家已拒绝报价'
      }
    }
    updateAfterSaleResult(created.record.no, observedResult, actual)
  }
  const refund = afterSaleRecords.value.find(r => r.returnId === 'DEMO-RT-007' && r.kind === '全额退款' && r.shopId === 'shop-us')
  if (!refund) return
  const prior = createAfterSale({
    requestId: 'seed-return-approval:007', kind: '退货', actionLabel: '接受退货 · 买家寄回',
    shopId: refund.shopId, shopName: refund.shopName, returnId: refund.returnId, orderNo: refund.orderNo, platformReason: refund.platformReason,
    items: refund.items.map(item => ({ ...item, reason: '描述不符' })),
  }, afterSaleActors[0])
  if (prior.record && !prior.reused) {
    dateHistoricalSample(prior.record, '2026-10-13T08:00:00Z')
    Object.assign(prior.record, { approvedReturnQty: 1, executionResult: '已确认退货安排',
      warehouseReceipts: [{ warehouse: '美国退货仓', receiptNo: 'DEMO-RCV-007', lineId: prior.record.items[0]!.lineId, quantity: 1 }] })
  }
}
