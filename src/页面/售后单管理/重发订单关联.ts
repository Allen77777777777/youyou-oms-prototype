import type { 全渠道订单 } from '../全渠道订单/类型'
import type { AfterSaleRecord } from './会话'

/** 系统执行事实只按唯一业务身份关联；查看权限由各读取入口另行校验。 */
export function resolveReshipOrderIdentity(record: AfterSaleRecord, orders: readonly 全渠道订单[]): 全渠道订单 | undefined {
  if (record.kind !== '重发' || record.approval !== '已审核' || !record.no || !record.systemOrderNo || !record.manualOrderNo) return
  const matches = orders.filter(order => order.systemOrderNo === record.manualOrderNo)
  const order = matches.length === 1 ? matches[0] : undefined
  if (!order || order.manualOrder?.afterSaleNo !== record.no || order.manualOrder.scenario !== '售后补寄' ||
    order.manualOrder.originalOrderNo !== record.systemOrderNo) return
  return order
}
