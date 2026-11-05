import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, inject, nextTick, provide, type Ref } from 'vue'
import { flushPromises, shallowMount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElMessage } from 'element-plus'
import ProcessingPage from './订单处理页面.vue'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本, 专项人工审核权限, 执行异常人工审核, 当前版本 } from './演示会话'
import { 共享标发单 } from '../订单标发/演示会话'
import { 标注状态 } from '@/原型标注/标注状态'

const 页面路径 = '/oms/self-fulfillment/processing'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
let wrapper: VueWrapper | undefined
let router: Router

// 保留页面的队列、动作、查询与导航；只替换通用容器，避免表格布局和计时组件干扰业务交互。
const 桩组件 = {
  ElConfigProvider: { template: '<div><slot /></div>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElTag: { template: '<span><slot /></span>' },
  ElTooltip: { template: '<span><slot /></span>' },
  ElIcon: { template: '<span />' },
  ElAlert: { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  ElDropdown: { template: '<div class="更多菜单桩"><slot /><slot name="dropdown" /></div>' },
  ElDropdownMenu: { template: '<div role="menu"><slot /></div>' },
  ElDropdownItem: { template: '<button role="menuitem"><slot /></button>' },
  ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue" class="履约摘要桩"><slot /><footer><slot name="footer" /></footer></section>' },
  ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' },
  ElTabs: defineComponent({
    props: ['modelValue'], emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      provide('processing-test-tabs', { value: computed(() => props.modelValue as string), change: (name: string) => emit('update:modelValue', name) })
      return () => h('div', { role: 'tablist' }, slots.default?.())
    },
  }),
  ElTabPane: defineComponent({
    props: ['name'],
    setup(props, { slots }) {
      const tabs = inject<{ value: Ref<string>; change: (name: string) => void }>('processing-test-tabs')!
      return () => h('button', { role: 'tab', 'data-stage': props.name, 'aria-selected': tabs.value.value === props.name, onClick: () => tabs.change(props.name as string) }, slots.label?.())
    },
  }),
  ElTable: defineComponent({
    props: ['data'],
    setup(props, { slots, expose }) {
      provide('processing-test-rows', computed(() => props.data as unknown[]))
      expose({ clearSelection: vi.fn() })
      return () => h('div', slots.default?.())
    },
  }),
  ElTableColumn: defineComponent({
    props: ['label'],
    setup(props, { slots }) {
      const rows = inject<Ref<unknown[]>>('processing-test-rows')!
      return () => h('div', { 'data-column': props.label }, rows.value.map(row => h('section', { 'data-row': (row as { key?: string }).key }, slots.default?.({ row }))))
    },
  }),
}

function 恢复数据() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions; 共享标发单.value = data.confirmations
}
function 快照() { return JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value }) }
function 单(编号: string) { return 共享订单.value.find(order => order.systemOrderNo === `OMS-DEMO-ACTION-${编号}`)! }
function 执行(编号: string) { return 仓库执行记录.value.find(execution => execution.订单号.includes(单(编号).systemOrderNo))! }
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开(编号?: string) {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: 页面路径, component: ProcessingPage },
    { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div />' } },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } },
  ] })
  await router.push({ path: 页面路径, query: 编号 ? { systemOrderNo: `OMS-DEMO-ACTION-${编号}` } : {} }); await router.isReady()
  wrapper = shallowMount(ProcessingPage, { global: { plugins: [router], directives: { prototype: {} }, stubs: 桩组件 } })
  await 稳定()
  return wrapper
}
function 按钮(root: { findAll(selector: string): DOMWrapper<Element>[] }, name: string) {
  const button = root.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`未找到按钮：${name}`)
  return button
}
function 无截单入口(root: { findAll(selector: string): DOMWrapper<Element>[] }) {
  expect(root.findAll('button').map(button => button.text()).filter(text => /截单/.test(text))).toEqual([])
}

beforeEach(() => {
  恢复数据(); 标注状态.退出()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; 恢复数据(); 标注状态.退出(); vi.restoreAllMocks() })

describe('订单处理保留仓库事实，将截单办理入口交给三方仓出库单', () => {
  it('发货审核失败按原因码过滤，专人逐单审核后同步两端计数', async () => {
    const 订单 = 单('01')
    订单.processingStatus = '异常'
    订单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
    单('20').blockReason = '备注中的未匹配到审单规则'
    const page = await 打开()
    const 待推单数 = () => Number(page.get('[data-stage="待推单"] b').text())
    const 原待推单数 = 待推单数()
    await page.get('[data-stage="异常"]').trigger('click')
    const 分类 = page.findAll('.关注选项 button').find(button => button.text().includes('发货审核失败'))!
    const 初始数 = Number(分类.get('b').text())
    await 分类.trigger('click')
    expect(page.find(`[data-column="操作"] [data-row="${单('20').systemOrderNo}"]`).exists()).toBe(false)
    const row = page.get(`[data-column="操作"] [data-row="${订单.systemOrderNo}"]`)
    expect(row.text()).toContain('人工审核通过')
    expect(row.text()).not.toContain('恢复发货')
    expect(page.get('.批量操作组').text()).not.toContain('人工审核通过')
    try {
      专项人工审核权限.value = false
      await 稳定()
      expect(row.text()).not.toContain('人工审核通过')
    } finally { 专项人工审核权限.value = true }
    expect(执行异常人工审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    await 稳定()
    expect(Number(分类.get('b').text())).toBe(初始数 - 1)
    expect(待推单数()).toBe(原待推单数 + 1)
  })

  it('平台新单首轮未完成时不开放作业行，完成后可办理审核、拆分和合并', async () => {
    const 订单 = 单('01')
    订单.initialReviewPending = true
    const page = await 打开('01')
    const 操作行 = `[data-column="操作"] [data-row="${订单.systemOrderNo}"]`
    expect(page.find(操作行).exists()).toBe(false)
    delete 订单.initialReviewPending
    await 稳定()
    expect(page.get(操作行).text()).toContain('审核')
    expect(page.get(操作行).text()).toContain('拆分发货')
    expect(page.get('.批量操作组').text()).toContain('合并发货')
  })
  it('六态队列的批量栏、行主操作和更多菜单均不提供截单，保留同步入口', async () => {
    const page = await 打开()
    const 原数据 = 快照()
    for (const stage of ['待审核', '待推单', '待发货', '已发货', '异常', '不发货']) {
      await page.get(`[role="tab"][data-stage="${stage}"]`).trigger('click')
      await 稳定()
      const toolbar = page.get('.批量操作组')
      expect(toolbar.findAll('button').map(button => button.text())).toContain('批量同步仓库状态')
      expect(page.findAll('.行操作').length).toBeGreaterThan(0)
      无截单入口(toolbar)
      page.findAll('.行操作').forEach(无截单入口)
    }
    expect(快照()).toBe(原数据)
  })

  it('零出库的已建仓单也不在订单处理发起截单，履约摘要保留仓态并导航到关联出库单', async () => {
    const page = await 打开('12')
    const 原数据 = 快照()
    expect(执行('12').状态).toBe('待出库')
    const row = page.get(`[data-column="操作"] [data-row="${单('12').fulfillmentOrders[0]!.fulfillmentOrderNo}"]`)
    expect(row.findAll('[role="menuitem"]').map(button => button.text())).toContain('退回待审核')
    无截单入口(row)
    await 按钮(page, 单('12').fulfillmentOrders[0]!.fulfillmentOrderNo).trigger('click')
    const drawer = page.get('.履约摘要桩')
    expect(drawer.get('.关联执行卡').text()).toContain('待出库')
    expect(drawer.get('.关联执行卡').text()).toContain(执行('12').出库单号)
    无截单入口(drawer)
    expect(快照()).toBe(原数据)
    await 按钮(drawer, '查看三方仓出库单').trigger('click')
    await 稳定()
    expect(router.currentRoute.value.path).toBe('/oms/warehouse-delivery/outbound-orders')
    expect(router.currentRoute.value.query).toMatchObject({ systemOrderNo: 单('12').systemOrderNo, fulfillmentOrderNo: 单('12').fulfillmentOrders[0]!.fulfillmentOrderNo })
    expect(快照()).toBe(原数据)
  })

  it('取消中仍可同步到明确已取消，保留原OMS阶段和出库单身份，摘要显示结果且不生成截单入口', async () => {
    const page = await 打开('14')
    const 原执行数量 = 仓库执行记录.value.length
    const 原出库编号 = 执行('14').出库单号
    expect(执行('14').状态).toBe('取消中')
    expect(page.get('.作业表格').text()).toContain('取消中')
    const row = page.get(`[data-column="操作"] [data-row="${单('14').fulfillmentOrders[0]!.fulfillmentOrderNo}"]`)
    await 按钮(row, '同步仓库状态').trigger('click')
    await 稳定()
    expect(执行('14')).toMatchObject({ 出库单号: 原出库编号, 状态: '已取消', 待核查: false })
    expect(单('14').processingStatus).toBe('待发货')
    expect(单('14').fulfillmentOrders[0]!.shippedQuantity).toBe(0)
    expect(仓库执行记录.value).toHaveLength(原执行数量)
    await 按钮(page, 单('14').fulfillmentOrders[0]!.fulfillmentOrderNo).trigger('click')
    const drawer = page.get('.履约摘要桩')
    expect(drawer.get('.关联执行卡').text()).toContain('已取消')
    expect(drawer.get('.关联执行卡').text()).toContain(原出库编号)
    无截单入口(page)
  })
})
