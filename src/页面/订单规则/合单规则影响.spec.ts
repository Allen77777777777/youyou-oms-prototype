import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ElMessage, ElMessageBox, type MessageBoxData } from 'element-plus'
import MergeImpact from './合单影响确认内容.vue'
import { 创建默认合单动作 } from './合单规则模型'
import { 获取合单规则退出影响, 确认合单规则退出 } from './合单规则影响'
import { 创建合单等待记录, 读取合单分组身份, type 合单等待记录 } from '../订单处理/自动合单模型'
import { 共享合单记录 } from '../订单处理/自动合单状态'
import { 共享订单, 创建作业样例 } from '../订单处理/演示会话'

const before = JSON.stringify(共享合单记录.value)
const originalOrders = JSON.stringify(共享订单.value)
function record(orderNo: string, ruleId: string, groupKey = 'same-buyer'): 合单等待记录 {
  const order = 创建作业样例(800, { systemOrderNo: orderNo, buyerExternalId: groupKey, shipByAt: undefined, urgency: '无时限' })
  order.items[0]!.orderedQuantity = 1; order.items[0]!.fulfillableQuantity = 1; order.items[0]!.skuResolutionStatus = '成功'
  共享订单.value.push(order)
  return 创建合单等待记录({ orderNo, ruleId, groupKey: 读取合单分组身份(order).key!, ruleName: ruleId, ruleVersion: 1, settingsVersion: 1, quantity: 1, action: { ...创建默认合单动作(), mode: 'advanced', readyOrderCount: 3 } }, Date.parse('2026-11-13T10:00:00+08:00'))
}
beforeEach(() => {
  共享订单.value = []
  共享合单记录.value = [record('ORDER-A', 'RULE-A'), record('ORDER-B', 'RULE-B'), record('ORDER-C', 'RULE-C', 'another-buyer')]
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { 共享合单记录.value = JSON.parse(before); 共享订单.value = JSON.parse(originalOrders); vi.restoreAllMocks() })

describe('合单规则退出的完整影响确认', () => {
  it('停用任一来源包含同组其他规则订单，批量规则去重且不牵连已结束组', () => {
    const ended = record('ENDED', 'RULE-A'); ended.status = '已放单'; 共享合单记录.value.push(ended)
    expect(获取合单规则退出影响(['RULE-A', 'RULE-B'])).toEqual([['ORDER-A', 'ORDER-B']])
    expect(获取合单规则退出影响(['missing'])).toEqual([])
  })
  it('确认展示完整组数、单数和名单，并说明后续仍需发货条件校验', () => {
    const page = mount(MergeImpact, { props: { message: '停用规则', groups: 获取合单规则退出影响(['RULE-A']) }, global: { directives: { prototype: {} } } })
    expect(page.text()).toContain('1 组、2 张订单')
    expect(page.text()).toContain('ORDER-A、ORDER-B')
    expect(page.text()).toContain('不代表立即发货')
    expect(page.find('details').attributes()).toHaveProperty('open')
    page.unmount()
  })
  it('取消确认不修改任何等待记录', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const snapshot = JSON.stringify(共享合单记录.value)
    expect(await 确认合单规则退出(['RULE-A'], { message: '停用规则', title: '停用', confirmButtonText: '确认' })).toBe(false)
    expect(JSON.stringify(共享合单记录.value)).toBe(snapshot)
  })
  it('确认期间新同组订单到达则阻止沿用旧名单执行', async () => {
    let resolve!: (value: MessageBoxData) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = 确认合单规则退出(['RULE-A'], { message: '停用规则', title: '停用', confirmButtonText: '确认' })
    共享合单记录.value.push(record('ORDER-D', 'RULE-D'))
    resolve(Object.assign('confirm' as const, { value: '', action: 'confirm' as const }))
    expect(await pending).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('等待组合已变化'))
    expect(共享合单记录.value.every(row => row.status === '等单中')).toBe(true)
  })
  it('未变化的完整组确认成功，本身不释放或改写订单', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(Object.assign('confirm' as const, { value: '', action: 'confirm' as const }))
    const snapshot = JSON.stringify(共享合单记录.value)
    expect(await 确认合单规则退出(['RULE-A'], { message: '删除规则', title: '删除', confirmButtonText: '确认' })).toBe(true)
    expect(JSON.stringify(共享合单记录.value)).toBe(snapshot)
  })
  it('来源数量变化但等待记录尚未刷新时也拒绝旧确认，防止重分组牵连未确认成员', async () => {
    let resolve!: (value: MessageBoxData) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = 确认合单规则退出(['RULE-A'], { message: '停用规则', title: '停用', confirmButtonText: '确认' })
    共享订单.value[0]!.items[0]!.fulfillableQuantity = 2
    resolve(Object.assign('confirm' as const, { value: '', action: 'confirm' as const }))
    expect(await pending).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('等待组合已变化'))
  })
  it('打开确认前来源已变也拒绝旧范围，不弹出仅含旧两单的确认', async () => {
    共享合单记录.value.push(record('ORDER-D', 'RULE-D'))
    for (const row of 共享合单记录.value) row.action.maxQuantity = 2
    const source = 共享订单.value.find(order => order.systemOrderNo === 'ORDER-A')!
    source.items[0]!.orderedQuantity = 2; source.items[0]!.fulfillableQuantity = 2
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const snapshot = JSON.stringify({ records: 共享合单记录.value, orders: 共享订单.value })
    expect(await 确认合单规则退出(['RULE-A'], { message: '停用规则', title: '停用', confirmButtonText: '确认' })).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('当前可发数量与等待记录不一致'))
    expect(JSON.stringify({ records: 共享合单记录.value, orders: 共享订单.value })).toBe(snapshot)
  })
})
