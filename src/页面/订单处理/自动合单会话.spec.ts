import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { 创建作业样例, 共享订单, 提交审核轮次, 当前版本 } from './演示会话'
import { 执行待审核规则轮次 } from './审单规则执行'
import { 共享规则 } from '../订单规则/演示会话'
import { 创建自动合单样例 } from './自动合单演示'
import { 共享合单记录, 共享合单执行结果, 订单正在等单 } from './自动合单状态'
import { 执行合单轮次, 处理合单到期, 结束合单等待, 释放全部等待, 重试合单分仓, 试算自动合单规则, 初始化合单待处理, 解除合单组合 } from './自动合单会话'
import { 共享自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 创建默认合单动作, type 合单动作配置 } from '../订单规则/合单规则模型'
import type { 订单规则 } from '../订单规则/规则逻辑'

const now = Date.parse('2026-11-13T01:00:00Z')
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const 原订单 = copy(共享订单.value)
const 原规则 = copy(共享规则.value)
const 原设置 = copy(共享自动合单设置.value)
function 使用全局高级(overrides: Partial<合单动作配置> = {}) { 共享自动合单设置.value.policy = { ...创建默认合单动作(), mode: 'advanced', ...overrides } }
function 创建跨规则同组() {
  const orders = 共享订单.value.filter(order => ['OMS-DEMO-AM-BASIC-01', 'OMS-DEMO-AM-BASIC-02'].includes(order.systemOrderNo))
  orders.forEach((order, index) => { order.amount.orderAmount = { value: String((index + 1) * 10), currency: 'USD' } })
  共享订单.value = orders
  const rules: 订单规则[] = [10, 20].map((amount, index) => ({ id: `POOL-${index + 1}`, name: `金额 ${amount} 的订单入池`, type: '合单规则', enabled: true, priority: index + 1, mode: '全部满足', conditions: [{ field: 'orderAmount', operator: '介于', value: String(amount), upperValue: String(amount), currency: 'USD' }], action: '进入合单池', version: 1, updatedAt: '', note: '' }))
  共享规则.value = [...共享规则.value.filter(rule => rule.type !== '合单规则'), ...rules]
  return { orders: 共享订单.value, rules: 共享规则.value.filter(rule => rule.type === '合单规则') }
}
beforeEach(() => {
  共享订单.value = 创建自动合单样例(创建作业样例, now)
  共享规则.value = copy(原规则)
  共享合单记录.value = []
  共享合单执行结果.value = null
  共享下次合单时间.value = now + 30 * 60_000
  共享自动合单设置.value = { ...copy(原设置), policy: 创建默认合单动作(), version: 1 }
})
afterEach(() => { 共享订单.value = copy(原订单); 共享规则.value = copy(原规则); 共享合单记录.value = []; 共享合单执行结果.value = null; 共享下次合单时间.value = null; 共享自动合单设置.value = copy(原设置) })

describe('自动合单会话与发货安排接续', () => {
  it('其他旧身份池来源改成所选组身份时直接排除，不重新入组或随所选组放单', () => {
    使用全局高级({ readyOrderCount: 3 })
    共享订单.value = 共享订单.value.filter(order => order.systemOrderNo.includes('BASIC-0'))
    初始化合单待处理(now)
    const [first, second, changed] = 共享订单.value
    expect(共享合单记录.value.every(record => record.status === '等单中')).toBe(true)
    changed!.buyerExternalId = first!.buyerExternalId
    changed!.address = copy(first!.address)
    结束合单等待([first!.systemOrderNo, second!.systemOrderNo], now + 1000)
    expect(共享合单记录.value.find(record => record.orderNo === changed!.systemOrderNo)).toMatchObject({ status: '已排除', reason: expect.stringContaining('收件身份或站点发生变化') })
    expect(first!.manualShippingPlan?.orderNos).toEqual([first!.systemOrderNo, second!.systemOrderNo])
    expect(changed!.manualShippingPlan).toBeUndefined()
  })
  it('全局基础模式统一处理各入池规则，合组与单单均继续分仓，已拆和取消排除', () => {
    const result = 执行合单轮次(now)!
    const basic = 共享订单.value.filter(order => order.systemOrderNo.includes('BASIC-0'))
    expect(basic[0]!.manualShippingPlan?.kind, JSON.stringify(result.rows)).toBe('合并发货')
    expect(basic[0]!.manualShippingPlan?.orderNos).toHaveLength(2)
    expect(basic[1]!.manualShippingPlan).toEqual(basic[0]!.manualShippingPlan)
    expect(basic[2]!.manualShippingPlan).toBeUndefined()
    expect(basic.every(order => order.defaultRoute?.warehouse === '万邑通美西仓')).toBe(true)
    expect(订单正在等单('OMS-DEMO-AM-READY-01')).toBe(false)
    expect(result.merged).toBe(6)
    expect(result.released).toBe(9)
    expect(result.waiting).toBe(0)
    expect(共享合单记录.value.every(record => record.action.mode === 'basic' && record.settingsVersion === 1)).toBe(true)
    expect(result.rows.find(row => row.orderNo.includes('SPLIT-01'))!.reason).toContain('已经拆单')
    expect(result.rows.find(row => row.orderNo.includes('CANCEL-01'))!.status).toBe('已排除')
    expect(basic.every(order => order.processingStatus === '待审核')).toBe(true)
  })
  it('独立到期不依赖半小时批次，处理后不会重复入池', () => {
    使用全局高级()
    执行合单轮次(now)
    处理合单到期(now + 60_000)
    const record = 共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-DUE-01')!
    expect(record.status).toBe('已放单')
    const entered = record.enteredAt
    执行合单轮次(now + 30 * 60_000)
    expect(共享合单记录.value.filter(row => row.orderNo === record.orderNo)).toHaveLength(1)
    expect(record.enteredAt).toBe(entered)
  })
  it('配置编辑不修改存量快照与截止，规则停用立即释放等待', () => {
    使用全局高级()
    执行合单轮次(now)
    const record = 共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-READY-01')!
    const deadline = record.deadlineAt
    const rule = 共享规则.value.find(rule => rule.id === record.ruleId)!
    rule.version += 1
    共享自动合单设置.value = { ...共享自动合单设置.value, version: 2, policy: { ...共享自动合单设置.value.policy, maxWaitMinutes: 600 } }
    执行合单轮次(now + 60_000)
    expect(record.deadlineAt).toBe(deadline)
    expect(record.ruleVersion).toBe(1)
    expect(record.settingsVersion).toBe(1)
    expect(record.action.maxWaitMinutes).toBe(120)
    rule.enabled = false
    处理合单到期(now + 2 * 60_000)
    expect(record.status).toBe('已放单')
    expect(record.reason).toContain('停用')
  })
  it('分仓失败保留完整组，修复后按原组重试', () => {
    const routing = 共享规则.value.filter(rule => rule.type === '分仓规则' && rule.enabled)
    routing.forEach(rule => { rule.enabled = false })
    执行合单轮次(now)
    const records = 共享合单记录.value.filter(row => row.orderNo.includes('BASIC-0') && !row.orderNo.endsWith('03'))
    expect(records.every(row => row.status === '分仓待处理')).toBe(true)
    expect(records[0]!.groupId).toBe(records[1]!.groupId)
    expect(订单正在等单(records[0]!.orderNo)).toBe(true)
    routing.forEach(rule => { rule.enabled = true })
    重试合单分仓([records[0]!.orderNo], now + 1000)
    expect(records.every(row => row.status === '已放单')).toBe(true)
    expect(共享订单.value.find(order => order.systemOrderNo === records[0]!.orderNo)!.manualShippingPlan?.orderNos).toHaveLength(2)
  })
  it('关闭释放全部等待，取消变化退出等待且不继续分仓', () => {
    使用全局高级()
    执行合单轮次(now)
    const ready = 共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-READY-01')!
    ready.processingStatus = '异常'; ready.blockReason = '付款状态已变化'
    释放全部等待('自动合单任务已关闭', now + 10_000)
    expect(共享合单记录.value.filter(row => ['等单中', '待本轮处理'].includes(row.status))).toHaveLength(0)
    expect(共享合单记录.value.find(row => row.orderNo === ready.systemOrderNo)!.status).toBe('已排除')
    expect(ready.defaultRoute).toBeUndefined()
  })
  it('多订单试算不写入共享等待、方案或日志', () => {
    const rule = 共享规则.value.find(rule => rule.id === 'RULE-MERGE-BASIC')!
    const orders = copy(共享订单.value)
    const before = JSON.stringify(orders)
    const result = 试算自动合单规则(rule, orders, now)
    expect(result.groups.some(group => group.orderNos.length === 2)).toBe(true)
    expect(JSON.stringify(orders)).toBe(before)
    expect(共享合单记录.value).toEqual([])
    expect(共享合单执行结果.value).toBeNull()
  })
  it('等单跳过自动审单且不消耗次数，直接人工提交也不能绕过', () => {
    使用全局高级()
    执行合单轮次(now)
    const order = 共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-READY-01')!
    const before = JSON.stringify({ reviews: order.reviews, retry: order.reviewRetry })
    const result = 执行待审核规则轮次('立即执行')
    expect(result.明细.find(row => row.订单号 === order.systemOrderNo)!.结果).toBe('跳过')
    expect(JSON.stringify({ reviews: order.reviews, retry: order.reviewRetry })).toBe(before)
    const direct = 提交审核轮次(order.systemOrderNo, 当前版本(order.systemOrderNo), '人工审核')
    expect(direct.成功).toBe(false)
    expect(direct.信息).toContain('等单')
    expect(order.fulfillmentOrders).toHaveLength(0)
    expect(JSON.stringify({ reviews: order.reviews, retry: order.reviewRetry })).toBe(before)
  })
  it('全局基础开启时各规则统一等待下一批次', () => {
    初始化合单待处理(now)
    expect(共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-READY-02')!.status).toBe('待本轮处理')
    expect(共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-BASIC-01')!.status).toBe('待本轮处理')
  })
  it('全局高级开启时所有规则够单即放，单单继续等待', () => {
    使用全局高级()
    初始化合单待处理(now)
    expect(共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-READY-02')!.status).toBe('已放单')
    expect(共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-BASIC-01')!.status).toBe('已放单')
    expect(共享合单记录.value.find(row => row.orderNo === 'OMS-DEMO-AM-BASIC-03')!.status).toBe('等单中')
  })
  it('初始新单未命中合单规则也独立接续分仓首轮，不伪造命中规则', () => {
    共享规则.value.filter(rule => rule.type === '合单规则').forEach(rule => { rule.enabled = false })
    执行合单轮次(now)
    const order = 共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-BASIC-01')!
    const record = 共享合单记录.value.find(row => row.orderNo === order.systemOrderNo)!
    expect(record.ruleId).toBe('')
    expect(record.status).toBe('已放单')
    expect(record.reason).toContain('未匹配')
    expect(order.defaultRoute?.warehouse).toBe('万邑通美西仓')
    expect(order.initialReviewPending).toBeUndefined()
    expect(order.manualShippingPlan).toBeUndefined()
    expect(共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-SPLIT-01')!.manualShippingPlan?.kind).toBe('拆分发货')
  })
  it('人工解除失败组合覆盖全部来源，取消单停止发货，其余独立分仓且不重新入池', () => {
    const routing = 共享规则.value.filter(rule => rule.type === '分仓规则' && rule.enabled)
    routing.forEach(rule => { rule.enabled = false })
    执行合单轮次(now)
    const a = 共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-BASIC-01')!
    const b = 共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-AM-BASIC-02')!
    a.address.addressLine1 = '200 New Reviewed Avenue'
    b.processingStatus = '异常'; b.blockReason = '平台取消处理中'
    routing.forEach(rule => { rule.enabled = true })
    const result = 解除合单组合([a.systemOrderNo], now + 60_000)
    expect(result.total).toBe(2)
    expect(共享合单记录.value.find(row => row.orderNo === a.systemOrderNo)!.status).toBe('已放单')
    expect(共享合单记录.value.find(row => row.orderNo === b.systemOrderNo)!.status).toBe('已排除')
    expect(a.defaultRoute?.warehouse).toBe('万邑通美西仓')
    expect(a.manualShippingPlan).toBeUndefined()
    expect(b.defaultRoute).toBeUndefined()
    const count = 共享合单记录.value.length
    执行合单轮次(now + 2 * 60_000)
    expect(共享合单记录.value.length).toBe(count)
    expect(订单正在等单(a.systemOrderNo)).toBe(false)
  })
  it('不同入池规则进入公共池合并，旧单规则动作完全不影响全局策略，审计保留全部命中来源', () => {
    const { orders, rules } = 创建跨规则同组()
    Object.assign(rules[0]!, { mergeAction: { mode: 'advanced', maxWaitMinutes: 999 } })
    Object.assign(rules[1]!, { mergeAction: { mode: 'invalid', maxOrders: 0 } })
    const result = 执行合单轮次(now)!
    expect(result.merged, JSON.stringify(result.rows)).toBe(2)
    expect(orders[0]!.manualShippingPlan?.orderNos).toEqual(orders.map(order => order.systemOrderNo))
    expect(orders[0]!.manualShippingPlan?.createdByRule?.rules.map(rule => rule.id)).toEqual(['POOL-1', 'POOL-2'])
    expect(共享合单记录.value.map(record => record.ruleId)).toEqual(['POOL-1', 'POOL-2'])
    expect(共享合单记录.value.every(record => record.action.mode === 'basic' && record.settingsVersion === 1)).toBe(true)
  })
  it('全局设置新旧版本不混池且旧单不延时；同规则修改条件仅留下命中版本追踪', () => {
    const { orders } = 创建跨规则同组()
    const later = orders[1]!
    共享订单.value = [orders[0]!]
    使用全局高级()
    执行合单轮次(now)
    const old = 共享合单记录.value[0]!
    const deadline = old.deadlineAt
    共享自动合单设置.value = { ...共享自动合单设置.value, version: 2, policy: { ...共享自动合单设置.value.policy, maxWaitMinutes: 600 } }
    共享订单.value.push(later)
    执行合单轮次(now + 60_000)
    expect(共享合单记录.value.map(record => record.settingsVersion)).toEqual([1, 2])
    expect(共享合单记录.value.every(record => record.status === '等单中')).toBe(true)
    expect(old.deadlineAt).toBe(deadline)
    expect(old.enteredAt).toBe(now)
    expect(old.action.maxWaitMinutes).toBe(120)
  })
  it('停用某入池规则结束整个跨规则候选组等待；分仓失败后仍整组重试', () => {
    const { rules } = 创建跨规则同组()
    使用全局高级({ readyOrderCount: 3 })
    执行合单轮次(now)
    expect(共享合单记录.value.every(record => record.status === '等单中')).toBe(true)
    const routing = 共享规则.value.filter(rule => rule.type === '分仓规则' && rule.enabled)
    routing.forEach(rule => { rule.enabled = false })
    rules[0]!.enabled = false
    处理合单到期(now + 60_000)
    expect(共享合单记录.value.every(record => record.status === '分仓待处理')).toBe(true)
    expect(new Set(共享合单记录.value.map(record => record.groupId)).size).toBe(1)
    expect(共享合单记录.value.every(record => record.reason.includes('整组结束等待'))).toBe(true)
    routing.forEach(rule => { rule.enabled = true })
    重试合单分仓([共享合单记录.value[0]!.orderNo], now + 2 * 60_000)
    expect(共享合单记录.value.every(record => record.status === '已放单')).toBe(true)
  })
  it('多规则试算使用明确传入的全局快照，不受当前已保存模式变化影响', () => {
    const { orders, rules } = 创建跨规则同组()
    const frozen = { ...创建默认合单动作(), mode: 'advanced' as const, readyOrderCount: 3 }
    const result = 试算自动合单规则(rules, copy(orders), now, frozen, 8)
    expect(result.groups).toEqual([])
    expect(result.records).toHaveLength(2)
    expect(result.records.every(record => record.action.mode === 'advanced' && record.settingsVersion === 8)).toBe(true)
    expect(共享合单记录.value).toEqual([])
  })
  it('任一规则已知命中即可入公共池，前置未知条件不阻断另一个明确入口', () => {
    const { rules } = 创建跨规则同组()
    共享规则.value.unshift({ ...copy(rules[0]!), id: 'UNKNOWN-FIRST', priority: 0, conditions: [{ field: 'orderWeight', operator: '介于', value: '1', upperValue: '2' }] })
    const result = 执行合单轮次(now)!
    expect(result.merged).toBe(2)
    expect(共享合单记录.value.map(record => record.ruleId)).toEqual(['POOL-1', 'POOL-2'])
  })
  it('同一订单命中多条准入规则只入池一次，首个命中仅用于追踪', () => {
    const { rules } = 创建跨规则同组()
    共享规则.value.push({ ...copy(rules[0]!), id: 'DUPLICATE', priority: 10 })
    使用全局高级({ readyOrderCount: 3 })
    执行合单轮次(now)
    执行合单轮次(now + 60_000)
    expect(共享合单记录.value).toHaveLength(2)
    expect(共享合单记录.value.map(record => record.ruleId)).toEqual(['POOL-1', 'POOL-2'])
    expect(共享合单记录.value.every(record => record.enteredAt === now)).toBe(true)
  })
})
