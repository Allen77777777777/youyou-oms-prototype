import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, withDirectives } from 'vue'
import { mount } from '@vue/test-utils'
import { 原型标注指令 } from './原型标注指令'
import { 获取标注分类, 标注状态 } from './标注状态'

const 数据 = { id: 'oms.annotation.test', 标题: '审核提交', 说明: '验证业务事件与锚点注册', 事实等级: '已确认' as const }
afterEach(() => {
  标注状态.退出()
  for (const 项 of [...标注状态.注册项.value]) 标注状态.注销(项.元素)
})

describe('原型标注生命周期与业务交互隔离', () => {
  it('开启及关闭标注均不吞掉业务点击和键盘事件，不修改原始可访问性语义', async () => {
    const 点击 = vi.fn(), 键盘 = vi.fn()
    const 组件 = defineComponent({ setup: () => () => withDirectives(h('button', { onClick: 点击, onKeydown: 键盘, 'aria-label': '提交审核' }, '提交'), [[原型标注指令, 数据]]) })
    const 实例 = mount(组件)
    await 实例.trigger('click')
    标注状态.切换模式()
    await 实例.trigger('click')
    await 实例.trigger('keydown', { key: 'Enter' })
    expect(点击).toHaveBeenCalledTimes(2)
    expect(键盘).toHaveBeenCalledTimes(1)
    expect(实例.attributes('aria-label')).toBe('提交审核')
    expect(实例.attributes('role')).toBeUndefined()
    expect(标注状态.注册项.value).toHaveLength(1)
    实例.unmount()
    expect(标注状态.注册项.value).toHaveLength(0)
  })

  it('同一稳定ID在多个行上复用，卸载一行仍保留其他锚点及当前说明', () => {
    const a = document.createElement('div'), b = document.createElement('div')
    标注状态.注册(a, 数据); 标注状态.注册(b, 数据)
    标注状态.切换模式(); 标注状态.打开(数据)
    标注状态.注销(a)
    expect(标注状态.当前标注.value?.id).toBe(数据.id)
    expect(标注状态.注册项.value[0]?.元素).toBe(b)
    标注状态.注销(b)
    expect(标注状态.当前标注.value).toBeUndefined()
  })

  it('动态元数据更新不增加重复锚点，并保留当前文档内容', async () => {
    const 标题 = ref('首次规则')
    const 实例 = mount(defineComponent({ setup: () => () => withDirectives(h('div', 标题.value), [[原型标注指令, { ...数据, 标题: 标题.value }]]) }))
    标注状态.切换模式(); 标注状态.打开(数据)
    标题.value = '更新后的规则'
    await 实例.vm.$nextTick()
    expect(标注状态.注册项.value).toHaveLength(1)
    expect(标注状态.当前标注.value?.标题).toBe('更新后的规则')
    expect(标注状态.注册项.value[0]?.标注.锚点).toBe(数据.id)
    实例.unmount()
  })

  it('关闭模式清空选择，关闭时不能打开说明', () => {
    标注状态.切换模式(); 标注状态.打开(数据); 标注状态.退出(); 标注状态.打开(数据)
    expect(标注状态.当前标注.value).toBeUndefined()
    expect(document.body.dataset.prototypeMode).toBe('false')
  })

  it('显式分类与事实等级分别管理，并兼容未迁移的旧标注', () => {
    expect(获取标注分类({ ...数据, 分类: '字段', 事实等级: '待确认' })).toBe('字段')
    expect(获取标注分类({ ...数据, 标题: '订单状态' })).toBe('字段')
    expect(获取标注分类({ ...数据, 事实等级: '待确认' })).toBe('待确认')
  })
})
