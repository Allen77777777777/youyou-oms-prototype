import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDialog, ElMessage, ElMessageBox, ElTabs } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import Panel from './自动合单面板.vue'
import Progress from './自动合单进度.vue'
import { 共享合单记录, 共享合单执行结果 } from './自动合单状态'
import { 共享自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
import { 读取合单分组身份, type 合单等待记录 } from './自动合单模型'
import { 共享订单, 创建作业样例, 订单版本 } from './演示会话'
import { 自动合单样例资料 } from './自动合单演示'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 创建合单展示组 } from './合单分组展示'

const runtime = vi.hoisted(() => ({ run: vi.fn(), release: vi.fn(), retry: vi.fn(), dissolve: vi.fn() }))
vi.mock('./自动合单会话', () => ({
  执行合单轮次: runtime.run,
  结束合单等待: runtime.release,
  重试合单分仓: runtime.retry,
  解除合单组合: runtime.dissolve,
}))

let wrapper: VueWrapper | undefined
const originalOrders = [...共享订单.value]
const originalVersions = { ...订单版本.value }
const originalSourceFacts = JSON.parse(JSON.stringify(自动合单样例资料))
const now = new Date('2026-11-13T02:00:00Z').getTime()
function record(orderNo: string, groupKey = 'same-buyer', status: 合单等待记录['status'] = '等单中'): 合单等待记录 {
  const source = 创建作业样例(800, { systemOrderNo: orderNo, buyerExternalId: groupKey, shipByAt: undefined, urgency: '无时限' })
  source.items[0]!.orderedQuantity = 1; source.items[0]!.fulfillableQuantity = 1; source.items[0]!.skuResolutionStatus = '成功'
  共享订单.value = [...共享订单.value.filter(order => order.systemOrderNo !== orderNo), source]
  return {
    orderNo, ruleId: 'entry-1', ruleName: '美国订单入池', ruleVersion: 1, settingsVersion: 1,
    action: { ...创建默认合单动作(), mode: 'advanced', releaseMode: 'scheduled', releaseTimes: ['14:00'] },
    groupKey: 读取合单分组身份(source).key!, quantity: 1, enteredAt: now, deadlineAt: now + 120 * 60_000,
    deadlineReason: '最长等待上限', status, reason: '等待同组订单或到期放单',
  }
}
beforeEach(() => {
  共享合单记录.value = []
  共享合单执行结果.value = null
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
  共享下次合单时间.value = null
  for (const mock of Object.values(runtime)) mock.mockReset()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined; 共享订单.value = [...originalOrders]; 订单版本.value = { ...originalVersions }
  for (const key of Object.keys(自动合单样例资料)) delete 自动合单样例资料[key]
  Object.assign(自动合单样例资料, originalSourceFacts)
  vi.restoreAllMocks()
})
async function open() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/oms/self-fulfillment/processing', component: { template: '<div />' } },
    { path: '/oms/self-fulfillment/order-rules', component: { template: '<div />' } },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } },
  ] })
  await router.push('/oms/self-fulfillment/processing')
  await router.isReady()
  wrapper = mount(Panel, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } })
  return router
}
async function click(label: string) {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label)
  expect(button).toBeDefined()
  button!.click()
  await flushPromises()
}
async function show() {
  await wrapper!.get('button[aria-label="合单处理"]').trigger('click')
  await flushPromises()
}
async function tab(value: string) {
  const title = { waiting: '等待中', blocked: '分仓待处理', history: '已结束记录', result: '最近执行结果' }[value]
  const target = [...document.body.querySelectorAll<HTMLElement>('[role="tab"]')].find(item => item.textContent?.startsWith(title!))
  expect(target).toBeDefined()
  target!.click()
  await flushPromises()
}

describe('合单处理弹窗', () => {
  it('收起时仅有工具栏入口，打开不会执行，配置链接关闭弹窗并进入唯一设置页', async () => {
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B')]
    const router = await open()
    expect(wrapper!.findAll('button')).toHaveLength(1)
    expect(wrapper!.text()).toContain('合单处理2')
    expect(wrapper!.text()).not.toContain('自动任务')
    expect(wrapper!.getComponent(ElDialog).props('modelValue')).toBe(false)
    expect(document.body.textContent).not.toContain('自动任务已关闭')
    await show()
    expect(wrapper!.getComponent(ElDialog).props('modelValue')).toBe(true)
    expect(document.querySelector('[role="dialog"] .el-dialog')).not.toBeNull()
    expect(document.querySelector('.el-drawer')).toBeNull()
    expect(document.body.textContent).toContain('等待中（2）')
    expect(document.body.textContent).toContain('分仓待处理（0）')
    expect(document.body.textContent).toContain('已结束记录')
    expect(document.body.textContent).toContain('最近执行结果')
    expect(runtime.run).not.toHaveBeenCalled()
    await click('合单设置')
    expect(router.currentRoute.value.fullPath).toBe('/oms/self-fulfillment/order-rules?type=merge')
    expect(wrapper!.getComponent(ElDialog).props('modelValue')).toBe(false)
    expect(runtime.run).not.toHaveBeenCalled()
  })

  it('按组勾选结束等待时确认组数、订单数与完整名单，取消不执行，确认后只释放该组', async () => {
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B'), record('WAIT-C', 'other-buyer')]
    await open()
    await show()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm' as never)
    wrapper!.getComponent({ name: 'ElTable' }).vm.$emit('selection-change', [创建合单展示组(共享合单记录.value, 共享订单.value, 'waiting')[0]])
    await flushPromises()
    await click('结束所选等待')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('共 2 张'), '结束合单等待', expect.any(Object))
    expect(confirm.mock.calls[0]![0]).toContain('1 组')
    expect(confirm.mock.calls[0]![0]).toContain('WAIT-A、WAIT-B')
    expect(runtime.release).not.toHaveBeenCalled()
    await click('结束所选等待')
    expect(runtime.release).toHaveBeenCalledWith(['WAIT-A', 'WAIT-B'])
    expect(wrapper!.emitted('executed')).toHaveLength(1)
    expect(wrapper!.getComponent(ElTabs).props('modelValue')).toBe('result')
    await tab('waiting')
    expect([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '结束所选等待')?.disabled).toBe(true)
  })

  it('分仓失败在弹窗整组重试，立即执行后查看结果且不改变任务开关', async () => {
    共享合单记录.value = [{ ...record('BLOCK-A', 'same-buyer', '分仓待处理'), groupId: 'GROUP-1', reason: '未匹配共同仓库' }]
    await open()
    await show()
    await tab('blocked')
    expect(document.body.textContent).toContain('未匹配共同仓库')
    await click('整组重试分仓')
    expect(runtime.retry).toHaveBeenCalledWith(['BLOCK-A'])
    runtime.run.mockImplementation(() => {
      共享合单执行结果.value = { executedAt: now, source: '立即执行', total: 1, merged: 0, released: 0, waiting: 1, skipped: 0, rows: [{ orderNo: 'WAIT-D', status: '等单中', reason: '等待下一张订单' }] }
    })
    await click('立即执行合单')
    expect(runtime.run).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('WAIT-D')
    expect(共享自动合单设置.value.enabled).toBe(false)
  })

  it('列表只展示进度和预计放单，完整规则和原因保留在弹窗记录', async () => {
    共享合单记录.value = [record('WAIT-A')]
    wrapper = mount(Progress, { props: { orderNo: 'WAIT-A' } })
    expect(wrapper.text()).toContain('合单 · 等单中')
    expect(wrapper.text()).toContain('预计放单')
    expect(wrapper.text()).not.toContain('美国订单入池')
    expect(wrapper.text()).not.toContain('等待同组订单或到期放单')
  })

  it('订单号查询先查整组，筛选草稿不提前生效，展开后可查看来源与入池快照并跳转订单', async () => {
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B'), record('WAIT-C', 'other-buyer')]
    共享订单.value = ['WAIT-A', 'WAIT-B', 'WAIT-C'].map((systemOrderNo, index) => 创建作业样例(index + 200, { systemOrderNo, storeId: 'store-demo', storeName: '演示综合店' }))
    const router = await open()
    await show()
    const search = wrapper!.getComponent(FieldSearch)
    search.vm.$emit('update:modelValue', 'WAIT-B')
    search.vm.$emit('update:mode', 'exact')
    await flushPromises()
    expect(wrapper!.getComponent({ name: 'ElTable' }).props('data')).toHaveLength(2)
    search.vm.$emit('search')
    await flushPromises()
    const groups = wrapper!.getComponent({ name: 'ElTable' }).props('data')
    expect(groups).toHaveLength(1)
    expect(groups[0].orderNos).toEqual(['WAIT-A', 'WAIT-B'])
    expect(document.body.textContent).toContain('当前 1 组 / 2 张订单')
    const expand = document.querySelector<HTMLElement>('.el-table__expand-icon')
    expect(expand).not.toBeNull()
    expand!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('入池时设置 · V1')
    expect(document.body.textContent).toContain('WAIT-A')
    expect(document.body.textContent).toContain('WAIT-B')
    expect(document.body.textContent).toContain('美国订单入池')
    await click('WAIT-B')
    expect(router.currentRoute.value.fullPath).toBe('/oms/orders/all/WAIT-B')
    expect(wrapper!.getComponent(ElDialog).props('modelValue')).toBe(false)
  })

  it('确认弹窗打开后候选组变化，不按旧确认释放新增成员', async () => {
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B')]
    await open()
    await show()
    let finish!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    wrapper!.getComponent({ name: 'ElTable' }).vm.$emit('selection-change', [创建合单展示组(共享合单记录.value, [], 'waiting')[0]])
    await flushPromises()
    await click('结束所选等待')
    共享合单记录.value.push(record('WAIT-C'))
    finish('confirm')
    await flushPromises()
    expect(runtime.release).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('确认期间组内订单已变化，请重新选择并确认完整组')
  })

  it.each(['来源数量', '来源身份', '来源资格', '来源版本', '容量外同池来源数量', '容量外同池来源重量'] as const)('确认期间%s变化但等待记录尚未复核，不执行旧确认', async change => {
    const action = { ...record('unused').action, maxQuantity: 2 }
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B'), { ...record('WAIT-C'), quantity: 2 }].map(row => ({ ...row, action: { ...action } }))
    共享订单.value = 共享订单.value.filter(order => ['WAIT-A', 'WAIT-B', 'WAIT-C'].includes(order.systemOrderNo))
    共享订单.value.find(order => order.systemOrderNo === 'WAIT-C')!.items[0]!.orderedQuantity = 2
    共享订单.value.find(order => order.systemOrderNo === 'WAIT-C')!.items[0]!.fulfillableQuantity = 2
    自动合单样例资料['WAIT-C'] = { siteId: 'US', weightKg: '2' }
    共享合单记录.value[2]!.weightKg = '2'
    await open()
    await show()
    let finish!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    const groups = 创建合单展示组(共享合单记录.value, 共享订单.value, 'waiting')
    expect(groups.map(group => group.orderNos)).toEqual([['WAIT-A', 'WAIT-B'], ['WAIT-C']])
    wrapper!.getComponent({ name: 'ElTable' }).vm.$emit('selection-change', [groups[0]])
    await flushPromises()
    await click('结束所选等待')
    const first = 共享订单.value[0]!, other = 共享订单.value[2]!
    if (change === '来源数量') first.items[0]!.fulfillableQuantity = 99
    else if (change === '来源身份') first.address.addressLine2 = 'UNIT-CHANGED'
    else if (change === '来源资格') first.processingStatus = '异常'
    else if (change === '来源版本') 订单版本.value[first.systemOrderNo] = 999
    else if (change === '容量外同池来源数量') other.items[0]!.fulfillableQuantity = 99
    else 自动合单样例资料['WAIT-C']!.weightKg = '99'
    expect(创建合单展示组(共享合单记录.value, 共享订单.value, 'waiting').map(group => group.orderNos)).toEqual([['WAIT-A', 'WAIT-B'], ['WAIT-C']])
    finish('confirm')
    await flushPromises()
    expect(runtime.release).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('确认期间来源订单或合单资料已变化，请重新查看并确认完整组')
  })

  it('来源在打开结束等待确认前已变时拒绝操作，不能按旧组名单带出容量外成员', async () => {
    共享合单记录.value = [record('WAIT-A'), record('WAIT-B'), record('WAIT-C')]
    for (const row of 共享合单记录.value) row.action.maxQuantity = 2
    const source = 共享订单.value.find(order => order.systemOrderNo === 'WAIT-A')!
    source.items[0]!.orderedQuantity = 2; source.items[0]!.fulfillableQuantity = 2
    await open(); await show()
    const groups = 创建合单展示组(共享合单记录.value, 共享订单.value, 'waiting')
    expect(groups.map(group => group.orderNos)).toEqual([['WAIT-A', 'WAIT-B'], ['WAIT-C']])
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    wrapper!.getComponent({ name: 'ElTable' }).vm.$emit('selection-change', [groups[0]])
    await flushPromises()
    const snapshot = JSON.stringify({ records: 共享合单记录.value, orders: 共享订单.value })
    await click('结束所选等待')
    expect(confirm).not.toHaveBeenCalled()
    expect(runtime.release).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('当前可发数量与等待记录不一致'))
    expect(JSON.stringify({ records: 共享合单记录.value, orders: 共享订单.value })).toBe(snapshot)
  })

  it('分仓待处理按冻结组展示，解除前确认整组名单而非只展示首张来源', async () => {
    共享合单记录.value = [
      { ...record('BLOCK-A', 'buyer-a', '分仓待处理'), groupId: 'GROUP-1' },
      { ...record('BLOCK-B', 'changed-buyer', '分仓待处理'), groupId: 'GROUP-1' },
    ]
    await open()
    await show()
    await tab('blocked')
    expect(wrapper!.getComponent({ name: 'ElTable' }).props('data')).toHaveLength(1)
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
    await click('解除组合')
    expect(confirm.mock.calls[0]![0]).toContain('1 组，共 2 张订单')
    expect(confirm.mock.calls[0]![0]).toContain('BLOCK-A、BLOCK-B')
    expect(runtime.dissolve).toHaveBeenCalledWith(['BLOCK-A', 'BLOCK-B'])
  })

  it('解除确认期间冻结组来源资格变化但名单未变，保留原组并要求重新确认', async () => {
    共享合单记录.value = [{ ...record('BLOCK-A', 'buyer-a', '分仓待处理'), groupId: 'GROUP-1' }, { ...record('BLOCK-B', 'buyer-a', '分仓待处理'), groupId: 'GROUP-1' }]
    共享订单.value = ['BLOCK-A', 'BLOCK-B'].map((systemOrderNo, index) => 创建作业样例(index + 400, { systemOrderNo }))
    await open()
    await show()
    await tab('blocked')
    let finish!: (value: unknown) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    await click('解除组合')
    共享订单.value[1]!.processingStatus = '异常'
    finish('confirm')
    await flushPromises()
    expect(runtime.dissolve).not.toHaveBeenCalled()
    expect(共享合单记录.value.every(row => row.groupId === 'GROUP-1')).toBe(true)
    expect(ElMessage.warning).toHaveBeenCalledWith('确认期间来源订单或合单资料已变化，请重新查看并确认完整组')
  })

  it('原组标识缺失时独立展示待核实记录，不用空组号串联多个失败订单执行', async () => {
    共享合单记录.value = [record('BLOCK-A', 'buyer-a', '分仓待处理'), record('BLOCK-B', 'buyer-b', '分仓待处理')]
    await open()
    await show()
    await tab('blocked')
    expect(wrapper!.getComponent({ name: 'ElTable' }).props('data')).toHaveLength(2)
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')].filter(button => ['整组重试分仓', '解除组合'].includes(button.textContent?.trim() ?? ''))
    expect(buttons).toHaveLength(4)
    expect(buttons.every(button => button.disabled)).toBe(true)
    expect(document.body.textContent).toContain('原组标识待核实')
    expect(runtime.retry).not.toHaveBeenCalled()
    expect(runtime.dissolve).not.toHaveBeenCalled()
  })
})

