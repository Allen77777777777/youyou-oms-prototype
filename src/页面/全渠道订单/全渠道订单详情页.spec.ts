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
    for (const suffix of ['默认', '当前', '历史']) {
      const section = 分区(page, 'fulfillment').text()
      for (const value of Object.values(路由(suffix))) expect(section).toContain(value)
    }
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
