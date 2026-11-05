import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed, defineComponent, h, inject, provide, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ActionSettings, { type 设置操作 } from './操作设置弹窗.vue'
import type { 作业行 } from './展示工具'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from './演示会话'

const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value })
const 实例: VueWrapper[] = []
const 桩组件 = {
  ElDialog: { props: ['modelValue'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="设置弹窗"><slot /><slot name="footer" /></section>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElCheckbox: { inheritAttrs: false, props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<label><input v-bind="$attrs" type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' },
  ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="">请选择</option><slot /></select>' },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElAlert: { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  ElTag: { template: '<span><slot /></span>' },
  ElTable: defineComponent({
    props: ['data'],
    setup(props, { slots }) {
      provide('test-action-rows', computed(() => props.data as unknown[]))
      return () => h('div', { class: '目标表' }, slots.default?.() as never)
    },
  }),
  ElTableColumn: defineComponent({
    setup(_props, { slots }) {
      const rows = inject<Ref<unknown[]>>('test-action-rows')!
      return () => h('div', rows.value.map(row => h('div', slots.default?.({ row }) as never)))
    },
  }),
}
function 恢复数据() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions
}
function 单(编号: string) { return 共享订单.value.find(order => order.systemOrderNo === `OMS-DEMO-ACTION-${编号}`)! }
function 行(编号: string, 履约行 = false): 作业行 {
  const order = 单(编号)
  const fulfillment = 履约行 ? order.fulfillmentOrders[0] : undefined
  return { key: fulfillment?.fulfillmentOrderNo || order.systemOrderNo, order, stage: order.processingStatus!, fulfillment, execution: 仓库执行记录.value.find(execution => execution.履约单号 === fulfillment?.fulfillmentOrderNo) }
}
async function 打开组件(操作: Parameters<InstanceType<typeof ActionSettings>['open']>[0], rows: 作业行[], batch = false) {
  const wrapper = mount(ActionSettings, { global: { stubs: 桩组件, directives: { prototype: {} } } })
  实例.push(wrapper)
  ;(wrapper.vm as unknown as InstanceType<typeof ActionSettings>).open(操作, rows, batch)
  await flushPromises()
  return wrapper
}
function 按钮(wrapper: VueWrapper, 名称: string) {
  const button = wrapper.findAll('button').find(item => item.text() === 名称)
  if (!button) throw new Error(`未找到按钮：${名称}`)
  return button
}
function 已禁用(wrapper: VueWrapper, 名称: string) { return (按钮(wrapper, 名称).element as HTMLButtonElement).disabled }

beforeEach(恢复数据)
afterEach(() => { 实例.splice(0).forEach(wrapper => wrapper.unmount()); 恢复数据(); document.body.innerHTML = '' })

describe('操作设置弹窗的对象范围与提交确认', () => {
  it('未匹配异常单笔审核通过后进入待推单，窗口说明可手动或按设置自动推单', async () => {
    const 订单 = 单('01')
    订单.processingStatus = '异常'
    订单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
    const 原仓单数 = 仓库执行记录.value.length
    const page = await 打开组件('人工审核通过', [行('01')])
    expect(page.text()).toContain('未匹配到审单规则')
    expect(page.text()).toContain('从异常进入待推单')
    expect(page.text()).toContain('可手动推单，也可开启自动推单')
    await 按钮(page, '确认人工审核通过').trigger('click')
    await flushPromises()
    expect(订单.processingStatus).toBe('待推单')
    const 有效履约 = 订单.fulfillmentOrders.filter(项 => 项.isActive)
    expect(有效履约).toHaveLength(1)
    expect(有效履约[0]!.autoPushHold).not.toBe(true)
    expect(仓库执行记录.value).toHaveLength(原仓单数)
  })

  it('确认前库存变动导致专项人工审核失败，保留异常并显示本次拦截', async () => {
    const 订单 = 单('01')
    订单.processingStatus = '异常'
    订单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
    const page = await 打开组件('人工审核通过', [行('01')])
    演示库存.value[订单.systemOrderNo] = '不足'
    await 按钮(page, '确认人工审核通过').trigger('click')
    await flushPromises()
    expect(订单.processingStatus).toBe('异常')
    expect(订单.fulfillmentOrders).toHaveLength(0)
    expect(page.emitted('result')?.[0]?.[1]).toMatchObject([{ result: { 成功: false, 信息: expect.stringContaining('库存不足') } }])
  })
  it('旧截单调用无法打开单个或批量弹窗，不发出结果也不改写仓库状态和操作日志', async () => {
    const 快照 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value })
    for (const batch of [false, true]) {
      const wrapper = await 打开组件('截单' as 设置操作, [行('12', true)], batch)
      expect(wrapper.find('.设置弹窗').exists()).toBe(false)
      expect(wrapper.findAll('button')).toHaveLength(0)
      expect(wrapper.emitted('result')).toBeUndefined()
      expect(JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value })).toBe(快照)
    }
  })

  it('库存不足的普通待审核订单仍可执行审核，保存本轮拦截摘要并保持待审核', async () => {
    const 原轮数 = 单('02').reviews.length
    const wrapper = await 打开组件('审核', [行('02')])
    expect(wrapper.get('.目标表').text()).toContain('库存')
    expect(已禁用(wrapper, '确认审核')).toBe(false)
    await wrapper.get('[aria-label="审核说明"]').setValue('本轮核实库存不足，待补库存后再审')
    await 按钮(wrapper, '确认审核').trigger('click')
    await flushPromises()
    expect(单('02').processingStatus).toBe('待审核')
    expect(单('02').fulfillmentOrders).toHaveLength(0)
    expect(单('02').reviews).toHaveLength(原轮数 + 1)
    expect(单('02').reviews[单('02').reviews.length - 1]).toMatchObject({ status: '已拦截', decisionNote: expect.stringContaining('库存不足') })
    expect(单('02').reviews[单('02').reviews.length - 1]!.decisionNote).toContain('本轮核实库存不足，待补库存后再审')
    const 结果 = (wrapper.emitted('result')![0]![1] as Array<{ key: string; result: { 成功: boolean; 信息: string } }>)[0]!
    expect(结果.key).toBe('OMS-DEMO-ACTION-02')
    expect(结果.result.成功).toBe(false)
    expect(结果.result.信息).not.toContain('已跳过')
  })

  it('混合批量先显示逐项原因并去重，取消目标后仅提交明确选中的合格对象', async () => {
    const 不合格快照 = JSON.stringify(单('15'))
    const wrapper = await 打开组件('不发货', [行('01'), 行('15', true), 行('01')], true)
    expect(wrapper.get('.范围摘要').text()).toContain('共 2 个对象')
    expect(wrapper.text()).toContain('本次仅处理符合条件的 1 个对象，其余对象将跳过')
    expect(wrapper.get('.目标表').text()).toContain('已有有效出库事实')
    await wrapper.get('[aria-label="不发货原因"]').setValue('业务确认不再需要发货')
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['不发货原因'])
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(false)
    await wrapper.get('[aria-label="选择操作对象 OMS-DEMO-ACTION-01"]').setValue(false)
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="选择操作对象 OMS-DEMO-ACTION-01"]').setValue(true)
    await wrapper.get('[aria-label="选择操作对象 OMS-DEMO-ACTION-15"]').setValue(false)
    await 按钮(wrapper, '确认不发货').trigger('click')
    await flushPromises()
    const emission = wrapper.emitted('result')![0]!
    expect(emission[0]).toBe('不发货')
    expect(emission[1]).toEqual([{ key: 'OMS-DEMO-ACTION-01', result: expect.objectContaining({ 成功: true }) }])
    expect(单('01').processingStatus).toBe('不发货')
    expect(JSON.stringify(单('15'))).toBe(不合格快照)
  })

  it('单个共享履约的订单级操作必须显式选择来源，不默认第一张来源订单', async () => {
    const wrapper = await 打开组件('不发货', [行('33', true)])
    const selector = wrapper.get('[aria-label="操作来源订单"]')
    expect((selector.element as HTMLSelectElement).value).toBe('')
    expect(wrapper.get('.目标表').text()).toBe('')
    expect(wrapper.text()).toContain('请先选择来源订单，不默认操作第一张')
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await selector.setValue('OMS-DEMO-ACTION-34')
    expect(wrapper.get('.目标表').text()).toContain('OMS-DEMO-ACTION-34')
    expect(wrapper.get('.目标表').text()).not.toContain('OMS-DEMO-ACTION-33')
    expect(wrapper.get('.目标表').text()).toContain('共享履约路径')
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    expect(wrapper.emitted('result')).toBeUndefined()
  })

  it('不发货只填写一个原因，仍需人工确认；空白原因及未确认不可提交，取消不改变订单', async () => {
    const 快照 = JSON.stringify(单('01'))
    const wrapper = await 打开组件('不发货', [行('01')])
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['不发货原因'])
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="不发货原因"]').setValue(' \n ')
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="不发货原因"]').setValue('无需继续发货')
    await wrapper.get('.确认勾选').setValue(false)
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(false)
    await 按钮(wrapper, '取消').trigger('click')
    expect(JSON.stringify(单('01'))).toBe(快照)
    expect(wrapper.emitted('result')).toBeUndefined()
  })

  it('恢复目标只读且由事实判定，仅恢复原因和人工确认齐备后即可回待审核', async () => {
    const wrapper = await 打开组件('恢复发货', [行('19')])
    expect(wrapper.text()).toContain('系统判定恢复到：待审核')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['恢复原因'])
    await wrapper.get('[aria-label="恢复原因"]').setValue('平台条件已恢复，需要重新配置发货')
    expect(已禁用(wrapper, '确认恢复发货')).toBe(true)
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认恢复发货')).toBe(false)
    await 按钮(wrapper, '确认恢复发货').trigger('click')
    await flushPromises()
    expect(单('19').processingStatus).toBe('待审核')
    expect(单('19').items[0]!.systemSku).toBeUndefined()
    expect(仓库执行记录.value.find(execution => execution.出库单号 === 'OUT-DEMO-ACTION-19')!.状态).toBe('已取消')
    expect(wrapper.emitted('result')![0]![1]).toEqual([{ key: 'OMS-DEMO-ACTION-19', result: expect.objectContaining({ 成功: true }) }])
  })

  it('撤销不发货只填写撤销原因并保留确认勾选，撤销后旧仓单不复活', async () => {
    const wrapper = await 打开组件('撤销不发货', [行('21')])
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['撤销原因'])
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认撤销不发货')).toBe(true)
    await wrapper.get('[aria-label="撤销原因"]').setValue('原结论误判，已核对仍需发货及旧执行结果')
    expect(已禁用(wrapper, '确认撤销不发货')).toBe(false)
    await 按钮(wrapper, '确认撤销不发货').trigger('click')
    await flushPromises()
    expect(单('21').processingStatus).toBe('待审核')
    expect(单('21').fulfillmentOrders.every(fulfillment => !fulfillment.isActive)).toBe(true)
    expect(仓库执行记录.value.find(execution => execution.出库单号 === 'OUT-DEMO-ACTION-21')!.状态).toBe('已取消')
  })

  it('已截单成功的独立订单只填写退回原因即可退回，保留终止的旧执行', async () => {
    const wrapper = await 打开组件('退回待审核', [行('13')])
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['退回原因'])
    expect(已禁用(wrapper, '确认退回待审核')).toBe(true)
    await wrapper.get('[aria-label="退回原因"]').setValue('原执行已结束，重新选择发货方案')
    expect(已禁用(wrapper, '确认退回待审核')).toBe(false)
    await 按钮(wrapper, '确认退回待审核').trigger('click')
    await flushPromises()
    expect(单('13').processingStatus).toBe('待审核')
    expect(单('13').fulfillmentOrders.every(item => !item.isActive)).toBe(true)
    expect(仓库执行记录.value.find(execution => execution.出库单号 === 'OUT-DEMO-ACTION-13')!.状态).toBe('已取消')
  })

  it('明确失败且已修复的单个仓单只要求修复说明，不直接改变待推单阶段', async () => {
    const wrapper = await 打开组件('重新推单', [行('08', true)])
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['修复说明'])
    expect(已禁用(wrapper, '确认重新推单')).toBe(true)
    await wrapper.get('[aria-label="修复说明"]').setValue('已核实渠道开通及原请求未生效，保持原方案重提')
    expect(已禁用(wrapper, '确认重新推单')).toBe(false)
    await 按钮(wrapper, '确认重新推单').trigger('click')
    await flushPromises()
    expect(单('08').processingStatus).toBe('待推单')
    expect(仓库执行记录.value.find(execution => execution.出库单号 === 'OUT-DEMO-ACTION-08')).toMatchObject({ 状态: '下单中', 待核查: true })
  })

  it('来源显示平台、店铺和平台订单号，订单目标系统编号只展示一次', async () => {
    const wrapper = await 打开组件('不发货', [行('01')])
    const source = wrapper.get('.来源事实')
    expect(source.get('.来源店铺').text()).toBe(`${单('01').platformCode} · ${单('01').storeName}`)
    expect(source.text()).toContain(`平台订单号：${单('01').platformOrderNo}`)
    expect(source.text()).toContain(`当前阶段：${单('01').processingStatus}`)
    expect(source.text()).not.toContain(单('01').systemOrderNo)
    expect(wrapper.get('.目标表').text().split(单('01').systemOrderNo)).toHaveLength(2)
  })

  it('共享仓单的重推预检准确展示全部来源身份且只构建一个仓单对象，未明确失败不能提交', async () => {
    const wrapper = await 打开组件('重新推单', [行('33', true)])
    expect(wrapper.findAll('.对象编号')).toHaveLength(1)
    expect(wrapper.get('.对象编号').text()).toBe('OUT-DEMO-ACTION-SHARED')
    const sources = wrapper.findAll('.来源事实')
    expect(sources).toHaveLength(2)
    for (const 编号 of ['33', '34']) {
      const order = 单(编号)
      const source = sources.find(item => item.text().includes(order.systemOrderNo))!
      expect(source).toBeDefined()
      expect(source.get('.来源店铺').text()).toBe(`${order.platformCode} · ${order.storeName}`)
      expect(source.text()).toContain(`平台订单号：${order.platformOrderNo}`)
    }
    expect(已禁用(wrapper, '确认重新推单')).toBe(true)
    expect(wrapper.emitted('result')).toBeUndefined()
  })

  it('28条待审核批量无需审核说明也可提交，普通拦截留痕且部分履约不代替人工核查', async () => {
    const orders = 共享订单.value.filter(order => !order.manualOrder && order.fulfillmentMode === '自配送' && order.processingStatus === '待审核')
    expect(orders).toHaveLength(28)
    const 原轮数 = new Map(orders.map(order => [order.systemOrderNo, order.reviews.length]))
    const rows: 作业行[] = orders.map(order => ({ key: order.systemOrderNo, order, stage: '待审核' }))
    const wrapper = await 打开组件('审核', rows, true)
    expect(wrapper.get('.范围摘要').text()).toContain('共 28 个对象')
    expect(wrapper.get('.范围摘要').text()).toContain('可处理 26 个')
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['审核说明'])
    expect(已禁用(wrapper, '确认审核')).toBe(false)
    await 按钮(wrapper, '确认审核').trigger('click')
    await flushPromises()
    const results = wrapper.emitted('result')![0]![1] as Array<{ key: string; result: { 成功: boolean } }>
    expect(results).toHaveLength(28)
    for (const order of orders) {
      if (order.platformOrderStatus === 'IN_PROGRESS') {
        expect(order.reviews).toHaveLength(原轮数.get(order.systemOrderNo)!)
        expect(order.processingStatus).toBe('待审核')
        expect(order.fulfillmentOrders).toHaveLength(0)
      } else expect(order.reviews).toHaveLength(原轮数.get(order.systemOrderNo)! + 1)
    }
    expect(单('02').reviews[单('02').reviews.length - 1]).toMatchObject({ status: '已拦截', decisionNote: expect.stringContaining('库存不足') })
    const sufficient = orders.find(order => order.systemOrderNo === 'OMS-DEMO-SPLIT-STAGE-REVIEW')!
    const insufficient = orders.find(order => order.systemOrderNo === 'OMS-DEMO-SPLIT-STAGE-LOWSTOCK')!
    expect(sufficient.processingStatus).toBe('待推单')
    expect(sufficient.fulfillmentOrders).toHaveLength(2)
    expect(insufficient.processingStatus).toBe('待审核')
    expect(insufficient.fulfillmentOrders).toHaveLength(0)
    expect(insufficient.reviews[insufficient.reviews.length - 1]).toMatchObject({ status: '已拦截', decisionNote: expect.stringContaining('本仓可用库存 1 件') })
    for (const suffix of ['04', '05', '06', '07']) {
      const order = orders.find(item => item.systemOrderNo === `OMS-DEMO-MERGE-${suffix}`)!
      expect(results.find(item => item.key === order.systemOrderNo)!.result.成功).toBe(true)
      expect(order.processingStatus).toBe('待推单')
      expect(order.fulfillmentOrders).toHaveLength(1)
    }
    const missingSku = orders.find(order => order.systemOrderNo === 'OMS-DEMO-MERGE-08')!
    expect(results.find(item => item.key === missingSku.systemOrderNo)!.result.成功).toBe(false)
    expect(missingSku.processingStatus).toBe('待审核')
    expect(missingSku.fulfillmentOrders).toHaveLength(0)
    expect(missingSku.reviews[missingSku.reviews.length - 1]).toMatchObject({ status: '已拦截', decisionNote: expect.stringContaining('SKU 映射') })
  })

  it('28条待审核批量不发货先跳过两张已有人工方案，其余26张终止且不创建仓单', async () => {
    const orders = 共享订单.value.filter(order => !order.manualOrder && order.fulfillmentMode === '自配送' && order.processingStatus === '待审核')
    expect(orders).toHaveLength(28)
    const protectedOrders = orders.filter(order => order.manualShippingPlan)
    expect(protectedOrders.map(order => order.systemOrderNo)).toEqual(['OMS-DEMO-SPLIT-STAGE-REVIEW', 'OMS-DEMO-SPLIT-STAGE-LOWSTOCK'])
    const protectedSnapshots = protectedOrders.map(order => JSON.stringify(order))
    const 初始执行数 = 仓库执行记录.value.length
    const rows: 作业行[] = orders.map(order => ({ key: order.systemOrderNo, order, stage: '待审核' }))
    const wrapper = await 打开组件('不发货', rows, true)
    expect(wrapper.get('.范围摘要').text()).toContain('共 28 个对象')
    expect(wrapper.get('.范围摘要').text()).toContain('可处理 26 个')
    expect(wrapper.findAll('textarea').map(item => item.attributes('aria-label'))).toEqual(['不发货原因'])
    await wrapper.get('[aria-label="不发货原因"]').setValue('已核实无需 OMS 继续发货，全部历史零出库且无未结束执行')
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(false)
    await 按钮(wrapper, '确认不发货').trigger('click')
    await flushPromises()
    expect(orders.filter(order => !order.manualShippingPlan).every(order => order.processingStatus === '不发货')).toBe(true)
    expect(protectedOrders.map(order => JSON.stringify(order))).toEqual(protectedSnapshots)
    expect(仓库执行记录.value).toHaveLength(初始执行数)
    const results = wrapper.emitted('result')![0]![1] as Array<{ key: string; result: { 成功: boolean; 信息: string } }>
    expect(results).toHaveLength(28)
    expect(results.filter(item => item.result.成功)).toHaveLength(26)
    expect(results.filter(item => item.result.信息.startsWith('已跳过：')).map(item => item.key)).toEqual(protectedOrders.map(order => order.systemOrderNo))
    for (const suffix of ['04', '05', '06', '07', '08']) expect(results.find(item => item.key === `OMS-DEMO-MERGE-${suffix}`)!.result.成功).toBe(true)
  })

  it('拆分P1推单只显示本包SKU1四件，P2只显示SKU2六件，未把整单方案当作本次范围', async () => {
    const order = 共享订单.value.find(candidate => candidate.systemOrderNo === 'OMS-DEMO-SPLIT-STAGE-READY')!
    for (const [index, fulfillment] of order.fulfillmentOrders.entries()) {
      const row: 作业行 = { key: fulfillment.fulfillmentOrderNo, order, fulfillment, stage: '待推单' }
      const wrapper = await 打开组件('推单', [row])
      const expectedSku = `DEMO-SKU-${index + 1}`, excludedSku = `DEMO-SKU-${index === 0 ? 2 : 1}`, quantity = index === 0 ? 4 : 6
      expect(wrapper.get('.本次商品范围').text()).toBe(`${expectedSku} · 本次分配 ${quantity} 件`)
      expect(wrapper.findAll('.本次商品行')).toHaveLength(1)
      expect(wrapper.text()).toContain(`本次计划 ${quantity} 件`)
      expect(wrapper.text()).not.toContain(excludedSku)
      expect(wrapper.findAll('.履约事实')).toHaveLength(1)
      expect(wrapper.get('.履约事实').text()).toContain(fulfillment.fulfillmentOrderNo)
      expect(wrapper.find('.人工审核方案').exists()).toBe(false)
      expect(已禁用(wrapper, '确认推单')).toBe(false)
    }
  })

  it('共享履约的重推范围按来源隔离，保留两张来源身份但不带入各自其他商品', async () => {
    const sources = [单('33'), 单('34')]
    for (const [index, order] of sources.entries()) {
      order.items[0]!.systemSku = `SHARED-SOURCE-${index + 1}`
      order.items.push({ ...order.items[0]!, externalLineId: `UNRELATED-LINE-${index + 1}`, systemSku: `UNRELATED-SKU-${index + 1}` })
    }
    const allocation = sources.map(order => ({ orderNo: order.systemOrderNo, externalLineId: order.items[0]!.externalLineId, quantity: 1 }))
    for (const order of sources) order.fulfillmentOrders[0]!.items = allocation.map(item => ({ ...item }))
    const wrapper = await 打开组件('重新推单', [行('33', true)])
    expect(wrapper.findAll('.来源事实')).toHaveLength(2)
    expect(wrapper.findAll('.对象编号')).toHaveLength(1)
    const ranges = wrapper.findAll('.本次商品范围')
    expect(ranges).toHaveLength(2)
    for (const [index, order] of sources.entries()) {
      const range = ranges.find(item => item.attributes('data-source-order') === order.systemOrderNo)!
      expect(range.text()).toBe(`SHARED-SOURCE-${index + 1} · 本次分配 1 件`)
      expect(range.text()).not.toContain(`SHARED-SOURCE-${index === 0 ? 2 : 1}`)
    }
    expect(wrapper.text()).not.toContain('UNRELATED-SKU')
    expect(已禁用(wrapper, '确认重新推单')).toBe(true)
  })
})
