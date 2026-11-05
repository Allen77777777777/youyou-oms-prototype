import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ElCheckboxGroup, ElInputNumber, ElSwitch } from 'element-plus'
import Page from './业务配置页面.vue'
import { 保存自动推单设置, 共享自动推单设置, 是推单执行日 } from './自动推单设置'
import { 运行自动推单轮次, 自动同步推单结果, 最近自动推单轮次 } from './自动推单执行'
import { 共享订单, 仓库执行记录, 订单版本, 操作核查证据, 演示库存, 当前版本, 执行演示推单, 执行异常人工审核 } from '../订单处理/演示会话'
import { 初始化新单首轮样例 } from '../订单处理/审单规则执行'
import { 执行演示恢复发货 } from '../订单处理/操作功能模型'
import { 启动循环推单 } from './循环推单'

const snapshot = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, versions: 订单版本.value, evidence: 操作核查证据.value, stock: 演示库存.value })
const 一小时 = 3_600_000
let page: VueWrapper | undefined
let scope: EffectScope | undefined
function restore() {
  仓库执行记录.value = []
  自动同步推单结果()
  const data = JSON.parse(snapshot)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 订单版本.value = data.versions
  操作核查证据.value = data.evidence; 演示库存.value = data.stock
  最近自动推单轮次.value = undefined
  保存自动推单设置({ enabled: false, intervalHours: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] })
}
function onlyReady() {
  const order = 共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-ACTION-07')!
  共享订单.value = [order]; 仓库执行记录.value = []
  return order
}
beforeEach(restore)
afterEach(() => { scope?.stop(); scope = undefined; page?.unmount(); page = undefined; vi.useRealTimers(); restore() })

describe('自动推单配置与执行', () => {
  it('保存星期集合与频率，取消不改生效配置，导航切换保留独立草稿', async () => {
    page = mount(Page, { global: { directives: { prototype: {} } } })
    await page.findAll('nav button')[1]!.trigger('click')
    const panel = page.get('#auto-push-settings')
    await panel.findAll('button').find(项 => 项.text() === '编辑')!.trigger('click')
    const push = page.findComponent({ name: '自动推单设置面板' })
    push.getComponent(ElSwitch).vm.$emit('update:modelValue', true)
    push.getComponent(ElInputNumber).vm.$emit('update:modelValue', 3)
    push.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', [1, 3, 5])
    await page.findAll('nav button')[0]!.trigger('click')
    await page.findAll('nav button')[1]!.trigger('click')
    expect(push.getComponent(ElInputNumber).props('modelValue')).toBe(3)
    expect(共享自动推单设置.value.enabled).toBe(false)
    await panel.findAll('button').find(项 => 项.text() === '保存')!.trigger('click')
    expect(共享自动推单设置.value).toEqual({ enabled: true, intervalHours: 3, weekdays: [1, 3, 5] })
    expect(panel.text()).toContain('星期一、星期三、星期五')
    await panel.findAll('button').find(项 => 项.text() === '编辑')!.trigger('click')
    push.getComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await panel.findAll('button').find(项 => 项.text() === '取消')!.trigger('click')
    expect(共享自动推单设置.value.enabled).toBe(true)
  })

  it('空日期及无效频率拒绝保存；相同设置不重置引用，星期按北京日期判断', () => {
    const saved = 共享自动推单设置.value
    for (const intervalHours of [0, 25, NaN, Infinity, 1.5]) expect(保存自动推单设置({ enabled: true, intervalHours, weekdays: [1] })).toContain('执行频率')
    for (const weekdays of [[], [0], [8], [1.5]]) expect(保存自动推单设置({ enabled: true, intervalHours: 1, weekdays })).toContain('执行日期')
    保存自动推单设置({ enabled: false, intervalHours: 1, weekdays: [7, 6, 5, 4, 3, 2, 1, 1] })
    expect(共享自动推单设置.value).toBe(saved)
    expect(是推单执行日([2], Date.parse('2026-11-02T16:00:00Z'))).toBe(true)
    expect(是推单执行日([1], Date.parse('2026-11-02T15:59:59Z'))).toBe(true)
  })

  it('自动提交只到下单中，回查明确成功才待发货，手工抢先推单不产生重复', () => {
    const order = onlyReady()
    const no = order.fulfillmentOrders[0]!.fulfillmentOrderNo
    expect(运行自动推单轮次()?.submitted).toBe(1)
    expect(order.processingStatus).toBe('待推单')
    expect(仓库执行记录.value[0]!.状态).toBe('下单中')
    expect(执行演示推单(order.systemOrderNo, no, 当前版本(order.systemOrderNo)).成功).toBe(false)
    expect(运行自动推单轮次()?.submitted).toBe(0)
    expect(仓库执行记录.value).toHaveLength(1)
    自动同步推单结果()
    expect(order.processingStatus).toBe('待发货')
    expect(order.operationLogs[order.operationLogs.length - 1]?.operator).toBe('自动推单任务')
    expect(order.fulfillmentOrders[0]!.shippedQuantity).toBe(0)
  })

  it('合并来源按一张履约推送，全部来源共同复验', () => {
    const a = onlyReady()
    const b = JSON.parse(JSON.stringify(a)) as typeof a
    b.systemOrderNo = 'OMS-DEMO-AUTO-MERGE-02'
    共享订单.value.push(b)
    const quantity = a.items.reduce((sum, item) => sum + item.fulfillableQuantity!, 0) * 2
    a.fulfillmentOrders[0]!.plannedQuantity = quantity
    b.fulfillmentOrders[0]!.plannedQuantity = quantity
    演示库存.value[b.systemOrderNo] = '不足'
    expect(运行自动推单轮次()?.blocked).toBe(1)
    expect(仓库执行记录.value).toHaveLength(0)
    演示库存.value[b.systemOrderNo] = '充足'
    expect(运行自动推单轮次()?.submitted).toBe(1)
    expect(仓库执行记录.value[0]!.订单号).toEqual([a.systemOrderNo, b.systemOrderNo])
    自动同步推单结果()
    expect(a.processingStatus).toBe('待发货'); expect(b.processingStatus).toBe('待发货')
  })

  it('失败与未知不重发；平台不允许、库存不足及异常恢复均不自动提交', () => {
    const ready = onlyReady()
    演示库存.value[ready.systemOrderNo] = '不足'
    expect(运行自动推单轮次()?.submitted).toBe(0)
    演示库存.value[ready.systemOrderNo] = '充足'
    操作核查证据.value[ready.systemOrderNo]!.平台允许 = false
    expect(运行自动推单轮次()?.submitted).toBe(0)
    操作核查证据.value[ready.systemOrderNo]!.平台允许 = true
    ready.processingStatus = '异常'
    expect(执行演示恢复发货(ready.systemOrderNo, 当前版本(ready.systemOrderNo), '核实原方案仍适用').成功).toBe(true)
    expect(ready.processingStatus).toBe('待推单')
    expect(运行自动推单轮次()?.rows[0]?.message).toContain('人工推单')
    restore()
    共享订单.value = 共享订单.value.filter(单 => ['OMS-DEMO-ACTION-08', 'OMS-DEMO-ACTION-11'].includes(单.systemOrderNo))
    仓库执行记录.value = 仓库执行记录.value.filter(项 => 项.订单号.some(号 => 共享订单.value.some(单 => 单.systemOrderNo === 号)))
    const count = 仓库执行记录.value.length
    expect(运行自动推单轮次()?.submitted).toBe(0)
    自动同步推单结果(); 自动同步推单结果()
    expect(仓库执行记录.value).toHaveLength(count)
    expect(仓库执行记录.value.some(项 => 项.状态 === '下单失败')).toBe(true)
    expect(共享订单.value.every(单 => 单.processingStatus === '待推单')).toBe(true)
    expect(共享订单.value.find(单 => 单.systemOrderNo.endsWith('11'))!.operationLogs.filter(项 => 项.operationType === '自动查询仓库失败')).toHaveLength(1)
  })

  it('未匹配异常单人工审核通过后，由开关及周期控制推单，关闭后继续查原单', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T00:00:00Z'))
    初始化新单首轮样例()
    const order = 共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-REVIEW-CA')!
    共享订单.value = [order]; 仓库执行记录.value = []
    scope = effectScope(); scope.run(启动循环推单)
    expect(执行异常人工审核(order.systemOrderNo, 当前版本(order.systemOrderNo)).成功).toBe(true)
    await vi.advanceTimersByTimeAsync(一小时)
    expect(仓库执行记录.value).toHaveLength(0)
    保存自动推单设置({ enabled: true, intervalHours: 1, weekdays: [2] })
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    保存自动推单设置({ enabled: true, intervalHours: 1, weekdays: [2] })
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(仓库执行记录.value).toHaveLength(1)
    expect(order.processingStatus).toBe('待推单')
    保存自动推单设置({ enabled: false, intervalHours: 1, weekdays: [2] })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(order.processingStatus).toBe('待发货')
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('非执行日不推单，修改设置重新计时且不补跑历史轮次', async () => {
    onlyReady()
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T00:00:00Z'))
    scope = effectScope(); scope.run(启动循环推单)
    保存自动推单设置({ enabled: true, intervalHours: 1, weekdays: [1] })
    await vi.advanceTimersByTimeAsync(一小时)
    expect(仓库执行记录.value).toHaveLength(0)
    保存自动推单设置({ enabled: true, intervalHours: 2, weekdays: [2] })
    await vi.advanceTimersByTimeAsync(一小时)
    expect(仓库执行记录.value).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(一小时)
    expect(仓库执行记录.value).toHaveLength(1)
  })
})
