import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { 共享订单, 创建作业样例, 仓库执行记录 } from './演示会话'
import { 共享合单记录 } from './自动合单状态'
import { 自动合单样例资料 } from './自动合单演示'
import { 创建合单等待记录, 读取合单分组身份 } from './自动合单模型'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
import { 校验合单操作来源一致性, 合单操作复核快照 } from './合单操作快照'

const original = JSON.stringify({ orders: 共享订单.value, records: 共享合单记录.value, facts: 自动合单样例资料, warehouse: 仓库执行记录.value })
beforeEach(() => {
  共享订单.value = ['CHECK-A', 'CHECK-B', 'CHECK-C'].map(systemOrderNo => {
    const order = 创建作业样例(800, { systemOrderNo, shipByAt: undefined, urgency: '无时限' })
    order.items[0]!.orderedQuantity = 1; order.items[0]!.fulfillableQuantity = 1; order.items[0]!.skuResolutionStatus = '成功'
    自动合单样例资料[systemOrderNo] = { weightKg: '1', siteId: 'US' }
    return order
  })
  共享合单记录.value = 共享订单.value.map((order, index) => 创建合单等待记录({
    orderNo: order.systemOrderNo, ruleId: index ? 'OTHER' : 'SELECTED', ruleName: '入口', ruleVersion: 1, settingsVersion: 1,
    quantity: 1, weightKg: '1', groupKey: 读取合单分组身份(order, true, 'US').key!,
    action: { ...创建默认合单动作(), mode: 'advanced', readyOrderCount: 3, maxQuantity: 2, maxWeightKg: '5', groupBySite: true },
  }, Date.parse('2026-11-13T10:00:00+08:00')))
})
afterEach(() => {
  const saved = JSON.parse(original)
  共享订单.value = saved.orders; 共享合单记录.value = saved.records; 仓库执行记录.value = saved.warehouse
  for (const key of Object.keys(自动合单样例资料)) delete 自动合单样例资料[key]
  Object.assign(自动合单样例资料, saved.facts)
})

describe('合单操作前只读源一致性核验', () => {
  it('已一致的来源可以确认，核验不改订单、等单记录或日志', () => {
    const before = 合单操作复核快照(['CHECK-A', 'CHECK-B'])
    expect(校验合单操作来源一致性(['CHECK-A', 'CHECK-B'])).toBe('')
    expect(合单操作复核快照(['CHECK-A', 'CHECK-B'])).toBe(before)
  })
  it.each(['数量', '重量', '站点', '资格', '更早截止'] as const)('容量外同池来源的%s已变化也需先复核，不能沿旧名单确认', kind => {
    const order = 共享订单.value[2]!
    if (kind === '数量') { order.items[0]!.orderedQuantity = 2; order.items[0]!.fulfillableQuantity = 2 }
    else if (kind === '重量') 自动合单样例资料[order.systemOrderNo]!.weightKg = '4'
    else if (kind === '站点') 自动合单样例资料[order.systemOrderNo]!.siteId = 'CA'
    else if (kind === '资格') order.processingStatus = '异常'
    else order.shipByAt = '2026-11-13T11:00:00+08:00'
    const before = 合单操作复核快照(['CHECK-A', 'CHECK-B'])
    expect(校验合单操作来源一致性(['CHECK-A', 'CHECK-B'])).toContain('CHECK-C')
    expect(校验合单操作来源一致性(['CHECK-A', 'CHECK-B'])).toContain('立即执行合单')
    expect(合单操作复核快照(['CHECK-A', 'CHECK-B'])).toBe(before)
  })
  it('当前来源缺失或重复时拒绝确认', () => {
    共享订单.value.pop()
    expect(校验合单操作来源一致性(['CHECK-A'])).toContain('不存在或编号不唯一')
    共享订单.value.push(共享订单.value[0]!)
    expect(校验合单操作来源一致性(['CHECK-A'])).toContain('不存在或编号不唯一')
  })
  it('冻结失败组合仍允许解除已知身份变化或取消来源，不重新分组或放行来源', () => {
    共享合单记录.value.forEach(row => { row.status = '分仓待处理'; row.groupId = 'FROZEN' })
    共享订单.value[0]!.processingStatus = '异常'
    共享订单.value[1]!.address.addressLine2 = 'changed'
    const before = 合单操作复核快照(['CHECK-A', 'CHECK-B', 'CHECK-C'])
    expect(校验合单操作来源一致性(['CHECK-A', 'CHECK-B', 'CHECK-C'], '解除组合')).toBe('')
    expect(合单操作复核快照(['CHECK-A', 'CHECK-B', 'CHECK-C'])).toBe(before)
  })
  it('确认快照覆盖关联仓库执行，新增执行会使旧快照失效', () => {
    const before = 合单操作复核快照(['CHECK-A'])
    仓库执行记录.value.push({ 履约单号: 'CURRENT-EXECUTION', 订单号: ['CHECK-A'], 出库单号: 'DEMO-CURRENT-EXECUTION', 状态: '下单中', 待核查: true, 原因: '待核实仓库回执', 更新时间: '2026-11-13 10:30:00' })
    expect(合单操作复核快照(['CHECK-A'])).not.toBe(before)
    expect(校验合单操作来源一致性(['CHECK-A'])).toContain('合单资格需重新核实')
  })
})
