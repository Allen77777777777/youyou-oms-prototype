import { afterEach, describe, expect, it } from 'vitest'
import { 校验规则配置, 计算规则命中, type 订单规则 } from './规则逻辑'
import { 创建规则草稿, 丢弃规则草稿 } from './规则编辑会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

const 草稿键: string[] = []
afterEach(() => { 草稿键.splice(0).forEach(丢弃规则草稿) })
function 来源(): 订单规则 & { mergeAction?: unknown } {
  return { id: 'MERGE-POOL-LEGACY', name: '美国订单入池', type: '合单规则', enabled: true, priority: 10, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: '自动合并发货', mergeAction: { mode: 'invalid', maxOrders: -5, maxWaitMinutes: -100 }, version: 3, updatedAt: '', note: '筛选订单进入公共池' }
}

describe('公共合单池筛选规则', () => {
  it('遗留逐规则策略和旧动作不影响当前条件匹配', () => {
    const rule = 来源()
    const order = { ...structuredClone(全渠道订单模拟数据[0]!), platformCode: 'eBay' as const }
    expect(校验规则配置(rule, [])).toBe('')
    expect(计算规则命中(rule, order, [])).toEqual({ matched: true, pending: false, unknownFields: [] })
    rule.conditions[0]!.value = 'Temu'
    expect(计算规则命中(rule, order, []).matched).toBe(false)
  })

  it.each(['edit', 'copy'] as const)('%s 草稿保留筛选条件，移除旧策略并使用固定入池动作', mode => {
    const source = 来源(), before = JSON.stringify(source)
    const session = 创建规则草稿('合单规则', [source], mode, source)!
    草稿键.push(session.key)
    expect(session.draft).not.toHaveProperty('mergeAction')
    expect(session.draft.action).toBe('进入合单池')
    expect(session.draft.conditions).toEqual(source.conditions)
    if (mode === 'copy') expect(session.draft.enabled).toBe(false)
    expect(JSON.stringify(source)).toBe(before)
  })

  it('新增只创建筛选条件和固定动作，不生成逐规则设置', () => {
    const session = 创建规则草稿('合单规则', [])!
    草稿键.push(session.key)
    expect(session.draft).not.toHaveProperty('mergeAction')
    expect(session.draft).toMatchObject({ type: '合单规则', action: '进入合单池', enabled: false })
    expect(session.draft.conditions).toHaveLength(1)
  })
})
