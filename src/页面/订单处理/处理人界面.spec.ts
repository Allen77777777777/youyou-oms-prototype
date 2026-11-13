import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProcessingPage from './订单处理页面.vue'
import OrderDetail from '../全渠道订单/全渠道订单详情页.vue'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单处理状态 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from './演示会话'
import { 共享标发单 } from '../订单标发/演示会话'
import { 当前订单处理人ID } from './处理人模型'
import { 标注状态 } from '@/原型标注/标注状态'
import { 原型标注指令 } from '@/原型标注/原型标注指令'

const 页面实例: VueWrapper[] = []
const 六态: 订单处理状态[] = ['待审核', '待推单', '待发货', '已发货', '异常', '不发货']
const 初始会话 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, confirmations: 共享标发单.value })
const 原当前用户 = 当前订单处理人ID.value
const 原滚动 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
const 页面路径 = '/oms/self-fulfillment/processing'

/** 人员来源为显式保存的订单快照，避免把今天的商品目录当成历史责任。 */
function 订单(后缀: string, 商品人员: string[], 阶段: 订单处理状态 = '待审核'): 全渠道订单 {
  const 原单 = structuredClone(全渠道订单模拟数据[0]!)
  const 编号 = `OMS-HANDLER-UI-${后缀}`
  const items = (商品人员.length ? 商品人员 : ['']).map((_, index) => ({
    ...原单.items[0]!, externalLineId: `${编号}-LINE-${index}`, platformSku: `PL-${后缀}-${index}`,
    systemSku: `SYS-${后缀}-${index}`, systemItemName: `人员界面商品 ${index + 1}`, skuResolutionStatus: '成功' as const,
    orderedQuantity: 1, fulfillableQuantity: 1,
  }))
  const order: 全渠道订单 = {
    ...原单, systemOrderNo: 编号, platformOrderNo: `PLATFORM-${后缀}`, platformOrderId: `PLATFORM-ID-${后缀}`,
    storeId: 'handler-ui-store', storeName: '人员界面测试店', fulfillmentMode: '自配送', processingStatus: 阶段,
    initialReviewPending: undefined, manualShippingPlan: undefined, manualOrder: undefined, professionalOrder: undefined,
    items, tags: [], reviews: [], operationLogs: [], fulfillmentOrders: [], blockReason: undefined, noShipmentReason: undefined,
    orderedAt: '2026-11-12T08:00:00+08:00',
    handlerAssignment: {
      handlerIds: 商品人员.filter(Boolean), assignedAt: '2026-11-12T08:05:00+08:00', source: 'SKU',
      lines: items.map((item, index) => ({ externalLineId: item.externalLineId, systemSku: item.systemSku,
        operatorIds: 商品人员[index] ? [商品人员[index]!] : [],
        ...(!商品人员[index] ? { issue: '系统 SKU 无运营人员' as const } : {}),
      })),
    },
  }
  if (['待推单', '待发货', '已发货'].includes(阶段)) {
    order.fulfillmentOrders = [{
      fulfillmentOrderNo: `FL-HANDLER-UI-${后缀}`, status: 阶段 === '已发货' ? '已发货' : '待执行', isActive: true,
      route: { ...order.defaultRoute! }, plannedQuantity: items.length, shippedQuantity: 阶段 === '已发货' ? items.length : 0,
      items: items.map(item => ({ orderNo: 编号, externalLineId: item.externalLineId, quantity: 1 })),
    }]
  }
  return order
}

async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
function 主行(page: VueWrapper) { return page.get('.作业表格').findAll('tbody tr.el-table__row') }
function 当前单号(page: VueWrapper) { return 主行(page).map(row => row.get('.编号').text()) }
function 队列计数(page: VueWrapper) { return page.findAll('.状态页签标签').map(tab => Number(tab.get('b').text())) }
function 全页() { return new DOMWrapper(document.body) }
async function 点击(page: Pick<DOMWrapper<Element>, 'findAll'>, 文案: string) {
  const button = page.findAll('button').find(item => item.text() === 文案)
  if (!button) throw new Error(`未找到按钮：${文案}`)
  await button.trigger('click'); await 稳定()
}
async function 设置处理人(page: VueWrapper, 名称: string[]) {
  const trigger = page.get('button[aria-label="处理人"]')
  await trigger.trigger('click')
  await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'), { interval: 10 })
  await 稳定()
  const panel = 全页().get('[aria-label="处理人多选"]')
  for (const label of panel.findAll('label')) {
    if (label.text() === '全选') continue
    await label.get('input[type="checkbox"]').setValue(名称.includes(label.text()))
  }
  await 点击(panel, '确定')
}
async function 打开列表(orders: 全渠道订单[]) {
  共享订单.value = orders
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: 页面路径, component: ProcessingPage },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } },
    { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div />' } },
    { path: '/oms/self-fulfillment/shipping-confirmation', component: { template: '<div />' } },
  ] })
  await router.push(页面路径); await router.isReady()
  const page = mount(ProcessingPage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: {
    ElDropdown: { template: '<div><slot /></div>' },
    ElDialog: true, ElDrawer: true, ActionSettings: true, ManualShippingActions: true,
    OrderNotes: true, ReviewRuleRunner: true, WarehouseInventoryDetails: true,
    RecipientSummary: true, OrderAmountSummary: true, OrderTimeSummary: true,
    OrderFlags: true, OrderProductImage: true, PlatformProductTitle: true,
  } } })
  页面实例.push(page); await 稳定(); return page
}

beforeEach(() => {
  标注状态.退出()
  共享订单.value = []; 仓库执行记录.value = []; 操作核查证据.value = {}; 演示库存.value = {}; 订单版本.value = {}; 共享标发单.value = []
  当前订单处理人ID.value = 'staff-01'
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  页面实例.splice(0).forEach(page => page.unmount())
  const data = JSON.parse(初始会话)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions; 共享标发单.value = data.confirmations
  当前订单处理人ID.value = 原当前用户
  标注状态.退出(); document.body.innerHTML = ''
  if (原滚动) Object.defineProperty(HTMLElement.prototype, 'scrollTo', 原滚动)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})

describe('订单处理人员展示与查询', () => {
  it('列表独立展示去重并列处理人，展开商品后逐行展示运营人员', async () => {
    const order = 订单('JOINT', ['staff-01', 'staff-01', 'staff-02'])
    const 原值 = JSON.stringify(order)
    const page = await 打开列表([order, 订单('UNASSIGNED', [])])
    expect(page.get('.el-table__header-wrapper').text()).toContain('处理人')
    const row = 主行(page).find(item => item.text().includes(order.systemOrderNo))!
    expect(row.get('.订单处理人 > span').text()).toBe('客服01、客服02')
    expect(row.get('.商品运营人员').text()).toBe('运营人员客服01')
    await row.get('.展开商品').trigger('click'); await 稳定()
    expect(row.findAll('.商品运营人员 b').map(item => item.text())).toEqual(['客服01', '客服01', '客服02'])
    const 未分配 = 主行(page).find(item => item.text().includes('OMS-HANDLER-UI-UNASSIGNED'))!
    expect(未分配.get('.订单处理人 > span').text()).toBe('未分配')
    expect(未分配.get('.商品运营人员 b').text()).toBe('未分配')
    expect(JSON.stringify(order)).toBe(原值)
  })

  it('处理人多选先保存草稿，查询后按任一人员命中，未分配可以单独筛出', async () => {
    const orders = [订单('A', ['staff-01']), 订单('B', ['staff-02']), 订单('AB', ['staff-01', 'staff-02']), 订单('C', ['staff-03']), 订单('NONE', [])]
    const page = await 打开列表(orders)
    await 设置处理人(page, ['客服01', '客服02'])
    expect(page.get('button[aria-label="处理人"]').text()).toBe('处理人 2项')
    expect(主行(page)).toHaveLength(5)
    expect(队列计数(page)[0]).toBe(5)
    await 点击(page, '查询')
    expect(当前单号(page).sort()).toEqual(['OMS-HANDLER-UI-A', 'OMS-HANDLER-UI-AB', 'OMS-HANDLER-UI-B'])
    expect(队列计数(page)[0]).toBe(3)
    await 设置处理人(page, ['未分配'])
    expect(主行(page)).toHaveLength(3)
    await 点击(page, '查询')
    expect(当前单号(page)).toEqual(['OMS-HANDLER-UI-NONE'])
  })

  it('只看我的点击先改草稿，与处理人筛选共同查询，重置清除并恢复全部', async () => {
    const page = await 打开列表([订单('A', ['staff-01']), 订单('B', ['staff-02']), 订单('AB', ['staff-01', 'staff-02']), 订单('NONE', [])])
    const onlyMine = page.get('[aria-label="只看我的"]').get('input[type="checkbox"]')
    await onlyMine.setValue(true); await 稳定()
    expect(主行(page)).toHaveLength(4)
    expect(队列计数(page)[0]).toBe(4)
    await 点击(page, '查询')
    expect(当前单号(page).sort()).toEqual(['OMS-HANDLER-UI-A', 'OMS-HANDLER-UI-AB'])
    await 设置处理人(page, ['客服02'])
    expect(主行(page)).toHaveLength(2)
    await 点击(page, '查询')
    expect(当前单号(page)).toEqual(['OMS-HANDLER-UI-AB'])
    await 点击(page, '重置')
    expect((onlyMine.element as HTMLInputElement).checked).toBe(false)
    expect(page.get('button[aria-label="处理人"]').text()).toBe('处理人')
    expect(主行(page)).toHaveLength(4)
    expect(队列计数(page)[0]).toBe(4)
  })

  it('查询同步六态角标与分页，换人查询回到首页且切队列保持已应用条件', async () => {
    const orders = [
      ...Array.from({ length: 23 }, (_, i) => 订单(`PAGE-A-${i}`, ['staff-01'])),
      ...Array.from({ length: 2 }, (_, i) => 订单(`PAGE-B-${i}`, ['staff-02'])),
      ...六态.slice(1).flatMap((stage, i) => [订单(`STAGE-A-${i}`, ['staff-01'], stage), 订单(`STAGE-B-${i}`, ['staff-02'], stage)]),
    ]
    const page = await 打开列表(orders)
    expect(队列计数(page)).toEqual([25, 2, 2, 2, 2, 2])
    await 设置处理人(page, ['客服01']); await 点击(page, '查询')
    expect(队列计数(page)).toEqual([23, 1, 1, 1, 1, 1])
    expect(page.get('.分页栏 .el-pagination__total').text()).toContain('23')
    expect(主行(page)).toHaveLength(20)
    await page.get('.分页栏 .btn-next').trigger('click'); await 稳定()
    expect(主行(page)).toHaveLength(3)
    expect(page.get('.分页栏 .el-pager .is-active').text()).toBe('2')
    await 设置处理人(page, ['客服02'])
    expect(队列计数(page)).toEqual([23, 1, 1, 1, 1, 1])
    expect(主行(page)).toHaveLength(3)
    await 点击(page, '查询')
    expect(队列计数(page)).toEqual([2, 1, 1, 1, 1, 1])
    expect(page.get('.分页栏 .el-pager .is-active').text()).toBe('1')
    expect(当前单号(page).every(no => no.includes('PAGE-B'))).toBe(true)
    const 待发货 = page.findAll('[role="tab"]').find(tab => tab.text().startsWith('待发货'))!
    await 待发货.trigger('click'); await 稳定()
    expect(主行(page)).toHaveLength(1)
    expect(主行(page)[0]!.get('.订单处理人 > span').text()).toBe('客服02')
    expect(page.get('.分页栏 .el-pagination__total').text()).toContain('1')
  }, 15_000)

  it('完整详情用真实标注指令渲染商品人员，开关标注及更新均不报错或重算归属', async () => {
    const order = 订单('DETAIL', ['staff-01', 'staff-02'])
    共享订单.value = [order]
    const 原值 = JSON.stringify(order)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/orders/all/:systemOrderNo', component: { template: '<div />' } }] })
    await router.push(`/oms/orders/all/${order.systemOrderNo}`); await router.isReady()
    const 运行异常 = vi.fn()
    const page = mount(OrderDetail, { attachTo: document.body, props: { order }, global: { plugins: [router], config: { errorHandler: 运行异常 }, directives: { prototype: 原型标注指令 }, stubs: {
      ElTooltip: { template: '<span><slot /></span>' }, OrderFlags: true, OrderNotes: true, OrderProductImage: true, WarehouseInventoryDetails: true,
    } } })
    页面实例.push(page); await 稳定()
    const 字段 = page.get('[data-section="basic"]').findAll('dt').find(item => item.text() === '处理人')!
    expect(new DOMWrapper(字段.element.parentElement!).get('dd').text()).toBe('客服01、客服02')
    expect(page.get('[data-section="basic"]').attributes('data-prototype-id')).toBe('oms.all-order.detail.handlers')
    const 商品人员 = () => page.get('[data-section="items"]').findAll('tbody tr.el-table__row').map(row => row.get('.商品运营人员').text())
    expect(商品人员()).toEqual(['运营人员：客服01', '运营人员：客服02'])
    expect(page.findAll('[data-prototype-id="oms.all-order.detail.handlers"]')).toHaveLength(3)
    expect(运行异常).not.toHaveBeenCalled()

    标注状态.切换模式(); await 稳定()
    expect(document.body.dataset.prototypeMode).toBe('true')
    // 新 props 触发真实指令 updated；避免只验证 mounted 后的静态文字。
    await page.setProps({ order: { ...order } }); await 稳定()
    expect(商品人员()).toEqual(['运营人员：客服01', '运营人员：客服02'])
    标注状态.切换模式(); await 稳定()
    expect(document.body.dataset.prototypeMode).toBe('false')
    expect(商品人员()).toEqual(['运营人员：客服01', '运营人员：客服02'])
    expect(运行异常).not.toHaveBeenCalled()
    expect(JSON.stringify(order)).toBe(原值)
  })
})
