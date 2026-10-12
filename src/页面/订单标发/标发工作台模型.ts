import type { 全渠道订单 } from '../全渠道订单/类型'
import { 标发阻断原因, type 标发单 } from './标发逻辑'

export type 标发动作 = '提交标发' | '重新提交' | '查询结果' | '不标发'
export interface 标发处理结果 { no: string; result: '成功' | '失败' | '跳过' | '处理中'; status: string; reason: string }

export function 标发动作阻断(单: 标发单, 动作: 标发动作, 来源?: 全渠道订单): string[] {
  if (动作 === '不标发') {
    const 原因: string[] = []
    if (!来源 || 来源.systemOrderNo !== 单.orderNo) 原因.push('来源订单不存在或关联不一致，请先核查')
    if (来源 && (!来源.fulfillmentOrders.some(项 => 项.fulfillmentOrderNo === 单.fulfillmentNo) || !来源.items.some(项 => 项.externalLineId === 单.lineId))) 原因.push('来源履约或订单行关联缺失，请先核查')
    if (来源 && 来源.fulfillmentMode !== '自配送') 原因.push('平台履约订单不进入 OMS 标发')
    if (单.status !== '待标发' && 单.status !== '标发失败') 原因.push('仅待标发或已明确未生效的失败记录可不标发')
    if (单.pendingVerification || 单.status === '标发中') 原因.push('请求正在执行或平台结果待核查，先核查原请求再处理')
    if (单.externalId) 原因.push('已有平台回执，请先核查平台结果，不能直接不标发')
    return 原因
  }
  if (动作 === '查询结果') {
    if (!来源 || 来源.platformCode !== 'eBay') return ['来源订单不存在或平台查询能力尚未接入']
    return 单.status === '标发中' || (单.status === '标发失败' && 单.pendingVerification) ? [] : ['仅标发中或待核查的失败记录可查询结果']
  }
  const 原因 = 标发阻断原因(单, 来源)
  if (动作 === '提交标发' && 单.status !== '待标发') 原因.unshift('仅待标发记录可提交；失败记录请使用重新提交')
  if (动作 === '重新提交' && 单.status !== '标发失败') 原因.unshift('仅符合重试条件的标发失败记录可重新提交')
  return [...new Set(原因)]
}

// 确认期间载荷或状态改变时，要求重新检查本次范围，避免把旧确认应用于新数据。
export function 标发确认指纹(单: 标发单, 来源?: 全渠道订单): string {
  return JSON.stringify([单.no, 单.orderNo, 单.fulfillmentNo, 单.status, 单.pendingVerification,
    单.lineId, 单.quantity, 单.carrier, 单.tracking, 单.shippedAt, 单.idempotencyKey, 单.externalId, 单.attempts, 单.exemptionReason, 单.nonMarkRecord,
    来源 && [来源.systemOrderNo, 来源.platformCode, 来源.storeId, 来源.platformOrderNo, 来源.fulfillmentMode]])
}

export function 不标发原因错误(原因: string): string {
  return !原因.trim() ? '请填写不标发原因' : 原因.trim().length > 500 ? '不标发原因最多 500 字' : ''
}

// 本地人工结束回传责任，不调用平台、不新增接口尝试，也不改写订单或出库事实。
export function 设置不标发(单: 标发单, 来源: 全渠道订单 | undefined, 原因: string, 时间: string, 操作人: string): string[] {
  const 阻断 = 标发动作阻断(单, '不标发', 来源)
  const 原因错误 = 不标发原因错误(原因)
  if (原因错误) 阻断.push(原因错误)
  if (阻断.length) return 阻断
  单.nonMarkRecord = { reason: 原因.trim(), time: 时间, operator: 操作人, previousStatus: 单.status }
  单.exemptionReason = 原因.trim()
  单.status = '无需标发'
  return []
}

export function 标发下一步(单: 标发单, 来源?: 全渠道订单): string {
  if (单.status === '标发成功') return '查看平台回执'
  if (单.status === '无需标发') return 单.nonMarkRecord ? '查看不标发原因' : '查看豁免依据'
  if (单.pendingVerification || 单.status === '标发中') return '先查询平台结果'
  return 标发阻断原因(单, 来源).length ? '查看详情并修复条件' : 单.status === '标发失败' ? '校验后重新提交' : '核对后提交标发'
}
