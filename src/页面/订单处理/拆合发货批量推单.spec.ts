import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed, defineComponent, h, inject, provide, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ActionSettings from './操作设置弹窗.vue'
import type { 作业行 } from './展示工具'
import type { 命令结果 } from './演示会话'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本, 演示路由, 当前版本, 人工发货上下文, 执行演示审核 } from './演示会话'
import { 保存人工发货方案, 创建拆分发货草稿 } from './拆合发货模型'

const 拆单号 = 'OMS-DEMO-SPLIT-01'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value })
const 实例: VueWrapper[] = []
const 桩组件 = {
  ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue" class="批量推单窗口"><slot /><slot name="footer" /></section>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElCheckbox: { inheritAttrs: false, props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<label><input v-bind="$attrs" type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' },
  ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElAlert: { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  ElTag: { template: '<span><slot /></span>' },
  ElTable: defineComponent({ props: ['data'], setup(props, { slots }) { provide('split-batch-rows', computed(() => props.data as unknown[])); return () => h('div', { class: '目标表' }, slots.default?.() as never) } }),
  ElTableColumn: defineComponent({ setup(_props, { slots }) { const rows = inject<Ref<unknown[]>>('split-batch-rows')!; return () => h('div', rows.value.map(row => h('div', slots.default?.({ row }) as never))) } }),
}
function 恢复会话() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions
}
beforeEach(恢复会话)
afterEach(() => { 实例.splice(0).forEach(wrapper => wrapper.unmount()); 恢复会话(); document.body.innerHTML = '' })

function 已审核拆分() {
  const order = 共享订单.value.find(item => item.systemOrderNo === 拆单号)!
  // 两包数量故意不同，避免按整单或另一包数量生成仓单也误通过。
  order.items[0]!.orderedQuantity = 3
  order.items[0]!.fulfillableQuantity = 3
  const plan = 创建拆分发货草稿(order)
  plan.packages[0]!.route = { ...演示路由[0]! }
  plan.packages[1]!.route = { ...演示路由[1]! }
  plan.reason = '同一订单分仓分包发货'
  const saved = 保存人工发货方案(人工发货上下文(), plan, { [拆单号]: 当前版本(拆单号) })
  expect(saved.成功, saved.信息).toBe(true)
  expect(order.processingStatus).toBe('待审核')
  const reviewed = 执行演示审核(拆单号, 当前版本(拆单号), '已核实每包商品与路由')
  expect(reviewed.成功, reviewed.信息).toBe(true)
  expect(order.processingStatus).toBe('待推单')
  expect(order.fulfillmentOrders).toHaveLength(2)
  expect(order.fulfillmentOrders.map(item => item.plannedQuantity)).toEqual([3, 2])
  const rows: 作业行[] = order.fulfillmentOrders.map(fulfillment => ({ key: fulfillment.fulfillmentOrderNo, order, fulfillment, stage: '待推单' }))
  return { order, rows, plan: saved.方案! }
}
async function 打开预检(rows: 作业行[]) {
  const wrapper = mount(ActionSettings, { global: { stubs: 桩组件, directives: { prototype: {} } } })
  实例.push(wrapper)
  ;(wrapper.vm as unknown as InstanceType<typeof ActionSettings>).open('推单', rows, true)
  await flushPromises()
  expect(wrapper.get('.范围摘要').text()).toContain('共 2 个对象')
  expect(wrapper.get('.范围摘要').text()).toContain('可处理 2 个')
  return wrapper
}
async function 一次确认(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find(item => item.text() === '确认推单')!
  expect((button.element as HTMLButtonElement).disabled).toBe(false)
  await button.trigger('click')
  await flushPromises()
  const emissions = wrapper.emitted('result')!
  expect(emissions).toHaveLength(1)
  expect(emissions[0]![0]).toBe('推单')
  return emissions[0]![1] as Array<{ key: string; result: 命令结果 }>
}

describe('拆分发货的实际批量推单窗口', () => {
  it('保存拆分并审核后，一次批量确认推送两包，各生成一张独立数量及商品快照的仓单', async () => {
    const { order, rows, plan } = 已审核拆分()
    const 原仓单数 = 仓库执行记录.value.length
    const 初始版本 = 当前版本(拆单号)
    const wrapper = await 打开预检(rows)
    const results = await 一次确认(wrapper)
    expect(results.map(item => item.key)).toEqual(rows.map(row => row.key))
    expect(results.map(item => item.result.成功)).toEqual([true, true])
    expect(当前版本(拆单号)).toBe(初始版本 + 2)
    expect(仓库执行记录.value).toHaveLength(原仓单数 + 2)
    const 本单仓单 = 仓库执行记录.value.filter(item => item.订单号.includes(拆单号))
    expect(本单仓单).toHaveLength(2)
    expect(new Set(本单仓单.map(item => item.出库单号)).size).toBe(2)
    expect(new Set(本单仓单.map(item => item.履约单号))).toEqual(new Set(rows.map(row => row.key)))
    for (const [index, fulfillment] of order.fulfillmentOrders.entries()) {
      const execution = 本单仓单.find(item => item.履约单号 === fulfillment.fulfillmentOrderNo)!
      const parcel = plan.packages[index]!
      expect(execution.状态).toBe('下单中')
      expect(execution.待核查).toBe(true)
      expect(execution.出库快照?.snapshotReliable).toBe(true)
      expect(execution.出库快照?.route).toEqual(parcel.route)
      expect(execution.出库快照?.items.map(item => ({ orderNo: item.sourceOrderNo, externalLineId: item.externalLineId, quantity: item.plannedQuantity }))).toEqual(parcel.items)
      expect(execution.出库快照?.quantitySummary.plannedQuantity).toBe(index === 0 ? 3 : 2)
      expect(execution.出库快照?.quantitySummary.plannedQuantity).not.toBe(5)
    }
    expect(order.fulfillmentOrders.every(item => item.status === '待执行')).toBe(true)
    expect(order.processingStatus).toBe('待推单')
  })

  it('打开批量预检后外部改变来源版本，两包均阻断，不将外部写入认作本批前一包写入', async () => {
    const { order, rows } = 已审核拆分()
    const wrapper = await 打开预检(rows)
    const 预检版本 = 当前版本(拆单号)
    订单版本.value[拆单号] = 预检版本 + 1
    const 外部变更后订单 = JSON.stringify(order)
    const 外部变更后执行 = JSON.stringify(仓库执行记录.value)
    const results = await 一次确认(wrapper)
    expect(results.map(item => item.key)).toEqual(rows.map(row => row.key))
    expect(results.map(item => item.result.成功)).toEqual([false, false])
    expect(results.every(item => item.result.信息.includes('变化'))).toBe(true)
    expect(当前版本(拆单号)).toBe(预检版本 + 1)
    expect(JSON.stringify(order)).toBe(外部变更后订单)
    expect(JSON.stringify(仓库执行记录.value)).toBe(外部变更后执行)
    expect(仓库执行记录.value.filter(item => item.订单号.includes(拆单号))).toEqual([])
    expect(order.fulfillmentOrders.every(item => item.status === '待执行')).toBe(true)
    expect(order.processingStatus).toBe('待推单')
  })
})
