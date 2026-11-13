import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 划分合单候选组, type 合单等待记录, type 合单放单组 } from '../订单处理/自动合单模型'
import { 按规则优先级排序, 计算规则命中, 条件字段名, type 订单规则 } from './规则逻辑'
import { 校验条件配置 } from './规则条件定义'
import { 解析合单重量 } from './合单规则模型'

type 试算结果 = { records: 合单等待记录[]; groups: 合单放单组[]; rows: Array<{ orderNo: string; status: string; reason: string }> }
const 身份字段 = ['平台', '店铺', '买家身份', '收件人', '国家', '省州', '城市', '区县', '地址 1', '地址 2', '邮编', '订单站点']

/** 解释复用匹配函数，只返回差异字段，不复制买家姓名、地址或联系方式。 */
function 条件说明(rule: 订单规则, order: 全渠道订单, channels: readonly 渠道配置[]): string {
  const result = 计算规则命中(rule, order, channels)
  if (result.matched) return '全部条件满足'
  const details = rule.conditions.map(condition => {
    const error = 校验条件配置(condition)
    if (error) return `${条件字段名[condition.field]}：配置待完善（${error}）`
    // 平台履约状态依赖同一规则的 eBay 平台范围，不能脱离其范围单独判定。
    const conditions = condition.field === 'platformOrderStatus'
      ? rule.conditions.filter(item => item === condition || item.field === 'platformCode') : [condition]
    const item = 计算规则命中({ ...rule, conditions }, order, channels)
    return item.matched ? '' : `${条件字段名[condition.field]}：${item.pending ? '资料待核实' : '不满足条件'}`
  }).filter(Boolean)
  return details.join('；') || (result.pending ? '条件资料待核实' : '规则配置或条件不满足')
}

export function 合单容量差异(records: readonly 合单等待记录[]): string[] {
  const action = records[0]?.action
  if (!action) return []
  const reasons: string[] = []
  if (records.length > action.maxOrders) reasons.push(`订单数 ${records.length} 超过 ${action.maxOrders} 单`)
  const quantity = records.reduce((sum, record) => sum + record.quantity, 0)
  if (action.maxQuantity !== undefined && quantity > action.maxQuantity) reasons.push(`总件数 ${quantity} 超过 ${action.maxQuantity} 件`)
  if (action.maxWeightKg !== undefined) {
    const maximum = 解析合单重量(action.maxWeightKg)
    const weights = records.map(record => 解析合单重量(record.weightKg))
    if (maximum === undefined || weights.some(weight => weight === undefined)) reasons.push('重量资料待核实')
    else if (weights.reduce<bigint>((sum, weight) => sum + weight!, 0n) > maximum) reasons.push(`总重量超过 ${action.maxWeightKg} kg`)
  }
  return reasons
}

function 身份差异(left: string, right: string): string[] {
  try {
    const a: unknown = JSON.parse(left), b: unknown = JSON.parse(right)
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 身份字段.length || b.length !== 身份字段.length) return ['收件分组身份']
    return 身份字段.filter((_, index) => a[index] !== b[index])
  } catch { return ['收件分组身份'] }
}

export function 解释合单试算(result: 试算结果, rules: readonly 订单规则[], orders: readonly 全渠道订单[], channels: readonly 渠道配置[]) {
  const candidates = 划分合单候选组(result.records)
  const groups = candidates.map((records, index) => {
    const first = records[0]!
    const preceding = candidates.slice(0, index)
    const sameIdentity = [...preceding].reverse().find(group => group[0]!.groupKey === first.groupKey)
    let separation = '按固定收件身份及当前设置组成候选组'
    const alone = 合单容量差异([first])
    if (alone.length) separation = `单张超出合并限制：${alone.join('；')}，按独立放单处理`
    else if (sameIdentity && (sameIdentity[0]!.settingsVersion !== first.settingsVersion || JSON.stringify(sameIdentity[0]!.action) !== JSON.stringify(first.action))) separation = '使用不同的设置快照，分别成组'
    else if (sameIdentity) {
      const differences = 合单容量差异([...sameIdentity, first])
      separation = differences.length ? `与前一同收件组分开：再加入本组首单会使${differences.join('；')}` : '使用不同的设置快照，分别成组'
    } else if (preceding.length) {
      const comparisons = preceding.map((group, i) => ({ number: i + 1, fields: 身份差异(group[0]!.groupKey, first.groupKey) })).sort((a, b) => a.fields.length - b.fields.length)
      const closest = comparisons[0]!
      separation = `与候选组 ${closest.number} 分开：${closest.fields.join('、')}不同`
    }
    const release = result.groups.find(group => group.orderNos.includes(first.orderNo))
    const action = first.action
    const progress = release ? release.reason : action.mode === 'advanced' && action.releaseMode === 'ready'
      ? `已凑 ${records.length} / ${action.readyOrderCount} 单；继续等单，截止到期不受该数量限制` : action.mode === 'basic' ? '等待本轮处理或更早发货保护截止' : '等待固定时点或更早截止'
    return { number: index + 1, orderNos: records.map(record => record.orderNo), quantity: records.reduce((sum, record) => sum + record.quantity, 0), separation, progress, release }
  })
  const enabledRules = 按规则优先级排序(rules.filter(rule => rule.enabled))
  const rows = result.rows.map(row => {
    const order = orders.find(order => order.systemOrderNo === row.orderNo)
    const record = result.records.find(record => record.orderNo === row.orderNo)
    const group = groups.find(group => group.orderNos.includes(row.orderNo))
    const ruleDetails = order ? enabledRules.map(rule => ({ name: rule.name || '当前草稿', explanation: 条件说明(rule, order, channels) })) : []
    return { ...row, groupNumber: group?.number, ruleName: record?.ruleName, ruleDetails }
  })
  return { rows, groups }
}
