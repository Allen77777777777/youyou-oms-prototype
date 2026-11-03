import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProductSummary from './作业商品摘要.vue'
import ProcessingPage from './订单处理页面.vue'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from './演示会话'
import { 共享标发单 } from '../订单标发/演示会话'
import { 标注状态 } from '@/原型标注/标注状态'

const 实例: VueWrapper[] = []
let 恢复会话: (() => void) | undefined
afterEach(() => {
  实例.splice(0).forEach(wrapper => wrapper.unmount())
  恢复会话?.(); 恢复会话 = undefined
  vi.unstubAllGlobals()
})
function 来源订单(): 全渠道订单 {
  const order = JSON.parse(JSON.stringify(全渠道订单模拟数据[0])) as 全渠道订单
  order.systemOrderNo = 'OMS-PRODUCT-SOURCE'
  order.items = [1, 2, 3].map(no => ({ ...order.items[0]!, externalLineId: `line-${no}`, platformSku: `PLATFORM-SKU-${no}`, systemSku: `SYSTEM-SKU-${no}`, orderedQuantity: 5, fulfillableQuantity: 5 }))
  return order
}
function 本次履约(order: 全渠道订单): 履约单摘要 {
  return { fulfillmentOrderNo: 'FL-PRODUCT-PACKAGE', status: '待执行', isActive: true, route: { ...order.defaultRoute! }, plannedQuantity: 7, shippedQuantity: 0,
    items: [{ orderNo: 'OTHER-SOURCE', externalLineId: 'line-1', quantity: 4 }, { orderNo: order.systemOrderNo, externalLineId: 'line-2', quantity: 1 }, { orderNo: order.systemOrderNo, externalLineId: 'line-3', quantity: 2 }] }
}
function 展示(order: 全渠道订单, fulfillment?: 履约单摘要, parcelView = false) {
  const wrapper = mount(ProductSummary, { props: { order, fulfillment, sourceOrder: false, parcelView }, global: { stubs: {
    ElTooltip: { template: '<div><slot /></div>' }, ElButton: { template: '<button><slot /></button>' },
    OrderProductImage: true, PlatformProductTitle: true,
  } } })
  实例.push(wrapper)
  return wrapper
}

// 沿用原模拟商品的下单量、单价和实收；仅新增真实审核后形状的两包分配。
function 拆分来源订单(): 全渠道订单 {
  const order = JSON.parse(JSON.stringify(全渠道订单模拟数据[0])) as 全渠道订单
  order.systemOrderNo = 'OMS-PRODUCT-PARCEL'
  order.processingStatus = '待推单'
  const [第一行, 第二行] = order.items
  const packages = [
    { key: 'package-1', route: { ...order.defaultRoute! }, items: [
      { orderNo: order.systemOrderNo, externalLineId: 第一行!.externalLineId, quantity: 1 },
      { orderNo: order.systemOrderNo, externalLineId: 第二行!.externalLineId, quantity: 1 },
    ] },
    { key: 'package-2', route: { ...order.defaultRoute! }, items: [
      { orderNo: order.systemOrderNo, externalLineId: 第二行!.externalLineId, quantity: 1 },
    ] },
  ]
  order.manualShippingPlan = { id: 'MANUAL-PRODUCT-PARCEL', kind: '拆分发货', orderNos: [order.systemOrderNo], packages, reason: '商品区按包展示', updatedAt: '2026-10-21 10:00:00 UTC+8' }
  order.fulfillmentOrders = packages.map((parcel, index) => ({ fulfillmentOrderNo: `FL-PRODUCT-PARCEL-P${index + 1}`, status: '待执行', isActive: true, route: { ...parcel.route }, manualPlanId: order.manualShippingPlan!.id, plannedQuantity: index === 0 ? 2 : 1, shippedQuantity: 0, items: parcel.items.map(item => ({ ...item })) }))
  return order
}

describe('拆合发货的本次商品范围', () => {
  it('按来源和本包明细展示，只累计本来源计划，展开也不带入其他包或其他来源', async () => {
    const order = 来源订单(), wrapper = 展示(order, 本次履约(order))
    expect(wrapper.get('.商品数量摘要').text()).toBe('本次履约商品 · 2 行 · 本次计划 3 件')
    expect(wrapper.text()).toContain('SYSTEM-SKU-2')
    expect(wrapper.text()).not.toContain('SYSTEM-SKU-1')
    expect(wrapper.text()).not.toContain('SYSTEM-SKU-3')
    expect(wrapper.get('.商品数量').text()).toContain('本次计划 1 件')
    expect(wrapper.get('.商品金额').attributes('aria-label')).toBe('来源订单商品行金额')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('.商品明细')).toHaveLength(2)
    expect(wrapper.text()).toContain('SYSTEM-SKU-3')
    expect(wrapper.text()).not.toContain('SYSTEM-SKU-1')
    expect(wrapper.findAll('.商品数量').map(row => row.text())).toEqual(['本次计划 1 件来源下单 5', '本次计划 2 件来源下单 5'])
  })
  it('切换到无本来源的包明确空态，不退回整单商品', async () => {
    const order = 来源订单(), fulfillment = 本次履约(order), wrapper = 展示(order, fulfillment)
    await wrapper.setProps({ fulfillment: { ...fulfillment, items: fulfillment.items!.filter(item => item.orderNo !== order.systemOrderNo) } })
    expect(wrapper.get('.商品数量摘要').text()).toBe('本次履约商品 · 0 行 · 本次计划 0 件')
    expect(wrapper.findAll('.商品明细')).toHaveLength(0)
    expect(wrapper.get('.空商品').text()).toBe('本次履约没有该来源订单商品')
  })
  it('历史无分配摘要继续展示来源订单商品，完整保留下单量', async () => {
    const order = 来源订单(), fulfillment = 本次履约(order)
    delete fulfillment.items
    const wrapper = 展示(order, fulfillment)
    expect(wrapper.get('.商品数量摘要').text()).toBe('订单商品 · 3 行 · 下单 15 件')
    expect(wrapper.text()).not.toContain('本次计划')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('.商品明细')).toHaveLength(3)
  })
})

describe('拆分包裹商品区的数量与实收展示', () => {
  it('本包数量和实收取本包份额，单价保持来源值，展开仍只展示本包商品且不改源对象', async () => {
    const order = 拆分来源订单(), 原值 = JSON.stringify(order)
    const wrapper = 展示(order, order.fulfillmentOrders[1], true)
    expect(wrapper.get('.商品数量摘要').text()).toBe('本包商品 · 1 行 · 1 件')
    expect(wrapper.get('.商品数量').text()).toBe('本包数量 1')
    expect(wrapper.get('.商品金额').attributes('aria-label')).toBe('本包商品金额')
    expect(wrapper.get('.商品金额').text()).toBe('商品单价：USD 51.40本包实收金额：USD 51.40')
    expect(wrapper.text()).not.toContain('来源下单')
    expect(wrapper.text()).not.toContain('USD 102.80')
    expect(wrapper.text()).not.toContain(order.items[0]!.systemSku)
    await wrapper.setProps({ fulfillment: order.fulfillmentOrders[0] })
    expect(wrapper.get('.商品数量摘要').text()).toBe('本包商品 · 2 行 · 2 件')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('.商品明细')).toHaveLength(2)
    expect(wrapper.findAll('.商品数量').map(item => item.text())).toEqual(['本包数量 1', '本包数量 1'])
    expect(wrapper.findAll('.商品金额 dd').map(item => item.text())).toEqual(['USD 184.00', 'USD 184.00', 'USD 51.40', 'USD 51.40'])
    expect(JSON.stringify(order)).toBe(原值)
  })

  it('来源没有商品实收时保留本包数量，金额显示横线，不按单价补造', () => {
    const order = 拆分来源订单()
    order.items[1]!.actualReceived = undefined
    const 原值 = JSON.stringify(order), wrapper = 展示(order, order.fulfillmentOrders[1], true)
    expect(wrapper.get('.商品数量摘要').text()).toBe('本包商品 · 1 行 · 1 件')
    expect(wrapper.get('.商品金额').text()).toBe('商品单价：USD 51.40本包实收金额：—')
    expect(JSON.stringify(order)).toBe(原值)
  })

  it.each(['缺少履约', '缺少分配', '兄弟包缺少分配'] as const)('%s 时显示待核实，不用整单商品或金额兜底', 情况 => {
    const order = 拆分来源订单()
    if (情况 === '缺少分配') delete order.fulfillmentOrders[1]!.items
    if (情况 === '兄弟包缺少分配') delete order.fulfillmentOrders[0]!.items
    const 原值 = JSON.stringify(order), wrapper = 展示(order, 情况 === '缺少履约' ? undefined : order.fulfillmentOrders[1], true)
    expect(wrapper.get('.商品数量摘要').text()).toBe('本包商品 · 待核实')
    expect(wrapper.get('.空商品').text()).toBe('本包商品分配待核实')
    expect(wrapper.findAll('.商品明细')).toHaveLength(0)
    expect(wrapper.find('.商品金额').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('下单 3')
    expect(JSON.stringify(order)).toBe(原值)
  })
})

describe('订单处理真实页面的商品金额展示范围', () => {
  it('仅待推单和待发货的拆分包裹使用本包投影，其余阶段及来源订单六项金额保持原样', async () => {
    const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
    恢复会话 = () => {
      const data = JSON.parse(初始)
      共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
      演示库存.value = data.inventory; 订单版本.value = data.versions; 共享标发单.value = data.confirmations
      标注状态.退出()
    }
    标注状态.退出()
    共享订单.value = [拆分来源订单()]; 仓库执行记录.value = []; 操作核查证据.value = {}; 演示库存.value = {}; 订单版本.value = {}; 共享标发单.value = []
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    const 页面路径 = '/oms/self-fulfillment/processing'
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: 页面路径, component: ProcessingPage },
      { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } },
      { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div />' } },
      { path: '/oms/self-fulfillment/shipping-confirmation', component: { template: '<div />' } },
    ] })
    await router.push({ path: 页面路径, query: { systemOrderNo: 共享订单.value[0]!.systemOrderNo } }); await router.isReady()
    // 保留真实页面、表格、商品摘要和金额摘要，仅关闭未参与本用例的弹窗及提示浮层。
    const page = mount(ProcessingPage, { global: { plugins: [router], directives: { prototype: {} }, stubs: {
      ElTooltip: { template: '<span><slot /></span>' }, ElDropdown: { template: '<div><slot /></div>' },
      ElDialog: true, ElDrawer: true, ActionSettings: true, ManualShippingActions: true, OrderNotes: true,
    } } })
    实例.push(page)
    async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
    async function 刷新队列() {
      await router.replace({ path: 页面路径, query: {} }); await 稳定()
      await router.replace({ path: 页面路径, query: { systemOrderNo: 共享订单.value[0]!.systemOrderNo } }); await 稳定()
    }
    const 主行 = () => page.get('.作业表格').findAll('tbody tr.el-table__row')
    await 稳定()
    const order = 共享订单.value[0]!
    const 原六项金额 = order.amount
    let 六项金额文本: string[] | undefined
    for (const stage of ['待推单', '待发货', '已发货', '待审核'] as const) {
      order.processingStatus = stage
      await 刷新队列()
      const 原值 = JSON.stringify(order), rows = 主行()
      expect(rows).toHaveLength(stage === '待审核' ? 1 : 2)
      const 本包行 = stage === '待审核' ? rows[0]! : rows.find(row => row.text().includes('FL-PRODUCT-PARCEL-P2'))!
      const goods = 本包行.get('.作业商品摘要')
      if (stage === '待推单' || stage === '待发货') {
        expect(page.get('.el-table__header-wrapper').text()).toContain('商品信息')
        expect(goods.get('.商品数量摘要').text()).toBe('本包商品 · 1 行 · 1 件')
        expect(goods.get('.商品数量').text()).toBe('本包数量 1')
        expect(goods.get('.商品金额').text()).toBe('商品单价：USD 51.40本包实收金额：USD 51.40')
        expect(goods.text()).not.toContain('来源下单')
      } else if (stage === '已发货') {
        expect(goods.get('.商品数量摘要').text()).toBe('本次履约商品 · 1 行 · 本次计划 1 件')
        expect(goods.get('.商品数量').text()).toContain('来源下单 2')
        expect(goods.get('.商品金额').text()).toContain('商品实收金额：USD 102.80')
      } else {
        expect(goods.get('.商品数量摘要').text()).toBe('订单商品 · 2 行 · 下单 3 件')
        await goods.get('.展开商品').trigger('click')
        expect(goods.findAll('.商品金额')[1]!.text()).toContain('商品实收金额：USD 102.80')
      }
      const amounts = 本包行.get('.订单金额摘要')
      expect(amounts.findAll('dd')).toHaveLength(6)
      const 文本 = amounts.findAll('dd').map(item => item.text())
      expect(文本[0]).toBe('USD 286.80')
      六项金额文本 ??= 文本
      expect(文本).toEqual(六项金额文本)
      expect(order.amount).toEqual(原六项金额)
      expect(JSON.stringify(order)).toBe(原值)
    }

    // 已进入本包视图的拆分订单即使丢失履约分配，也不恢复为整单商品。
    order.processingStatus = '待推单'
    delete order.fulfillmentOrders[1]!.items
    await 刷新队列()
    let 未核实行 = 主行().find(row => row.text().includes('FL-PRODUCT-PARCEL-P2'))!
    expect(未核实行.get('.商品数量摘要').text()).toBe('本包商品 · 待核实')
    expect(未核实行.find('.商品明细').exists()).toBe(false)
    expect(未核实行.findAll('.订单金额摘要 dd').map(item => item.text())).toEqual(六项金额文本)
    order.fulfillmentOrders = []
    await 刷新队列()
    未核实行 = 主行()[0]!
    expect(未核实行.get('.商品数量摘要').text()).toBe('本包商品 · 待核实')
    expect(未核实行.find('.商品明细').exists()).toBe(false)

    // 合并发货和普通订单沿用来源商品金额，不受商品列通用标题影响。
    for (const 合并 of [true, false]) {
      const 来源 = 拆分来源订单()
      if (合并) 来源.manualShippingPlan!.kind = '合并发货'
      else delete 来源.manualShippingPlan
      共享订单.value = [来源]
      await 刷新队列()
      const 普通行 = 主行().find(row => row.text().includes('FL-PRODUCT-PARCEL-P2'))!
      expect(普通行.get('.商品金额').text()).toContain('商品实收金额：USD 102.80')
      expect(普通行.get('.商品数量').text()).toContain('来源下单 2')
      expect(普通行.text()).not.toContain('本包实收金额')
      expect(普通行.findAll('.订单金额摘要 dd').map(item => item.text())).toEqual(六项金额文本)
    }
  }, 20_000)
})
