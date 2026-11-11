import { reactive } from 'vue'
import { createCustomerServiceLog } from '@/组件/客服日志/日志工具'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { returnSession } from '../eBay退换货申请/数据'
import { findReturnRecord, returnKey } from '../eBay退换货申请/模型'
import { initializeReturnDemoContext } from '../eBay退换货申请/关联资料'
import { currentHandlerName } from '@/组件/客服处理人/处理人'
import { recordKey } from './模型'
import { disputeDemoRecipient, initializeDisputeFixture } from './客服关联样例'
import type { DisputeRecord } from './类型'

function sourceReturn(row: DisputeRecord) {
  const links = row.links.filter(link => link.kind === 'RETURN' && link.shopId === row.shopId)
  if (links.length !== 1) return
  const source = findReturnRecord(returnSession.records, returnKey(links[0]!))
  if (source && source.orderNo === row.orderId && source.buyerId === row.buyer) return source
}

export function initializeDisputeContext(row: DisputeRecord, area?: 'order' | 'mail') {
  initializeDisputeFixture(row, area)
  if (area !== 'mail' && sourceReturn(row)?.systemOrderNo) initializeReturnDemoContext()
}

export function disputeRecipient(row: DisputeRecord) {
  return sourceReturn(row)?.mailRecipient || disputeDemoRecipient(row.shopId, row.buyer)
}

/** 店铺 + eBay 订单身份唯一，且买家、可用的来源系统订单号交叉核对通过，才允许打开订单。 */
export function resolveDisputeOrder(row: DisputeRecord, orders: readonly 全渠道订单[]) {
  if (![row.shopId, row.orderId, row.buyer].every(id => id.trim())) return
  const candidates = orders.filter(order => order.platformCode === 'eBay' && order.storeId === row.shopId &&
    (order.platformOrderId === row.orderId || (!order.platformOrderId && order.platformOrderNo === row.orderId)))
  if (candidates.length !== 1) return
  const order = candidates[0]!
  const sourceSystemId = sourceReturn(row)?.systemOrderNo
  if (!order.systemOrderNo.trim() || order.buyerExternalId !== row.buyer || (sourceSystemId && sourceSystemId !== order.systemOrderNo)) return
  if (orders.filter(item => item.systemOrderNo === order.systemOrderNo).length !== 1) return
  return order
}

/** 行范围完整、唯一对应时才区分“其他订单行”。履约合单中只检查本系统订单的组成。 */
export function disputePackageScope(row: DisputeRecord, order: 全渠道订单, pack: 履约单摘要) {
  const paymentLines = row.payment?.details?.lines
  if (paymentLines?.some(line => !line.itemId?.trim())) return '纠纷行关联待核实'
  const required = paymentLines?.map(line => ({ id: line.lineItemId, itemId: line.itemId })) ??
    row.inquiry?.lineItems?.map(line => ({ id: line.orderLineId, itemId: '' }))
  const items = pack.items?.filter(item => item.orderNo === order.systemOrderNo && item.quantity > 0)
  const match = (id: string, itemId = '') => !!id && order.items.filter(item => item.externalLineId === id &&
    (!itemId || item.platformItemId === itemId)).length === 1
  if (!required?.length || !items?.length || !required.every(line => match(line.id, line.itemId)) ||
    !items.every(line => match(line.externalLineId))) return '纠纷行关联待核实'
  return items.some(line => required.some(r => r.id === line.externalLineId)) ? '含本纠纷订单行' : '其他订单行'
}

interface DisputeNote { at: string; author: string; text: string }
const notes = reactive(new Map<string, DisputeNote[]>())
export const notesForDispute = (row: DisputeRecord) => notes.get(recordKey(row)) ?? []
export function addDisputeNote(row: DisputeRecord, value: string) {
  const text = value.trim()
  if (!text || text.length > 500) return '内部备注须为 1～500 字'
  const key = recordKey(row)
  const at = new Date().toISOString(), actor = currentHandlerName.value
  notes.set(key, [{ at, author: actor, text }, ...notesForDispute(row)])
  ;(row.operationLogs ??= []).push(createCustomerServiceLog(actor, '添加内部备注', `新增内部备注 ${text.length} 字，正文见内部备注`, '成功', at))
  return ''
}
