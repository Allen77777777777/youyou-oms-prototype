import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import ChecklistInput from './待办清单输入.vue'

type Item = { text: string; done: boolean }
let mounted: VueWrapper | undefined
function render(initial: Item[] = [], disabled = false) {
  const items = ref(initial)
  const submitCount = ref(0)
  const Host = defineComponent({
    components: { ChecklistInput },
    setup: () => ({ items, disabled, submitCount }),
    template: '<form @submit.prevent="submitCount++"><ChecklistInput v-model="items" :disabled="disabled" /></form>',
  })
  const wrapper = mount(Host, { attachTo: document.body })
  mounted = wrapper
  return { wrapper, items, submitCount }
}
function clipboard(text: string, files: File[] = []) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, files, items: files.map(file => ({ kind: 'file', getAsFile: () => file })) } })
  return event
}
afterEach(() => { mounted?.unmount(); mounted = undefined; document.body.innerHTML = '' })

describe('可编辑待办清单', () => {
  it('初始只显示添加入口，逐行创建、编辑和勾选，删除后焦点仍可接着操作', async () => {
    const { wrapper, items, submitCount } = render()
    const group = wrapper.get('[role="group"][aria-label="待办清单"]')
    const add = group.get('.checklist-add')
    expect(group.find('input').exists()).toBe(false)
    expect(add.text()).toBe('添加待办项')
    await add.trigger('click'); await nextTick()
    const first = group.get<HTMLInputElement>('input[aria-label="第1项待办内容"]')
    expect(document.activeElement).toBe(first.element)
    await first.setValue('核实仓库签收')
    first.element.setSelectionRange(2, 2)
    await first.trigger('keydown', { key: 'Enter' }); await nextTick()
    const second = group.get<HTMLInputElement>('input[aria-label="第2项待办内容"]')
    expect(items.value).toEqual([{ text: '核实', done: false }, { text: '仓库签收', done: false }])
    expect(document.activeElement).toBe(second.element)
    expect(second.element.selectionStart).toBe(0)
    await group.get('input[aria-label="第2项完成状态"]').setValue(true)
    expect(items.value[1]!.done).toBe(true)
    await group.get('button[aria-label="删除第2项"]').trigger('click'); await nextTick()
    expect(document.activeElement).toBe(first.element)
    await group.get('button[aria-label="删除第1项"]').trigger('click'); await nextTick()
    expect(items.value).toEqual([])
    expect(document.activeElement).toBe(add.element)
    expect(submitCount.value).toBe(0)
  })

  it('多行粘贴保留光标前后文字、剩余任务和原行勾选，新行未勾选，草稿空白行可编辑', async () => {
    const { wrapper, items } = render([{ text: '请核实单号', done: true }, { text: '回访买家', done: false }])
    const first = wrapper.get<HTMLInputElement>('.checklist-text')
    first.element.setSelectionRange(1, 3)
    const pasted = clipboard('检查包裹\r\n\r\n确认签收')
    first.element.dispatchEvent(pasted); await nextTick(); await nextTick()
    expect(pasted.defaultPrevented).toBe(true)
    expect(items.value).toEqual([
      { text: '请检查包裹', done: true }, { text: '', done: false },
      { text: '确认签收单号', done: false }, { text: '回访买家', done: false },
    ])
    const lastPasted = wrapper.get<HTMLInputElement>('[aria-label="第3项待办内容"]')
    expect(document.activeElement).toBe(lastPasted.element)
    expect(lastPasted.element.selectionStart).toBe(4)
  })

  it('中文输入法确认候选保留当前行，提交汉字后再按普通回车才添行', async () => {
    const { wrapper, items } = render([{ text: '', done: false }])
    const input = wrapper.get<HTMLInputElement>('.checklist-text')
    await input.trigger('compositionstart')
    input.element.value = 'he'
    await input.trigger('input')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(items.value).toEqual([{ text: '', done: false }])
    input.element.value = '核实'
    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(items.value).toEqual([{ text: '核实', done: false }])
    await input.trigger('keydown', { key: 'Enter' })
    expect(items.value).toEqual([{ text: '核实', done: false }, { text: '', done: false }])
  })

  it('文件与文本混合粘贴交给外层附件编辑器处理；纯单行粘贴交给原生文本框', () => {
    const { wrapper, items } = render([{ text: '现有待办', done: false }])
    const observed: Event[] = []
    wrapper.element.addEventListener('paste', (event: Event) => observed.push(event))
    const input = wrapper.get('.checklist-text').element
    const mixed = clipboard('第一行\n第二行', [new File(['abc'], '签收.png', { type: 'image/png' })])
    const single = clipboard('核查仓库')
    input.dispatchEvent(mixed); input.dispatchEvent(single)
    expect(observed).toEqual([mixed, single])
    expect(observed.every(event => !event.defaultPrevented)).toBe(true)
    expect(items.value).toEqual([{ text: '现有待办', done: false }])
  })

  it('禁用期间所有编辑控件均不可操作，派发多行粘贴也不改变父表单', () => {
    const { wrapper, items } = render([{ text: '已完成', done: true }], true)
    expect(wrapper.findAll('button, input').every(control => control.attributes('disabled') !== undefined)).toBe(true)
    wrapper.get('.checklist-text').element.dispatchEvent(clipboard('甲\n乙'))
    expect(items.value).toEqual([{ text: '已完成', done: true }])
  })
})
