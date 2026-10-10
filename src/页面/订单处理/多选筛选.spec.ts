import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'

const 选项 = [{ value: 'a', label: '店铺甲' }, { value: 'b', label: '店铺乙' }, { value: 'c', label: '其他店铺' }]
const 实例: VueWrapper[] = []
const 页面 = () => new DOMWrapper(document.body)
function 创建(modelValue: string[] = []) {
  const wrapper = mount(MultiSelectFilter, { props: { modelValue, options: 选项, placeholder: '店铺' }, attachTo: document.body })
  实例.push(wrapper)
  return wrapper
}
async function 打开(wrapper: VueWrapper) {
  await wrapper.get('button[aria-label="店铺"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('.多选触发').attributes('aria-expanded')).toBe('true'), { interval: 10 })
  await flushPromises()
}
function 复选框(名称: string) {
  const label = 页面().findAll('label').find(项 => 项.text() === 名称)
  if (!label) throw new Error(`未找到复选框：${名称}`)
  return label.get('input[type="checkbox"]')
}
async function 点击(名称: string) {
  const button = 页面().findAll('button').find(项 => 项.text() === 名称)
  if (!button) throw new Error(`未找到按钮：${名称}`)
  await button.trigger('click')
  await flushPromises()
}
afterEach(() => { 实例.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('订单处理多选筛选', () => {
  it('确定前只修改草稿，取消与重新打开恢复父值；触发按钮保持固定宽度', async () => {
    const wrapper = 创建(['a'])
    const trigger = wrapper.get('button[aria-label="店铺"]')
    expect(trigger.text()).toBe('店铺甲')
    expect(trigger.attributes('style')).toContain('width: 130px')
    await 打开(wrapper)
    await 复选框('店铺乙').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(页面().get('.确认栏').text()).toContain('已选 2 项')
    await 点击('取消')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await 打开(wrapper)
    expect((复选框('店铺乙').element as HTMLInputElement).checked).toBe(false)
    await 复选框('店铺乙').setValue(true)
    await 点击('确定')
    expect(wrapper.emitted('update:modelValue')).toEqual([[['a', 'b']]])
    await wrapper.setProps({ modelValue: ['a', 'b'] })
    expect(trigger.text()).toBe('店铺 2项')
  })

  it('搜索全选只影响匹配项，保留搜索范围外选择并显示半选状态', async () => {
    const wrapper = 创建(['a', 'c'])
    await 打开(wrapper)
    await 页面().get('input[aria-label="搜索店铺"]').setValue('店铺甲')
    await 复选框('全选').setValue(false)
    await 页面().get('input[aria-label="搜索店铺"]').setValue('店铺')
    expect(页面().get('.全选栏 .el-checkbox__input').classes()).toContain('is-indeterminate')
    await 页面().get('input[aria-label="搜索店铺"]').setValue('店铺乙')
    await 复选框('全选').setValue(true)
    await 页面().get('input[aria-label="搜索店铺"]').setValue('不存在')
    expect(页面().get('[role="status"]').text()).toBe('暂无匹配选项')
    await 点击('确定')
    expect(wrapper.emitted('update:modelValue')).toEqual([[['c', 'b']]])
  })

  it('外部点击和 Esc 均不提交；联动选项移除只清理草稿', async () => {
    const wrapper = 创建(['a'])
    await 打开(wrapper)
    await 复选框('店铺乙').setValue(true)
    await 页面().trigger('pointerdown')
    await 页面().trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.多选触发').attributes('aria-expanded')).toBe('false'), { interval: 10 })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await 打开(wrapper)
    expect((复选框('店铺乙').element as HTMLInputElement).checked).toBe(false)
    await 复选框('店铺乙').setValue(true)
    await wrapper.setProps({ options: 选项.filter(项 => 项.value !== 'b') })
    expect(页面().get('.确认栏').text()).toContain('已选 1 项')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await 页面().get('input[aria-label="搜索店铺"]').trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(wrapper.get('.多选触发').attributes('aria-expanded')).toBe('false')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
