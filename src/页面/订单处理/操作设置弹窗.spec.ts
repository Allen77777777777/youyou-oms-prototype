import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed, defineComponent, h, inject, provide, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ActionSettings from './操作设置弹窗.vue'
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
    await wrapper.get('[aria-label="复核说明"]').setValue('逐单核实无仓库执行及实际出库')
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

  it('不发货的原因、复核说明和人工确认各自必填，取消不改变订单', async () => {
    const 快照 = JSON.stringify(单('01'))
    const wrapper = await 打开组件('不发货', [行('01')])
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="不发货原因"]').setValue(' \n ')
    await wrapper.get('[aria-label="复核说明"]').setValue('已核对全部范围')
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="不发货原因"]').setValue('无需继续发货')
    await wrapper.get('[aria-label="复核说明"]').setValue(' ')
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('[aria-label="复核说明"]').setValue('全部履约及历史执行已核实为零出库')
    await wrapper.get('.确认勾选').setValue(false)
    expect(已禁用(wrapper, '确认不发货')).toBe(true)
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认不发货')).toBe(false)
    await 按钮(wrapper, '取消').trigger('click')
    expect(JSON.stringify(单('01'))).toBe(快照)
    expect(wrapper.emitted('result')).toBeUndefined()
  })

  it('恢复目标只读且由事实判定，原因、说明和确认齐备后才恢复待审核', async () => {
    const wrapper = await 打开组件('恢复发货', [行('19')])
    expect(wrapper.text()).toContain('系统判定恢复到：待审核')
    expect(wrapper.find('select').exists()).toBe(false)
    await wrapper.get('[aria-label="恢复原因"]').setValue('平台条件已恢复，需要重新配置发货')
    expect(已禁用(wrapper, '确认恢复发货')).toBe(true)
    await wrapper.get('[aria-label="复核说明"]').setValue('旧仓单已明确结束，剩余两件仍需发货')
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

  it('撤销不发货还要求独立核查依据，撤销后保留旧仓单并回待审核', async () => {
    const wrapper = await 打开组件('撤销不发货', [行('21')])
    await wrapper.get('[aria-label="撤销原因"]').setValue('原结论误判')
    await wrapper.get('[aria-label="纠错说明"]').setValue('已取得仍需发货的业务结论')
    await wrapper.get('.确认勾选').setValue(true)
    expect(已禁用(wrapper, '确认撤销不发货')).toBe(true)
    await wrapper.get('[aria-label="核查依据"]').setValue('已核对付款、取消、剩余范围及旧执行结果')
    expect(已禁用(wrapper, '确认撤销不发货')).toBe(false)
    await 按钮(wrapper, '确认撤销不发货').trigger('click')
    await flushPromises()
    expect(单('21').processingStatus).toBe('待审核')
    expect(单('21').fulfillmentOrders.every(fulfillment => !fulfillment.isActive)).toBe(true)
    expect(仓库执行记录.value.find(execution => execution.出库单号 === 'OUT-DEMO-ACTION-21')!.状态).toBe('已取消')
  })
})
