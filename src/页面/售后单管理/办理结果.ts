import type { 全渠道订单 } from '../全渠道订单/类型'
import { 共享订单 } from '../订单处理/演示会话'
import type { AfterSaleRecord } from './会话'
import { activeAfterSaleActor, canViewAfterSale, type AfterSaleActor } from './权限'
import { resolveAfterSaleSource } from './来源关联'
import { resolveReshipOrderIdentity } from './重发订单关联'

export type AfterSaleResultGroup = '待核查' | '失败' | '等待买家决定' | '买家拒绝' | '处理中' | '已确认' | '待审核' | '已停止' | '其他'
export const afterSaleResultOptions: Array<{ value: AfterSaleResultGroup; label: string }> = [
  '待核查', '失败', '等待买家决定', '买家拒绝', '处理中', '已确认', '待审核', '已停止', '其他',
].map(value => ({ value: value as AfterSaleResultGroup, label: value }))

const knownResults: Record<string, AfterSaleResultGroup> = {
  '等待重发审核': '待审核',
  '已登记，待核实执行结果': '待核查',
  '平台结果待核实': '待核查',
  '平台已确认退款，实退金额待核实': '待核查',
  '平台提交失败': '失败',
  '平台明确失败': '失败',
  '平台退款失败': '失败',
  '已提交，待平台回查': '处理中',
  '退款处理中': '处理中',
  '买家已接受报价，退款处理中': '处理中',
  '已报价，待买家决定': '等待买家决定',
  '已报价，等待买家决定': '等待买家决定',
  '买家已拒绝报价': '买家拒绝',
  '买家拒绝报价': '买家拒绝',
  '平台退款成功': '已确认',
  '退款成功': '已确认',
  '已退款': '已确认',
  '平台已确认退货安排': '已确认',
  '已确认退货安排': '已确认',
  '已确认无需寄回': '已确认',
  '买家已寄回': '已确认',
  '已创建手工订单': '已确认',
}
const tones: Record<AfterSaleResultGroup, 'info' | 'warning' | 'danger' | 'success'> = {
  待核查: 'warning', 失败: 'danger', 等待买家决定: 'warning', 买家拒绝: 'danger', 处理中: 'info',
  已确认: 'success', 待审核: 'warning', 已停止: 'info', 其他: 'info',
}
const present = (text: string, group: AfterSaleResultGroup) => ({ text, group, tone: tones[group] })

/** 详情包裹与执行结果共用同一可靠关联；单号命中不能替代来源及店铺权限检查。 */
export function resolveAfterSaleReshipOrder(record: AfterSaleRecord, orders: 全渠道订单[] = 共享订单.value, actor: AfterSaleActor = activeAfterSaleActor.value): 全渠道订单 | undefined {
  if (!canViewAfterSale(record, actor)) return
  const order = resolveReshipOrderIdentity(record, orders)
  return order && canViewAfterSale({ shopId: order.storeId }, actor) ? order : undefined
}

/** 筛选分组是展示投影；保留本次办理原文，不从金额是否为空反推执行结果。 */
export function afterSaleResultPresentation(record: AfterSaleRecord, orders: 全渠道订单[] = 共享订单.value, actor: AfterSaleActor = activeAfterSaleActor.value) {
  if (record.kind === '重发' && record.approval === '已审核') {
    const order = resolveAfterSaleReshipOrder(record, orders, actor)
    if (!order) return present('重发订单关联待核查', '待核查')
    const state = order.processingStatus
    if (!state) return present('重发执行结果待核查', '待核查')
    const group = ({ 待审核: '处理中', 待推单: '处理中', 待发货: '处理中', 已发货: '已确认', 异常: '待核查', 不发货: '已停止' } as const)[state]
    return present('重发' + state, group)
  }
  const text = record.executionResult?.trim() || '尚未取得办理结果'
  const group = knownResults[text] || (text.startsWith('未提交：') ? '失败' : '其他')
  return present(text, group)
}

/** 运单号属于成功取得的 FULL 资料；轨迹查询失败不使可信的运单号失效。 */
export function afterSaleTrackingNumbers(record: AfterSaleRecord): string[] {
  if (!canViewAfterSale(record)) return []
  const source = resolveAfterSaleSource(record).row
  const detail = source?.detail
  if (!detail || detail.contentOnHold || detail.readStatus.detail.status !== 'success') return []
  return [...new Set(detail.shipments.map(shipment => shipment.trackingNumber.trim()).filter(Boolean))]
}
