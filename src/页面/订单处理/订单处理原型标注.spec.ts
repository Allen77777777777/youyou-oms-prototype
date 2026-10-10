import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElIcon, ElInput } from 'element-plus'
import ProcessingPage from './订单处理页面.vue'
import AnnotationIndex from '@/原型标注/标注抽屉.vue'
import { 原型标注指令 } from '@/原型标注/原型标注指令'
import { 标注状态 } from '@/原型标注/标注状态'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from './演示会话'
import { 共享标发单 } from '../订单标发/演示会话'

const 页面路径 = '/oms/self-fulfillment/processing'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
let wrapper: VueWrapper | undefined
let page: Omit<VueWrapper, 'exists'>
let router: Router
let 帧时刻 = 0, 帧编号 = 0
const 动画帧 = new Map<number, FrameRequestCallback>()
const 原滚动方法 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

// 保留真实索引识别所需的弹层结构；关闭时卸载内容，避免 jsdom 布局干扰。
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
  演示库存.value = data.inventory; 订单版本.value = data.versions; 共享标发单.value = data.confirmations
}
function 快照() { return JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value }) }
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 布局() {
  await 稳定(); 帧时刻 += 160
  const pending = [...动画帧.values()]; 动画帧.clear()
  pending.forEach(callback => callback(帧时刻)); await 稳定()
}
async function 打开() {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: 页面路径, component: ProcessingPage, meta: { title: '订单处理' } },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } },
    { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div />' } },
    { path: '/oms/self-fulfillment/shipping-confirmation', component: { template: '<div />' } },
  ] })
  await router.push(页面路径); await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h('main', [h(ProcessingPage), h(AnnotationIndex)]) }), {
    attachTo: document.body,
    global: { plugins: [router], components: { ElIcon, ElInput }, directives: { prototype: 原型标注指令 }, stubs: { ElDialog: 弹层桩('dialog', 3000), ElDrawer: 弹层桩('drawer', 2000), ElTooltip: { inheritAttrs: false, template: '<span><slot /></span>' }, ElDropdown: { inheritAttrs: false, template: '<div><slot /></div>' } } },
  })
  page = wrapper.getComponent(ProcessingPage)
  await 布局()
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
  for (const toggle of index.findAll('.详情开关')) if (toggle.attributes('aria-expanded') === 'false') await toggle.trigger('click')
  return index.findAll('.详细说明 code').map(code => code.text()).sort()
}
async function 搜索单号(no: string) {
  const search = page.getComponent(FieldSearch)
  search.vm.$emit('update:field', 'systemOrderNo'); search.vm.$emit('update:mode', 'exact'); search.vm.$emit('update:modelValue', no)
  await 稳定(); await 按钮(page.get('.筛选操作'), '查询').trigger('click'); await 布局()
}
function 主行() { return page.get('.作业表格').findAll('tbody tr.el-table__row') }

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

// 真实表格与索引集成会挂载多来源及重复锚点，保留断言并允许全量并发时的DOM开销。
describe('订单处理业务与原型标注索引集成', { timeout: 20_000 }, () => {
  it('模式开关不改业务事实或查询，重复行同 ID 只索引一张卡片', async () => {
    await 打开(); const before = 快照()
    expect(document.body.querySelector('[aria-label="原型标注索引"]')).toBeNull()
    expect(标注状态.注册项.value.filter(item => item.标注.id === 'oms.processing.list-fields').length).toBeGreaterThan(1)
    标注状态.切换模式(); await 布局()
    const ids = await 索引IDs()
    expect(ids.filter(id => id === 'oms.processing.list-fields')).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['oms.processing.filters', 'oms.processing.field-search', 'oms.processing.product-fields', 'oms.processing.processing-hints']))
    expect(ids).not.toContain('oms.order.item-title-link')
    await 搜索单号('OMS-DEMO-ACTION-01')
    expect(主行()).toHaveLength(1); expect(主行()[0]!.text()).toContain('OMS-DEMO-ACTION-01')
    const filteredIds = 注册IDs()
    await 索引().get('[aria-label="关闭原型标注"]').trigger('click'); await 布局()
    expect(document.body.dataset.prototypeMode).toBe('false')
    expect(document.body.querySelector('.原型编号层')).toBeNull()
    expect(注册IDs()).toEqual(filteredIds)
    await 搜索单号('OMS-DEMO-ACTION-02')
    expect(主行()).toHaveLength(1); expect(主行()[0]!.text()).toContain('OMS-DEMO-ACTION-02')
    expect(快照()).toBe(before)
  })

  it('按稳定锚点搜索及展开可读逻辑，不影响查询结果', async () => {
    await 打开(); 标注状态.切换模式(); await 布局()
    const before = 快照(), rowCount = 主行().length
    await 索引().get('.标注搜索 input').setValue('oms.processing.field-search'); await 布局()
    const cards = 索引().findAll('.标注卡片'); expect(cards).toHaveLength(1)
    const card = cards[0]!
    await card.get('.标注卡片标题').trigger('click'); await 布局()
    expect(标注状态.当前标注.value?.id).toBe('oms.processing.field-search')
    expect(card.get('.详情开关').attributes('aria-expanded')).toBe('true')
    const headings = card.findAll('.详细说明 > section h4').map(heading => heading.text())
    expect(headings).toEqual(expect.arrayContaining(['触发方式', '系统动作', '异常与阻断', '验收要点', '来源与追溯']))
    expect(card.get('.详细说明').text()).toContain('超限不截断')
    expect(card.findAll('.引用').some(reference => reference.text().startsWith('PRD/订单处理列表与查询功能PRD.md#'))).toBe(true)
    expect(card.get('.详细说明 code').text()).toBe('oms.processing.field-search')
    await card.get('.详情开关').trigger('click'); expect(card.find('.详细说明').exists()).toBe(false)
    await 索引().get('.标注搜索 input').setValue('不存在的订单处理说明'); await 布局()
    expect(索引().findAll('.标注卡片')).toHaveLength(0)
    expect(索引().get('.标注空态').text()).toContain('没有匹配的标注')
    expect(主行()).toHaveLength(rowCount); expect(快照()).toBe(before)
  })

  it('操作、库存及结果只索引前台弹层，关闭后移除锚点并恢复页面', async () => {
    await 打开(); await 搜索单号('OMS-DEMO-ACTION-01'); 标注状态.切换模式(); await 布局()
    const before = 快照()
    await 按钮(主行()[0]!, '审核').trigger('click'); await 布局()
    expect(await 索引IDs()).toEqual(expect.arrayContaining(['oms.processing.action-settings', 'oms.processing.action-validation', 'oms.processing.action-scope']))
    expect(await 索引IDs()).not.toContain('oms.processing.filters')
    expect(索引().text()).toContain('20 项')
    await 按钮(弹窗('审核'), '取消').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.processing.action-settings')
    expect(await 索引IDs()).toContain('oms.processing.filters')
    await 主行()[0]!.get('.库存明细入口').trigger('click'); await 布局()
    expect(await 索引IDs()).toEqual(expect.arrayContaining(['oms.processing.inventory-details', 'oms.processing.inventory-item', 'oms.processing.inventory-scope']))
    expect(await 索引IDs()).not.toContain('oms.processing.list-fields')
    await 按钮(弹窗('仓库库存与库龄'), '关闭').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.processing.inventory-details')
    expect(await 索引IDs()).toContain('oms.processing.filters')
    expect(快照()).toBe(before)
    await 按钮(主行()[0]!, '审核').trigger('click'); await 布局()
    await 按钮(弹窗('审核'), '确认审核').trigger('click'); await 布局()
    expect(await 索引IDs()).toEqual(['oms.processing.batch-results'])
    expect(注册IDs()).not.toContain('oms.processing.action-settings')
    expect(弹窗('审核结果').text()).toContain('OMS-DEMO-ACTION-01')
    expect(共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-ACTION-01')!.reviews).toHaveLength(1)
    await 按钮(弹窗('审核结果'), '关闭').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.processing.batch-results')
    expect(await 索引IDs()).toContain('oms.processing.filters')
  })

  it('共享履约查看先选择来源，来源弹窗不索引后台也不默认第一张', async () => {
    await 打开(); await router.replace({ path: 页面路径, query: { systemOrderNo: 'OMS-DEMO-ACTION-33' } }); await 布局()
    expect(主行()).toHaveLength(1)
    标注状态.切换模式(); await 布局(); const before = 快照()
    await 按钮(主行()[0]!, '订单详情').trigger('click'); await 布局()
    expect(await 索引IDs()).toEqual(['oms.processing.source-selection'])
    expect((按钮(弹窗('订单详情 · 选择来源订单'), '确认来源').element as HTMLButtonElement).disabled).toBe(true)
    await 按钮(弹窗('订单详情 · 选择来源订单'), '取消').trigger('click'); await 布局()
    expect(注册IDs()).not.toContain('oms.processing.source-selection')
    expect(await 索引IDs()).toContain('oms.processing.filters')
    expect(快照()).toBe(before); expect(router.currentRoute.value.path).toBe(页面路径)
  })
})
