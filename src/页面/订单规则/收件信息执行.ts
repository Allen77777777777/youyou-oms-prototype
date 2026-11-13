import type { 全渠道订单, 订单收件处理记录, 收件信息请求处理记录, 收件信息请求触发点, 收件信息请求输入快照, 脱敏收件信息, 订单路由 } from '../全渠道订单/类型'
import { 试算规则, type 订单规则 } from './规则逻辑'
import { 解析门牌号 } from './收件信息规则模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 读取收件路由身份, type 收件信息匹配上下文 } from './规则渠道条件'

export type { 收件信息请求处理记录, 收件信息请求触发点 } from '../全渠道订单/类型'
export const 收件处理状态名称: Record<订单收件处理记录['status'], string> = {
  parsed: '已解析', preserved: '保留来源门牌', unrecognized: '未识别', needs_review: '待核实',
  invalid_config: '配置待核实', not_matched: '未命中规则', not_applicable: '不适用',
}
export const 收件处理触发名称: Record<收件信息请求触发点 | 'order_created', string> = {
  freight_quote: '运费试算前', logistics_order: '物流下单前', warehouse_push: '推仓前', order_created: '订单创建后（历史）',
}
function 复制<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function 相同快照(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

export function 试算收件信息规则(rules: readonly 订单规则[], order: 全渠道订单, channels: readonly 渠道配置[], context: 收件信息匹配上下文) {
  return 试算规则([...rules], order, '收件信息规则', channels, [], [], undefined, context)
}
export function 读取收件条件输入(order: 全渠道订单, context: 收件信息匹配上下文, channels: readonly 渠道配置[], routeSensitive = false): 订单收件处理记录['conditionInput'] {
  const address = context.originalAddress
  const identity = routeSensitive ? 读取收件路由身份(context.route, channels) : undefined
  return {
    platformCode: order.platformCode, storeId: order.storeId,
    countryCode: address.countryCode ?? '', stateProvince: address.stateProvince ?? '', city: address.city ?? '',
    addressLine1: address.addressLine1 ?? '', addressLine2: address.addressLine2 ?? '', routeSensitive,
    ...(routeSensitive ? { shippingChannelId: context.route?.shippingChannelId ?? '', shippingWarehouseKey: identity?.warehouseKey ?? '', shippingChannelKey: identity?.channelKey ?? '' } : {}),
  }
}
export interface 收件信息请求准备输入 {
  requestId: string
  trigger: 收件信息请求触发点
  order: 全渠道订单
  /** 必须是本次请求处理前的完整地址，不得传上一次处理输出。 */
  originalAddress: 脱敏收件信息
  /** 本次候选或目标路由；不传时仅路由条件未知，不读取订单默认路由。 */
  route?: 订单路由
  rules: readonly 订单规则[]
  channels: readonly 渠道配置[]
  processedAt?: string
  previous?: 收件信息请求准备结果
}
export interface 收件信息请求准备结果 {
  requestId: string
  trigger: 收件信息请求触发点
  address: 脱敏收件信息
  record: 收件信息请求处理记录
  trial: ReturnType<typeof 试算收件信息规则>
  /** 仅规则准备结论，不代表目标接口必填/格式校验或发货条件已通过。 */
  blocked: boolean
  reused: boolean
}

/** 纯请求准备：只返回副本与快照，不写订单、日志或外部接口。创建事件不再执行收件规则。 */
export function 准备收件信息请求(input: 收件信息请求准备输入): 收件信息请求准备结果 {
  const { order, originalAddress, route, rules, channels, trigger, requestId } = input
  const context: 收件信息匹配上下文 = { originalAddress, route }
  const identity = 读取收件路由身份(route, channels)
  const requestInput: 收件信息请求输入快照 = {
    orderNo: order.systemOrderNo, platformCode: order.platformCode, storeId: order.storeId, fulfillmentMode: order.fulfillmentMode,
    originalAddress: 复制(originalAddress), shippingChannelId: route?.shippingChannelId ?? '',
    shippingWarehouseKey: identity?.warehouseKey ?? '', shippingChannelKey: identity?.channelKey ?? '',
  }
  if (input.previous?.requestId === requestId && input.previous.trigger === trigger && 相同快照(input.previous.record.requestInput, requestInput)) {
    // 同次请求重放复用冻结快照，规则后续修改不会重新截取；返回独立副本避免调用方改坏历史。
    return { ...复制(input.previous), reused: true }
  }
  const trial = 试算收件信息规则(rules, order, channels, context)
  const endpoint = trial.blockedRule?.rule.id ?? trial.hit?.id
  const endpointIndex = endpoint === undefined ? -1 : trial.trace.findIndex(item => item.rule.id === endpoint)
  const path = endpointIndex < 0 ? trial.trace : trial.trace.slice(0, endpointIndex + 1)
  const routeSensitive = !trial.gates.length && path.some(item => item.rule.enabled && Array.isArray(item.rule.conditions)
    && item.rule.conditions.some(condition => condition.field === 'shippingWarehouse' || condition.field === 'shippingChannel'))
  const before = { addressLine1: originalAddress.addressLine1 ?? '', addressLine2: originalAddress.addressLine2 ?? '', houseNumber: originalAddress.houseNumber ?? '' }
  let record: 收件信息请求处理记录 = {
    requestId, trigger, processedAt: input.processedAt ?? new Date().toISOString(), requestInput,
    ...(route ? { routeSnapshot: 复制(route) } : {}),
    status: 'not_matched', reason: '没有适用的启用规则，保留本次原始请求收件资料。',
    before: { ...before }, after: { ...before }, houseNumber: before.houseNumber,
    conditionInput: 读取收件条件输入(order, context, channels, routeSensitive),
  }
  let blocked = false
  if (typeof requestId !== 'string' || !requestId.trim() || !['freight_quote', 'logistics_order', 'warehouse_push'].includes(trigger)) {
    record = { ...record, status: 'invalid_config', reason: '请提供有效的本次请求标识及执行位置。' }; blocked = true
  } else if (input.previous?.requestId === requestId) {
    record = { ...record, status: 'needs_review', reason: '同一请求的原始资料、目标路由或执行位置已变化，请重新建立请求，不复用已处理地址。' }; blocked = true
  } else if (trial.gates.length) {
    record = { ...record, status: 'not_applicable', reason: trial.gates.join('；') }; blocked = true
  } else if (trial.blockedRule) {
    const stop = trial.blockedRule
    record = { ...record, ruleId: stop.rule.id, ruleName: stop.rule.name, ruleVersion: stop.rule.version,
      actionSnapshot: stop.rule.recipientAction ? 复制(stop.rule.recipientAction) : undefined,
      status: stop.pending ? 'needs_review' : 'invalid_config', reason: stop.configError || `规则条件资料待核实：${stop.unknownFields.join('、')}` }
    blocked = true
  } else if (trial.hit) {
    const hit = trial.hit
    record = { ...record, ...解析门牌号(originalAddress, hit.recipientAction), ruleId: hit.id, ruleName: hit.name, ruleVersion: hit.version,
      actionSnapshot: hit.recipientAction ? 复制(hit.recipientAction) : undefined }
    // 未识别、字符不符或候选超长时保留原值，由目标接口要求判定是否能继续；不作全局门牌必填。
    blocked = record.status === 'invalid_config'
  }
  const address = 复制(originalAddress)
  if (!blocked && record.status === 'parsed') {
    address.houseNumber = record.after.houseNumber
    if (record.sourceField) address[record.sourceField] = record.after[record.sourceField]
  }
  return { requestId, trigger, address, record, trial, blocked, reused: false }
}
