import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import OrderDetail from './全渠道订单详情页.vue'
import { 全渠道订单模拟数据 } from './模拟数据'
import type { 全渠道订单, 订单路由 } from './类型'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 共享标发单 } from '../订单标发/演示会话'
import type { 标发单 } from '../订单标发/标发逻辑'

const 初始会话 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, confirmations: 共享标发单.value })
const 原滚动 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
const 页面实例: VueWrapper[] = []
const 滚动 = vi.fn()

function 路由(后缀: string): 订单路由 {
  return { warehouse: `虚构仓库-${后缀}`, warehouseProvider: `虚构服务商-${后缀}`, warehouseAccount: `DEMO-ACCOUNT-${后缀}`, shippingChannel: `虚构渠道-${后缀}`, shippingChannelCode: `DEMO-CHANNEL-${后缀}`, labelMode: '仓配一体' }
}

function 测试订单(): 全渠道订单 {
  return {
    ...structuredClone(全渠道订单模拟数据[0]!),
    systemOrderNo: 'OMS-DETAIL-TEST-A', platformOrderNo: 'PLATFORM-DETAIL-TEST-A', platformOrderId: 'PLATFORM-ID-TEST-A',
    storeId: 'DEMO-DETAIL-STORE', storeName: '虚构详情评审店', processingStatus: '已发货', platformOrderStatus: 'FULFILLED',
    defaultRoute: 路由('默认'),
    address: { fullName: 'DEMO***', companyName: '虚构收件公司', countryCode: 'US', stateProvince: 'DEMO-STATE', city: 'DEMO-CITY', district: '虚构县区', addressLine1: '虚构地址第一行', addressLine2: '虚构地址第二行', postalCode: 'DEMO***', mobilePhone: '+1 *** MOBILE-DEMO', telephone: '+1 *** TELEPHONE-DEMO', email: 'demo***@example.invalid', buyerMessage: '第一行虚构留言\n第二行虚构留言' },
    amount: { orderAmount: { value: '19.50', currency: 'USD' }, buyerPaidShipping: { value: '0', currency: 'USD' }, buyerPaidTax: { value: '1.20', currency: 'EUR' }, transactionFee: undefined, platformSubsidy: undefined, otherFee: undefined },
    items: [
      { externalLineId: 'DEMO-LINE-A', platformItemId: 'DEMO-PRODUCT-A', platformSku: 'DEMO-PLATFORM-SKU-A', platformVariant: '虚构规格-A', platformItemTitle: '虚构平台商品 A', systemSku: 'DEMO-SYSTEM-SKU-A', systemItemName: '虚构系统商品 A', skuResolutionStatus: '成功', orderedQuantity: 2, fulfillableQuantity: 0, currencyCode: 'USD', unitPrice: { value: '9.75', currency: 'USD' }, itemTotal: { value: '19.50', currency: 'USD' }, actualReceived: { value: '0', currency: 'EUR' }, actualReceivedSource: 'PLATFORM' },
      { externalLineId: 'DEMO-LINE-B', platformItemId: 'DEMO-PRODUCT-B', platformSku: 'DEMO-PLATFORM-SKU-B', platformItemTitle: '虚构平台商品 B', systemItemName: '虚构系统商品 B', skuResolutionStatus: '缺失', orderedQuantity: 1, fulfillableQuantity: undefined, currencyCode: 'JPY', unitPrice: { value: '3800', currency: 'JPY' }, itemTotal: { value: '3800', currency: 'JPY' } },
    ],
    orderedAt: '2026-10-09T23:20:31-07:00', paidAt: undefined, createdAt: '2026-10-10T08:01:02+08:00',
    shipByAt: '2026-10-11T06:00:00Z', platformUpdatedAt: '2026-10-10 09:30:00', lastSyncedAt: '2026-10-10T01:00:00Z',
    fulfillmentCompletedAt: '2026-10-10T02:10:11Z', cancelledAt: undefined, cancelledReason: undefined,
    blockReason: undefined, admissionReason: undefined, noShipmentReason: undefined,
    fulfillmentOrders: [], reviews: [], operationLogs: [], professionalOrder: undefined,
    sync: { status: '已同步', latestAttempt: '2026-10-10T01:20:30Z', lastSuccess: '2026-10-10T01:10:20Z', normalizationStatus: '已标准化', message: '' },
  }
}

async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开(order: 全渠道订单) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/orders/all/:systemOrderNo', component: { template: '<div />' } }, { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div />' } }, { path: '/oms/self-fulfillment/shipping-confirmation', component: { template: '<div />' } }] })
  await router.push(`/oms/orders/all/${order.systemOrderNo}`); await router.isReady()
  const page = mount(OrderDetail, { attachTo: document.body, props: { order }, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElTooltip: { template: '<span><slot /></span>' }, OrderFlags: true, OrderNotes: { template: '<h2>订单备注</h2>' }, OrderProductImage: { props: ['src'], template: '<span :data-image="src || \'missing\'" />' }, WarehouseInventoryDetails: true } } })
  页面实例.push(page); await 稳定(); return page
}
function 分区(page: VueWrapper, id: string) { return page.get(`[data-section="${id}"]`) }
function 字段值(root: { findAll(selector: string): DOMWrapper<Element>[] }, label: string) {
  const field = root.findAll('dt').find(item => item.text() === label)
  if (!field?.element.parentElement) throw new Error(`未找到详情字段：${label}`)
  return new DOMWrapper(field.element.parentElement).get('dd').text()
}
function 表行(page: VueWrapper, selector: string) { return page.get(selector).findAll('tbody tr.el-table__row') }
function 指定行(page: VueWrapper, selector: string, no: string) {
  const row = 表行(page, selector).find(item => item.text().includes(no))
  if (!row) throw new Error(`未找到详情明细：${no}`)
  return row
}

beforeEach(() => {
  共享订单.value = []; 仓库执行记录.value = []; 共享标发单.value = []
  滚动.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: 滚动 })
})
afterEach(() => {
  页面实例.splice(0).forEach(page => page.unmount())
  const 初始 = JSON.parse(初始会话)
  共享订单.value = 初始.orders; 仓库执行记录.value = 初始.executions; 共享标发单.value = 初始.confirmations
  document.body.innerHTML = ''
  if (原滚动) Object.defineProperty(HTMLElement.prototype, 'scrollTo', 原滚动)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  vi.restoreAllMocks()
})

describe('订单完整详情的业务事实展示', () => {
  it('拆分商品并入各履约行，只展示本次分配的SKU及数量且取消独立发货安排区', async () => {
    const order = 测试订单()
    order.items[1]!.systemSku = 'DEMO-SYSTEM-SKU-B'
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-PRODUCTS-SPLIT-A', isActive: true, status: '已发货', route: 路由('商品一'), plannedQuantity: 1, shippedQuantity: 1, items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 1 }] },
      { fulfillmentOrderNo: 'FL-PRODUCTS-SPLIT-B', isActive: true, status: '已发货', route: 路由('商品二'), plannedQuantity: 1, shippedQuantity: 1, items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-B', quantity: 1 }] },
    ]
    order.manualShippingPlan = { id: 'PLAN-PRODUCTS-SPLIT', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: order.fulfillmentOrders.map((fulfillment, index) => ({ key: `PACKAGE-${index}`, route: fulfillment.route, items: fulfillment.items! })), reason: '', updatedAt: '2026-10-28T08:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(page.find('.当前路由表').exists()).toBe(false)
    expect(page.find('.原保存路由').exists()).toBe(false)
    expect(表行(page, '.履约表')).toHaveLength(2)
    expect(分区(page, 'fulfillment').findAll('h3').some(item => item.text() === '发货安排')).toBe(false)
    const 第一包 = 指定行(page, '.履约表', 'FL-PRODUCTS-SPLIT-A').get('.履约商品列表')
    const 第二包 = 指定行(page, '.履约表', 'FL-PRODUCTS-SPLIT-B').get('.履约商品列表')
    expect(第一包.findAll('.履约商品项')).toHaveLength(1)
    expect(第二包.findAll('.履约商品项')).toHaveLength(1)
    for (const value of ['虚构系统商品 A', 'DEMO-SYSTEM-SKU-A', 'DEMO-PLATFORM-SKU-A', 'DEMO-LINE-A']) expect(第一包.text()).toContain(value)
    expect(第一包.text()).not.toContain('DEMO-SYSTEM-SKU-B')
    expect(第一包.text().replace(/\s/g, '')).toContain('计划数量1')
    for (const value of ['虚构系统商品 B', 'DEMO-SYSTEM-SKU-B', 'DEMO-PLATFORM-SKU-B', 'DEMO-LINE-B']) expect(第二包.text()).toContain(value)
    expect(第二包.text()).not.toContain('DEMO-SYSTEM-SKU-A')
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('合并履约中同SKU不同来源仍逐行显示，不把整包数量当作本来源分配', async () => {
    const order = 测试订单()
    order.items = [order.items[0]!]
    const other = { ...structuredClone(order), systemOrderNo: 'OMS-DETAIL-MERGED-B', items: [{ ...structuredClone(order.items[0]!), externalLineId: 'DEMO-MERGED-LINE-B', orderedQuantity: 3 }] }
    const fulfillment = { fulfillmentOrderNo: 'FL-PRODUCTS-MERGED', isActive: true, status: '已发货' as const, route: 路由('共享'), plannedQuantity: 5, shippedQuantity: 5, items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 2 }, { orderNo: other.systemOrderNo, externalLineId: 'DEMO-MERGED-LINE-B', quantity: 3 }] }
    order.fulfillmentOrders = [fulfillment]
    other.fulfillmentOrders = [structuredClone(fulfillment)]
    共享订单.value = [order, other]
    const 原事实 = JSON.stringify([order, other])
    const page = await 打开(order)
    const row = 指定行(page, '.履约表', fulfillment.fulfillmentOrderNo)
    const 商品 = row.findAll('.履约商品项')
    expect(商品).toHaveLength(2)
    expect(商品.every(item => item.text().includes('DEMO-SYSTEM-SKU-A'))).toBe(true)
    expect(商品[0]!.text()).toContain(order.systemOrderNo)
    expect(商品[0]!.text()).toContain('DEMO-LINE-A')
    expect(商品[0]!.text().replace(/\s/g, '')).toContain('计划数量2')
    expect(商品[1]!.text()).toContain(other.systemOrderNo)
    expect(商品[1]!.text()).toContain('DEMO-MERGED-LINE-B')
    expect(商品[1]!.text().replace(/\s/g, '')).toContain('计划数量3')
    expect(row.text()).toContain('共享履约')
    expect(字段值(row, '计划')).toBe('5')
    expect(字段值(row, '有效出库')).toBe('5')
    expect(JSON.stringify([order, other])).toBe(原事实)
  })

  it('历史或当前履约缺少本次分配时保留待核实，不借整单商品或最新安排补齐', async () => {
    const order = 测试订单()
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-PRODUCTS-MISSING', isActive: true, status: '待执行', route: 路由('缺分配'), plannedQuantity: 2, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-PRODUCTS-OLD-EMPTY', isActive: false, status: '已终止', route: 路由('历史空分配'), plannedQuantity: 1, shippedQuantity: 0, items: [] },
    ]
    order.manualShippingPlan = { id: 'PLAN-NEWEST-PRODUCTS', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [{ key: 'PACKAGE-NEWEST', route: 路由('最新安排'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 2 }] }], reason: '', updatedAt: '2026-10-28T08:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    for (const no of ['FL-PRODUCTS-MISSING', 'FL-PRODUCTS-OLD-EMPTY']) {
      const row = 指定行(page, '.履约表', no)
      expect(row.text()).toContain('本次商品明细待核实')
      expect(row.findAll('.履约商品项')).toHaveLength(0)
      expect(row.text()).not.toContain('DEMO-SYSTEM-SKU-A')
      expect(row.text()).not.toContain('虚构系统商品 B')
    }
    expect(指定行(page, '.履约表', 'FL-PRODUCTS-OLD-EMPTY').text()).toContain('历史版本')
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('概览只按当前有效履约状态统计进度，历史完成及仅有跟踪号不算已发货', async () => {
    const order = 测试订单()
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-PROGRESS-DONE', isActive: true, status: '已发货', route: 路由('已完成'), plannedQuantity: 1, shippedQuantity: 1 },
      { fulfillmentOrderNo: 'FL-PROGRESS-TRACKING-ONLY', isActive: true, status: '执行中', route: 路由('仅取号'), plannedQuantity: 1, shippedQuantity: 0, trackingNumber: 'DEMO-TRACK-NOT-SHIPPED' },
      { fulfillmentOrderNo: 'FL-PROGRESS-HISTORY', isActive: false, status: '已发货', route: 路由('历史完成'), plannedQuantity: 1, shippedQuantity: 1 },
    ]
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    const 概览 = page.get('.履约概览').text()
    expect(概览).toContain('自配送')
    expect(概览).toMatch(/2\s*张/)
    expect(概览).toMatch(/1\s*\/\s*2/)
    expect(概览).not.toMatch(/2\s*\/\s*2|2\s*\/\s*3/)
    expect(表行(page, '.履约表')).toHaveLength(3)
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('待审核包裹在商品表展示对应分配，不伪造正式履约且不恢复独立发货安排标题', async () => {
    const order = 测试订单()
    order.processingStatus = '待审核'
    order.items[1]!.systemSku = 'DEMO-SYSTEM-SKU-B'
    order.manualShippingPlan = { id: 'PLAN-REVIEW-PRODUCTS', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [
      { key: 'PREPARED-A', route: 路由('待审一'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 2 }] },
      { key: 'PREPARED-B', route: 路由('待审二'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-B', quantity: 1 }] },
    ], reason: '', updatedAt: '2026-10-28T08:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(表行(page, '.待审核包裹表')).toHaveLength(2)
    expect(指定行(page, '.待审核包裹表', '包裹 1').text()).toContain('DEMO-SYSTEM-SKU-A')
    expect(指定行(page, '.待审核包裹表', '包裹 1').text()).not.toContain('DEMO-SYSTEM-SKU-B')
    expect(指定行(page, '.待审核包裹表', '包裹 2').text()).toContain('DEMO-SYSTEM-SKU-B')
    expect(指定行(page, '.待审核包裹表', '包裹 2').text()).not.toContain('DEMO-SYSTEM-SKU-A')
    expect(page.get('.履约概览').text()).toContain('尚未生成履约单')
    expect(分区(page, 'fulfillment').findAll('h3').find(item => item.text().startsWith('待审核包裹'))?.text()).toContain('尚未生成当前履约单')
    expect(分区(page, 'fulfillment').findAll('h3').some(item => item.text() === '发货安排')).toBe(false)
    expect(page.find('.履约表').exists()).toBe(false)
    expect(order.fulfillmentOrders).toHaveLength(0)
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('仓储物流归入各自履约行，当前与历史快照独立且不展示旧安排或默认路线', async () => {
    const order = 测试订单()
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-ROUTE-HISTORY-1', isActive: false, status: '已终止', route: 路由('历史一'), plannedQuantity: 2, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-ROUTE-CURRENT-1', isActive: true, status: '待执行', route: 路由('当前一'), plannedQuantity: 1, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-ROUTE-HISTORY-2', isActive: false, status: '已终止', route: 路由('历史二'), plannedQuantity: 1, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-ROUTE-CURRENT-2', isActive: true, status: '待执行', route: 路由('当前二'), plannedQuantity: 2, shippedQuantity: 0 },
    ]
    order.manualShippingPlan = { id: 'PLAN-OLDER', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [{ key: 'OLD-PACKAGE', route: 路由('旧安排'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 2 }] }], reason: '', updatedAt: '2026-10-21T20:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(page.find('.当前路由表').exists()).toBe(false)
    expect(page.find('.原保存路由').exists()).toBe(false)
    for (const [编号, 后缀] of [['FL-ROUTE-CURRENT-1', '当前一'], ['FL-ROUTE-CURRENT-2', '当前二']]) {
      const row = 指定行(page, '.履约表', 编号!)
      for (const value of Object.values(路由(后缀!))) expect(row.text()).toContain(value)
      for (const value of ['FL-ROUTE-HISTORY-1', 'FL-ROUTE-HISTORY-2', '虚构渠道-历史一', '虚构渠道-历史二', '虚构渠道-默认', '虚构渠道-旧安排']) expect(row.text()).not.toContain(value)
    }
    for (const value of ['虚构渠道-默认', '虚构渠道-旧安排']) expect(分区(page, 'fulfillment').text()).not.toContain(value)
    const 履约行 = 表行(page, '.履约表')
    expect(履约行).toHaveLength(4)
    expect(履约行.map(row => row.get('strong').text())).toEqual(order.fulfillmentOrders.map(item => item.fulfillmentOrderNo))
    for (const [no, suffix] of [['FL-ROUTE-HISTORY-1', '历史一'], ['FL-ROUTE-HISTORY-2', '历史二']] as const) {
      const row = 指定行(page, '.履约表', no)
      expect(row.text()).toContain('历史版本')
      expect(row.text()).toContain('已终止')
      expect(row.text()).not.toContain('已取消')
      for (const value of Object.values(路由(suffix))) expect(row.text()).toContain(value)
    }
    const 标题 = 分区(page, 'fulfillment').findAll('h3').find(item => item.text().startsWith('履约单'))!
    expect(标题.text()).toMatch(/4\s*张/)
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('审核前按包裹展示全部已保存仓渠，保存安排不会提前产生履约单', async () => {
    const order = 测试订单()
    order.processingStatus = '待审核'
    order.manualShippingPlan = { id: 'PLAN-PREPARED', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [
      { key: 'PACKAGE-A', route: 路由('准备一'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 1 }] },
      { key: 'PACKAGE-B', route: 路由('准备二'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 1 }, { orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-B', quantity: 1 }] },
    ], reason: '', updatedAt: '2026-10-21T20:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(表行(page, '.待审核包裹表')).toHaveLength(2)
    for (const [包裹, 后缀] of [['包裹 1', '准备一'], ['包裹 2', '准备二']]) {
      const row = 指定行(page, '.待审核包裹表', 包裹!)
      for (const value of Object.values(路由(后缀!))) expect(row.text()).toContain(value)
    }
    expect(page.get('.待审核包裹表').text()).not.toContain('虚构渠道-默认')
    expect(page.find('.履约表').exists()).toBe(false)
    expect(order.fulfillmentOrders).toHaveLength(0)
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('已有发货安排但包裹缺失时显示待核对空态，不以默认路由冒充当前', async () => {
    const order = 测试订单()
    order.processingStatus = '待审核'
    order.manualShippingPlan = { id: 'PLAN-MISSING-PACKAGES', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [], reason: '', updatedAt: '2026-10-21T20:00:00+08:00' }
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(表行(page, '.待审核包裹表')).toHaveLength(0)
    expect(page.get('.待审核包裹表').text()).toContain('暂无包裹商品，请核对发货安排')
    expect(分区(page, 'fulfillment').text()).not.toContain('虚构渠道-默认')
    expect(page.find('.原保存路由').exists()).toBe(false)
    expect(page.find('.履约表').exists()).toBe(false)
    expect(order.fulfillmentOrders).toHaveLength(0)
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('未审核拆分撤销后保留原历史履约，只有无实际履约时才在空态展示订单保存路由', async () => {
    const order = 测试订单()
    order.processingStatus = '待审核'
    order.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-PREVIOUS-HISTORY', isActive: false, status: '已终止', route: 路由('旧履约'), plannedQuantity: 2, shippedQuantity: 0 }]
    order.manualShippingPlan = { id: 'PLAN-TO-REVOKE', kind: '拆分发货', orderNos: [order.systemOrderNo], packages: [{ key: 'PACKAGE-TO-REVOKE', route: 路由('待撤销'), items: [{ orderNo: order.systemOrderNo, externalLineId: 'DEMO-LINE-A', quantity: 2 }] }], reason: '', updatedAt: '2026-10-21T20:00:00+08:00' }
    const page = await 打开(order)
    expect(page.get('.待审核包裹表').text()).toContain('虚构渠道-待撤销')
    const 撤销后 = { ...order, manualShippingPlan: undefined }
    const 原事实 = JSON.stringify(撤销后)
    await page.setProps({ order: 撤销后 }); await 稳定()
    expect(page.find('.当前路由表').exists()).toBe(false)
    expect(page.find('.待审核包裹表').exists()).toBe(false)
    expect(分区(page, 'fulfillment').text()).not.toContain('虚构渠道-默认')
    expect(表行(page, '.履约表')).toHaveLength(1)
    expect(指定行(page, '.履约表', 'FL-PREVIOUS-HISTORY').text()).toContain('历史版本')
    expect(分区(page, 'fulfillment').text()).not.toContain('虚构渠道-待撤销')
    expect(JSON.stringify(撤销后)).toBe(原事实)
    const 无历史订单 = { ...撤销后, fulfillmentOrders: [] }
    const 无历史原事实 = JSON.stringify(无历史订单)
    await page.setProps({ order: 无历史订单 }); await 稳定()
    expect(表行(page, '.履约表')).toHaveLength(0)
    expect(page.get('.履约表').text()).toContain('尚未创建履约单')
    expect(page.get('.履约表').text()).toContain('订单保存的仓储物流')
    expect(字段值(page.get('.履约表'), '物流渠道')).toBe('虚构渠道-默认')
    expect(page.get('.履约表').text()).not.toContain('FL-PREVIOUS-HISTORY')
    expect(JSON.stringify(无历史订单)).toBe(无历史原事实)
  })

  it('当前履约的路由缺失不使用订单默认值或历史快照补齐', async () => {
    const order = 测试订单()
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-EMPTY-ROUTE', isActive: true, status: '待执行', route: { ...路由('空字段'), warehouse: '', shippingChannel: '', shippingChannelCode: '' }, plannedQuantity: 1, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-MISSING-ROUTE', isActive: true, status: '待执行', route: undefined as unknown as 订单路由, plannedQuantity: 1, shippedQuantity: 0 },
    ]
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(表行(page, '.履约表')).toHaveLength(2)
    for (const no of ['FL-EMPTY-ROUTE', 'FL-MISSING-ROUTE']) {
      const row = 指定行(page, '.履约表', no)
      expect(row.text()).toContain('—')
      for (const value of ['虚构仓库-默认', '虚构渠道-默认', 'DEMO-CHANNEL-默认']) expect(row.text()).not.toContain(value)
    }
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('同仓不同渠道仍逐包显示，不按仓库名称折成一行', async () => {
    const order = 测试订单()
    const 同仓 = 路由('同仓')
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-SAME-WAREHOUSE-A', isActive: true, status: '待执行', route: { ...同仓, shippingChannel: '虚构渠道-A', shippingChannelCode: 'DEMO-CHANNEL-A' }, plannedQuantity: 1, shippedQuantity: 0 },
      { fulfillmentOrderNo: 'FL-SAME-WAREHOUSE-B', isActive: true, status: '待执行', route: { ...同仓, shippingChannel: '虚构渠道-B', shippingChannelCode: 'DEMO-CHANNEL-B' }, plannedQuantity: 2, shippedQuantity: 0 },
    ]
    const page = await 打开(order)
    expect(表行(page, '.履约表')).toHaveLength(2)
    expect(指定行(page, '.履约表', 'FL-SAME-WAREHOUSE-A').text()).toContain('虚构渠道-A')
    expect(指定行(page, '.履约表', 'FL-SAME-WAREHOUSE-B').text()).toContain('虚构渠道-B')
  })

  it('平台履约不以自配送计算概览或展示订单默认路线，即使保留了路由数据', async () => {
    const order = 测试订单()
    order.fulfillmentMode = '平台履约'
    order.processingStatus = undefined
    order.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-NOT-SELF-FULFILLED', isActive: true, status: '待执行', route: 路由('不适用'), plannedQuantity: 2, shippedQuantity: 0 }]
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    expect(page.find('.当前路由表').exists()).toBe(false)
    expect(分区(page, 'fulfillment').text()).toContain('平台负责仓储与配送')
    expect(字段值(page.get('.履约概览'), '当前履约单数量')).toBe('不适用')
    expect(字段值(page.get('.履约概览'), '已发货进度')).toBe('不适用')
    expect(分区(page, 'fulfillment').text()).not.toContain('虚构渠道-默认')
    expect(JSON.stringify(order)).toBe(原事实)
  })

  it('发货安排默认展示操作原因，未填写时显示空值且不影响来源日志', async () => {
    const order = 测试订单()
    order.manualShippingPlan = { id: 'DEMO-MERGE-REASON', kind: '合并发货', orderNos: [order.systemOrderNo, 'OMS-DETAIL-TEST-B'], packages: [], reason: '买家申请同包寄送', updatedAt: '2026-10-21T20:00:00+08:00' }
    order.operationLogs = [{ operatedAt: '2026-10-21T20:00:00+08:00', operator: '演示操作员', operationType: '合并发货', operationResult: '成功', content: '原因：买家申请同包寄送' }]
    const page = await 打开(order)
    expect(page.get('.原因预览').text()).toContain('买家申请同包寄送')
    expect(分区(page, 'logs').text()).toContain('原因：买家申请同包寄送')
    await page.setProps({ order: { ...order, manualShippingPlan: { ...order.manualShippingPlan, reason: '' } } })
    expect(page.get('.原因预览').text()).toContain('—')
    expect(分区(page, 'logs').text()).toContain('原因：买家申请同包寄送')
  })

  it('多商品 eBay 标题分别链接当前行，切换其他平台后不保留 eBay 外链', async () => {
    const order = 测试订单()
    order.items[0]!.platformItemId = '0011112222333'
    order.items[1]!.platformItemId = '0044445555666'
    const page = await 打开(order)
    for (const [lineId, itemId] of [['DEMO-LINE-A', '0011112222333'], ['DEMO-LINE-B', '0044445555666']]) {
      const link = 指定行(page, '.商品表', lineId!).get('a.平台商品标题')
      expect(link.attributes('href')).toBe(`https://www.ebay.com/itm/${itemId}`)
      expect(link.attributes('target')).toBe('_blank')
    }
    await page.setProps({ order: { ...order, platformCode: 'Temu' } })
    await 稳定()
    expect(分区(page, 'items').findAll('a.平台商品标题')).toHaveLength(0)
    expect(指定行(page, '.商品表', 'DEMO-LINE-A').text()).toContain('虚构平台商品 A')
    expect(指定行(page, '.商品表', 'DEMO-LINE-B').text()).toContain('虚构平台商品 B')
  })

  it('展示全部商品、双联系方式和完整地址；明确零值、缺失及异币不互相替代', async () => {
    const page = await 打开(测试订单())
    const 收件 = 分区(page, 'recipient')
    expect(字段值(收件, '公司名称')).toBe('虚构收件公司')
    expect(字段值(收件, '县 / 区')).toBe('虚构县区')
    expect(字段值(收件, '手机')).toBe('+1 *** MOBILE-DEMO')
    expect(字段值(收件, '电话')).toBe('+1 *** TELEPHONE-DEMO')
    expect(字段值(收件, '地址行 1')).toBe('虚构地址第一行')
    expect(字段值(收件, '地址行 2')).toBe('虚构地址第二行')
    expect(收件.get('.买家留言 p').text()).toBe('第一行虚构留言\n第二行虚构留言')
    expect(字段值(分区(page, 'amount'), '客付运费')).toBe('USD 0.00')
    expect(字段值(分区(page, 'amount'), '客付税费')).toBe('EUR 1.20')
    expect(字段值(分区(page, 'amount'), '交易费')).toBe('—')
    expect(表行(page, '.商品表')).toHaveLength(2)
    const 第一行 = 指定行(page, '.商品表', 'DEMO-LINE-A')
    for (const value of ['DEMO-PRODUCT-A', '虚构平台商品 A', '虚构系统商品 A', 'DEMO-SYSTEM-SKU-A', '虚构规格-A']) expect(第一行.text()).toContain(value)
    expect(字段值(第一行, '可履约')).toBe('0')
    expect(字段值(第一行, '商品实收金额')).toBe('EUR 0.00')
    expect(第一行.text()).toContain('平台返回')
    const 第二行 = 指定行(page, '.商品表', 'DEMO-LINE-B')
    expect(第二行.text()).toContain('虚构系统商品 B')
    expect(字段值(第二行, '可履约')).toBe('—')
    expect(字段值(第二行, '商品单价')).toBe('JPY 3,800.00')
    expect(字段值(第二行, '商品实收金额')).toBe('—')
    expect(第二行.find('.实收来源').exists()).toBe(false)
  })

  it('保留历史路由和全部仓库执行，共享仓单按整单数量显示且标发状态独立归属', async () => {
    const order = 测试订单()
    order.fulfillmentOrders = [
      { fulfillmentOrderNo: 'FL-DETAIL-CURRENT', isActive: true, status: '已发货', route: 路由('当前'), plannedQuantity: 2, shippedQuantity: 2, trackingNumber: 'DEMO-TRACK-CURRENT', shippedAt: '2026-10-10T02:00:00Z' },
      { fulfillmentOrderNo: 'FL-DETAIL-HISTORY', isActive: false, status: '已终止', route: 路由('历史'), plannedQuantity: 2, shippedQuantity: 0 },
    ]
    const other = { ...structuredClone(order), systemOrderNo: 'OMS-DETAIL-TEST-B' }
    共享订单.value = [order, other]
    仓库执行记录.value = [
      { 履约单号: 'FL-DETAIL-CURRENT', 订单号: [order.systemOrderNo, other.systemOrderNo], 出库单号: 'CK-DETAIL-SHARED', 三方仓出库单号: 'WH-DETAIL-SHARED', 状态: '已出库', 待核查: false, 原因: '', 更新时间: '2026-10-10T02:01:00Z', 出库事实: { planned: 8, shipped: 3, tracking: 'DEMO-TRACK-SHARED', shippedAt: '2026-10-10T02:00:00Z' } },
      { 履约单号: 'FL-DETAIL-OLDER-REQUEST', 订单号: [order.systemOrderNo], 出库单号: 'CK-DETAIL-HISTORY', 状态: '已取消', 待核查: false, 原因: '历史原请求已明确取消', 更新时间: '2026-10-09T02:00:00Z', 出库事实: { planned: null, shipped: null, tracking: null, shippedAt: null } },
      { 履约单号: 'FL-UNRELATED', 订单号: ['OMS-UNRELATED'], 出库单号: 'CK-UNRELATED', 状态: '下单失败', 待核查: false, 原因: '', 更新时间: '2026-10-10T02:00:00Z' },
    ]
    const confirmation: 标发单 = { no: 'CF-DETAIL-OWN', orderNo: order.systemOrderNo, fulfillmentNo: 'FL-DETAIL-CURRENT', status: '标发失败', tracking: 'DEMO-TRACK-SUBMITTED', carrier: 'DEMO-CARRIER', shippedAt: '2026-10-10T02:00:00Z', quantity: 2, lineId: 'DEMO-LINE-A', idempotencyKey: 'DEMO-KEY-OWN', pendingVerification: true, reason: '平台结果待核查，保留提交快照', attempts: [] }
    共享标发单.value = [confirmation, { ...confirmation, no: 'CF-DETAIL-OTHER', orderNo: other.systemOrderNo, status: '标发成功', pendingVerification: false }]
    const page = await 打开(order)
    expect(page.get('.头部状态').text()).toContain('已发货')
    for (const suffix of ['当前', '历史']) {
      const section = 分区(page, 'fulfillment').text()
      for (const value of Object.values(路由(suffix))) expect(section).toContain(value)
    }
    expect(分区(page, 'fulfillment').text()).not.toContain('虚构渠道-默认')
    expect(表行(page, '.履约表')).toHaveLength(2)
    expect(指定行(page, '.履约表', 'FL-DETAIL-HISTORY').text()).toContain('历史版本')
    expect(表行(page, '.仓库执行表')).toHaveLength(2)
    const 共享仓单 = 指定行(page, '.仓库执行表', 'CK-DETAIL-SHARED')
    expect(共享仓单.text()).toContain(other.systemOrderNo)
    expect(共享仓单.text()).toContain('数量为整张出库单')
    expect(字段值(共享仓单, '整单计划 / 有效出库')).toBe('8 / 3')
    expect(字段值(指定行(page, '.仓库执行表', 'CK-DETAIL-HISTORY'), '整单计划 / 有效出库')).toBe('— / —')
    expect(page.text()).not.toContain('CK-UNRELATED')
    expect(表行(page, '.标发表')).toHaveLength(1)
    const 标发 = 指定行(page, '.标发表', 'CF-DETAIL-OWN')
    expect(标发.text()).toContain('标发失败')
    expect(标发.text()).toContain('平台结果待核查')
    expect(字段值(标发, '跟踪号')).toBe('DEMO-TRACK-SUBMITTED')
    expect(标发.text()).not.toContain('标发成功')
    expect(page.text()).not.toContain('CF-DETAIL-OTHER')
    expect(order.processingStatus).toBe('已发货')
  })

  it('审核记录不能推造订单日志，不恢复已删除入口或暴露平台专业原值', async () => {
    const order = 测试订单()
    order.reviews = [{ round: 9, type: '自动审核', triggerSource: '测试审核', status: '已通过', decisionNote: '不可推造的审核汇总', completedAt: '2026-10-10T01:00:00Z' }]
    order.professionalOrder = { routeName: 'oms-ebay-order-detail', sellerId: 'DEMO-PRIVATE-SELLER', orderId: 'DEMO-PRIVATE-PROFESSIONAL-ID' }
    Object.assign(order, { orderPaymentStatus: 'DEMO-PRIVATE-PAYMENT', cancelStatus: { cancelState: 'DEMO-PRIVATE-CANCEL' }, integrationPayloadSnapshot: 'DEMO-PRIVATE-RAW-PAYLOAD' })
    const page = await 打开(order)
    expect(分区(page, 'logs').text()).toContain('暂无订单操作日志')
    expect(表行(page, '.日志表')).toHaveLength(0)
    expect(page.findAll('h2').map(item => item.text())).not.toContain('审核记录')
    for (const value of ['不可推造的审核汇总', 'DEMO-PRIVATE-SELLER', 'DEMO-PRIVATE-PROFESSIONAL-ID', 'DEMO-PRIVATE-PAYMENT', 'DEMO-PRIVATE-CANCEL', 'DEMO-PRIVATE-RAW-PAYLOAD']) expect(page.text()).not.toContain(value)
    const 按钮名 = page.findAll('button').map(item => item.text())
    expect(按钮名).not.toContain('返回列表')
    expect(按钮名).not.toContain('平台专业订单')
    expect(order.operationLogs).toHaveLength(0)
  })

  it('时间按各自可靠来源转为北京时间，导航只滚动且全部信息保持挂载', async () => {
    const order = 测试订单()
    order.operationLogs = [{ operatedAt: '2026-10-09T23:00:05-07:00', operator: '虚构操作角色', operationType: '详情测试操作', operationResult: '成功', content: '已有日志全文' }]
    const 原事实 = JSON.stringify(order)
    const page = await 打开(order)
    const 时间 = 分区(page, 'times')
    expect(字段值(时间, '下单时间')).toBe('2026-10-10 14:20:31')
    expect(字段值(时间, '订单创建时间')).toBe('2026-10-10 08:01:02')
    expect(字段值(时间, '履约完成时间')).toBe('2026-10-10 10:10:11')
    expect(字段值(时间, '付款时间')).toBe('—')
    expect(字段值(时间, '平台更新时间')).toBe('时间待核实')
    expect(时间.findAll('dd').find(item => item.text() === '时间待核实')?.attributes('title')).toBe(order.platformUpdatedAt)
    expect(字段值(分区(page, 'sync'), '最近成功时间')).toBe('2026-10-10 09:10:20')
    expect(字段值(分区(page, 'sync'), '最近尝试时间')).toBe('2026-10-10 09:20:30')
    expect(指定行(page, '.日志表', '已有日志全文').text()).toContain('2026-10-10 14:00:05')
    const 导航 = page.get('nav[aria-label="订单详情分区"]').findAll('button')
    expect(导航).toHaveLength(9)
    await 导航.find(item => item.text() === '操作日志')!.trigger('click')
    expect(滚动).toHaveBeenCalled()
    expect(page.findAll('[data-section]')).toHaveLength(9)
    expect(表行(page, '.商品表')).toHaveLength(2)
    expect(分区(page, 'recipient').isVisible()).toBe(true)
    expect(JSON.stringify(order)).toBe(原事实)
  })
})
