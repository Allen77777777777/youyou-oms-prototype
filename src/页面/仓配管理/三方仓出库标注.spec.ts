import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElIcon, ElInput } from 'element-plus'
import OutboundPage from './三方仓出库单页面.vue'
import AnnotationIndex from '@/原型标注/标注抽屉.vue'
import { 原型标注指令 } from '@/原型标注/原型标注指令'
import { 标注状态 } from '@/原型标注/标注状态'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 仓库会话单据 } from './仓配会话'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from '../订单处理/演示会话'

const 页面路径 = '/oms/warehouse-delivery/outbound-orders'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, rows: 仓库会话单据.value })
let wrapper: VueWrapper | undefined
let page: Omit<VueWrapper, 'exists'>
let 帧时刻 = 0, 帧编号 = 0
const 动画帧 = new Map<number, FrameRequestCallback>()
const 原滚动方法 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

// 保留真实弹层的选择器与叠层关系；v-if 让关闭后的内容真正卸载。
function 弹层桩(kind: 'dialog' | 'drawer', zIndex: number) {
  return defineComponent({
    props: ['modelValue', 'title'],
    setup(props, { slots }) {
      return () => props.modelValue ? h('div', { class: 'el-overlay', style: { zIndex } }, [
        h('section', { class: `el-${kind}`, 'data-title': props.title }, [slots.default?.(), h('footer', slots.footer?.())]),
      ]) : null
    },
  })
}
function 恢复数据() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions; 仓库会话单据.value = data.rows
}
function 快照() { return JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, rows: 仓库会话单据.value }) }
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 布局() {
  await 稳定()
  帧时刻 += 160
  const pending = [...动画帧.values()]
  动画帧.clear()
  pending.forEach(callback => callback(帧时刻))
  await 稳定()
}
async function 打开() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: 页面路径, component: OutboundPage, meta: { title: '三方仓出库单' } }] })
  await router.push(页面路径); await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h('main', [h(OutboundPage), h(AnnotationIndex)]) }), {
    attachTo: document.body,
    global: { plugins: [router], components: { ElIcon, ElInput }, directives: { prototype: 原型标注指令 }, stubs: { ElDialog: 弹层桩('dialog', 3000), ElDrawer: 弹层桩('drawer', 2000), ElTooltip: { template: '<span><slot /></span>' } } },
  })
  page = wrapper.getComponent(OutboundPage)
  await 布局()
  return page
}
function 按钮(root: { findAll(selector: string): DOMWrapper<Element>[] }, name: string) {
  const button = root.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`未找到按钮：${name}`)
  return button
}
function 索引() { return new DOMWrapper(document.body).get('aside[aria-label="原型标注索引"]') }
function 弹窗(title: string) { return page.get(`[data-title="${title}"]`) }
function 注册IDs() { return [...new Set(标注状态.注册项.value.map(item => item.标注.id))].sort() }
async function 索引IDs() {
  const index = 索引()
  for (const toggle of index.findAll('.详情开关')) {
    if (toggle.attributes('aria-expanded') === 'false') await toggle.trigger('click')
  }
  return index.findAll('.详细说明 code').map(code => code.text()).sort()
}
async function 搜索单号(no: string) {
  const search = page.getComponent(FieldSearch)
  search.vm.$emit('update:field', 'no'); search.vm.$emit('update:mode', 'exact'); search.vm.$emit('update:modelValue', no)
  await 稳定(); await 按钮(page.get('.出库筛选'), '搜索').trigger('click'); await 布局()
}
function 主行() { return page.get('.出库表格').findAll('tbody tr.el-table__row') }

beforeEach(async () => {
  恢复数据(); 标注状态.退出(); await 稳定()
  帧时刻 = 0; 帧编号 = 0; 动画帧.clear()
  vi.stubGlobal('innerWidth', 1600); vi.stubGlobal('innerHeight', 1000)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++帧编号; 动画帧.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { 动画帧.delete(id) })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    let visible = this.isConnected
    for (let node: HTMLElement | null = this; node && visible; node = node.parentElement) visible = !node.hidden && node.style.display !== 'none' && node.style.visibility !== 'hidden'
    return (visible ? [new DOMRect(120, 160, 300, 100)] : []) as unknown as DOMRectList
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.prototypeId) return new DOMRect(120, 160, 300, 100)
    if (this.matches('button, input, select, textarea, a, label, h1, h2, h3, h4, [role="button"], [role="combobox"]')) return new DOMRect(900, 820, 80, 22)
    return new DOMRect(0, 0, 1600, 1000)
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined; 标注状态.退出()
  for (const item of [...标注状态.注册项.value]) 标注状态.注销(item.元素)
  if (原滚动方法) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', 原滚动方法)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  document.body.innerHTML = ''; 动画帧.clear(); 恢复数据(); await 稳定(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('三方仓出库单标注与真实索引集成', () => {
  it('稳定ID在查询与模式切换后保持，关闭标注不干扰精确查询或修改业务事实', async () => {
    await 打开()
    const before = 快照()
    expect(document.body.querySelector('[aria-label="原型标注索引"]')).toBeNull()
    await 搜索单号('CK2610100008')
    expect(主行()).toHaveLength(1)
    expect(主行()[0]!.text()).toContain('CK2610100008')
    const ids = 注册IDs(), count = 标注状态.注册项.value.length
    expect(ids).toEqual(expect.arrayContaining(['oms.outbound.overview', 'oms.outbound.states', 'oms.outbound.filters', 'oms.outbound.table', 'oms.outbound.table.sources', 'oms.outbound.table.quantities', 'oms.outbound.sync']))
    expect(标注状态.注册项.value.every(item => item.元素.dataset.prototypeId === item.标注.id && item.标注.锚点 === item.标注.id && item.标注.路由 === 页面路径)).toBe(true)
    标注状态.切换模式(); await 布局()
    expect(document.body.dataset.prototypeMode).toBe('true')
    expect(await 索引IDs()).toEqual(expect.arrayContaining(ids))
    await 搜索单号('CK2610100008')
    expect(注册IDs()).toEqual(ids)
    expect(标注状态.注册项.value).toHaveLength(count)
    await 索引().get('[aria-label="关闭原型标注"]').trigger('click'); await 布局()
    expect(document.body.dataset.prototypeMode).toBe('false')
    expect(document.body.querySelector('.原型编号层')).toBeNull()
    await 搜索单号('CK2610100003')
    expect(主行()).toHaveLength(1)
    expect(主行()[0]!.text()).toContain('CK2610100003')
    expect(快照()).toBe(before)
  })

  it('按稳定ID搜索动作标注，展开非空业务分组和PRD追溯', async () => {
    await 打开(); 标注状态.切换模式(); await 布局()
    await 索引().get('.标注搜索 input').setValue('oms.outbound.sync'); await 布局()
    const cards = 索引().findAll('.标注卡片')
    expect(cards).toHaveLength(1)
    const card = cards[0]!
    expect(card.get('.详情开关').attributes('aria-expanded')).toBe('false')
    await card.get('.标注卡片标题').trigger('click'); await 布局()
    expect(标注状态.当前标注.value?.id).toBe('oms.outbound.sync')
    expect(card.get('.详情开关').attributes('aria-expanded')).toBe('true')
    const groups = card.findAll('.详细说明 > section')
    const headings = groups.map(group => group.get('h4').text())
    expect(headings).toEqual(expect.arrayContaining(['前置条件', '触发方式', '系统动作', '成功结果', '异常与阻断', '验收要点', '来源与追溯']))
    groups.filter(group => group.get('h4').text() !== '来源与追溯').forEach(group => expect(group.findAll('p').some(paragraph => paragraph.text().trim())).toBe(true))
    expect(card.get('.详细说明 code').text()).toBe('oms.outbound.sync')
    expect(card.findAll('.引用').some(reference => /^PRD\/.+\.md/.test(reference.text()))).toBe(true)
    await card.get('.详情开关').trigger('click')
    expect(card.get('.详情开关').attributes('aria-expanded')).toBe('false')
    expect(card.find('.详细说明').exists()).toBe(false)
    await 索引().get('.标注搜索 input').setValue('不存在的出库标注锚点'); await 布局()
    expect(索引().findAll('.标注卡片')).toHaveLength(0)
    expect(索引().get('.标注空态').text()).toContain('没有匹配的标注')
    expect(主行()).toHaveLength(10)
  })

  it('详情页签及叠加确认仅索引最上弹层，内容卸载后移除锚点并恢复页面索引', async () => {
    await 打开(); await 搜索单号('CK2610100003'); 标注状态.切换模式(); await 布局()
    await 按钮(主行()[0]!, '出库单详情').trigger('click'); await 布局()
    expect(await 索引IDs()).toEqual(expect.arrayContaining(['oms.outbound.detail.identity', 'oms.outbound.detail.snapshot', 'oms.outbound.detail.times']))
    expect(await 索引IDs()).not.toContain('oms.outbound.overview')
    await 按钮(弹窗('三方仓出库单详情').get('.详情页签'), '商品明细').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.outbound.detail.snapshot')
    expect(注册IDs()).not.toContain('oms.outbound.detail.times')
    expect(await 索引IDs()).toContain('oms.outbound.detail.items')
    await 按钮(弹窗('三方仓出库单详情'), '同步仓库状态').trigger('click'); await 布局()
    expect(page.find('.el-drawer').exists()).toBe(true)
    expect(await 索引IDs()).toContain('oms.outbound.confirm')
    expect(await 索引IDs()).not.toContain('oms.outbound.detail.identity')
    await 按钮(弹窗('同步仓库状态 · 执行确认'), '取消').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.outbound.confirm')
    expect(await 索引IDs()).toContain('oms.outbound.detail.items')
    await 按钮(弹窗('三方仓出库单详情'), '同步仓库状态').trigger('click'); await 布局()
    await 按钮(弹窗('同步仓库状态 · 执行确认'), '确认同步仓库状态').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.outbound.confirm')
    expect(注册IDs()).not.toContain('oms.outbound.detail.identity')
    expect(await 索引IDs()).toContain('oms.outbound.result')
    expect(await 索引IDs()).not.toContain('oms.outbound.table')
    await 按钮(弹窗('出库单处理结果'), '完成').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.outbound.result')
    expect(await 索引IDs()).toContain('oms.outbound.overview')
    expect(await 索引IDs()).toContain('oms.outbound.table')
  })
})
