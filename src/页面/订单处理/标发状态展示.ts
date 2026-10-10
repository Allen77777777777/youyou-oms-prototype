import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 标发单 } from '../订单标发/标发逻辑'
import type { 作业行 } from './展示工具'
import { 获取作业来源订单 } from './筛选模型'

export function 获取作业标发记录(行: 作业行, 订单: 全渠道订单[], 标发: 标发单[]): 标发单[] {
  const 来源订单号 = new Set(获取作业来源订单(行, 订单).map(项 => 项.systemOrderNo))
  return 标发.filter(单 => 来源订单号.has(单.orderNo) && (!行.fulfillment || 单.fulfillmentNo === 行.fulfillment.fulfillmentOrderNo))
}
