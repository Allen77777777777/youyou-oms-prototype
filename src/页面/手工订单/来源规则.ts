import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 仓库执行 } from '../订单处理/演示会话'

/** 订单类型为业务依据；兼容已有原型的来源元数据与展示值。 */
export function 是手工订单(订单: Pick<全渠道订单, 'orderType' | 'manualOrder' | 'platformCode'>): boolean {
  return 订单.orderType === '手工订单' || Boolean(订单.manualOrder) || 订单.platformCode === '手工'
}

/** 关联只建立业务追溯，不授权重复原订单仍在执行的发货需求。 */
export function 校验手工原订单关联(原订单号: string, 订单列表: 全渠道订单[], 执行列表: 仓库执行[]): string[] {
  const 原单 = 订单列表.find(订单 => 订单.systemOrderNo === 原订单号 && !是手工订单(订单))
  if (!原单) return ['关联原订单不存在或不可查看，请重新选择']
  const 原因: string[] = []
  if (!['已发货', '不发货'].includes(原单.processingStatus ?? '')) 原因.push('原订单发货处理尚未结束或仍需核查，不能通过手工建单绕过原流程')
  const 履约号 = new Set(原单.fulfillmentOrders.map(履约 => 履约.fulfillmentOrderNo))
  const 执行 = 执行列表.filter(仓单 => 仓单.订单号.includes(原订单号) || 履约号.has(仓单.履约单号))
  if (执行.some(仓单 => 仓单.待核查 || !['已出库', '已取消', '下单失败'].includes(仓单.状态))) 原因.push('原订单存在未结束或结果待核查的仓库执行，请先核实原发货')
  if (执行.some(仓单 => 仓单.出库事实 && (!Number.isInteger(仓单.出库事实.shipped) || 仓单.出库事实.shipped! < 0))) 原因.push('原订单仓库实际出库数量未知，请先核实原发货')
  if (原单.fulfillmentOrders.some(履约 => !Number.isInteger(履约.shippedQuantity) || 履约.shippedQuantity < 0 || 履约.shippedQuantity > 履约.plannedQuantity || 履约.status === '执行中' || (履约.status === '已发货' && 履约.shippedQuantity !== 履约.plannedQuantity))) 原因.push('原订单实际出库范围尚未核清，请先核实原发货')
  return 原因
}

export function 手工发货条件阻断(订单: 全渠道订单, 订单列表: 全渠道订单[], 执行列表: 仓库执行[]): string[] {
  if (!是手工订单(订单)) return []
  const 元数据 = 订单.manualOrder
  if (!元数据) return ['手工订单来源资料缺失，请先核查']
  const 原因: string[] = []
  if (订单.platformCode !== '手工' || 订单.platformOrderId || 订单.platformOrderNo || 订单.professionalOrder || 订单.platformOrderStatus) 原因.push('手工来源与平台订单身份冲突，请先核查')
  if (!订单.storeId?.trim() || !订单.storeName?.trim()) 原因.push('手工订单缺少发货店铺，请先核查')
  if (元数据.scenario === '线下销售' && !元数据.paidConfirmed) 原因.push('线下销售尚未确认已收款，不允许发货')
  if (元数据.scenario === '售后补寄' && !元数据.originalOrderNo) 原因.push('售后补寄缺少关联原订单，请先核查')
  if (元数据.originalOrderNo) 原因.push(...校验手工原订单关联(元数据.originalOrderNo, 订单列表, 执行列表))
  return 原因
}
