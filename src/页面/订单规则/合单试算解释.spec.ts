import { describe, expect, it } from 'vitest'
import { 解释合单试算 } from './合单试算解释'
import { 创建默认合单动作 } from './合单规则模型'
import { 创建合单等待记录, 读取合单分组身份, type 合单等待记录 } from '../订单处理/自动合单模型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 订单规则 } from './规则逻辑'

const order = () => ({ ...structuredClone(全渠道订单模拟数据[0]!), systemOrderNo: 'SOURCE-1', platformCode: 'eBay' as const, storeId: 'store-a', buyerExternalId: 'private-buyer', address: { ...structuredClone(全渠道订单模拟数据[0]!.address), fullName: 'private-recipient', countryCode: 'US', addressLine1: 'private-address-1', addressLine2: '' } })
const rule: 订单规则 = { id: 'RULE', name: '美国入池', type: '合单规则', enabled: true, priority: 10, mode: '全部满足', conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '进入合单池', version: 1, updatedAt: '', note: '' }
function record(no: string, overrides: Partial<合单等待记录> = {}) {
  return { ...创建合单等待记录({ orderNo: no, ruleId: rule.id, ruleName: rule.name, ruleVersion: 1, settingsVersion: 1, groupKey: 读取合单分组身份(order()).key!, quantity: 2, weightKg: '2', action: { ...创建默认合单动作(), mode: 'advanced', readyOrderCount: 3, maxWeightKg: '3' } }, 1000), ...overrides }
}

describe('合单试算解释', () => {
  it('重量切组说明具体限制，等待中的全部候选组均展示成员和凑单进度', () => {
    const records = [record('A'), record('B')]
    const result = 解释合单试算({ records, groups: [], rows: [] }, [rule], [], [])
    expect(result.groups).toHaveLength(2)
    expect(result.groups[1]!.separation).toContain('总重量超过 3 kg')
    expect(result.groups[0]!.progress).toContain('已凑 1 / 3 单')
    expect(result.groups.map(group => group.orderNos)).toEqual([['A'], ['B']])
  })

  it('只解释收件身份差异字段，不输出买家身份和具体收件地址', () => {
    const other = order(); other.address.addressLine2 = 'private-address-2'
    const records = [record('A'), record('B', { groupKey: 读取合单分组身份(other).key! })]
    const result = 解释合单试算({ records, groups: [], rows: [] }, [rule], [], [])
    expect(result.groups[1]!.separation).toBe('与候选组 1 分开：地址 2不同')
    expect(JSON.stringify(result)).not.toContain('private-')
  })

  it('未命中给出具体不满足条件，未知资料保持待核实', () => {
    const source = order(); source.address.countryCode = 'CA'
    const unknownRule: 订单规则 = { ...rule, id: 'UNKNOWN', name: '按站点', conditions: [{ field: 'siteCode', operator: '等于', value: 'US', values: ['US'] }] }
    const result = 解释合单试算({ records: [], groups: [], rows: [{ orderNo: source.systemOrderNo, status: '不参与', reason: '未命中规则' }] }, [rule, unknownRule], [source], [])
    expect(result.rows[0]!.ruleDetails[0]!.explanation).toContain('不满足条件')
    expect(result.rows[0]!.ruleDetails[1]!.explanation).toContain('资料待核实')
  })

  it('单张件数超限说明独立放单，不误称存在可共同分仓结果', () => {
    const base = record('A'), records = [{ ...base, quantity: 4, action: { ...base.action, maxQuantity: 3 } }]
    const result = 解释合单试算({ records, groups: [{ orderNos: ['A'], reason: '单张超限', groupKey: records[0]!.groupKey }], rows: [] }, [rule], [], [])
    expect(result.groups[0]!.separation).toContain('总件数 4 超过 3 件')
    expect(result.groups[0]!.separation).toContain('独立放单')
  })
})
