import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, inject, nextTick, provide, type Ref } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElMessage } from 'element-plus'
import ShippingPage from './订单标发页面.vue'
import ChannelPage from '../仓配管理/物流渠道管理页面.vue'
import { 共享标发单 } from './演示会话'
import type { 标发单 } from './标发逻辑'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from '../订单处理/演示会话'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 渠道会话 } from '../仓配管理/仓配会话'

const 页面路径 = '/oms/self-fulfillment/shipping-confirmation'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value, channels: 渠道会话.value })
let wrapper: VueWrapper | undefined
let router: Router

const 桩组件 = {
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElIcon: { template: '<span><slot /></span>' },
  ElTag: { template: '<span><slot /></span>' },
  ElDrawer: { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="标发详情桩" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' },
  ElDialog: { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="标发弹窗桩" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' },
  ElTooltip: { template: '<span><slot /></span>' },
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
    props: ['prop'],
    setup(props, { slots }) {
      const rows = inject<Ref<标发单[]>>('shipping-test-rows')!
      return () => h('div', rows.value.map(row => h('div', { class: '标发行桩', 'data-no': row.no }, slots.default?.({ row }) ?? String((row as unknown as Record<string, unknown>)[props.prop] ?? ''))))
    },
  }),
  FieldSearch: {
    props: ['modelValue', 'field', 'mode', 'fields'], emits: ['update:modelValue', 'update:field', 'update:mode', 'search'],
    template: '<div class="字段搜索桩"><select aria-label="测试搜索字段" :value="field" @change="$emit(\'update:field\', $event.target.value)"><option v-for="item in fields" :key="item.value" :value="item.value">{{ item.label }}</option></select><select aria-label="测试匹配方式" :value="mode" @change="$emit(\'update:mode\', $event.target.value)"><option value="contains">模糊</option><option value="exact">精确</option></select><input aria-label="测试搜索内容" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
  },
  MultiSelectFilter: {
    props: ['modelValue', 'placeholder'], emits: ['update:modelValue'],
    template: '<input :aria-label="placeholder === \'店铺\' ? \'测试店铺筛选\' : \'测试平台筛选\'" :value="modelValue.join(\',\')" @input="$emit(\'update:modelValue\', $event.target.value ? $event.target.value.split(\',\') : [])" />',
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
  渠道会话.value = data.channels
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
    order.fulfillmentOrders[0]!.trackingNumber = `TRACK-CF-TEST-${编号}`
    order.fulfillmentOrders[0]!.shippedAt = '2026-10-10 10:00:00 UTC+8'
    order.operationLogs = [{ operatedAt: '2026-10-10 10:00:00 UTC+8', operationType: '虚构测试初始化', operationResult: '成功', operator: '测试', content: '保留有效出库事实；查看详情不得提交或查询平台。' }]
    return order
  }
  const source = 创建订单('1', 'eBay'), other = 创建订单('10', 'Temu')
  const 创建单 = (no: string, order: 全渠道订单, status: 标发单['status']): 标发单 => ({
    no, orderNo: order.systemOrderNo, fulfillmentNo: order.fulfillmentOrders[0]!.fulfillmentOrderNo,
    outboundNo: `OUT-${order.fulfillmentOrders[0]!.fulfillmentOrderNo}`,
    status, tracking: `TRACK-${no}`, carrier: 'FedEx', shippedAt: '2026-10-10 10:00:00 UTC+8', quantity: 1,
    lineId: order.items[0]!.externalLineId, idempotencyKey: `KEY-${no}`, pendingVerification: status === '标发失败',
    reason: status === '标发失败' ? '平台是否受理待核查；禁止重提' : '',
    externalId: status === '标发成功' ? `RECEIPT-${no}` : undefined,
    attempts: [{ time: '2026-10-10 10:01:00 UTC+8', action: '历史尝试', result: status, evidence: `历史证据-${no}` }],
  })
  共享订单.value = [source, other]
  仓库执行记录.value = [source, other].map(order => ({ 履约单号: order.fulfillmentOrders[0]!.fulfillmentOrderNo, 订单号: [order.systemOrderNo], 出库单号: `OUT-${order.fulfillmentOrders[0]!.fulfillmentOrderNo}`, 状态: '已出库', 待核查: false, 原因: '', 更新时间: '2026-10-10 10:00:00 UTC+8', 出库事实: { planned: 1, shipped: 1, tracking: order.fulfillmentOrders[0]!.trackingNumber!, shippedAt: order.fulfillmentOrders[0]!.shippedAt! } }))
  共享标发单.value = [创建单('CF-TEST-1', source, '标发失败'), 创建单('CF-TEST-10', other, '标发成功'), 创建单('CF-TEST-11', source, '标发成功')]
}
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开(query: Record<string, string> = {}) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: 页面路径, component: ShippingPage }, { path: '/oms/orders/all/:systemOrderNo', component: { template: '<div />' } }, { path: '/oms/warehouse-delivery/logistics-channels', component: { template: '<div />' } }] })
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
afterEach(() => { wrapper?.unmount(); wrapper = undefined; 恢复数据(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })

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

function 初始化动作样例() {
  const 基础 = 共享标发单.value[0]!
  共享标发单.value = [
    { ...JSON.parse(JSON.stringify(基础)), no: 'CF-ACTION-READY', status: '待标发', pendingVerification: false, reason: '', attempts: [] },
    { ...JSON.parse(JSON.stringify(基础)), no: 'CF-ACTION-PENDING' },
    { ...JSON.parse(JSON.stringify(基础)), no: 'CF-ACTION-RETRY', status: '标发失败', pendingVerification: false, reason: '平台明确未接收；修复条件已完成' },
  ]
}
function 选择全部(page: VueWrapper) { page.findComponent(桩组件.ElTable).vm.$emit('selection-change', [...共享标发单.value]) }
function 弹窗(page: VueWrapper, title: string) { return page.get(`.标发弹窗桩[data-title="${title}"]`) }

describe('标发工作台动作保护与逐项结果', () => {
  it('单条不标发要求原因，取消不写入，确认仅结束所选单，详情保留人工记录', async () => {
    初始化动作样例(); const target = 共享标发单.value[0]!, sibling = JSON.stringify(共享标发单.value.slice(1))
    const page = await 打开({ shippingConfirmationNo: target.no }), before = 快照()
    await 按钮(page.get('.标发详情桩'), '不标发').trigger('click'); await 稳定()
    let confirm = 弹窗(page, '确认不标发')
    expect((按钮(confirm, '确认不标发').element as HTMLButtonElement).disabled).toBe(true)
    await confirm.get('textarea').setValue('  '); await 稳定()
    expect((按钮(confirm, '确认不标发').element as HTMLButtonElement).disabled).toBe(true)
    await 按钮(confirm, '返回检查').trigger('click'); await 稳定()
    expect(快照()).toBe(before)
    await 按钮(page.get('.标发详情桩'), '不标发').trigger('click'); await 稳定()
    confirm = 弹窗(page, '确认不标发')
    expect((confirm.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    await confirm.get('textarea').setValue('  已在店铺后台自行处理  '); await 稳定()
    const orders = JSON.stringify(共享订单.value)
    await 按钮(confirm, '确认不标发').trigger('click'); await 稳定()
    expect(target.status).toBe('无需标发'); expect(target.attempts).toHaveLength(0)
    expect(target.externalId).toBeUndefined()
    expect(target.nonMarkRecord?.reason).toBe('已在店铺后台自行处理')
    expect(JSON.stringify(共享标发单.value.slice(1))).toBe(sibling)
    expect(JSON.stringify(共享订单.value)).toBe(orders)
    expect(page.get('.标发详情桩').text()).toContain('不标发记录')
    expect(page.get('.标发详情桩').text()).toContain('店铺后台是否已完成标发尚未核验')
    expect(page.get('.标发详情桩').findAll('button').map(b => b.text())).not.toContain('不标发')
  })

  it('批量不标发逐项跳过待核查，操作成功不冒充平台标发成功且保留历史接口尝试', async () => {
    初始化动作样例(); const page = await 打开(), pending = JSON.stringify(共享标发单.value[1])
    const attempts = 共享标发单.value.map(item => JSON.stringify(item.attempts))
    选择全部(page); await 稳定(); await 按钮(page, '批量不标发').trigger('click'); await 稳定()
    const confirm = 弹窗(page, '确认不标发')
    expect(confirm.text()).toContain('共选 3 张，可执行 2 张，将跳过 1 张')
    expect(confirm.text()).toContain('先核查原请求')
    await confirm.get('textarea').setValue('自行在店铺后台完成，本次不再由 OMS 标发'); await 稳定()
    await 按钮(confirm, '确认不标发').trigger('click'); await 稳定()
    expect(共享标发单.value.map(item => item.status)).toEqual(['无需标发', '标发失败', '无需标发'])
    expect(共享标发单.value.map(item => JSON.stringify(item.attempts))).toEqual(attempts)
    expect(JSON.stringify(共享标发单.value[1])).toBe(pending)
    expect(弹窗(page, '标发处理结果').text()).toContain('成功 2')
    expect(弹窗(page, '标发处理结果').text()).toContain('跳过 1')
    expect(弹窗(page, '标发处理结果').text()).toContain('平台完成情况未核验')
  })

  it('不标发确认后载荷变化或开始执行时拦截，保留原请求且没有人工结论', async () => {
    初始化动作样例(); const page = await 打开(), target = 共享标发单.value[0]!
    选择全部(page); await 稳定(); await 按钮(page, '批量不标发').trigger('click'); await 稳定()
    const confirm = 弹窗(page, '确认不标发')
    await confirm.get('textarea').setValue('店铺后台自行处理'); await 稳定()
    target.tracking = 'NEW-TRACKING'
    共享标发单.value[2]!.status = '标发中'
    await 按钮(confirm, '确认不标发').trigger('click'); await 稳定()
    expect(target.status).toBe('待标发'); expect(target.nonMarkRecord).toBeUndefined()
    expect(共享标发单.value[2]!.status).toBe('标发中')
    expect(共享标发单.value[2]!.nonMarkRecord).toBeUndefined()
    expect(弹窗(page, '标发处理结果').text()).toContain('记录已变化')
  })

  it('混选提交先列出跳过原因，确认后仅待标发执行，待核查和失败原单不被盲目重提', async () => {
    初始化动作样例(); const page = await 打开(); const 订单前 = JSON.stringify(共享订单.value)
    选择全部(page); await 稳定(); await 按钮(page, '批量标发').trigger('click'); await 稳定()
    const confirm = 弹窗(page, '确认提交标发')
    expect(confirm.text()).toContain('共选 3 张，可执行 1 张，将跳过 2 张')
    expect(confirm.text()).toContain('平台结果待核查，确认前禁止重提')
    expect(共享标发单.value[0]!.attempts).toHaveLength(0)
    await 按钮(confirm, '确认提交标发').trigger('click')
    await vi.waitFor(() => expect(弹窗(page, '标发处理结果').text()).toContain('总数 3'))
    await vi.waitFor(() => expect(共享标发单.value[0]!.status).toBe('标发成功'))
    await 稳定()
    expect(共享标发单.value[1]!.pendingVerification).toBe(true)
    expect(共享标发单.value[1]!.attempts).toHaveLength(1)
    expect(共享标发单.value[2]!.attempts).toHaveLength(1)
    expect(弹窗(page, '标发处理结果').text()).toContain('跳过 2')
    expect(弹窗(page, '标发处理结果').text()).toContain('成功 1')
    expect(page.get('.勾选提示').text()).toContain('已选 0 张')
    expect(JSON.stringify(共享订单.value)).toBe(订单前)
  })

  it('确认后载荷被改变时跳过，既不提交旧载荷，也不把新值当作已批准', async () => {
    初始化动作样例(); const page = await 打开(); const 单 = 共享标发单.value[0]!
    选择全部(page); await 稳定(); await 按钮(page, '批量标发').trigger('click'); await 稳定()
    单.tracking = 'CHANGED-AFTER-CONFIRMATION'
    await 按钮(弹窗(page, '确认提交标发'), '确认提交标发').trigger('click'); await 稳定()
    expect(单.status).toBe('待标发'); expect(单.attempts).toHaveLength(0)
    expect(弹窗(page, '标发处理结果').text()).toContain('记录已变化，请重新检查后操作')
  })

  it('确认后来源订单不再满足已发货时重新阻断，保留标发单与出库事实', async () => {
    初始化动作样例(); const page = await 打开()
    const 单 = 共享标发单.value[0]!, 来源 = 共享订单.value.find(order => order.systemOrderNo === 单.orderNo)!
    选择全部(page); await 稳定(); await 按钮(page, '批量标发').trigger('click'); await 稳定()
    expect(弹窗(page, '确认提交标发').text()).toContain('可执行 1 张')
    来源.processingStatus = '待发货'
    const 出库前 = JSON.stringify(来源.fulfillmentOrders)
    await 稳定()
    expect(弹窗(page, '确认提交标发').text()).toContain('可执行 0 张')
    expect(弹窗(page, '确认提交标发').text()).toContain('OMS 订单尚未已发货')
    expect((按钮(弹窗(page, '确认提交标发'), '确认提交标发').element as HTMLButtonElement).disabled).toBe(true)
    expect(单.status).toBe('待标发'); expect(单.attempts).toHaveLength(0)
    expect(JSON.stringify(来源.fulfillmentOrders)).toBe(出库前)
  })

  it('待核查查询只认领原单，保留编号与幂等键且不新增提交尝试', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[1]!, key = 单.idempotencyKey
    const page = await 打开({ shippingConfirmationNo: 单.no }), 订单前 = JSON.stringify(共享订单.value)
    expect(page.get('.标发详情桩').findAll('button').map(b => b.text())).not.toContain('重新提交')
    await 按钮(page.get('.标发详情桩'), '查询结果').trigger('click'); await 稳定()
    await 按钮(弹窗(page, '确认查询结果'), '确认查询结果').trigger('click')
    await vi.waitFor(() => expect(单.status).toBe('标发成功'))
    expect(单.pendingVerification).toBe(false); expect(单.idempotencyKey).toBe(key)
    expect(共享标发单.value).toHaveLength(3)
    expect(单.attempts.filter(a => a.action.includes('提交'))).toHaveLength(0)
    expect(单.attempts[0]!.action).toBe('查询平台结果（模拟）')
    expect(JSON.stringify(共享订单.value)).toBe(订单前)
  })

  it('合格失败重新提交保留原单身份，双击确认只执行一次', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[2]!, key = 单.idempotencyKey, attempts = 单.attempts.length
    const page = await 打开({ shippingConfirmationNo: 单.no })
    await 按钮(page.get('.标发详情桩'), '重新提交').trigger('click'); await 稳定()
    const confirm = 按钮(弹窗(page, '确认重新提交'), '确认重新提交')
    await confirm.trigger('click'); await confirm.trigger('click')
    await vi.waitFor(() => expect(单.status).toBe('标发成功'))
    expect(单.idempotencyKey).toBe(key); expect(共享标发单.value).toHaveLength(3)
    expect(单.attempts).toHaveLength(attempts + 2)
    expect(单.attempts.filter(a => a.action === '重新提交')).toHaveLength(1)
  })

  it('待核查范围计数、页签和重置同步，成功页不提供批量写动作', async () => {
    const page = await 打开(), before = 快照()
    await page.get('.关注筛选').trigger('click'); await 稳定()
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(page.get('.状态栏').text()).toContain('全部 1')
    await 按钮(page.get('.搜索栏'), '重置').trigger('click'); await 稳定()
    await page.get('.状态栏').findAll('button').find(b => b.text().startsWith('标发成功'))!.trigger('click'); await 稳定()
    expect(page.get('.操作栏').findAll('button').map(b => b.text())).not.toContain('批量重新提交')
    expect(page.get('.操作栏').findAll('button').map(b => b.text())).not.toContain('批量标发')
    expect(快照()).toBe(before)
  })
})


describe('物流渠道、出库与时效联动', () => {
  it('首次提交取共享渠道当前平台设置，查看不改写，提交时固定载荷', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[0]!
    const mapping = 渠道会话.value.find(row => row.id === 'DEMO-CF-CHANNEL-GC')!.shipmentMappings[0]!
    mapping.carrierCode = 'DEMO-CURRENT-CARRIER'
    const before = JSON.stringify(单), page = await 打开({ shippingConfirmationNo: 单.no })
    expect(page.get('.标发详情桩').text()).toContain('DEMO-CURRENT-CARRIER')
    expect(JSON.stringify(单)).toBe(before)
    await 按钮(page.get('.标发详情桩'), '提交标发').trigger('click'); await 稳定()
    expect(弹窗(page, '确认提交标发').text()).toContain('DEMO-CURRENT-CARRIER')
    await 按钮(弹窗(page, '确认提交标发'), '确认提交标发').trigger('click')
    await vi.waitFor(() => expect(单.status).toBe('标发成功'))
    expect(单.carrier).toBe('DEMO-CURRENT-CARRIER')
    expect(单.tracking).toBe(共享订单.value[0]!.fulfillmentOrders[0]!.trackingNumber)
    mapping.carrierCode = 'DEMO-LATER-SETTING'; await 稳定()
    expect(单.carrier).toBe('DEMO-CURRENT-CARRIER')
    expect(page.get('.标发详情桩').text()).toContain('DEMO-LATER-SETTING')
    expect(page.get('.标发详情桩').text()).toContain('原提交快照')
  })
  it('确认后映射变化不能把新的承运商当成已批准载荷', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[0]!, page = await 打开({ shippingConfirmationNo: 单.no })
    await 按钮(page.get('.标发详情桩'), '提交标发').trigger('click'); await 稳定()
    渠道会话.value.find(row => row.id === 'DEMO-CF-CHANNEL-GC')!.shipmentMappings[0]!.carrierCode = 'CHANGED-AFTER-CONFIRM'
    await 按钮(弹窗(page, '确认提交标发'), '确认提交标发').trigger('click'); await 稳定()
    expect(单.status).toBe('待标发'); expect(单.attempts).toHaveLength(0)
    expect(弹窗(page, '标发处理结果').text()).toContain('记录已变化')
  })
  it('本平台承运商缺失阻断首次提交，不阻断人工不标发', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[0]!
    渠道会话.value.find(row => row.id === 'DEMO-CF-CHANNEL-GC')!.shipmentMappings[0]!.carrierCode = ''
    const page = await 打开({ shippingConfirmationNo: 单.no }), detail = page.get('.标发详情桩')
    expect((按钮(detail, '提交标发').element as HTMLButtonElement).disabled).toBe(true)
    expect(detail.text()).toContain('本平台承运商未配置')
    expect((按钮(detail, '不标发').element as HTMLButtonElement).disabled).toBe(false)
  })
  it('关联仓单出库状态和数量可见，确认后的出库事实变化被复验', async () => {
    恢复数据(); const 单 = 共享标发单.value[0]!, execution = 仓库执行记录.value.find(row => row.出库单号 === 单.outboundNo)!
    const page = await 打开({ shippingConfirmationNo: 单.no })
    expect(page.get('.标发详情桩').text()).toContain('出库单计划数量')
    expect(page.get('.标发详情桩').text()).toContain(execution.出库单号)
    expect(page.get('.标发详情桩').text()).toContain('仓库回传跟踪号')
    await 按钮(page.get('.标发详情桩'), '提交标发').trigger('click'); await 稳定()
    execution.出库事实!.planned = 2
    await 按钮(弹窗(page, '确认提交标发'), '确认提交标发').trigger('click'); await 稳定()
    expect(单.status).toBe('待标发'); expect(单.attempts).toHaveLength(0)
    expect(弹窗(page, '标发处理结果').text()).toContain('记录已变化')
  })
  it('仓库已经出库的待标发单每秒倒计时，终态停止且卸载清理', async () => {
    初始化动作样例(); 共享标发单.value = [共享标发单.value[0]!]
    let now = Date.parse('2026-10-10T11:59:58Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    共享订单.value[0]!.shipByAt = '2026-10-10T12:00:00Z'
    const page = await 打开()
    expect(page.get('.倒计时').text()).toBe('00:00:02')
    now += 1000; vi.advanceTimersByTime(1000); await nextTick()
    expect(page.get('.倒计时').text()).toBe('00:00:01')
    now += 1000; vi.advanceTimersByTime(1000); await nextTick()
    expect(page.get('.倒计时').text()).toBe('已超时')
    共享标发单.value[0]!.status = '标发成功'; await nextTick()
    expect(page.get('.倒计时').text()).toBe('标发已完成')
    expect(vi.getTimerCount()).toBe(0)
    共享标发单.value[0]!.status = '待标发'; await nextTick()
    expect(vi.getTimerCount()).toBe(1)
    page.unmount(); wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
})


async function 打开渠道(id: string) {
  const path = '/oms/warehouse-delivery/logistics-channels'
  router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: ChannelPage }] })
  await router.push({ path, query: { channelId: id } }); await router.isReady()
  const 内容桩 = { template: '<div><slot /></div>' }
  wrapper = mount(ChannelPage, { global: { plugins: [router], directives: { prototype: {} }, stubs: {
    ...桩组件, ElConfigProvider: 内容桩, ElForm: 内容桩, ElFormItem: 内容桩, ElSelect: 内容桩, ElOption: true,
    ElTabs: 内容桩, ElTabPane: true, ElTree: true, ElInputNumber: true, ElSwitch: true, ElRadioGroup: 内容桩, ElRadio: true,
    MultiFilter: true, DateRange: true,
  } } })
  await 稳定(); return wrapper
}

describe('准确进入共享物流渠道标发设置', () => {
  it('订单标发渠道链接携带明确 ID，不使用同名渠道或当前平台推断身份', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[0]!, page = await 打开({ shippingConfirmationNo: 单.no })
    await 按钮(page.get('.标发详情桩'), 'FedEx Home Delivery').trigger('click'); await 稳定()
    expect(router.currentRoute.value.path).toBe('/oms/warehouse-delivery/logistics-channels')
    expect(router.currentRoute.value.query).toEqual({ channelId: 'DEMO-CF-CHANNEL-GC' })
  })
  it('渠道深链打开指定资料，编辑保存后订单标发首次准备读取同一会话配置', async () => {
    初始化动作样例(); const 单 = 共享标发单.value[0]!
    const page = await 打开渠道('DEMO-CF-CHANNEL-GC')
    let detail = 弹窗(page, '物流渠道详情')
    expect(detail.text()).toContain('FedEx'); expect(detail.text()).toContain('标发设置')
    await 按钮(detail, '编辑配置').trigger('click'); await 稳定()
    detail = 弹窗(page, '编辑物流渠道')
    await detail.get('[aria-label="eBay承运商代码"]').setValue('DEMO-SAVED-CARRIER')
    await 按钮(detail, '保存').trigger('click'); await 稳定()
    expect(渠道会话.value.find(row => row.id === 'DEMO-CF-CHANNEL-GC')!.shipmentMappings[0]!.carrierCode).toBe('DEMO-SAVED-CARRIER')
    page.unmount(); wrapper = undefined
    const shipping = await 打开({ shippingConfirmationNo: 单.no })
    expect(shipping.get('.标发详情桩').text()).toContain('DEMO-SAVED-CARRIER')
    expect(单.attempts).toHaveLength(0)
  })
  it('渠道深链缺失时不展示旧资料，也不回退第一条渠道', async () => {
    const page = await 打开渠道('DEMO-CF-CHANNEL-GC')
    expect(page.find('.标发弹窗桩[data-title="物流渠道详情"]').exists()).toBe(true)
    await router.push({ path: '/oms/warehouse-delivery/logistics-channels', query: { channelId: 'MISSING-ID' } }); await 稳定()
    expect(page.find('.标发弹窗桩[data-title="物流渠道详情"]').exists()).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('未找到唯一关联的物流渠道，请核查渠道身份')
  })
})


describe('标发字段查询展示一致', () => {
  it('实际发货日期筛选取列表关联出库事实，跟踪号搜索取当前准备值', async () => {
    const execution = 仓库执行记录.value.find(row => row.订单号.includes('OMS-TEST-1'))!
    execution.出库事实!.shippedAt = '2026-10-09 10:00:00 UTC+8'
    const page = await 打开()
    await page.get('[aria-label="测试时间筛选"]').setValue('2026-10-09 00:00:00|2026-10-09 23:59:59')
    await 按钮(page.get('.搜索栏'), '查询').trigger('click'); await 稳定()
    expect(表内单号(page)).toEqual(['CF-TEST-1', 'CF-TEST-11'])
    expect(共享标发单.value[0]!.shippedAt).toBe('2026-10-10 10:00:00 UTC+8')
    await 按钮(page.get('.搜索栏'), '重置').trigger('click'); await 稳定()
    共享标发单.value[0]!.status = '待标发'; 共享标发单.value[0]!.pendingVerification = false; 共享标发单.value[0]!.attempts = []
    共享订单.value[0]!.fulfillmentOrders[0]!.trackingNumber = 'NEW-WAREHOUSE-TRACK'
    await page.get('[aria-label="测试搜索字段"]').setValue('tracking')
    await page.get('[aria-label="测试搜索内容"]').setValue('NEW-WAREHOUSE-TRACK')
    await 按钮(page.get('.搜索栏'), '查询').trigger('click'); await 稳定()
    expect(表内单号(page)).toEqual(['CF-TEST-1'])
    expect(共享标发单.value[0]!.tracking).toBe('TRACK-CF-TEST-1')
  })
})
