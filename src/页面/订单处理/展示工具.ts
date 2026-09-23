import type { 全渠道订单, 履约单摘要, 订单处理状态 } from '../全渠道订单/类型'
import type { 仓库执行 } from './演示会话'

/** 展示来源时间自带的 UTC 偏移；缺失时不推测服务器或用户时区。 */
export function 提取发货时区(来源时间?: string): string {
  if (!来源时间?.trim() || 来源时间.trim() === '—') return '平台未提供'
  return 来源时间.trim().match(/\bUTC(?:[+-]\d{1,2}(?::\d{2})?)?$/i)?.[0].toUpperCase() ?? '时区未提供'
}

/** 已有履约计划优先；订单行数量未核实时不能合计为零。 */
export function 展示计划数量(商品: { fulfillableQuantity?: number }[], 履约计划?: number): string {
  if (履约计划 !== undefined) return `计划 ${履约计划}`
  if (!商品.length || 商品.some((行) => 行.fulfillableQuantity === undefined)) return '计划待核实'
  return `计划 ${商品.reduce((合计, 行) => 合计 + 行.fulfillableQuantity!, 0)}`
}

export interface 作业行 { key: string; order: 全渠道订单; fulfillment?: 履约单摘要; execution?: 仓库执行; stage: 订单处理状态 }
export type 作业关注 = '全部' | '可审核' | '审核待处理' | '可推仓' | '结果待核查' | '下单失败' | '待出库' | '部分出库' | '出库异常' | '取消中' | '待标发' | '标发中' | '标发失败' | '标发成功' | '无需标发' | '无标发记录'

/** 快捷关注只筛选已存在的事实，不写入订单或仓库状态。 */
export function 命中作业关注(行: 作业行, 关注: 作业关注, 阻断: string[], 标发状态?: string): boolean {
  if (关注 === '全部') return true
  if (关注 === '可审核') return 行.stage === '待审核' && !阻断.length
  if (关注 === '审核待处理') return 行.stage === '待审核' && !!阻断.length
  if (关注 === '可推仓') return 行.stage === '待推单' && !阻断.length
  if (关注 === '结果待核查') return !!行.execution?.待核查 || 行.execution?.状态 === '下单中'
  if (关注 === '部分出库') return !!行.fulfillment && 行.fulfillment.shippedQuantity > 0 && 行.fulfillment.shippedQuantity < 行.fulfillment.plannedQuantity
  if (['下单失败', '待出库', '出库异常', '取消中'].includes(关注)) return 行.execution?.状态 === 关注
  if (关注 === '无标发记录') return 行.stage === '已发货' && !标发状态
  return 行.stage === '已发货' && 标发状态 === 关注
}

export function 展示剩余数量(履约?: 履约单摘要): string {
  if (!履约) return '待审核确认'
  if (履约.shippedQuantity > 履约.plannedQuantity) return '数量待核查'
  return String(履约.plannedQuantity - 履约.shippedQuantity)
}
