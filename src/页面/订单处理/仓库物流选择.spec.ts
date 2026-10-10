import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WarehouseChannelSelect from './仓库物流选择.vue'
import { 查找所选仓库物流, 路由仓库键 } from './仓库物流选择模型'
import type { 订单路由 } from '../全渠道订单/类型'

const 基础路由: 订单路由 = { warehouse: '同名仓', warehouseProvider: '万邑通', warehouseAccount: '账号甲', shippingChannel: '渠道甲', shippingChannelCode: 'A', labelMode: '仓配一体' }
const 路由 = [基础路由, { ...基础路由, shippingChannel: '渠道乙', shippingChannelCode: 'B' }, { ...基础路由, warehouseAccount: '账号乙', shippingChannel: '其他账号渠道', shippingChannelCode: 'C' }]
const stubs = {
  ElFormItem: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  ElSelect: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :data-selected-value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
}

describe('仓库与渠道分开选择', () => {
  it('先选仓库，渠道按服务商和账号隔离，切仓清空渠道且不自动取首个', async () => {
    const wrapper = mount(WarehouseChannelSelect, { props: { routes: 路由, warehouse: '', channel: '' }, global: { stubs, directives: { prototype: {} } } })
    expect(wrapper.get('[aria-label="物流渠道"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="发货仓库"]').setValue(路由仓库键(基础路由))
    expect(wrapper.emitted('update:channel')?.[0]).toEqual([''])
    await wrapper.setProps({ warehouse: 路由仓库键(基础路由), channel: 'A' })
    expect(wrapper.findAll('[aria-label="物流渠道"] option').map(option => option.text())).toEqual(['渠道甲', '渠道乙'])
    await wrapper.get('[aria-label="仓库账号"]').setValue('账号乙')
    expect(wrapper.emitted('update:warehouse')?.slice(-1)[0]).toEqual([''])
    expect(wrapper.emitted('update:channel')?.slice(-1)[0]).toEqual([''])
    await wrapper.setProps({ warehouse: '', channel: '' })
    expect(wrapper.get('[aria-label="物流渠道"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[aria-label="发货仓库"] option').map(option => option.attributes('value'))).toEqual([路由仓库键(路由[2]!)])
    await wrapper.get('[aria-label="发货仓库"]').setValue(路由仓库键(路由[2]!))
    expect(wrapper.emitted('update:channel')?.slice(-1)[0]).toEqual([''])
    await wrapper.setProps({ warehouse: 路由仓库键(路由[2]!), channel: '' })
    expect(wrapper.findAll('[aria-label="物流渠道"] option').map(option => option.text())).toEqual(['其他账号渠道'])
    wrapper.unmount()
  })

  it('切换服务商同时清账号、仓库和渠道，新候选不混入同名仓的其他服务商', async () => {
    const 谷仓路由: 订单路由 = { ...基础路由, warehouseProvider: '谷仓', warehouseAccount: '账号丙', shippingChannel: '谷仓渠道', shippingChannelCode: 'GC-A' }
    const wrapper = mount(WarehouseChannelSelect, { props: { routes: [...路由, 谷仓路由], warehouse: 路由仓库键(基础路由), channel: 'A' }, global: { stubs, directives: { prototype: {} } } })
    await wrapper.get('[aria-label="仓储服务商"]').setValue('谷仓')
    expect(wrapper.emitted('update:warehouse')?.slice(-1)[0]).toEqual([''])
    expect(wrapper.emitted('update:channel')?.slice(-1)[0]).toEqual([''])
    await wrapper.setProps({ warehouse: '', channel: '' })
    expect(wrapper.props('warehouse')).toBe('')
    expect(wrapper.props('channel')).toBe('')
    expect(wrapper.get('[aria-label="仓库账号"]').attributes('data-selected-value')).toBe('')
    expect(wrapper.findAll('[aria-label="仓库账号"] option').map(option => option.text())).toEqual(['账号丙'])
    expect(wrapper.findAll('[aria-label="发货仓库"] option').map(option => option.attributes('value'))).toEqual([路由仓库键(谷仓路由)])
    expect(wrapper.get('[aria-label="物流渠道"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[aria-label="物流渠道"] option')).toHaveLength(0)
    await wrapper.get('[aria-label="仓库账号"]').setValue('账号丙')
    await wrapper.get('[aria-label="发货仓库"]').setValue(路由仓库键(谷仓路由))
    await wrapper.setProps({ warehouse: 路由仓库键(谷仓路由), channel: '' })
    expect(wrapper.findAll('[aria-label="物流渠道"] option').map(option => option.text())).toEqual(['谷仓渠道'])
    wrapper.unmount()
  })

  it('不接受其他仓的旧渠道或重复冲突组合', () => {
    expect(查找所选仓库物流(路由, 路由仓库键(基础路由), 'C')).toBeUndefined()
    expect(查找所选仓库物流(路由, 路由仓库键(基础路由), 'A')).toBe(基础路由)
    expect(查找所选仓库物流([基础路由, { ...基础路由 }], 路由仓库键(基础路由), 'A')).toBeUndefined()
  })
})
