import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import OrderNotes from './订单备注组件.vue'
import { 共享订单备注, 获取订单备注, 追加订单备注 } from './订单备注模型'

const 初始备注 = JSON.stringify(共享订单备注.value)
const 实例: VueWrapper[] = []
const 桩组件 = {
  ElDialog: { props: ['modelValue'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="备注弹窗" tabindex="-1" @keydown.esc.stop="$emit(\'update:modelValue\', false)"><slot /><slot name="footer" /></section>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue', 'input'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" />' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
}
function 打开组件(mode: 'list' | 'detail' | 'action', orderNo = 'ORDER-DEMO-A') {
  const wrapper = mount(OrderNotes, { props: { mode, orderNo }, global: { directives: { prototype: {} }, stubs: 桩组件 } })
  实例.push(wrapper)
  return wrapper
}
function 按钮(wrapper: VueWrapper, 名称: string) {
  const button = wrapper.findAll('button').find(项 => 项.text() === 名称)
  if (!button) throw new Error(`未找到按钮：${名称}`)
  return button
}
beforeEach(() => { 共享订单备注.value = [] })
afterEach(() => { 实例.splice(0).forEach(wrapper => wrapper.unmount()); 共享订单备注.value = JSON.parse(初始备注); document.body.innerHTML = '' })

describe('订单备注交互', () => {
  it('直接增加备注时展示同订单历史全文和北京时间，没有历史时不伪造记录', async () => {
    共享订单备注.value = [
      { order_id: 'ORDER-DEMO-A', note_content: '历史第一行\n历史第二行', author_id: 'prototype-user', noted_at: '2026-10-09T00:30:00Z' },
      { order_id: 'ORDER-DEMO-B', note_content: '其他订单的历史', author_id: 'prototype-user', noted_at: '2026-10-09T01:00:00Z' },
    ]
    const 操作 = 打开组件('action')
    await 按钮(操作, '增加备注').trigger('click')
    expect(操作.get('.追加备注历史 .备注正文').text()).toBe('历史第一行\n历史第二行')
    expect(操作.get('.追加备注历史 time').text()).toBe('2026-10-09 08:30:00 UTC+8')
    expect(操作.get('.追加备注历史').text()).not.toContain('其他订单的历史')
    await 操作.get('textarea').setValue('取消的草稿')
    await 按钮(操作, '取消').trigger('click')
    expect(获取订单备注('ORDER-DEMO-A')).toHaveLength(1)
    await 操作.setProps({ orderNo: 'ORDER-DEMO-C' })
    await 按钮(操作, '增加备注').trigger('click')
    expect(操作.find('.追加备注历史').exists()).toBe(false)
    expect(操作.get('textarea').element.value).toBe('')
  })

  it('操作保存后列表摘要和详情立即共享更新，重复点击只追加一次', async () => {
    const 列表 = 打开组件('list')
    const 详情 = 打开组件('detail')
    const 操作 = 打开组件('action')
    const 其他订单 = 打开组件('list', 'ORDER-DEMO-B')
    await 按钮(操作, '增加备注').trigger('click')
    await 操作.get('textarea').setValue('第一行沟通记录\n第二行处理说明')
    const 保存 = 按钮(操作, '保存备注')
    await Promise.all([保存.trigger('click'), 保存.trigger('click')])
    await flushPromises()
    expect(获取订单备注('ORDER-DEMO-A')).toHaveLength(1)
    expect(列表.get('.备注摘要').text()).toBe('第一行沟通记录\n第二行处理说明')
    expect(按钮(列表, '全部 1 条').attributes('aria-haspopup')).toBe('dialog')
    expect(详情.get('.备注正文').text()).toBe('第一行沟通记录\n第二行处理说明')
    expect(其他订单.find('.本地备注块').exists()).toBe(false)
    expect(操作.find('.备注弹窗').exists()).toBe(false)
  })

  it('空白备注停留弹窗提示，切换订单后清空未保存草稿', async () => {
    const 操作 = 打开组件('action')
    await 按钮(操作, '增加备注').trigger('click')
    await 操作.get('textarea').setValue(' \n ')
    await 按钮(操作, '保存备注').trigger('click')
    await flushPromises()
    expect(操作.get('[role="alert"]').text()).toBe('请输入备注内容')
    expect(共享订单备注.value).toHaveLength(0)
    await 操作.get('textarea').setValue('不应写到下一订单的草稿')
    await 操作.setProps({ orderNo: 'ORDER-DEMO-B' })
    expect(操作.find('.备注弹窗').exists()).toBe(false)
    await 按钮(操作, '增加备注').trigger('click')
    expect(操作.get('textarea').element.value).toBe('')
    expect(共享订单备注.value).toHaveLength(0)
  })

  it('列表仅显示最新摘要，完整历史保留每条正文和来源信息且可追加', async () => {
    const 旧备注 = '旧记录第一行\n旧记录后续内容'
    const 新备注 = `最新记录第一行\n${'需要完整保留的后续内容'.repeat(20)}\n末尾核对信息`
    追加订单备注('ORDER-DEMO-A', 旧备注)
    追加订单备注('ORDER-DEMO-A', 新备注)
    追加订单备注('ORDER-DEMO-B', '其他订单的独立记录')
    const 列表 = 打开组件('list')
    expect(列表.get('.备注摘要').text()).toBe(新备注)
    expect(列表.find('.备注正文').exists()).toBe(false)
    expect(列表.find('time').exists()).toBe(false)
    expect(列表.text()).not.toContain(旧备注)
    const 全部 = 按钮(列表, '全部 2 条')
    expect(全部.attributes('aria-expanded')).toBe('false')
    await 全部.trigger('click')
    expect(全部.attributes('aria-expanded')).toBe('true')
    expect(列表.findAll('.备注历史 .备注正文').map(项 => 项.text())).toEqual([旧备注, 新备注])
    expect(列表.get('.备注历史').text()).toContain('原型用户')
    expect(列表.get('.备注历史').text()).toContain('UTC+8')
    expect(列表.get('.备注历史').text()).not.toContain('其他订单的独立记录')
    await 按钮(列表, '增加备注').trigger('click')
    await 列表.get('textarea').setValue('在完整历史中追加的新备注')
    await 按钮(列表, '保存备注').trigger('click')
    await flushPromises()
    expect(列表.get('.备注摘要').text()).toBe('在完整历史中追加的新备注')
    expect(按钮(列表, '全部 3 条').attributes('aria-expanded')).toBe('true')
    expect(列表.findAll('.备注历史 .备注正文').map(项 => 项.text())).toEqual([旧备注, 新备注, '在完整历史中追加的新备注'])
  })

  it('完整历史可以关闭，切换订单同时关闭历史及未保存备注', async () => {
    追加订单备注('ORDER-DEMO-A', '订单甲历史')
    追加订单备注('ORDER-DEMO-B', '订单乙历史')
    const 列表 = 打开组件('list')
    await 按钮(列表, '全部 1 条').trigger('click')
    await 列表.get('.备注弹窗').trigger('keydown', { key: 'Escape' })
    expect(列表.find('.备注历史').exists()).toBe(false)
    expect(按钮(列表, '全部 1 条').attributes('aria-expanded')).toBe('false')
    await 按钮(列表, '全部 1 条').trigger('click')
    await 按钮(列表, '增加备注').trigger('click')
    await 列表.get('textarea').setValue('订单甲未保存草稿')
    await 列表.setProps({ orderNo: 'ORDER-DEMO-B' })
    expect(列表.findAll('.备注弹窗')).toHaveLength(0)
    expect(列表.get('.备注摘要').text()).toBe('订单乙历史')
    await 按钮(列表, '全部 1 条').trigger('click')
    expect(列表.findAll('.备注历史 .备注正文').map(项 => 项.text())).toEqual(['订单乙历史'])
    await 按钮(列表, '增加备注').trigger('click')
    expect(列表.get('textarea').element.value).toBe('')
    expect(获取订单备注('ORDER-DEMO-A')).toHaveLength(1)
    expect(获取订单备注('ORDER-DEMO-B')).toHaveLength(1)
  })
})
