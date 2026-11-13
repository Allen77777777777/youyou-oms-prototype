import { describe, expect, it } from 'vitest'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 合单等待记录 } from './自动合单模型'
import { 创建合单展示组, 筛选合单展示组, 合单组成员签名, 合单整组确认文本, type 合单组筛选 } from './合单分组展示'

const now = Date.parse('2026-11-13T02:00:00Z')
const filters: 合单组筛选 = { keyword: '', mode: 'contains', storeIds: [], nearDeadline: false }
function record(no: string, override: Partial<合单等待记录> = {}): 合单等待记录 {
  return { orderNo: no, ruleId: 'rule-a', ruleName: '美国订单', ruleVersion: 1, settingsVersion: 1,
    action: { ...创建默认合单动作(), mode: 'advanced', readyOrderCount: 3 }, groupKey: 'buyer-a', quantity: 1,
    weightKg: '0.1', enteredAt: now, deadlineAt: now + 60 * 60_000, deadlineReason: '最长等待时间已到', status: '等单中', reason: '等待同组订单或到期放单', ...override }
}
const orders = (nos: string[], storeId = 'store-a') => nos.map(systemOrderNo => ({ systemOrderNo, storeId, storeName: '综合店' } as 全渠道订单))

describe('合单按组展示', () => {
  it('跨规则来源仍复用执行组，按原容量分组且未知重量不补零', () => {
    const rows = [record('A'), record('B', { ruleId: 'rule-b', weightKg: '0.2' }), record('C', { settingsVersion: 2, weightKg: undefined })]
    const snapshot = JSON.stringify(rows)
    const groups = 创建合单展示组(rows, orders(['A', 'B', 'C']), 'waiting')
    expect(groups.map(group => group.orderNos)).toEqual([['A', 'B'], ['C']])
    expect(groups[0]).toMatchObject({ quantity: 2, weightKg: '0.3', progress: '2 / 3 单', deadlineReason: '最长等待上限' })
    expect(groups[1]!.weightKg).toBeUndefined()
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('搜索一张来源只筛组选中，仍返回全组成员和完整确认名单', () => {
    const groups = 创建合单展示组([record('A'), record('B'), record('C', { groupKey: 'buyer-b' })], orders(['A', 'B', 'C']), 'waiting')
    const result = 筛选合单展示组(groups, { ...filters, keyword: 'B', mode: 'exact' }, now)
    expect(result).toHaveLength(1)
    expect(result[0]!.orderNos).toEqual(['A', 'B'])
    expect(合单整组确认文本(result, '结束等待')).toContain('1 组，共 2 张订单')
    expect(合单整组确认文本(result, '结束等待')).toContain('A、B')
  })

  it('店铺用稳定ID筛选，临近截止含已到期且不包含无期限组', () => {
    const rows = [record('A', { deadlineAt: now - 1 }), record('B', { groupKey: 'buyer-b', deadlineAt: now + 31 * 60_000 }), record('C', { groupKey: 'buyer-c', deadlineAt: null }), record('D', { groupKey: 'buyer-d', deadlineAt: now + 30 * 60_000 })]
    const groups = 创建合单展示组(rows, [...orders(['A', 'B', 'C']), ...orders(['D'], 'store-b')], 'waiting')
    expect(筛选合单展示组(groups, { ...filters, nearDeadline: true }, now).map(group => group.orderNos)).toEqual([['A'], ['D']])
    expect(筛选合单展示组(groups, { ...filters, nearDeadline: true, storeIds: ['store-a'] }, now).map(group => group.orderNos)).toEqual([['A']])
  })

  it('分仓待处理按冻结组号聚合，身份改变不重组，无组号不擅自并组', () => {
    const rows = [record('A', { status: '分仓待处理', groupId: 'G1' }), record('B', { status: '分仓待处理', groupId: 'G1', groupKey: 'changed-buyer' }), record('C', { status: '分仓待处理' }), record('D', { status: '分仓待处理' })]
    expect(创建合单展示组(rows, orders(['A', 'B', 'C', 'D']), 'blocked').map(group => group.orderNos)).toEqual([['A', 'B'], ['C'], ['D']])
  })

  it('筛选条件必须在同一来源订单成立，不能跨冻结组成员拼凑店铺和订单号', () => {
    const rows = [record('A', { status: '分仓待处理', groupId: 'G1' }), record('B', { status: '分仓待处理', groupId: 'G1' })]
    const groups = 创建合单展示组(rows, [...orders(['A'], 'store-a'), ...orders(['B'], 'store-b')], 'blocked')
    expect(筛选合单展示组(groups, { ...filters, keyword: 'A', mode: 'exact', storeIds: ['store-b'] }, now)).toEqual([])
    expect(筛选合单展示组(groups, { ...filters, keyword: 'A', mode: 'exact', storeIds: ['store-a'] }, now)[0]!.orderNos).toEqual(['A', 'B'])
  })

  it('组内新增或退出订单改变确认签名，展示名称不是业务分组身份', () => {
    const first = 创建合单展示组([record('A')], [], 'waiting')
    const second = 创建合单展示组([record('A'), record('B')], [], 'waiting')
    expect(first[0]!.label).toBe(second[0]!.label)
    expect(合单组成员签名(first)).not.toBe(合单组成员签名(second))
  })
})
