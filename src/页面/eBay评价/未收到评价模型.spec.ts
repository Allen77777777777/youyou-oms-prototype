import { describe, expect, it } from 'vitest'
import { createBuyerFeedback, createReviews } from './数据'
import { createAwaitingReviewOrders } from './未收到评价数据'
import { addAwaitingReviewNote, AWAITING_LOGISTICS_PLACEHOLDER, createAwaitingReviewFilters, exportAwaitingReviewCsv, filterAwaitingReviewOrders, getAwaitingShippedDays, projectAwaitingReviewOrders, validateAwaitingReviewFilters } from './未收到评价模型'
import { getAwaitingReviewOrders } from './未收到评价会话'
import { 共享订单, 仓库执行记录, type 仓库执行 } from '../订单处理/演示会话'
import type { AwaitingReviewOrder } from './未收到评价模型'
import type { ReviewRecord } from './类型'

function source(patch: Partial<AwaitingReviewOrder> = {}): AwaitingReviewOrder {
  return { id: 'ORDER-A', omsOrderNo: 'OMS-A', shopId: 'shop-us', shopName: '演示店铺-US', buyerId: 'buyer-a', orderNo: 'EBAY-A', platform: 'eBay', processingStatus: '已发货', shippedAt: '2026-10-20T23:30:00+08:00', outboundStatuses: ['已出库'], trackingNumbers: ['DEMO-TRACK-A'], coverage: 'complete', association: 'confirmed', lines: [{ id: 'A', orderLineItemId: 'FB-LINE-A', listingId: 'ITEM-A', title: '折叠收纳箱', sku: 'STORAGE-A', platformSku: 'EBAY-STORAGE-A', quantity: 1, association: 'confirmed' }], notes: [], ...patch }
}
function received(patch: Partial<ReviewRecord> = {}): ReviewRecord {
  return { ...createReviews()[0]!, id: 'REVIEW-A', shopId: 'shop-us', buyerId: 'buyer-a', orderLineItemId: 'FB-LINE-A', listingId: 'ITEM-A', automated: false, platformState: 'ENTERED', ...patch }
}
const project = (orders = [source()], reviews: ReviewRecord[] = []) => projectAwaitingReviewOrders(orders, reviews, [])

describe('未收到买家评价订单投影', () => {
  it('按剩余未评价行确定所有处理人，搜到单一商品不改整单分工', () => {
    const rows = projectAwaitingReviewOrders(createAwaitingReviewOrders(), createReviews(), createBuyerFeedback())
    const order = rows.find(item => item.id === 'AWAIT-DEMO-PARTIAL')!
    expect(order.reviewedLineCount).toBe(1)
    expect(new Set(order.handlerIds)).toEqual(new Set(['staff-01', 'staff-02']))
    const filters = { ...createAwaitingReviewFilters(), field: 'sku' as const, query: 'DEMO-CUP-04', handlerIds: ['staff-01'] }
    const found = filterAwaitingReviewOrders([order], filters)[0]!
    expect(found.missingLines.map(line => line.sku)).toEqual(['DEMO-CUP-04'])
    expect(found.handlerIds).toEqual(order.handlerIds)
    expect(found.missingLines[0]?.handlerIds).toEqual(['staff-02'])
    expect(exportAwaitingReviewCsv([found])).toContain('"客服01、客服02","客服02"')
    expect(exportAwaitingReviewCsv([found])).toContain('客服02')
    expect(rows.find(item => item.id === 'AWAIT-DEMO-ASSOCIATION')?.handlerIds).toEqual([])
  })
  it('一行待核对时只汇集其他已确认未评商品的人员', () => {
    const order = createAwaitingReviewOrders()[0]!
    const mixed = project([{ ...order, lines: order.lines.map((line, i) => i === 1 ? { ...line, association: 'unknown' } : line) }])[0]!
    expect(mixed.status).toBe('check')
    expect(mixed.handlerIds).toEqual(['staff-01'])
    expect(mixed.missingLines[1]?.handlerIds).toEqual([])
    expect(project([{ ...order, coverage: 'unknown' }])[0]?.handlerIds).toEqual([])
  })
  it('只取 OMS 已发货的 eBay 订单，平台 FULFILLED 不能替代', () => {
    expect(project([source(), source({ id: 'B', processingStatus: '待发货' }), source({ id: 'C', platform: 'Temu' })]).map(row => row.id)).toEqual(['ORDER-A'])
  })
  it.each(['ENTERED', 'HIDDEN', 'WITHDRAWN', 'REVISED', 'REVISION_OPEN', 'REVISION_DECLINED_OR_EXPIRED'] as const)('曾有买家主动评价 %s 均不重新列为未评价', platformState => {
    expect(project([source()], [received({ platformState })])).toEqual([])
  })
  it('仅平台自动评价仍等待买家主动评价', () => {
    const row = project([source()], [received({ automated: true, buyerId: 'ebay-system' })])[0]!
    expect(row.status).toBe('unreviewed'); expect(row.automatedOnly).toBe(true)
  })
  it('按交易行保留部分未评价商品，不按整单或 SKU 误判', () => {
    const original = source(), second = { ...original.lines[0]!, id: 'B', orderLineItemId: 'FB-LINE-B' }
    original.lines.push(second)
    const row = project([original], [received()])[0]!
    expect(row.totalLineCount).toBe(2); expect(row.reviewedLineCount).toBe(1); expect(row.missingLines.map(line => line.id)).toEqual(['B'])
  })
  it('其他店铺同交易行不算已评价', () => {
    expect(project([source()], [received({ shopId: 'shop-uk' })])[0]!.status).toBe('unreviewed')
  })
  it('买家不符不能认定已评价，也不允许认定从未评价', () => {
    expect(project([source()], [received({ buyerId: 'another-buyer' })])[0]).toMatchObject({ status: 'check', blockedReason: expect.stringContaining('买家不一致') })
  })
  it('评价来源未知不当作买家主动或自动评价', () => {
    const unknown = received(); delete (unknown as Partial<ReviewRecord>).automated
    expect(project([source()], [unknown])[0]).toMatchObject({ status: 'check', automatedOnly: false })
  })
  it('同一交易行的商品身份不一致时不误排除或标自动', () => {
    for (const automated of [true, false]) expect(project([source()], [received({ listingId: 'DIFFERENT-ITEM', automated })])[0]).toMatchObject({ status: 'check', automatedOnly: false })
  })
  it('商品行ID重复或无效数量进入核对队列', () => {
    const duplicate = source(); duplicate.lines.push({ ...duplicate.lines[0]!, orderLineItemId: 'FB-B' })
    expect(project([duplicate])[0]!.blockedReason).toContain('商品行标识重复')
    const invalid = source(); invalid.lines[0]!.quantity = 0
    expect(project([invalid])[0]!.blockedReason).toContain('商品数量无效')
  })
  it('历史覆盖未完成和映射未确认独立归待核对', () => {
    expect(project([source({ coverage: 'incomplete' })])[0]!.status).toBe('check')
    expect(project([source({ association: 'unknown' })])[0]!.status).toBe('check')
    const missingLine = source(); missingLine.lines[0]!.orderLineItemId = ''
    expect(project([missingLine])[0]!.status).toBe('check')
  })
  it('同店铺交易行关联两个订单时两单均待核对', () => {
    expect(project([source(), source({ id: 'B', orderNo: 'EBAY-B' })]).every(row => row.status === 'check')).toBe(true)
  })
  it('同单只要剩余一行需要核对则整单进入核对队列', () => {
    const original = source(); original.lines.push({ ...original.lines[0]!, id: 'B', orderLineItemId: '', association: 'unknown' })
    expect(project([original])[0]!.status).toBe('check')
  })
  it('收到新买家评价后自动退出，卖家留评不改变买家方向', () => {
    const original = source(), seller = { ...createBuyerFeedback()[10]!, shopId: original.shopId, buyerId: original.buyerId, orderLineItemId: original.lines[0]!.orderLineItemId }
    expect(projectAwaitingReviewOrders([original], [], [seller])[0]).toMatchObject({ status: 'unreviewed', sellerFeedbackState: 'sent' })
    expect(projectAwaitingReviewOrders([original], [received()], [seller])).toEqual([])
    expect(project([original])[0]!.sellerFeedbackState).toBe('unknown')
  })
  it('卖家留评来源身份不符或重复不误标已留评', () => {
    const original = source(), seller = { ...createBuyerFeedback()[10]!, shopId: original.shopId, buyerId: 'wrong', orderLineItemId: original.lines[0]!.orderLineItemId }
    expect(projectAwaitingReviewOrders([original], [], [seller])[0]!.sellerFeedbackState).toBe('unknown')
    seller.buyerId = original.buyerId
    expect(projectAwaitingReviewOrders([original], [], [seller, { ...seller }])[0]!.sellerFeedbackState).toBe('unknown')
  })
  it('无时区、未来或非法发货时间进入待核对', () => {
    for (const shippedAt of ['2026-10-28 10:00:00', '2026-10-30T10:00:00+08:00', 'invalid']) expect(project([source({ shippedAt })])[0]!.status).toBe('check')
  })
  it('跨类目演示资料正确演示部分已评、仅自动、隐藏排除及未知覆盖', () => {
    const rows = projectAwaitingReviewOrders(createAwaitingReviewOrders(), createReviews(), createBuyerFeedback())
    expect(rows.find(row => row.id === 'AWAIT-DEMO-AUTO')).toMatchObject({ status: 'unreviewed', automatedOnly: true })
    expect(rows.find(row => row.id === 'AWAIT-DEMO-PARTIAL')).toMatchObject({ reviewedLineCount: 1, totalLineCount: 3 })
    expect(rows.filter(row => row.id.startsWith('AWAIT-DEMO-RECEIVED'))).toHaveLength(0)
    expect(rows.find(row => row.id === 'AWAIT-DEMO-COVERAGE')!.status).toBe('check')
    expect(rows.filter(row => row.status === 'unreviewed').length).toBeGreaterThan(20)
  })
})

describe('未收到评价查询与独立跟进', () => {
  it('按北京时间自然日计算发货天数，含跨时区同一天', () => {
    expect(getAwaitingShippedDays({ shippedAt: '2026-10-28T16:01:00Z' })).toBe(0)
    expect(getAwaitingShippedDays({ shippedAt: '2026-10-28T15:59:00Z' })).toBe(1)
    expect(getAwaitingShippedDays({ shippedAt: '2026-10-30T00:00:00+08:00' })).toBeUndefined()
  })
  it('默认独立排除核对队列，日期按发货日期而不是评价日期', () => {
    const rows = project([source(), source({ id: 'B', coverage: 'unknown', lines: [{ ...source().lines[0]!, id: 'B', orderLineItemId: 'FB-B' }] })])
    expect(filterAwaitingReviewOrders(rows, createAwaitingReviewFilters()).map(row => row.id)).toEqual(['ORDER-A'])
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), status: 'check' }).map(row => row.id)).toEqual(['B'])
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), dateRange: ['2026-10-21', '2026-10-29'] })).toEqual([])
  })
  it('组合过滤店铺、出库状态、发货天数、卖家好评和自动来源', () => {
    const rows = project([source()], [received({ automated: true })])
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), shopIds: ['shop-us'], outboundStatuses: ['已出库'], automated: 'only', minDays: '9', maxDays: '9', sellerFeedback: 'unknown' })).toHaveLength(1)
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), automated: 'none' })).toHaveLength(0)
  })
  it('出库状态筛选匹配任一明确来源状态，缺失时不假定已出库', () => {
    const rows = project([source({ outboundStatuses: ['已出库', '出库异常'] })])
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), outboundStatuses: ['出库异常'] })).toHaveLength(1)
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), outboundStatuses: ['待出库'] })).toHaveLength(0)
    expect(filterAwaitingReviewOrders(project([source({ outboundStatuses: [] })]), { ...createAwaitingReviewFilters(), outboundStatuses: ['已出库'] })).toHaveLength(0)
  })
  it('共享OMS出库状态只读当前履约准确关联执行，保留多状态且不由已发货推断', () => {
    const originalOrders = 共享订单.value, originalExecutions = 仓库执行记录.value
    try {
      const sourceOrder = originalOrders.find(order => order.platformCode === 'eBay' && order.processingStatus === '已发货' && order.fulfillmentOrders.some(item => item.isActive))!
      const order = JSON.parse(JSON.stringify(sourceOrder)) as typeof sourceOrder
      order.systemOrderNo = 'OMS-AWAIT-OUTBOUND-TEST'
      const fulfillment = { ...order.fulfillmentOrders.find(item => item.isActive)!, fulfillmentOrderNo: 'AWAIT-FULFILLMENT-A', isActive: true }
      order.fulfillmentOrders = [fulfillment, { ...fulfillment, fulfillmentOrderNo: 'AWAIT-FULFILLMENT-B' }, { ...fulfillment, fulfillmentOrderNo: 'AWAIT-FULFILLMENT-HISTORY', isActive: false }]
      const execution = (fulfillmentNo: string, status: 仓库执行['状态'], orderNos = [order.systemOrderNo]): 仓库执行 => ({ 履约单号: fulfillmentNo, 订单号: orderNos, 出库单号: `OUT-${fulfillmentNo}-${status}`, 状态: status, 待核查: false, 原因: '', 更新时间: '2026-10-29T10:00:00+08:00' })
      共享订单.value = [order]
      仓库执行记录.value = [execution('AWAIT-FULFILLMENT-A', '已出库'), execution('AWAIT-FULFILLMENT-B', '出库异常'), execution('AWAIT-FULFILLMENT-A', '已出库'), execution('AWAIT-FULFILLMENT-A', '下单失败', ['DIFFERENT-ORDER']), execution('UNRELATED-FULFILLMENT', '下单失败'), execution('AWAIT-FULFILLMENT-HISTORY', '已取消')]
      const getShared = () => getAwaitingReviewOrders().find(item => item.omsOrderNo === order.systemOrderNo)!
      expect(getShared().outboundStatuses).toEqual(['已出库', '出库异常'])
      仓库执行记录.value = []
      expect(getShared().processingStatus).toBe('已发货')
      expect(getShared().outboundStatuses).toEqual([])
    } finally {
      共享订单.value = originalOrders; 仓库执行记录.value = originalExecutions
    }
  })
  it('商品搜索先缩小匹配子行，保留原始订单的真实评价数量', () => {
    const original = source(); original.lines.push({ ...original.lines[0]!, id: 'B', orderLineItemId: 'FB-B', sku: 'STORAGE-B' })
    const rows = project([original])
    const filtered = filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), field: 'sku', mode: 'exact', query: 'STORAGE-B' })[0]!
    expect(filtered.missingLines).toHaveLength(1)
    expect(filtered).toMatchObject({ totalLineCount: 2, unreviewedLineCount: 2, reviewedLineCount: 0 })
    const partiallyReviewed = project([original], [received()])
    expect(filterAwaitingReviewOrders(partiallyReviewed, { ...createAwaitingReviewFilters(), field: 'sku', mode: 'exact', query: 'STORAGE-A' })).toEqual([])
  })
  it('天数、日期和多行字段校验不静默扩大结果', () => {
    expect(validateAwaitingReviewFilters({ ...createAwaitingReviewFilters(), minDays: '-1' })).toContain('整数')
    expect(validateAwaitingReviewFilters({ ...createAwaitingReviewFilters(), minDays: '10', maxDays: '2' })).toContain('不能大于')
    expect(filterAwaitingReviewOrders(project(), { ...createAwaitingReviewFilters(), minDays: 'bad' })).toEqual([])
  })
  it('备注追加原订单跟进，保留历史及人员时间，不创建评价', () => {
    const original = source(), rows = project([original])
    expect(addAwaitingReviewNote(rows[0]!, '  已完成回访  ', '客服02', '2026-10-29T10:00:00+08:00').ok).toBe(true)
    expect(original.notes[0]).toEqual({ text: '已完成回访', by: '客服02', at: '2026-10-29T10:00:00+08:00' })
    expect(addAwaitingReviewNote(original, '').ok).toBe(false)
    expect(addAwaitingReviewNote(original, '字'.repeat(1001)).ok).toBe(false)
  })
  it('导出以未评价行平铺，保留待核对原因和虚构说明，处理CSV公式', () => {
    const original = source({ coverage: 'incomplete' }); original.lines[0]!.title = '=1+2'
    const csv = exportAwaitingReviewCsv(project([original]))
    expect(csv).toContain('待核对原因'); expect(csv).toContain('历史评价采集尚未完整完成')
    expect(csv).toContain("'=1+2"); expect(csv).toContain('虚构原型评审数据')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
  it('CSV分开导出明确出库状态和恒定物流占位，不生成运输或签收事实', () => {
    const csv = exportAwaitingReviewCsv(project([source()]))
    expect(csv).toContain('"出库状态","物流轨迹状态"')
    expect(csv).toContain(`"已出库","${AWAITING_LOGISTICS_PLACEHOLDER}"`)
    expect(csv).not.toMatch(/运输中|已签收/)
  })
  it('缺商品行的核对订单在空商品查询和导出中保留，商品留空不伪造', () => {
    const rows = project([source({ lines: [] })])
    const filtered = filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), status: 'check', field: 'sku', query: '' })
    expect(filtered).toHaveLength(1)
    const csvRows = exportAwaitingReviewCsv(filtered).split('\r\n')
    expect(csvRows).toHaveLength(2)
    expect(csvRows[1]).toContain('"EBAY-A"')
    expect(csvRows[1]).toContain('订单商品行缺失')
    expect(csvRows[1]!.split(',').slice(12, 17)).toEqual(['""', '""', '""', '""', '""'])
    expect(filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), status: 'check', field: 'sku', query: 'STORAGE-A' })).toEqual([])
  })
  it('同订单混合自动和暂无评价行分别导出来源，搜索后不导出不匹配行', () => {
    const original = source(); original.lines.push({ ...original.lines[0]!, id: 'B', orderLineItemId: 'FB-B', sku: 'STORAGE-B' })
    const rows = project([original], [received({ automated: true })])
    expect(rows[0]!.missingLines.map(line => line.automatedOnly)).toEqual([true, false])
    const csv = exportAwaitingReviewCsv(rows)
    expect(csv.split('\r\n')[1]).toContain('仅平台自动评价')
    expect(csv.split('\r\n')[2]).toContain('暂无评价')
    const filtered = filterAwaitingReviewOrders(rows, { ...createAwaitingReviewFilters(), field: 'sku', mode: 'exact', query: 'STORAGE-B' })
    expect(exportAwaitingReviewCsv(filtered)).not.toContain('FB-LINE-A')
  })
})
