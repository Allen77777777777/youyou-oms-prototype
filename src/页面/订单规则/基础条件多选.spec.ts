import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BaseMultiSelect from './基础条件多选.vue'

// 仅替换定位浮层；搜索、复选框、草稿和组件事件使用真实组件。
const 浮层桩 = defineComponent({
  props: { visible: Boolean }, emits: ['update:visible'],
  template: '<div><span @click="$emit(\'update:visible\', !visible)"><slot name="reference" /></span><div v-if="visible"><slot /></div></div>',
})
const 选项 = [
  { value: 'alpha-us', label: '[eBay].美国' },
  { value: 'alpha-gb', label: '[eBay].英国' },
  { value: 'beta-us', label: '[Temu].美国' },
  { value: 'beta-fr', label: '[Temu].法国' },
]
let 页面: VueWrapper | undefined
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 准备(values: string[] = [], options = 选项) {
  页面 = mount(BaseMultiSelect, { props: { modelValue: values, options, placeholder: '请选择订单站点', ariaLabel: '订单站点' }, attachTo: document.body, global: { stubs: { ElPopover: 浮层桩 } } })
  await 稳定()
  return 页面
}
async function 打开(page: VueWrapper) { await page.get('.基础多选触发').trigger('click'); await 稳定() }
function 复选框(page: VueWrapper, label: string) {
  const row = page.findAll('.el-checkbox').find(项 => 项.text() === label)
  if (!row) throw new Error(`未找到复选框：${label}`)
  return row.get<HTMLInputElement>('input[type="checkbox"]')
}
async function 勾选(page: VueWrapper, label: string, checked = true) { await 复选框(page, label).setValue(checked); await 稳定() }
async function 操作(page: VueWrapper, text: string) {
  const button = page.findAll('button').find(项 => 项.text() === text)
  if (!button) throw new Error(`未找到按钮：${text}`)
  await button.trigger('click'); await 稳定()
}
function 已提交(page: VueWrapper) { const events = page.emitted('update:modelValue'); return events?.[events.length - 1]?.[0] as string[] | undefined }
afterEach(() => { 页面?.unmount(); 页面 = undefined; document.body.innerHTML = '' })

describe('基础条件多选', () => {
  it('复选操作只修改草稿，取消不提交且再次打开恢复已保存值', async () => {
    const values = ['alpha-us'], page = await 准备(values)
    await 打开(page)
    expect(复选框(page, '[eBay].美国').element.checked).toBe(true)
    await 勾选(page, '[eBay].美国', false)
    await 勾选(page, '[Temu].美国')
    expect(page.emitted('update:modelValue')).toBeUndefined()
    expect(values).toEqual(['alpha-us'])
    await 操作(page, '取消')
    expect(page.get('.基础多选触发').attributes('aria-expanded')).toBe('false')
    expect(page.get('.基础多选触发').text()).toBe('[eBay].美国')
    expect(page.emitted('update:modelValue')).toBeUndefined()
    await 打开(page)
    expect(复选框(page, '[eBay].美国').element.checked).toBe(true)
    expect(复选框(page, '[Temu].美国').element.checked).toBe(false)
  })

  it('确定一次提交独立数组，父级回填后触发文字与重开选择一致', async () => {
    const values = ['alpha-us'], page = await 准备(values)
    await 打开(page); await 勾选(page, '[Temu].法国'); await 操作(page, '确定')
    expect(page.emitted('update:modelValue')).toHaveLength(1)
    expect(已提交(page)).toEqual(['alpha-us', 'beta-fr'])
    expect(已提交(page)).not.toBe(values)
    expect(values).toEqual(['alpha-us'])
    await page.setProps({ modelValue: 已提交(page)! }); await 稳定()
    expect(page.get('.基础多选触发').text()).toBe('[eBay].美国、[Temu].法国')
    await 打开(page)
    expect(复选框(page, '[Temu].法国').element.checked).toBe(true)
  })

  it('搜索支持显示名及值，全选与取消全选仅影响当前搜索结果', async () => {
    const page = await 准备(['beta-fr'])
    await 打开(page)
    await page.get('input[aria-label="搜索订单站点"]').setValue('美国'); await 稳定()
    expect(page.findAll('.基础选项行').map(项 => 项.text())).toEqual(['[eBay].美国', '[Temu].美国'])
    await 勾选(page, '全选')
    await page.get('input[aria-label="搜索订单站点"]').setValue('ALPHA-US'); await 稳定()
    expect(page.findAll('.基础选项行').map(项 => 项.text())).toEqual(['[eBay].美国'])
    await 勾选(page, '全选', false)
    await page.get('input[aria-label="搜索订单站点"]').setValue(''); await 稳定()
    expect(复选框(page, '[eBay].美国').element.checked).toBe(false)
    expect(复选框(page, '[Temu].美国').element.checked).toBe(true)
    expect(复选框(page, '[Temu].法国').element.checked).toBe(true)
    expect(复选框(page, '[eBay].英国').element.checked).toBe(false)
    await 操作(page, '确定')
    expect(已提交(page)).toEqual(['beta-fr', 'beta-us'])
  })

  it('Shift按当前可见顺序连续勾选和取消，搜索改变后不沿用旧范围起点', async () => {
    const page = await 准备()
    await 打开(page)
    await 勾选(page, '[eBay].美国')
    await 复选框(page, '[Temu].美国').trigger('click', { shiftKey: true }); await 稳定()
    expect(复选框(page, '[eBay].英国').element.checked).toBe(true)
    expect(复选框(page, '[Temu].美国').element.checked).toBe(true)
    expect(复选框(page, '[Temu].法国').element.checked).toBe(false)
    await 复选框(page, '[eBay].美国').trigger('click', { shiftKey: true }); await 稳定()
    expect(复选框(page, '[eBay].美国').element.checked).toBe(false)
    expect(复选框(page, '[eBay].英国').element.checked).toBe(false)
    expect(复选框(page, '[Temu].美国').element.checked).toBe(false)
    await page.get('input[aria-label="搜索订单站点"]').setValue('Temu'); await 稳定()
    await 复选框(page, '[Temu].法国').trigger('click', { shiftKey: true }); await 稳定()
    expect(复选框(page, '[Temu].美国').element.checked).toBe(false)
    expect(复选框(page, '[Temu].法国').element.checked).toBe(true)
    await 操作(page, '确定')
    expect(已提交(page)).toEqual(['beta-fr'])
  })

  it('Esc丢弃未确认改动并将焦点归还触发按钮', async () => {
    const page = await 准备(['alpha-us'])
    await 打开(page); await 勾选(page, '[Temu].美国')
    page.get<HTMLInputElement>('input[aria-label="搜索订单站点"]').element.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await 稳定()
    expect(page.get('.基础多选触发').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(page.get('.基础多选触发').element)
    expect(page.emitted('update:modelValue')).toBeUndefined()
    await 打开(page)
    expect(复选框(page, '[Temu].美国').element.checked).toBe(false)
  })

  it('失效选项保留并可明确移除，其他已选项与来源数组不受影响', async () => {
    const values = ['retired-site', 'alpha-us'], page = await 准备(values)
    expect(page.get('.基础多选触发').text()).toBe('已失效选项（retired-site）、[eBay].美国')
    await 打开(page)
    expect(复选框(page, '已失效选项（retired-site）').element.checked).toBe(true)
    await 勾选(page, '已失效选项（retired-site）', false)
    expect(page.find('.失效选项').exists()).toBe(false)
    expect(复选框(page, '[eBay].美国').element.checked).toBe(true)
    await 操作(page, '确定')
    expect(已提交(page)).toEqual(['alpha-us'])
    expect(values).toEqual(['retired-site', 'alpha-us'])
  })

  it('空字典及无搜索结果都不创建选项，禁用全选且确定仅提交空选择', async () => {
    const page = await 准备([], [])
    await 打开(page)
    expect(page.get('[role="status"]').text()).toBe('暂无可选项')
    expect(复选框(page, '全选').element.disabled).toBe(true)
    await page.get('input[aria-label="搜索订单站点"]').setValue('自行创建站点'); await 稳定()
    expect(page.get('[role="status"]').text()).toBe('暂无匹配选项')
    expect(page.findAll('.基础选项行')).toHaveLength(0)
    expect(page.findAll('button').map(项 => 项.text())).not.toContain('创建')
    await 操作(page, '确定')
    expect(已提交(page)).toEqual([])
  })
})
