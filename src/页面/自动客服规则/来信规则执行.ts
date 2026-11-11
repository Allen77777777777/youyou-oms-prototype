import { serviceRules, validateRule, type RuleCondition } from './规则模型'
import { 解析条件定点值, 读取范围边界 } from '../订单规则/规则条件定义'
import { handlerIdFromLegacy, handlerOptions } from '@/组件/客服处理人/处理人'
import { applyRuleHandler } from '../eBay站内信/会话处理人'
import { recordMailOperation } from '../eBay站内信/操作日志'
import type { Conversation } from '../eBay站内信/类型'

/** 只由新入库的买家来信提供。缺少的条件不参与正向或否定匹配。 */
export interface IncomingFacts {
  /** 每个元素是同一条已核实商品行的两侧 SKU，没有映射的一侧保持缺失。 */
  lines?: Array<{ systemSku?: string; platformSku?: string }>
  site?: string
  fulfillmentMode?: string
  isSplit?: boolean
  amount?: { value: string; currency: string }
}

function matches(condition: RuleCondition, shop: string, facts: IncomingFacts): boolean {
  if (condition.field === 'orderAmount') {
    const range = condition.amountRange, amount = facts.amount
    if (!range || !amount || amount.currency !== range.currency) return false
    const value = 解析条件定点值(amount.value)
    if (value === undefined) return false
    const bounds = 读取范围边界(range)
    const lower = 解析条件定点值(range.value), upper = 解析条件定点值(range.upperValue)
    return (!bounds.lowerEnabled || (lower !== undefined && (bounds.lowerInclusive ? value >= lower : value > lower))) &&
      (!bounds.upperEnabled || (upper !== undefined && (bounds.upperInclusive ? value <= upper : value < upper)))
  }
  const key = condition.field
  if (key === 'systemSku' || key === 'platformSku') {
    const values = facts.lines?.map(line => line[key]?.trim())
    if (!values?.length) return false
    const intersects = values.some(value => !!value && condition.values.includes(value))
    return condition.operator === 'eq' ? intersects : condition.operator === 'neq' && values.every(Boolean) && !intersects
  }
  const source = key === 'shop' ? shop : facts[key]
  if (source === undefined) return false
  const values = Array.isArray(source) ? source : [String(source)]
  if (!values.length || values.some(value => !value.trim())) return false
  const intersects = values.some(value => condition.values.includes(value))
  return condition.operator === 'eq' ? intersects : condition.operator === 'neq' && !intersects
}

export function applyIncomingRules(c: Conversation, messageId: string, facts: IncomingFacts) {
  const rules = serviceRules.value.filter(rule => rule.type === 'assignment' &&
    rule.enabled && !validateRule(rule) && rule.conditions.every(condition => matches(condition, c.shopId, facts)) &&
    matchesPositiveSkuPair(rule.conditions, facts))
  if (!rules.length) return
  // 多规则冲突不擅定生产叠加顺序；整次停在原值，保留实际命中证据。
  if (rules.length > 1) {
    recordMailOperation(c, '系统', '站内信规则', `来信 ${messageId} 同时匹配 ${rules.map(item => item.name).join('、')}，本次未执行。`, '待核对')
    return
  }
  const rule = rules[0]!, action = rule.assignment
  if (action.assign) {
    const userId = handlerIdFromLegacy(action.assignee)
    if (!handlerOptions.some(item => item.value === userId)) return
    applyRuleHandler(c, { ruleId: rule.id, version: rule.version, userId, messageId }, rule.name)
  }
  const changes: string[] = []
  if (action.tag) {
    const additional = action.tagIds.filter(id => !c.tags?.includes(id))
    if (additional.length) { c.tags = [...(c.tags ?? []), ...additional]; changes.push(`增加标签 ${additional.join('、')}`) }
  }
  if (action.status && c.status !== 'ignored' && c.status !== action.workStatus) {
    c.status = action.workStatus
    c.statusRevision = (c.statusRevision ?? 0) + 1
    changes.push(`标注${c.status === 'processed' ? '已处理' : '待处理'}`)
  }
  if (action.prioritize && c.priority !== action.priority) { c.priority = action.priority; changes.push('更新优先级') }
  if (changes.length) recordMailOperation(c, '系统', '站内信规则', `${rule.name} · 来信 ${messageId}：${changes.join('、')}`)
}

function matchesPositiveSkuPair(conditions: RuleCondition[], facts: IncomingFacts) {
  const system = conditions.find(item => item.field === 'systemSku' && item.operator === 'eq')
  const platform = conditions.find(item => item.field === 'platformSku' && item.operator === 'eq')
  if (!system || !platform) return true
  return facts.lines?.some(line =>
    !!line.systemSku && system.values.includes(line.systemSku.trim()) &&
    !!line.platformSku && platform.values.includes(line.platformSku.trim())) ?? false
}
