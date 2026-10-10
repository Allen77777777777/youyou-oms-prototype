import { computed, defineComponent, h, inject, provide, type Directive, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { 原型标注 } from '@/类型/标注'
import type { 作业行 } from './展示工具'
import ActionSettings from './操作设置弹窗.vue'
import { 共享订单 } from './演示会话'

const 桩组件 = {
  ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { template: '<textarea />' },
  ElCheckbox: { template: '<label><input type="checkbox" /><slot /></label>' },
  ElAlert: { props: ['title'], template: '<p>{{ title }}</p>' },
  ElTag: { template: '<span><slot /></span>' },
  ElSelect: { template: '<select><slot /></select>' },
  ElOption: { props: ['label'], template: '<option>{{ label }}</option>' },
  ElTable: defineComponent({
    props: ['data'],
    setup(props, { slots }) {
      provide('annotation-test-rows', computed(() => props.data as unknown[]))
      return () => h('div', slots.default?.() as never)
    },
  }),
  ElTableColumn: defineComponent({
    setup(_props, { slots }) {
      const rows = inject<Ref<unknown[]>>('annotation-test-rows')!
      return () => h('div', rows.value.map(row => h('div', slots.default?.({ row }) as never)))
    },
  }),
}

describe('操作标注只登记当前已挂载内容', () => {
  it('动作切换更新同一校验语义，条件消失和窗口关闭不残留虚假索引', async () => {
    const 注册 = new Map<HTMLElement, 原型标注>()
    const 指令: Directive<HTMLElement, 原型标注> = {
      mounted: (元素, binding) => { 注册.set(元素, binding.value) },
      updated: (元素, binding) => { 注册.set(元素, binding.value) },
      unmounted: 元素 => { 注册.delete(元素) },
    }
    const wrapper = mount(ActionSettings, { global: { stubs: 桩组件, directives: { prototype: 指令 } } })
    const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 'OMS-DEMO-ACTION-01')!
    const 行: 作业行 = { key: 订单.systemOrderNo, order: 订单, stage: '待审核' }
    const 快照 = JSON.stringify(订单)
    const 实例 = wrapper.vm as unknown as InstanceType<typeof ActionSettings>
    const 当前 = () => [...注册.values()]
    try {
      expect(当前()).toHaveLength(0)
      实例.open('不发货', [行])
      await flushPromises()
      expect(当前().some(项 => 项.id === 'oms.processing.action-settings')).toBe(true)
      expect(当前().some(项 => 项.id === 'oms.processing.action-confirmation')).toBe(true)
      expect(当前().some(项 => 项.id === 'oms.processing.action-source')).toBe(false)
      expect(当前().find(项 => 项.id === 'oms.processing.action-validation')?.标题).toContain('不发货')

      实例.open('审核', [行])
      await flushPromises()
      expect(当前().find(项 => 项.id === 'oms.processing.action-validation')?.标题).toContain('20 项')
      expect(当前().some(项 => 项.id === 'oms.processing.action-confirmation')).toBe(false)
      expect(当前().some(项 => 项.id === 'oms.processing.action-reason')).toBe(true)
      expect(当前().every(项 => (项.交互规则?.length ?? 0) > 0)).toBe(true)

      实例.open('推单', [行])
      await flushPromises()
      expect(当前().find(项 => 项.id === 'oms.processing.action-validation')?.标题).toContain('首次推单')
      expect(当前().some(项 => 项.id === 'oms.processing.action-reason')).toBe(false)
      expect(当前().some(项 => 项.id === 'oms.processing.action-confirmation')).toBe(false)
      await wrapper.findAll('button').find(项 => 项.text() === '取消')!.trigger('click')
      await flushPromises()
      expect(当前()).toHaveLength(0)
      expect(JSON.stringify(订单)).toBe(快照)
      expect(wrapper.emitted('result')).toBeUndefined()
    } finally { wrapper.unmount() }
    expect(当前()).toHaveLength(0)
  })
})
