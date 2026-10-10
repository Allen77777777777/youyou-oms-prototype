import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, inject, nextTick, provide, type Ref } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElMessage } from 'element-plus'
import ShippingPage from './订单标发页面.vue'
import { 共享标发单 } from './演示会话'
import type { 标发单 } from './标发逻辑'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from '../订单处理/演示会话'
import type { 全渠道订单 } from '../全渠道订单/类型'

const 页面路径 = '/oms/self-fulfillment/shipping-confirmation'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
let wrapper: VueWrapper | undefined
let router: Router

const 桩组件 = {
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElIcon: { template: '<span><slot /></span>' },
  ElTag: { template: '<span><slot /></span>' },
  ElDrawer: { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="标发详情桩" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' },
  ElDescriptions: { template: '<dl><slot /></dl>' },
  ElDescriptionsItem: { props: ['label'], template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>' },
  ElAlert: { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' },
  ElEmpty: { props: ['description'], template: '<div>{{ description }}<slot /></div>' },
  ElTimeline: { template: '<ol><slot /></ol>' },
  ElTimelineItem: { props: ['timestamp'], template: '<li>{{ timestamp }}<slot /></li>' },
  ElPagination: { props: ['total'], template: '<span :data-total="total" />' },
  ElTable: defineComponent({
    props: ['data'],
    setup(props, { slots, expose }) {
      provide('shipping-test-rows', computed(() => props.data as 标发单[]))
      expose({ clearSelection: vi.fn() })
      return () => h('div', { class: '标发表桩' }, [slots.default?.(), ...(props.data.length ? [] : [slots.empty?.()])])
    },
  }),
  ElTableColumn: defineComponent({
    setup(_props, { slots }) {
      const rows = inject<Ref<标发单[]>>('shipping-test-rows')!
      return () => h('div', rows.value.map(row => h('div', { class: '标发行桩', 'data-no': row.no }, slots.default?.({ row }))))
    },
  }),
  FieldSearch: {
    props: ['modelValue', 'field', 'mode', 'fields'], emits: ['update:modelValue', 'update:field', 'update:mode', 'search'],
    template: '<div class="字段搜索桩"><select aria-label="测试搜索字段" :value="field" @change="$emit(\'update:field\', $event.target.value)"><option v-for="item in fields" :key="item.value" :value="item.value">{{ item.label }}</option></select><select aria-label="测试匹配方式" :value="mode" @change="$emit(\'update:mode\', $event.target.value)"><option value="contains">模糊</option><option value="exact">精确</option></select><input aria-label="测试搜索内容" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
  },
  MultiSelectFilter: {
    props: ['modelValue'], emits: ['update:modelValue'],
    template: '<input aria-label="测试平台筛选" :value="modelValue.join(\',\')" @input="$emit(\'update:modelValue\', $event.target.value ? $event.target.value.split(\',\') : [])" />',
  },
  TimeRange: {
    props: ['modelValue'], emits: ['update:modelValue'],
    template: '<input aria-label="测试时间筛选" :value="(modelValue || []).join(\'|\')" @input="$emit(\'update:modelValue\', $event.target.value ? $event.target.value.split(\'|\') : null)" />',
  },
  ListSort: { template: '<span />' },
}

function 恢复数据() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions; 共享标发单.value = data.confirmations
}
function 快照() {
  return JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
}
function 创建测试数据() {
  const 基础 = JSON.parse(初始).orders.find((order: 全渠道订单) => order.systemOrderNo === 'OMS-DEMO-CF-01') as 全渠道订单
  const 创建订单 = (编号: string, 平台: 全渠道订单['platformCode']): 全渠道订单 => {
    const order = structuredClone(基础)
    order.systemOrderNo = `OMS-TEST-${编号}`; order.platformCode = 平台; order.storeName = `${平台}虚构测试店`
    order.platformOrderNo = `PLATFORM-TEST-${编号}`; order.items[0]!.externalLineId = `LINE-TEST-${编号}`
    order.fulfillmentOrders[0]!.fulfillmentOrderNo = `FL-TEST-${编号}`
    order.operationLogs = [{ operatedAt: '2026-10-10 10:00:00 UTC+8', operationType: '虚构测试初始化', operationResult: '成功', operator: '测试', content: '保留有效出库事实；查看详情不得提交或查询平台。' }]
    return order
  }
  const source = 创建订单('1', 'eBay'), other = 创建订单('10', 'Temu')
  const 创建单 = (no: string, order: 全渠道订单, status: 标发单['status']): 标发单 => ({
    no, orderNo: order.systemOrderNo, fulfillmentNo: order.fulfillmentOrders[0]!.fulfillmentOrderNo,
    status, tracking: `TRACK-${no}`, carrier: 'USPS', shippedAt: '2026-10-10 10:00:00 UTC+8', quantity: 1,
    lineId: order.items[0]!.externalLineId, idempotencyKey: `KEY-${no}`, pendingVerification: status === '标发失败',
    reason: status === '标发失败' ? '平台是否受理待核查；禁止重提' : '',
    externalId: status === '标发成功' ? `RECEIPT-${no}` : undefined,
    attempts: [{ time: '2026-10-10 10:01:00 UTC+8', action: '历史尝试', result: status, evidence: `历史证据-${no}` }],
  })
  共享订单.value = [source, other]
  共享标发单.value = [创建单('CF-TEST-1', source, '标发失败'), 创建单('CF-TEST-10', other, '标发成功'), 创建单('CF-TEST-11', source, '标发成功')]
}
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开(query: Record<string, string> = {}) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: 页面路径, component: ShippingPage }, { path: '/oms/orders/all/:systemOrderNo', component: { template: '<div />' } }] })
  await router.push({ path: 页面路径, query }); await router.isReady()
  wrapper = mount(ShippingPage, { global: { plugins: [router], directives: { prototype: {} }, stubs: 桩组件 } })
  await 稳定()
  return wrapper
}
function 按钮(root: { findAll(selector: string): DOMWrapper<Element>[] }, name: string) {
  const button = root.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`未找到按钮：${name}`)
  return button
}
function 表内单号(page: VueWrapper) { return page.get('.标发表桩').findAll('.单号').map(item => item.text()) }
function 搜索值(page: VueWrapper, label: string) { return (page.get(`[aria-label="${label}"]`).element as HTMLInputElement | HTMLSelectElement).value }
async function 定向(no: string) { await router.push({ path: 页面路径, query: { shippingConfirmationNo: no } }); await 稳定() }

beforeEach(() => {
  恢复数据(); 创建测试数据()
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; 恢复数据(); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('订单标发定向详情与只读保护', () => {
  it('初始标发单号深链精确匹配并自动查看已有详情，来源限定一致时仍按标发单号筛选', async () => {
    const page = await 打开({ shippingConfirmationNo: 'CF-TEST-1', fulfillmentOrderNo: 'FL-TEST-1', systemOrderNo: 'OMS-TEST-1' })
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(搜索值(page, '测试搜索字段')).toBe('no')
    expect(搜索值(page, '测试匹配方式')).toBe('exact')
    expect(搜索值(page, '测试搜索内容')).toBe('CF-TEST-1')
    const detail = page.get('.标发详情桩')
    expect(detail.attributes('data-title')).toBe('CF-TEST-1')
    expect(detail.text()).toContain('OMS-TEST-1'); expect(detail.text()).toContain('KEY-CF-TEST-1')
    expect(detail.text()).toContain('平台结果待核查'); expect(detail.text()).toContain('历史证据-CF-TEST-1')
    expect(detail.text()).not.toContain('KEY-CF-TEST-10')
  })

  it('不存在的标发编号给出未找到提示，保持空结果且不生成标发单或改写任何订单事实', async () => {
    const before = 快照()
    const page = await 打开({ shippingConfirmationNo: 'CF-TEST-404' })
    expect(表内单号(page)).toEqual([])
    expect(page.find('.标发详情桩').exists()).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('未找到'))
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('CF-TEST-404'))
    expect(快照()).toBe(before)
  })

  it('定向查看及关闭待核查详情均不执行标发或查询，不改变数量、状态和历史日志', async () => {
    const before = 快照()
    const page = await 打开({ shippingConfirmationNo: 'CF-TEST-1' })
    expect(page.get('.标发详情桩').text()).toContain('历史尝试')
    expect(快照()).toBe(before)
    await 按钮(page.get('.标发详情桩'), '关闭').trigger('click'); await 稳定()
    expect(page.find('.标发详情桩').exists()).toBe(false)
    await page.get('.标发表桩 .单号').trigger('click'); await 稳定()
    expect(page.get('.标发详情桩').attributes('data-title')).toBe('CF-TEST-1')
    expect(快照()).toBe(before)
  })

  it('同页标发编号切换准确打开各自详情，不沿用前一张来源或接口记录', async () => {
    const before = 快照()
    const page = await 打开({ shippingConfirmationNo: 'CF-TEST-1' })
    await 定向('CF-TEST-10')
    expect(表内单号(page)).toEqual(['CF-TEST-10'])
    expect(page.get('.标发详情桩').attributes('data-title')).toBe('CF-TEST-10')
    expect(page.get('.标发详情桩').text()).toContain('OMS-TEST-10')
    expect(page.get('.标发详情桩').text()).toContain('RECEIPT-CF-TEST-10')
    expect(page.get('.标发详情桩').findAll('dd').map(item => item.text())).not.toContain('KEY-CF-TEST-1')
    await 定向('CF-TEST-1')
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(page.get('.标发详情桩').attributes('data-title')).toBe('CF-TEST-1')
    expect(page.get('.标发详情桩').text()).not.toContain('RECEIPT-CF-TEST-10')
    expect(快照()).toBe(before)
  })

  it('已有状态和平台时间条件不会阻挡新的编号深链，定向时清除已应用条件', async () => {
    const page = await 打开()
    const successTab = page.get('.状态栏').findAll('button').find(item => item.text().startsWith('标发成功'))!
    await successTab.trigger('click')
    await page.get('[aria-label="测试平台筛选"]').setValue('Temu')
    await page.get('[aria-label="测试时间筛选"]').setValue('2027-01-01 00:00:00|2027-01-02 23:59:59')
    await 按钮(page.get('.搜索栏'), '查询').trigger('click'); await 稳定()
    expect(表内单号(page)).toEqual([])
    await 定向('CF-TEST-1')
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(page.get('.状态栏 .active').text()).toMatch(/^全部/)
    expect(搜索值(page, '测试平台筛选')).toBe('')
    expect(搜索值(page, '测试时间筛选')).toBe('')
    expect(page.get('.标发详情桩').attributes('data-title')).toBe('CF-TEST-1')
  })

  it('同页切到不存在编号时关闭旧详情，随后有效编号仍能打开原单且不造记录', async () => {
    const before = 快照()
    const page = await 打开({ shippingConfirmationNo: 'CF-TEST-1' })
    await 定向('CF-TEST-404')
    expect(page.find('.标发详情桩').exists()).toBe(false)
    expect(表内单号(page)).toEqual([])
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('CF-TEST-404'))
    await 定向('CF-TEST-11')
    expect(page.get('.标发详情桩').attributes('data-title')).toBe('CF-TEST-11')
    expect(表内单号(page)).toEqual(['CF-TEST-11'])
    expect(快照()).toBe(before)
  })

  const 不一致场景: Array<{ title: string; query: Record<string, string> }> = [
    { title: '来源订单', query: { shippingConfirmationNo: 'CF-TEST-1', systemOrderNo: 'OMS-TEST-10' } },
    { title: '履约单', query: { shippingConfirmationNo: 'CF-TEST-1', fulfillmentOrderNo: 'FL-TEST-10' } },
  ]
  it.each(不一致场景)('编号附带的 $title 不一致时阻止自动打开，保留目标编号筛选且不改写关联', async ({ query }) => {
    const before = 快照()
    const page = await 打开(query)
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(page.find('.标发详情桩').exists()).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('不一致'))
    expect(快照()).toBe(before)
  })

  const 旧查询场景: Array<{ title: string; query: Record<string, string>; field: string; keyword: string }> = [
    { title: '履约单号', query: { fulfillmentOrderNo: 'FL-TEST-1', systemOrderNo: 'OMS-TEST-10' }, field: 'fulfillmentNo', keyword: 'FL-TEST-1' },
    { title: '系统订单号', query: { systemOrderNo: 'OMS-TEST-1' }, field: 'orderNo', keyword: 'OMS-TEST-1' },
  ]
  it.each(旧查询场景)('原有 $title 查询保持精确筛选多张关联标发单，不擅自选择第一张详情', async ({ query, field, keyword }) => {
    const before = 快照()
    const page = await 打开(query)
    expect(表内单号(page)).toEqual(['CF-TEST-1', 'CF-TEST-11'])
    expect(搜索值(page, '测试搜索字段')).toBe(field)
    expect(搜索值(page, '测试匹配方式')).toBe('exact')
    expect(搜索值(page, '测试搜索内容')).toBe(keyword)
    expect(page.find('.标发详情桩').exists()).toBe(false)
    expect(快照()).toBe(before)
  })
})
