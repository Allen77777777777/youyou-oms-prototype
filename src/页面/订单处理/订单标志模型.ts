import type { 全渠道订单 } from '../全渠道订单/类型'

export type 订单标志代码 = 'REFUND' | 'CANCEL' | 'EBAY_MESSAGE' | 'BUYER_NOTE' | 'MERGED' | 'SPLIT'
export interface 订单标志 {
  code: 订单标志代码
  text: string
  name: string
  tone: 'red' | 'orange' | 'blue'
  reason: string
  sourceOrderNos: string[]
}
export interface 订单标志同源身份 {
  systemOrderNo: string
  storeId: string
  platformOrderId: string
}
export interface 标志退款证据 {
  refundId: string
  refundStatus?: string
  revision: number
  reliable: boolean
}
export interface 标志消息证据 {
  messageId: string
  direction: 'BUYER_INBOUND' | 'SELLER_OUTBOUND' | 'SYSTEM'
  valid: boolean
  linkedOrder: 订单标志同源身份
  read?: boolean
  replied?: boolean
}
/** 本轮不生成合／拆样例；此契约只能读取明确成功且仍有效的独立操作事实。 */
export interface 标志履约证据 {
  code: 'MERGED' | 'SPLIT'
  operationId: string
  operationSuccess: boolean
  active: boolean
  fulfillmentOrderNo: string
  sourceOrderNos: string[]
}
/** 专属只读样例契约，不增加 eBay 原值到通用订单类型，不执行接口或订单规则。 */
export interface 订单标志证据 extends 订单标志同源身份 {
  revision: number
  sourceVersion: string
  reliable: boolean
  complete: boolean
  paymentStatus?: string
  cancelState?: string
  refunds?: 标志退款证据[]
  messages?: 标志消息证据[]
  fulfillmentFacts?: 标志履约证据[]
}

export const 订单标志定义: Record<订单标志代码, Pick<订单标志, 'text' | 'name' | 'tone'>> = {
  REFUND: { text: '退', name: '退款提醒', tone: 'red' },
  CANCEL: { text: '消', name: '取消提醒', tone: 'red' },
  EBAY_MESSAGE: { text: '信', name: 'eBay 站内信', tone: 'orange' },
  BUYER_NOTE: { text: '言', name: '买家留言', tone: 'orange' },
  MERGED: { text: '合', name: '合并履约', tone: 'blue' },
  SPLIT: { text: '拆', name: '拆分发货', tone: 'blue' },
}
export const 订单标志顺序: 订单标志代码[] = ['REFUND', 'CANCEL', 'EBAY_MESSAGE', 'BUYER_NOTE', 'MERGED', 'SPLIT']
// 对应 PRD 各标志的短释义；界面提示不展示命中证据或来源订单编号。
export const 订单标志短释义: Record<订单标志代码, string> = {
  REFUND: '订单有退款中或已退款事实',
  CANCEL: '订单取消中或已取消',
  EBAY_MESSAGE: '订单有明确关联的 eBay 买家站内信',
  BUYER_NOTE: '收件信息中有买家下单留言',
  MERGED: '本订单与其他系统订单共用履约单',
  SPLIT: '本订单存在拆分发货操作产生的有效方案',
}

export function 标志身份匹配(a: 订单标志同源身份, b: 订单标志同源身份): boolean {
  return !!a.systemOrderNo.trim() && !!a.storeId.trim() && !!a.platformOrderId.trim()
    && a.systemOrderNo === b.systemOrderNo && a.storeId === b.storeId && a.platformOrderId === b.platformOrderId
}
const 有效版本 = (revision: number) => Number.isSafeInteger(revision) && revision >= 0
function 稳定证据内容(evidence: 订单标志证据): string {
  return JSON.stringify({ sourceVersion: evidence.sourceVersion, paymentStatus: evidence.paymentStatus, cancelState: evidence.cancelState,
    refunds: [...(evidence.refunds ?? [])].sort((a, b) => a.refundId.localeCompare(b.refundId) || a.revision - b.revision),
    messages: [...(evidence.messages ?? [])].sort((a, b) => a.messageId.localeCompare(b.messageId)),
    fulfillmentFacts: [...(evidence.fulfillmentFacts ?? [])].sort((a, b) => a.operationId.localeCompare(b.operationId)),
  })
}
function 当前可靠证据(identity: 订单标志同源身份, evidences: 订单标志证据[]): 订单标志证据 | undefined {
  const matches = evidences.filter(evidence => 标志身份匹配(identity, evidence) && evidence.reliable && evidence.complete && !!evidence.sourceVersion.trim() && 有效版本(evidence.revision))
  if (!matches.length) return undefined
  const version = Math.max(...matches.map(evidence => evidence.revision))
  const newest = matches.filter(evidence => evidence.revision === version)
  // 同一版本来源内容冲突时不任取第一条；独立演示证据须先核实。
  return new Set(newest.map(稳定证据内容)).size === 1 ? newest[0] : undefined
}
function 当前退款事实(rows: 标志退款证据[]): 标志退款证据[] {
  const groups = new Map<string, 标志退款证据[]>()
  for (const row of rows) {
    if (!row.refundId.trim() || !row.reliable || !有效版本(row.revision)) continue
    const group = groups.get(row.refundId)
    if (group) group.push(row)
    else groups.set(row.refundId, [row])
  }
  return [...groups.values()].flatMap(group => {
    const version = Math.max(...group.map(row => row.revision))
    const newest = group.filter(row => row.revision === version)
    return new Set(newest.map(row => row.refundStatus)).size === 1 ? [newest[0]!] : []
  })
}

/** 仅生成当前页面的展示投影，不写 order_tag、tags、日志或处理状态。 */
export function 计算订单标志(order: 全渠道订单, evidences: 订单标志证据[] = []): 订单标志[] {
  const plan = order.manualShippingPlan
  const manualCode = plan?.id && plan.orderNos.includes(order.systemOrderNo) ? plan.kind === '拆分发货' && plan.packages.length > 1 ? 'SPLIT' : plan.kind === '合并发货' && plan.orderNos.length > 1 ? 'MERGED' : undefined : undefined
  if (order.platformCode !== 'eBay') return manualCode ? [{ code: manualCode, ...订单标志定义[manualCode], reason: '发货安排已保存且仍有关联', sourceOrderNos: [order.systemOrderNo] }] : []
  const identity = { systemOrderNo: order.systemOrderNo, storeId: order.storeId, platformOrderId: order.platformOrderId ?? '' }
  const evidence = 当前可靠证据(identity, evidences)
  const flags: 订单标志[] = []
  const add = (code: 订单标志代码, reasons: string[]) => {
    if (reasons.length) flags.push({ code, ...订单标志定义[code], reason: [...new Set(reasons)].join('；'), sourceOrderNos: [order.systemOrderNo] })
  }
  if (evidence) {
    const refundReasons: string[] = []
    if (evidence.paymentStatus === 'PARTIALLY_REFUNDED') refundReasons.push('订单级状态为部分已退款')
    if (evidence.paymentStatus === 'FULLY_REFUNDED') refundReasons.push('订单级状态为全额已退款')
    for (const refund of 当前退款事实(evidence.refunds ?? [])) {
      if (refund.refundStatus === 'PENDING') refundReasons.push('退款明细有退款中事实')
      if (refund.refundStatus === 'REFUNDED') refundReasons.push('退款明细有已退款事实')
    }
    add('REFUND', refundReasons)
    add('CANCEL', evidence.cancelState === 'IN_PROGRESS' ? ['当前平台取消状态为取消中'] : evidence.cancelState === 'CANCELED' ? ['当前平台取消状态为已取消'] : [])
    const inbound = (evidence.messages ?? []).filter(message => !!message.messageId.trim() && message.valid && message.direction === 'BUYER_INBOUND' && 标志身份匹配(identity, message.linkedOrder))
    const messageCount = new Set(inbound.map(message => message.messageId)).size
    add('EBAY_MESSAGE', messageCount ? [`有 ${messageCount} 条明确关联本订单的有效买家入站消息`] : [])
  }
  // trim 只判断有无，正文仍按原文保存；不读取系统备注、原因字符串或日志。
  add('BUYER_NOTE', order.address.buyerMessage?.trim() ? ['平台收件信息有买家下单留言'] : [])
  if (evidence) {
    const facts = (evidence.fulfillmentFacts ?? []).filter(fact => fact.operationSuccess && fact.active && !!fact.operationId.trim() && fact.sourceOrderNos.includes(order.systemOrderNo)
      && order.fulfillmentOrders.some(fulfillment => fulfillment.isActive && fulfillment.fulfillmentOrderNo === fact.fulfillmentOrderNo))
    add('MERGED', manualCode === 'MERGED' || facts.some(fact => fact.code === 'MERGED' && new Set(fact.sourceOrderNos.filter(no => !!no.trim())).size > 1) ? ['已成功参与当前有效合并履约方案'] : [])
    add('SPLIT', manualCode === 'SPLIT' || facts.some(fact => fact.code === 'SPLIT') ? ['拆分发货操作已成功且对应履约方案仍有效'] : [])
  }
  if (!evidence && manualCode) add(manualCode, ['发货安排已保存且仍有关联'])
  return flags.sort((a, b) => 订单标志顺序.indexOf(a.code) - 订单标志顺序.indexOf(b.code))
}

/** 共享履约行传入全部来源订单的投影；来源事实只聚合展示，不反写其他订单。 */
export function 合并来源订单标志(groups: 订单标志[][]): 订单标志[] {
  return 订单标志顺序.flatMap(code => {
    const matches = groups.flat().filter(flag => flag.code === code)
    if (!matches.length) return []
    return [{ code, ...订单标志定义[code], reason: [...new Set(matches.map(flag => flag.reason))].join('；'), sourceOrderNos: [...new Set(matches.flatMap(flag => flag.sourceOrderNos))] }]
  })
}
