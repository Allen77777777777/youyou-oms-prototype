import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDatePicker, ElSelect } from 'element-plus'
import FieldSearch from './字段搜索.vue'
import ListSort from './列表排序.vue'
import DateRange from './时间范围.vue'

const 实例: VueWrapper[] = []
const 页面 = () => new DOMWrapper(document.body)
function 创建(component: typeof FieldSearch | typeof ListSort | typeof DateRange, props: Record<string, unknown>) {
  const wrapper = mount(component, { props: props as never, attachTo: document.body })
  实例.push(wrapper)
  return wrapper
}
async function 点击文字(text: string) {
  const button = 页面().findAll('button').find(项 => 项.text() === text)
  if (!button) throw new Error(`找不到按钮 ${text}`)
  await button.trigger('click')
  await flushPromises()
}
async function 多行(wrapper: VueWrapper) {
  await wrapper.get('button[aria-label="测试多行输入搜索"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('button[aria-label="测试多行输入搜索"]').attributes('aria-expanded')).toBe('true'))
  await flushPromises()
}
afterEach(() => { 实例.splice(0).forEach(项 => 项.unmount()); document.body.innerHTML = '' })

describe('公共字段搜索交互', () => {
  const props = { modelValue: 'OLD', field: 'id', mode: 'contains', fields: [{ value: 'id', label: '平台订单号' }], ariaPrefix: '测试' }
  it('多行搜索提交去重值、精确模式及查询；清空与关闭只改草稿', async () => {
    const wrapper = 创建(FieldSearch, props)
    await 多行(wrapper)
    await 页面().get('textarea').setValue('A\nB\nA')
    expect(页面().get('.搜索计数').text()).toBe('已识别 2 项')
    expect(wrapper.emitted('search')).toBeUndefined()
    await 点击文字('搜索')
    expect(wrapper.emitted('update:modelValue')).toEqual([['A, B']])
    expect(wrapper.emitted('update:mode')).toEqual([['exact']])
    expect(wrapper.emitted('search')).toHaveLength(1)
    await 多行(wrapper)
    await 点击文字('清空')
    expect((页面().get('textarea').element as HTMLTextAreaElement).value).toBe('')
    await 点击文字('关闭')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })
  it('姓名多行保留内部空格，超过上限不发出搜索', async () => {
    const wrapper = 创建(FieldSearch, { ...props, field: 'name', fields: [{ value: 'name', label: '商品名称', kind: 'text' }] })
    await 多行(wrapper)
    await 页面().get('textarea').setValue('Brake Pad\nbrake pad\nOil Filter')
    await 点击文字('搜索')
    expect(wrapper.emitted('update:modelValue')).toEqual([['Brake Pad, Oil Filter']])
    await vi.waitFor(() => expect(wrapper.get('button[aria-label="测试多行输入搜索"]').attributes('aria-expanded')).toBe('false'))
    await 多行(wrapper)
    await 页面().get('textarea').setValue(Array.from({ length: 1001 }, (_, i) => `P${i}`).join('\n'))
    await 点击文字('搜索')
    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(页面().get('.搜索计数').classes()).toContain('超限')
  })
})

describe('公共排序交互', () => {
  it('嵌套字段下拉留在排序弹层内，选择字段后仍可确认方向', async () => {
    const wrapper = 创建(ListSort, { modelValue: { field: '', direction: 'asc' }, fields: [{ value: 'priority', label: '优先级', kind: 'number' }], ariaPrefix: '测试' })
    await wrapper.get('button[aria-label="测试排序"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('button[aria-label="测试排序"]').attributes('aria-expanded')).toBe('true'))
    const select = wrapper.findComponent(ElSelect)
    expect(select.props('teleported')).toBe(false)
    await select.vm.$emit('update:modelValue', 'priority')
    await flushPromises()
    await 点击文字('大 → 小')
    await 点击文字('确定')
    expect(wrapper.emitted('change')).toEqual([[{ field: 'priority', direction: 'desc' }]])
  })
  it('取消不提交排序，确认按数字方向提交复制对象', async () => {
    const modelValue = { field: 'quantity', direction: 'desc' }
    const wrapper = 创建(ListSort, { modelValue, fields: [{ value: 'quantity', label: '可用数量', kind: 'number' }], ariaPrefix: '测试' })
    await wrapper.get('button[aria-label="测试排序"]').trigger('click')
    await vi.waitFor(() => expect(页面().findAll('button').map(项 => 项.text())).toContain('小 → 大'))
    await flushPromises()
    await 点击文字('小 → 大')
    await 点击文字('取消')
    expect(modelValue.direction).toBe('desc')
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.get('button[aria-label="测试排序"]').trigger('click')
    await vi.waitFor(() => expect(页面().findAll('.排序方向 button').find(项 => 项.text() === '大 → 小')?.attributes('aria-pressed')).toBe('true'))
    await flushPromises()
    expect(页面().findAll('.排序方向 button').find(项 => 项.text() === '大 → 小')?.attributes('aria-pressed')).toBe('true')
    await 点击文字('小 → 大')
    await 点击文字('确定')
    expect(wrapper.emitted('change')).toEqual([[{ field: 'quantity', direction: 'asc' }]])
    expect(wrapper.emitted('change')?.[0]?.[0]).not.toBe(modelValue)
  })
})

describe('公共中文时间范围', () => {
  it('完整秒值保留，日历星期为中文，清空向父级提交空范围', async () => {
    const wrapper = 创建(DateRange, { modelValue: ['2026-09-01 00:00:00', '2026-09-30 23:59:59'], ariaPrefix: '测试' })
    expect(wrapper.findAll('input').map(项 => (项.element as HTMLInputElement).value)).toEqual(['2026-09-01 00:00:00', '2026-09-30 23:59:59'])
    await wrapper.get('input').trigger('click')
    await vi.waitFor(() => expect(页面().find('[aria-label="星期日"]').exists()).toBe(true))
    expect(页面().text()).toContain('最近2月')
    expect(页面().text()).toContain('去年')
    await wrapper.findComponent(ElDatePicker).vm.$emit('update:modelValue', null)
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })
})
