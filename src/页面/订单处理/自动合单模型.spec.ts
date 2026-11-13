import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
import { 创建合单等待记录, 划分合单候选组, 计算合单放单, 读取合单分组身份, 解析合单来源时间, 下一固定放单时间, type 合单候选 } from './自动合单模型'

const now = Date.parse('2026-11-13T01:00:00Z') // 北京 09:00
function candidate(orderNo: string, overrides: Partial<合单候选> = {}): 合单候选 {
  return { orderNo, ruleId: 'R1', ruleName: '合单', ruleVersion: 1, settingsVersion: 1, action: 创建默认合单动作(), groupKey: 'SAME', quantity: 1, weightKg: '1.25', shipByAt: now + 24 * 60 * 60_000, ...overrides }
}
const advanced = () => ({ ...创建默认合单动作(), mode: 'advanced' as const, maxWaitMinutes: 120 })

describe('自动合单纯模型', () => {
  it('基础本轮一次性处理，可合组且单张不跨轮滞留', () => {
    const rows = [candidate('A'), candidate('B'), candidate('C', { groupKey: 'OTHER' })].map(row => 创建合单等待记录(row, now))
    expect(计算合单放单(rows, now)).toEqual([])
    expect(计算合单放单(rows, now, { batch: true }).map(group => group.orderNos)).toEqual([['A', 'B'], ['C']])
  })
  it('高级未达到门槛跨轮等待，同伴到来立即放单且不重置入池时间', () => {
    const a = 创建合单等待记录(candidate('A', { action: advanced() }), now)
    expect(计算合单放单([a], now + 60_000, { batch: true })).toEqual([])
    const b = 创建合单等待记录(candidate('B', { action: advanced() }), now + 60_000)
    expect(计算合单放单([a, b], now + 60_000, { batch: true })[0]!.orderNos).toEqual(['A', 'B'])
    expect(a.enteredAt).toBe(now)
    expect(a.deadlineAt).toBe(now + 120 * 60_000)
  })
  it('到点集中模式即使够单也等待时点，截止不依赖批次扫描', () => {
    const action = { ...advanced(), releaseMode: 'scheduled' as const, maxWaitMinutes: 600, releaseTimes: ['10:00'] }
    const rows = ['A', 'B'].map(no => 创建合单等待记录(candidate(no, { action }), now))
    expect(计算合单放单(rows, now, { batch: true })).toEqual([])
    expect(计算合单放单(rows, now + 60 * 60_000)[0]!.reason).toBe('已到固定放单时间')
  })
  it('可合即放的可选固定时点也纳入最早截止', () => {
    const row = 创建合单等待记录(candidate('A', { action: { ...advanced(), releaseTimes: ['09:30'] } }), now)
    expect(row.deadlineAt).toBe(now + 30 * 60_000)
  })
  it('最长等待取首次节点起点，固定时点仍取实际入池后的最近时点', () => {
    // 10:00 到节点，11:30 入池：已过的 11:00 不参与，最长等待 12:00 早于下个固定时点 14:00。
    const nodeAt = now + 60 * 60_000
    const enteredAt = now + 150 * 60_000
    const row = 创建合单等待记录(candidate('A', { waitStartedAt: nodeAt, action: { ...advanced(), releaseMode: 'scheduled', releaseTimes: ['11:00', '14:00'] } }), enteredAt)
    expect(row.enteredAt).toBe(enteredAt)
    expect(row.waitStartedAt).toBe(nodeAt)
    expect(row.deadlineAt).toBe(now + 180 * 60_000)
    expect(row.deadlineReason).toBe('最长等待时间已到')
    expect(计算合单放单([row], enteredAt)).toEqual([])
  })
  it('等候候选排序仍按实际入池，节点更早不插队；旧快照缺起点时沿入池时间', () => {
    const action = { ...advanced(), maxOrders: 2, readyOrderCount: 2 }
    const old = 创建合单等待记录(candidate('A', { action }), now)
    const b = 创建合单等待记录(candidate('B', { action, waitStartedAt: now - 60_000 }), now + 60_000)
    const c = 创建合单等待记录(candidate('C', { action, waitStartedAt: now - 120_000 }), now + 120_000)
    expect(old.deadlineAt).toBe(now + 120 * 60_000)
    expect(old.waitStartedAt).toBeUndefined()
    expect(划分合单候选组([c, b, old]).map(group => group.map(row => row.orderNo))).toEqual([['A', 'B'], ['C']])
  })
  it('发货截止预留优先且独立到期放单', () => {
    const row = 创建合单等待记录(candidate('A', { action: advanced(), shipByAt: now + 125 * 60_000 }), now)
    expect(row.deadlineAt).toBe(now + 5 * 60_000)
    expect(计算合单放单([row], now + 5 * 60_000)[0]!.reason).toBe('已进入发货截止预留时间')
  })
  it('等待上限使用每条记录首次入池时刻，较新伙伴不能延长旧单', () => {
    const action = { ...advanced(), releaseMode: 'scheduled' as const, releaseTimes: ['18:00'] }
    const rows = [创建合单等待记录(candidate('A', { action }), now), 创建合单等待记录(candidate('B', { action }), now + 60 * 60_000)]
    expect(计算合单放单(rows, now + 120 * 60_000)[0]!.orderNos).toEqual(['A', 'B'])
  })
  it('公共池跨入池规则及规则版本合组，全局版本和设置快照不同仍隔离', () => {
    const rows = [candidate('A'), candidate('B', { ruleId: 'R2' }), candidate('C', { ruleVersion: 2 }), candidate('D', { settingsVersion: 2 }), candidate('E', { action: { ...创建默认合单动作(), maxOrders: 3 } })].map(row => 创建合单等待记录(row, now))
    expect(划分合单候选组(rows).map(group => group.map(record => record.orderNo))).toEqual([['A', 'B', 'C'], ['D'], ['E']])
  })
  it('每组张数、总件数与精确重量作用于完整组', () => {
    const action = { ...创建默认合单动作(), maxOrders: 3, maxQuantity: 3, maxWeightKg: '2.5' }
    const rows = ['A', 'B', 'C', 'D', 'E'].map(no => 创建合单等待记录(candidate(no, { action }), now))
    expect(划分合单候选组(rows).map(group => group.map(row => row.orderNo))).toEqual([['A', 'B'], ['C', 'D'], ['E']])
  })
  it('单张超出整组限制独立放行，不拆商品也不无限等待', () => {
    const row = 创建合单等待记录(candidate('A', { quantity: 6, action: { ...advanced(), maxQuantity: 5 } }), now)
    expect(计算合单放单([row], now)[0]!.reason).toContain('独立放单')
  })
  it('固定时点按北京时间跨日，客户端时区不参与', () => {
    expect(下一固定放单时间(Date.parse('2026-11-13T15:30:00Z'), ['09:00', '18:00'])).toBe(Date.parse('2026-11-14T01:00:00Z'))
    expect(下一固定放单时间(now, ['09:00'])).toBe(now)
    expect(解析合单来源时间('2026-11-13 09:00:00 UTC+8')).toBe(now)
    expect(解析合单来源时间('2026-11-13 09:00:00')).toBeUndefined()
  })
  it('地址公寓、邮编、买家身份精确匹配，不以空值或收货国家推断站点', () => {
    const a = structuredClone(全渠道订单模拟数据[0]!)
    a.buyerExternalId = 'BUYER'
    const b = structuredClone(a)
    b.address.addressLine2 = 'Unit 3'
    expect(读取合单分组身份(a).key).not.toBe(读取合单分组身份(b).key)
    expect(读取合单分组身份(a, true).reason).toContain('站点')
    delete a.buyerExternalId
    expect(读取合单分组身份(a).key).toBeUndefined()
  })
  it('手动结束等单覆盖同一完整候选组，已放单不会重入计算', () => {
    const rows = ['A', 'B'].map(no => 创建合单等待记录(candidate(no, { action: { ...advanced(), readyOrderCount: 3 } }), now))
    expect(计算合单放单(rows, now, { forceOrderNos: ['B'] })[0]!.orderNos).toEqual(['A', 'B'])
    rows.forEach(row => { row.status = '已放单' })
    expect(计算合单放单(rows, now, { batch: true })).toEqual([])
  })
})
