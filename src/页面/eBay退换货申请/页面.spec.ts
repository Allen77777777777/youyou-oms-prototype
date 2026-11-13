import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElIcon, ElMessage, ElRadioGroup, ElSelect, ElTooltip } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import Page from './eBay退换货申请页面.vue'
import PageTabs from '@/布局/页面页签.vue'
import { 业务页签关闭请求 } from '@/布局/页签操作'
import { returnDetailRoute } from './详情路由'
import DetailPage from './退货详情页面.vue'
import { resetReturnViews } from './视图会话'
import { createReturnData, returnSession as session } from './数据'
import { initializeReturnDemoContext } from './关联资料'
import { formatReturnTime, getReturnDetail, returnKey, stateNames, type ReturnRecord } from './模型'
import { resetMailSession } from '../eBay站内信/会话'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords, recordsForReturn } from '../售后单管理/会话'
import { 共享订单 } from '../订单处理/演示会话'
import BuyerMail from '../eBay取消订单申请/买家站内信.vue'

let wrapper: VueWrapper
let router: Router
const shell = {
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" :data-title="title"><header><slot name="header" title-id="test-return-title" title-class="el-drawer__title" /></header><slot /><footer data-shell-footer><slot name="footer" /></footer></section>',
}
type Scope = string | Pick<DOMWrapper<Element>, 'findAll'>
function scopeRoot(scope?: Scope) { return typeof scope === 'string' ? wrapper.get(scope) : scope || wrapper }
function button(label: string, scope?: Scope) {
  const result = scopeRoot(scope).findAll('button').find(item => item.text().trim() === label)
  if (!result) throw new Error(`未找到按钮：${label}`)
  return result
}
async function click(label: string, scope?: Scope) { await button(label, scope).trigger('click'); await flushPromises() }
function listRows() { return wrapper.findAll('.returns-table .el-table__row') }
function rowFor(record: ReturnRecord) {
  const result = listRows().find(item => item.text().includes(record.id) && item.text().includes(record.shopName))
  if (!result) throw new Error(`未找到申请：${returnKey(record)}`)
  return result
}
async function open(record: ReturnRecord) {
  if (router.currentRoute.value.path !== '/oms/ebay-service/returns') await click('退货退款申请', '.页面页签')
  if (!listRows().some(item => item.text().includes(record.id) && item.text().includes(record.shopName))) {
    await wrapper.get('input[aria-label="退货退款申请搜索内容"]').setValue(record.id)
    await click('查询')
  }
  await click(record.id, rowFor(record))
}
async function refreshCurrent() { await click('刷新数据', '.return-workbench-header .detail-refresh') }
async function select(label: string, value: string) {
  const control = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === label || item.attributes('aria-label') === label || item.find(`[aria-label="${label}"]`).exists())
  if (!control) throw new Error(`未找到选择框：${label}`)
  control.vm.$emit('update:modelValue', value)
  await flushPromises()
}

beforeEach(async () => {
  resetReturnViews()
  activeAfterSaleActor.value = afterSaleActors[0]!
  afterSaleRecords.value = []
  业务页签关闭请求.value = undefined
  session.records = createReturnData()
  resetMailSession()
  initializeReturnDemoContext()
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/oms/ebay-service/returns', component: Page, meta: { title: '退货退款申请' } },
    { path: returnDetailRoute.path, name: returnDetailRoute.name, meta: returnDetailRoute.meta, component: DetailPage },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div>OMS订单详情</div>' } },
    { path: '/oms/warehouse-delivery/outbound-orders', component: { template: '<div>三方仓出库单详情</div>' } },
    { path: '/oms/ebay-service/messages', component: { template: '<div>站内信</div>' } },
    { path: '/oms/ebay-service/after-sale-orders', component: { template: '<div>售后单管理</div>' } },
  ] })
  await router.push('/oms/ebay-service/returns')
  await router.isReady()
  wrapper = mount({ components: { PageTabs }, template: '<PageTabs /><RouterView />' }, { global: { plugins: [router], components: { ElIcon, ElTooltip }, directives: { prototype: {} }, stubs: { ElDrawer: shell, ElDialog: shell } } })
  await flushPromises()
})
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll() })

describe('退货退款申请连续详情与处理', () => {
  it('明确失败后可选原请求重试或更正后新办理，金额更正新建单并保留旧失败单', async () => {
    const row = session.records[0]!
    row.mock = { submit: 'failed' }
    await open(row)
    await click('提出部分退款', '.operation-header')
    await wrapper.get('input[aria-label="部分退款金额"]').setValue('10.00')
    await select('系统售后原因', '质量问题')
    await click('确认内容'); await click('确认提交')
    const original = recordsForReturn(row.shopId, row.id)[0]!
    expect(original.executionResult).toBe('平台提交失败')
    await click('提出部分退款', '.operation-header')
    expect(wrapper.get('[aria-label="失败后办理方式"]').text()).toContain('原请求重试')
    expect(button('原请求重试').attributes('aria-pressed')).toBe('true')
    await wrapper.get('input[aria-label="部分退款金额"]').setValue('9.00')
    await click('原请求重试')
    expect((wrapper.get('input[aria-label="部分退款金额"]').element as HTMLInputElement).value).toBe('10.00')
    await wrapper.get('input[aria-label="部分退款金额"]').setValue('9.00')
    await click('更正后新办理')
    await click('确认内容')
    expect(wrapper.get('.sale-summary').text()).toContain('更正后新办理')
    expect(wrapper.get('.sale-summary').text()).toContain(original.no)
    await click('确认提交')
    const records = recordsForReturn(row.shopId, row.id)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ amount: { value: '9.00' }, executionResult: '已提交，待平台回查' })
    expect(original).toMatchObject({ amount: { value: '10.00' }, executionResult: '平台提交失败' })
    expect(wrapper.find('[aria-label="失败后办理方式"]').exists()).toBe(false)
  })
  it('申请关闭后列表和详情不再催办，保留平台仍返回的双方期限', async () => {
    const row = session.records[6]!, detail = getReturnDetail(row)
    detail.sellerDue = { activity: 'SELLER_ISSUE_REFUND', at: '2026-10-26T04:00:00Z' }
    detail.buyerDue = { activity: 'BUYER_ESCALATE', at: '2026-11-15T04:00:00Z' }
    detail.timeoutAt = '2026-11-25T04:00:00Z'
    detail.closeInfo!.reason = 'PARTIALLY_REFUNDED'
    await flushPromises()
    expect(rowFor(row).text()).toContain('暂无待办')
    expect(rowFor(row).text()).not.toContain('2026-10-26 12:00:00')
    await open(row)
    expect(wrapper.find('.responsibility-panel').exists()).toBe(false)
    expect(wrapper.get('.close-panel').text()).toContain('已部分退款')
    expect(detail.sellerDue.at).toBe('2026-10-26T04:00:00Z')
    expect(detail.buyerDue.at).toBe('2026-11-15T04:00:00Z')
    expect(detail.timeoutAt).toBe('2026-11-25T04:00:00Z')
  })
  it('重发紧随拒绝退货，原申请只需确认商品、数量、原因，提交待审不建手工单', async () => {
    const row = session.records[0]!, before = JSON.stringify([row.state, row.status, row.history, row.pendingRequest])
    const orderCount = 共享订单.value.length
    await open(row)
    const labels = wrapper.get('.operation-header').findAll('button').map(item => item.text())
    expect(labels[labels.indexOf('拒绝退货') + 1]).toBe('重发')
    await click('重发', '.operation-header')
    expect(wrapper.get('.reship-form').text()).toContain(row.systemOrderNo)
    expect(wrapper.find('.linked-sales .reship-form').exists()).toBe(false)
    expect(wrapper.get('.reship-form').text()).not.toMatch(/仓储服务商|联系电话|发货店铺/)
    await click('提交售后单', '.reship-form')
    expect(wrapper.get('.reship-form [role="alert"]').text()).toContain('系统售后原因')
    await click('取消', '.reship-form')
    expect(recordsForReturn(row.shopId, row.id)).toHaveLength(0)
    await click('重发', '.operation-header')
    await select('系统售后原因', '质量问题')
    await click('提交售后单', '.reship-form')
    expect(recordsForReturn(row.shopId, row.id)).toMatchObject([{ kind: '重发', approval: '待审核', items: [{ reason: '质量问题', quantity: row.quantity }] }])
    expect(recordsForReturn(row.shopId, row.id)[0]?.manualOrderNo).toBeUndefined()
    expect(共享订单.value.length).toBe(orderCount)
    expect(JSON.stringify([row.state, row.status, row.history, row.pendingRequest])).toBe(before)
  })
  it('申请内联填后可点击单号进入对应售后单，内部字段与对客说明分开', async () => {
    const row = session.records[0]!
    await open(row)
    await click('提出部分退款', '.operation-header')
    await wrapper.get('input[aria-label="部分退款金额"]').setValue('5.00')
    await click('确认内容')
    expect(wrapper.get('.action-form .inline-error').text()).toContain('请选择系统售后原因')
    expect(row.pendingRequest).toBeUndefined()
    expect(recordsForReturn(row.shopId, row.id)).toHaveLength(0)
    await select('系统售后原因', '质量问题')
    await wrapper.get('textarea[aria-label="售后单备注"]').setValue('仅售后单存档')
    await click('确认内容')
    expect(wrapper.get('.sale-summary').text()).toContain('仅售后单存档')
    await click('确认提交')
    const doc = recordsForReturn(row.shopId, row.id)[0]!
    expect(doc.items[0]?.reason).toBe('质量问题')
    expect(row.pendingRequest?.body).not.toHaveProperty('comments')
    await click(doc.no, '.linked-sales')
    expect(router.currentRoute.value.path).toBe('/oms/ebay-service/after-sale-orders')
    expect(router.currentRoute.value.query.documentNo).toBe(doc.no)
  })
  it.each([
    [['SELLER_APPROVE_REQUEST', 'SELLER_OFFER_RETURNS'], 'APPROVE'],
    [['SELLER_OFFER_RETURNS'], 'OFFER_RETURN'],
  ] as const)('接受退货统一入口按当前能力构造%s，保留商品作为独立选项', async (options, decision) => {
    const row = session.records[0]!, state = row.state
    row.options = [...options]
    getReturnDetail(row).availableActions = row.options.map(actionType => ({ actionType }))
    await open(row)
    expect(wrapper.get('.operation-header').findAll('button').filter(button => button.text() === '接受退货')).toHaveLength(1)
    expect(wrapper.get('.operation-header').text()).not.toContain('提议退回商品')
    await click('接受退货', '.operation-header')
    expect(button('接受退货', '.operation-header').attributes('aria-pressed')).toBe('true')
    const group = wrapper.findComponent(ElRadioGroup)
    expect(group.props('modelValue')).toBe(false)
    expect(wrapper.get('.return-arrangement').text()).toContain('买家退回商品')
    expect(wrapper.get('.return-arrangement').text()).toContain('买家保留商品，无需寄回')
    expect(wrapper.get('.sale-fixed-qty').text()).toBe(row.quantity + ' 件')
    group.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(row.state).toBe(state)
    expect(wrapper.find('.sale-fields').exists()).toBe(false)
    group.vm.$emit('update:modelValue', false)
    await flushPromises()
    await click('确认内容', '.action-form')
    expect(wrapper.get('.action-form .inline-error').text()).toContain('系统售后原因')
    group.vm.$emit('update:modelValue', true)
    await flushPromises()
    await wrapper.get('textarea[aria-label="退货退款处理说明"]').setValue('Please keep the item.')
    await click('确认内容', '.action-form')
    expect(wrapper.get('[data-title="确认接受退货"]').text()).toContain('允许买家保留，无需寄回')
    expect(wrapper.get('[data-title="确认接受退货"]').text()).not.toContain('售后单')
    await click('确认提交', '[data-title="确认接受退货"]')
    expect(row.pendingRequest?.body).toEqual({ decision, keepOriginalItem: true, comments: { content: 'Please keep the item.' } })
    expect(row.state).toBe(state)
    await refreshCurrent()
    expect(row.state).toBe('ITEM_KEPT')
    expect(recordsForReturn(row.shopId, row.id)).toHaveLength(0)
    await click('发起退款', '.operation-header')
    await select('系统售后原因', '质量问题')
    await click('确认内容', '.action-form')
    await click('确认提交', '[data-title="确认发起退款"]')
    await refreshCurrent()
    await refreshCurrent()
    expect(recordsForReturn(row.shopId, row.id)).toMatchObject([{ kind: '全额退款', amount: { value: '49.90', currency: 'USD' } }])
  })
  it('免寄回确认后失去该店铺权限，无平台提交和售后记录', async () => {
    const row = session.records[0]!
    await open(row)
    await click('接受退货', '.operation-header')
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', true)
    await flushPromises()
    await click('确认内容', '.action-form')
    activeAfterSaleActor.value = { ...afterSaleActors[0]!, shopIds: [] }
    await click('确认提交', '[data-title="确认接受退货"]')
    expect(wrapper.get('.action-form .inline-error').text()).toContain('权限')
    expect(row.outcome).toBe('idle')
    expect(row.pendingRequest).toBeUndefined()
    expect(afterSaleRecords.value.filter(doc => doc.shopId === row.shopId && doc.returnId === row.id)).toHaveLength(0)
  })

  it('列表、详情与关联来信统一北京时间，业务界面不附时区说明', async () => {
    expect(wrapper.get('.returns-table').text()).toContain('2026-10-28 11:20:00')
    expect(wrapper.get('.returns-page').text()).not.toMatch(/UTC|GMT|站点时间|时区/)
    expect(wrapper.get('.公共时间范围').find('[title]').exists()).toBe(false)
    await open(session.records[0]!)
    expect(wrapper.get('.return-history-panel').text()).toContain('2026-10-28 11:20:00')
    expect(wrapper.get('.attachments-panel').text()).toContain('2026-10-28 11:21:00')
    const mail = wrapper.findComponent(BuyerMail)
    expect(mail.props('formatTime')!('2026-10-28T03:20:00Z')).toBe('2026-10-28 11:20:00')
    expect(mail.find('time[title]').exists()).toBe(false)
    expect(wrapper.get('.return-workbench').text()).not.toMatch(/UTC|GMT|站点时间|时区/)
  })

  it('默认不选处理动作，切换与取消仅高亮当前选择', async () => {
    expect(wrapper.find('.returns-toolbar .sync-help').exists()).toBe(false)
    const refreshHelp = wrapper.findAllComponents(ElTooltip).find(item => String(item.props('content')).includes('按已应用店铺范围刷新'))!
    expect(refreshHelp.props('trigger')).toEqual(['hover', 'focus'])
    await open(session.records[0]!)
    const actions = () => wrapper.get('.operation-header .action-buttons')
    expect(actions().findAll('button.el-button--primary')).toHaveLength(0)
    expect(actions().findAll('button[aria-pressed="true"]')).toHaveLength(0)
    await click('接受退货', '.operation-header')
    expect(actions().get('button[aria-pressed="true"]').text()).toBe('接受退货')
    await click('拒绝退货', '.operation-header')
    expect(actions().findAll('button.el-button--primary')).toHaveLength(1)
    expect(actions().get('button[aria-pressed="true"]').text()).toBe('拒绝退货')
    expect(button('接受退货', '.operation-header').classes()).not.toContain('el-button--primary')
    expect(wrapper.find('[aria-label="上传申请材料"]').exists()).toBe(true)
    await click('取消', '.action-form')
    expect(actions().findAll('button.el-button--primary')).toHaveLength(0)
    expect(actions().findAll('button[aria-pressed="true"]')).toHaveLength(0)
  })

  it('处理中合并协商退货与退款记录，数量及平台状态筛选保持一致', async () => {
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.element.firstChild?.textContent?.trim())).toEqual(['全部', '待处理', '处理中', '已升级纠纷', '已关闭'])
    const processingIds = [2, 3, 4, 5, 8, 10, 11, 12, 13, 15, 19, 20].map(number => `DEMO-RT-${String(number).padStart(3, '0')}`)
    const processing = () => wrapper.findAll('[role="tab"]').find(tab => tab.text().startsWith('处理中'))!
    expect(processing().get('span').text()).toBe('12')
    await processing().trigger('click')
    await flushPromises()
    expect(processing().attributes('aria-selected')).toBe('true')
    expect(listRows().map(row => row.get('.link-button').text())).toEqual(processingIds)
    expect(wrapper.get('.returns-table').text()).toContain('退款失败')
    expect(wrapper.get('.returns-table').text()).toContain('待买家接受报价')

    const stateFilter = wrapper.findAllComponents(MultiFilter).find(filter => filter.props('placeholder') === '平台处理状态')!
    stateFilter.vm.$emit('update:modelValue', ['ITEM_SHIPPED', 'REFUND_FAILED'])
    await flushPromises()
    expect(processing().get('span').text()).toBe('12')
    await click('查询')
    expect(processing().get('span').text()).toBe('4')
    expect(listRows().map(row => row.get('.link-button').text())).toEqual(['DEMO-RT-002', 'DEMO-RT-005', 'DEMO-RT-012', 'DEMO-RT-013'])
    await click('重置')
    expect(wrapper.findAll('[role="tab"]')[0]!.attributes('aria-selected')).toBe('true')
    expect(processing().get('span').text()).toBe('12')
  })

  it('原订单地址取当前可靠关联，失去关联后不回显旧快照', async () => {
    const record = session.records[0]!
    await open(record)
    const order = 共享订单.value.find(item => item.systemOrderNo === record.systemOrderNo)!
    const card = () => wrapper.findAll('.address-card')[1]!
    expect(card().text()).toContain(order.address.addressLine1)
    expect(card().text()).not.toContain(getReturnDetail(record).orderAddress!.addressLine1)
    const originalId = record.systemOrderNo
    record.systemOrderNo = 'CONFLICTING-ORDER-ID'
    await flushPromises()
    expect(card().text()).toContain('尚未取得')
    expect(card().text()).not.toContain(order.address.addressLine1)
    record.systemOrderNo = originalId
  })

  it('申请查询保留草稿，提交后才生效；重置恢复全部', async () => {
    const first = session.records[0]!
    await wrapper.get('input[aria-label="退货退款申请搜索内容"]').setValue(first.id)
    expect(listRows()).toHaveLength(Math.min(session.records.length, 20))
    await click('查询')
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]!.text()).toContain(first.id)
    await click('重置')
    expect(listRows()).toHaveLength(Math.min(session.records.length, 20))
  })

  it('平台处理状态多选查询生效，不把内部提交结果作为业务筛选或列表列', async () => {
    const filters = wrapper.findAllComponents(MultiFilter)
    expect(filters.some(filter => filter.props('placeholder') === '提交结果')).toBe(false)
    const stateFilter = filters.find(filter => filter.props('placeholder') === '平台处理状态')!
    expect(stateFilter).toBeDefined()
    expect(wrapper.findAll('.returns-table th').map(item => item.text())).not.toContain('提交结果')
    stateFilter.vm.$emit('update:modelValue', ['CLOSED'])
    await flushPromises()
    expect(listRows()).toHaveLength(Math.min(session.records.length, 20))
    await click('查询')
    expect(listRows()).toHaveLength(session.records.filter(record => record.state === 'CLOSED').length)
    expect(listRows().every(item => item.text().includes(stateNames.CLOSED!))).toBe(true)
  })

  it('应用内详情保留两栏资料，右侧操作栏独立办理', async () => {
    const record = session.records[1]!
    await open(record)
    expect(wrapper.find('.detail-tabs').exists()).toBe(false)
    expect(wrapper.get('.return-detail .detail-workspace').find('.detail-main').exists()).toBe(true)
    expect(wrapper.get('.return-detail .detail-workspace').find('.detail-aside').exists()).toBe(true)
    expect(wrapper.get('.return-workbench-header').text()).toContain('刷新数据')
    expect(wrapper.get('.return-workbench-header').text()).not.toContain('返回申请列表')
    expect(wrapper.get('.return-workbench-header').text()).not.toContain('关闭详情')
    const refreshHelpSnapshot = JSON.stringify({ lastSyncedAt: record.lastSyncedAt, version: getReturnDetail(record).eligibilityVersion, logs: record.logs })
    expect(wrapper.find('.detail-refresh .sync-help').exists()).toBe(false)
    await button('刷新数据', '.detail-refresh').trigger('mouseenter')
    await button('刷新数据', '.detail-refresh').trigger('focus')
    await flushPromises()
    expect(JSON.stringify({ lastSyncedAt: record.lastSyncedAt, version: getReturnDetail(record).eligibilityVersion, logs: record.logs })).toBe(refreshHelpSnapshot)
    const footer = wrapper.get('.return-operation .operation-header')
    expect(footer.find('.action-buttons').exists()).toBe(true)
    expect(footer.findAll('button').map(item => item.text().trim())).toEqual(['接受退货', '提出部分退款', '发起退款', '发送消息', '拒绝退货', '重发', '请求 eBay 介入'])
    expect(button('拒绝退货', footer).attributes('disabled')).toBeDefined()
    expect(button('重发', footer).attributes('disabled')).toBeUndefined()
    expect(footer.text()).not.toContain('确认提交')
    expect(footer.text()).not.toContain('刷新数据')
    expect(wrapper.find('.action-section .action-buttons').exists()).toBe(false)

    const application = wrapper.get('.application-panel')
    expect(application.text()).toContain(record.reason)
    const refund = wrapper.get('.refund-detail-panel')
    expect(refund.text()).toContain('卖家预计承担')
    expect(refund.text()).toContain('卖家实际退款')
    expect(refund.text()).toContain('GBP 36.80')
    const item = wrapper.get('.return-item-panel')
    expect(item.text()).toContain(record.title)
    expect(item.text()).toContain('申请数量')
    expect(item.text()).not.toContain('DEMO-RET-ACCESSORY-2')
    const order = wrapper.get('.order-context')
    expect(application.find('.order-context').exists()).toBe(true)
    expect(wrapper.findAll('.order-context')).toHaveLength(1)
    expect(wrapper.get('.detail-main > .order-products').find('.order-context').exists()).toBe(false)
    expect(order.text()).toContain(record.systemOrderNo!)
    expect(order.text()).toContain(record.orderNo)
    expect(order.text()).toContain('GBP 83.60')
    expect(order.text()).not.toContain('GBP 36.80')
    expect(wrapper.get('.detail-main').text()).toContain('DEMO-RET-ACCESSORY-2')

    const outbound = wrapper.get('.outbound-panel')
    expect(outbound.text()).toContain('DEMO-ORIGINAL-SHIP-2-A')
    expect(outbound.text()).toContain('DEMO-ORIGINAL-SHIP-2-B')
    expect(outbound.text()).not.toContain(record.tracking!)
    const returnShipping = wrapper.get('.return-shipping-panel')
    expect(returnShipping.text()).toContain(record.tracking!)
    expect(returnShipping.text()).not.toContain('DEMO-ORIGINAL-SHIP-2')
    expect(application.text()).toContain(formatReturnTime(record.createdAt, record))

    const originalState = record.state, originalLogs = record.logs.length
    await click('发送消息', '.return-operation')
    expect(wrapper.get('.action-form').text()).toContain('发送消息')
    expect(wrapper.find('[data-title="确认发送消息"]').exists()).toBe(false)
    expect(record.outcome).toBe('idle')
    expect(record.pendingAction).toBeNull()
    expect(record.state).toBe(originalState)
    expect(record.logs).toHaveLength(originalLogs)
  })

  it('申请信息与右侧处理过程优先展示，来源顺序及站内信和内部记录隔离不变', async () => {
    const record = session.records[0]!
    record.history = [
      { at: '2026-10-29T03:00:00Z', author: 'SELLER', activity: 'SELLER_SEND_MESSAGE', text: 'Return来源卖家沟通独立证据' },
      { at: '2026-10-29T01:00:00Z', author: 'BUYER', activity: 'BUYER_MARK_RETURN_SHIPPED', text: 'Return来源买家事件独立证据', fromState: 'ITEM_READY_TO_SHIP', toState: 'ITEM_SHIPPED' },
      { at: '2026-10-29T01:00:00Z', author: 'EBAY', activity: 'PLATFORM_SOURCE_ACTIVITY', text: 'Return来源平台事件独立证据' },
    ]
    const sourceHistory = JSON.stringify(record.history)
    record.logs.push({ at: '2026-10-29T02:00:00Z', text: '仅内部执行记录证据' })
    await open(record)
    const history = wrapper.get('.detail-aside > .return-history-panel')
    expect(history.get('h3').text()).toBe('处理过程')
    const responsibility = wrapper.get('.return-reading .responsibility-panel').element
    const businessData = wrapper.get('.return-reading .detail-workspace').element
    expect(responsibility.compareDocumentPosition(history.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(responsibility.compareDocumentPosition(businessData) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wrapper.get('.detail-main').element.firstElementChild).toBe(wrapper.get('.application-panel').element)
    expect(wrapper.get('.detail-aside').element.firstElementChild).toBe(history.element)
    expect(history.findAll('.history-entry > header > strong').map(entry => entry.text())).toEqual(['卖家', '买家', 'eBay'])
    expect(history.findAll('.history-entry > p:not(.activity-kind)').map(entry => entry.text())).toEqual(record.history.map(entry => entry.text))
    expect(JSON.stringify(record.history)).toBe(sourceHistory)
    expect(history.text()).not.toContain('仅内部执行记录证据')
    const logs = wrapper.get('.return-operation .operation-logs-panel .internal-records')
    expect(logs.attributes('open')).toBeUndefined()
    expect(logs.text()).toContain('仅内部执行记录证据')
    expect(logs.text()).toContain('操作日志')
    expect(logs.text()).toContain('操作人：未记录')
    expect(logs.text()).not.toContain('Return来源卖家沟通独立证据')
    expect(wrapper.find('.return-reading .internal-notes-panel').exists()).toBe(false)
    const mail = wrapper.findComponent(BuyerMail)
    expect(mail.exists()).toBe(true)
    expect(mail.props('shopId')).toBe(record.shopId)
    expect(mail.props('buyerId')).toBe(record.buyerId)
    expect(history.findComponent(BuyerMail).exists()).toBe(false)
    getReturnDetail(record).contentOnHold = true
    await flushPromises()
    expect(history.text()).toContain('平台已隐藏沟通内容')
    expect(history.text()).not.toContain('Return来源卖家沟通独立证据')
    expect(history.text()).toContain('PLATFORM_SOURCE_ACTIVITY')
    expect(JSON.stringify(record.history)).toBe(sourceHistory)
    expect(wrapper.findComponent(BuyerMail).exists()).toBe(true)
  })

  it('未选办理动作也能在右侧保存内部备注，不改变未知结果或平台处理过程', async () => {
    const record = session.records[7]!, source = JSON.stringify({ state: record.state, status: record.status, outcome: record.outcome, history: record.history, pendingRequest: record.pendingRequest }), originalLogCount = record.logs.length
    await open(record)
    expect(wrapper.find('.return-operation .action-form').exists()).toBe(false)
    const notes = wrapper.get('.return-operation .internal-notes-panel')
    const empty = wrapper.get('.return-operation .operation-empty')
    expect(empty.element.compareDocumentPosition(notes.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await notes.get('textarea[aria-label="退货退款内部备注"]').setValue('  仅内部跟进，等待核实上次退款结果  ')
    await click('添加备注', notes)
    expect(record.notes[record.notes.length - 1]?.text).toBe('仅内部跟进，等待核实上次退款结果')
    expect((notes.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(notes.text()).toContain('仅内部跟进，等待核实上次退款结果')
    expect(wrapper.get('.return-history-panel').text()).not.toContain('仅内部跟进')
    expect(JSON.stringify({ state: record.state, status: record.status, outcome: record.outcome, history: record.history, pendingRequest: record.pendingRequest })).toBe(source)
    expect(record.logs).toHaveLength(originalLogCount + 1)
    expect(record.logs.slice(-1)[0]).toMatchObject({ action: '添加内部备注', result: '已保存' })
    expect(record.logs.slice(-1)[0]?.content).not.toContain('等待核实上次退款结果')
    expect(button('发起退款', '.return-operation').attributes('disabled')).toBeDefined()
  })

  it('历史备注最新在前独立展示，旧人员时间缺失显示未记录且不改写原资料', async () => {
    const record = session.records[0]!
    record.notes = [
      { text: '旧缺人员时间备注' },
      { text: '旧空资料备注', author: ' ', at: '' },
      { text: '较早的核查记录', author: '客服小林', at: '2026-10-28T10:00:00Z' },
      { text: '最近的核查记录', author: '跟单员小周', at: '2026-10-29T10:00:00Z' },
    ]
    const original = JSON.stringify(record.notes)
    await open(record)
    const notes = wrapper.get('.return-operation .internal-notes-panel'), entries = notes.findAll('.note-entry')
    expect(entries.map(entry => entry.get('p').text())).toEqual(['最近的核查记录', '较早的核查记录', '旧空资料备注', '旧缺人员时间备注'])
    expect(entries[0]!.get('small').text()).toContain('操作人：跟单员小周')
    expect(entries[0]!.get('small').text()).toContain(formatReturnTime('2026-10-29T10:00:00Z', record))
    for (const entry of entries.slice(2)) expect(entry.get('small').text()).toBe('操作人：未记录 · 时间：未记录')
    expect(wrapper.get('.operation-logs-panel').text()).not.toContain('最近的核查记录')
    expect(notes.find('.service-operation-logs').exists()).toBe(false)
    expect(JSON.stringify(record.notes)).toBe(original)
  })

  it('不确定退款结果保持局部提示和防重，顶部刷新不改成成功或影响其他申请', async () => {
    const record = session.records[7]!
    const others = session.records.filter(item => item !== record).map(item => ({ key: returnKey(item), state: item.state, updatedAt: item.updatedAt, lastSyncedAt: item.lastSyncedAt, logs: item.logs.length }))
    await open(record)
    expect(wrapper.get('.return-detail .business-hint').text()).toMatch(/结果.*未确认/)
    expect(button('发起退款').attributes('disabled')).toBeDefined()
    const previousState = record.state
    const previousActual = record.actualRefund
    await refreshCurrent()
    expect(record.outcome).toBe('unknown')
    expect(record.state).toBe(previousState)
    expect(record.actualRefund).toBe(previousActual)
    expect(button('发起退款').attributes('disabled')).toBeDefined()
    expect(record.logs[record.logs.length - 1]!.text).toContain('继续禁止重复提交')
    for (const original of others) {
      const current = session.records.find(item => returnKey(item) === original.key)!
      expect({ state: current.state, updatedAt: current.updatedAt, lastSyncedAt: current.lastSyncedAt, logs: current.logs.length }).toEqual({ state: original.state, updatedAt: original.updatedAt, lastSyncedAt: original.lastSyncedAt, logs: original.logs })
    }
  })

  it('部分退款确认保存报价请求，回执后才写平台活动且不写实际退款', async () => {
    const record = session.records[0]!
    const originalHistory = JSON.parse(JSON.stringify(record.history))
    await open(record)
    await click('提出部分退款')
    expect(wrapper.get('.action-form').text()).not.toContain('允许买家保留商品')
    expect(wrapper.get('.action-form').find('[aria-label="允许买家保留商品"]').exists()).toBe(false)
    await wrapper.get('input[aria-label="部分退款金额"]').setValue('10.00')
    await wrapper.get('textarea[aria-label="退货退款处理说明"]').setValue('We can offer USD 10.00.')
    await select('系统售后原因', '退差价')
    await click('确认内容')
    expect(wrapper.get('[data-title="确认提出部分退款"]').text()).toContain('USD 10.00')
    expect(wrapper.get('[data-title="确认提出部分退款"]').text()).not.toContain('商品安排')
    await click('确认提交')
    expect(record.outcome).toBe('pending')
    expect(record.state).toBe('RETURN_REQUESTED')
    expect(record.actualRefund).toBeNull()
    expect(record.history).toEqual(originalHistory)
    expect(record.pendingRequest?.body).toMatchObject({ decision: 'OFFER_PARTIAL_REFUND', partialRefundAmount: { currency: 'USD', value: 10 }, comments: { content: 'We can offer USD 10.00.' } })
    expect(record.pendingRequest?.body).not.toHaveProperty('keepOriginalItem')
    expect(button('提出部分退款').attributes('disabled')).toBeDefined()
    await refreshCurrent()
    expect(record.state).toBe('PARTIAL_REFUND_REQUESTED')
    expect(record.outcome).toBe('confirmed')
    expect(record.actualRefund).toBeNull()
    expect(record.history).toHaveLength(originalHistory.length + 1)
    expect(wrapper.get('.return-history-panel').text()).toContain('We can offer USD 10.00.')
    expect(getReturnDetail(record).sellerDue).toBeNull()
    expect(wrapper.get('.responsibility-panel').text()).toContain('买家当前待办')
    expect(wrapper.get('.responsibility-panel').text()).toContain('回应部分退款报价')
  })

  it('同ID跨店的详情、确认提交与顶部刷新按复合身份隔离', async () => {
    const first = session.records[0]!
    const duplicate: ReturnRecord = { ...JSON.parse(JSON.stringify(first)), shopId: 'shop-return-collision', shopName: '退货同号另一演示店', buyerId: 'buyer_return_collision', orderNo: 'DEMO-ORDER-RETURN-COLLISION', systemOrderNo: undefined, orderProducts: null, outbounds: null }
    session.records.push(duplicate)
    await flushPromises()
    const second = session.records[session.records.length - 1]!
    expect(returnKey(second)).not.toBe(returnKey(first))
    await open(second)
    expect(wrapper.get('.return-detail .detail-heading').text()).toContain(second.shopName)
    expect(wrapper.get('.return-detail .detail-heading').text()).not.toContain(first.shopName)
    await click('接受退货')
    await select('系统售后原因', '无理由退货')
    await click('确认内容')
    expect(wrapper.get('[data-title="确认接受退货"]').text()).toContain(second.shopName)
    await click('确认提交')
    expect(second.outcome).toBe('pending')
    expect(first.outcome).toBe('idle')
    const firstSync = first.lastSyncedAt
    await refreshCurrent()
    expect(second.state).toBe('RETURN_LABEL_PENDING')
    expect(first.state).toBe('RETURN_REQUESTED')
    expect(first.lastSyncedAt).toBe(firstSync)
    await wrapper.get('.页签项.激活 [aria-label="关闭页签"]').trigger('click'); await flushPromises()
    await open(first)
    expect(wrapper.get('.return-detail .detail-heading').text()).toContain(first.shopName)
    expect(wrapper.get('.return-detail .detail-heading').text()).not.toContain(second.shopName)
  })

  it('已升级但缺Case编号仍阻断全部写操作，原Return状态和退回物流保留', async () => {
    const record = session.records[5]!
    record.caseId = null
    await open(record)
    expect(wrapper.get('.return-detail').text()).toContain('已升级纠纷')
    expect(wrapper.get('.return-detail').text()).toContain('关联编号待刷新')
    for (const label of ['接受退货', '提出部分退款', '发起退款', '发送消息', '请求 eBay 介入']) expect(button(label).attributes('disabled')).toBeDefined()
    await refreshCurrent()
    expect(record.status).toBe('ESCALATED')
    expect(record.state).toBe('ITEM_DELIVERED')
    expect(wrapper.get('.return-shipping-panel').text()).toContain(record.tracking!)
  })

  it('确认退款固定本次费用，来源金额改变后阻止沿用旧确认提交', async () => {
    const record = session.records[2]!, detail = getReturnDetail(record)
    await open(record)
    await click('发起退款', '.return-operation')
    expect(wrapper.get('.refund-edit-table').text()).toContain('商品价款')
    expect(wrapper.get('input[aria-label="退款金额 PURCHASE_PRICE"]').attributes('disabled')).toBeDefined()
    await select('系统售后原因', '质量问题')
    await click('确认内容')
    const confirmation = wrapper.get('[data-title="确认发起退款"]')
    expect(confirmation.text()).toContain('USD 29.50')
    expect(confirmation.text()).not.toContain('退回运费')
    detail.refund.items[0]!.max = '30.00'
    await flushPromises()
    await click('确认提交')
    expect(record.outcome).toBe('idle')
    expect(record.pendingRequest).toBeUndefined()
    expect(wrapper.get('.action-form .inline-error').text()).toMatch(/资料已变化.*重新确认/)
  })

  it('确认前回查发现平台已自动批准，不再发送旧的同意退货操作', async () => {
    const record = session.records[17]!
    await open(record)
    await click('接受退货', '.return-operation')
    await select('系统售后原因', '描述不符')
    await click('确认内容')
    expect(record.state).toBe('ITEM_READY_TO_SHIP')
    expect(record.outcome).toBe('idle')
    expect(record.pendingRequest).toBeUndefined()
    expect(wrapper.find('[data-title="确认接受退货"]').exists()).toBe(false)
    expect(wrapper.get('.action-form .inline-error').text()).toContain('不支持此操作')
    expect(wrapper.get('.responsibility-panel').text()).toContain('寄回退货')
    expect(wrapper.get('.return-history-panel').text()).toContain('平台自动批准')
  })

  it('新版RMA可留空确认，显示本次豁免且不提供地址修改表单', async () => {
    const record = session.records[9]!, detail = getReturnDetail(record)
    await open(record)
    await click('提供退货授权', '.return-operation')
    expect(wrapper.get('.action-form').text()).toContain('退货授权编号（选填）')
    expect(wrapper.get('.action-form').text()).toContain('eBay 后台办理')
    expect(wrapper.find('textarea[aria-label="退货退款处理说明"]').exists()).toBe(false)
    await click('确认内容')
    expect(wrapper.get('[data-title="确认提供退货授权"]').text()).toContain('不提供，本次免除编号要求')
    await click('确认提交')
    expect(record.pendingRequest?.body.variables).toEqual({ input: { returnId: record.id, rmaRequirementWaived: true } })
    expect(record.status).toBe('WAITING_FOR_RMA')
    await refreshCurrent()
    expect(record.outcome).toBe('confirmed')
    expect(detail.rmaRequired).toBe(true)
    expect(wrapper.get('.application-panel').text()).toContain('本次已免除编号要求')
    expect(wrapper.get('.return-shipping-panel').text()).toContain('本次无需提供编号')
  })

  it('旧RMA与面单分步办理，上传先保留待关联状态，平台回执后转买家寄回待办', async () => {
    const record = session.records[9]!, detail = getReturnDetail(record)
    delete detail.rmaGraphql
    await open(record)
    expect(wrapper.get('.application-panel').text()).toContain('RMA 策略要求提供编号')
    await click('提供退货授权', '.return-operation')
    await click('确认内容')
    expect(wrapper.get('.action-form .inline-error').text()).toContain('退货授权编号')
    await wrapper.get('input[aria-label="退货授权编号"]').setValue('RMA-TEST-100')
    await click('确认内容'); await click('确认提交')
    expect(record.pendingRequest?.body).toMatchObject({ decision: 'PROVIDE_RMA', RMANumber: 'RMA-TEST-100', rMAProvided: true })
    await refreshCurrent()
    expect(detail.rmaNumber).toBe('RMA-TEST-100')
    expect(record.state).toBe('RETURN_LABEL_PENDING')
    await click('提供退货面单', '.return-operation')
    const input = wrapper.get('input[aria-label="选择退货面单"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['%PDF-1.4 test'], '退回面单.pdf', { type: 'application/pdf' })] })
    await input.trigger('change')
    await vi.waitFor(() => expect(detail.files.some(file => file.fileName === '退回面单.pdf')).toBe(true))
    await flushPromises()
    const file = detail.files.find(item => item.fileName === '退回面单.pdf')!
    expect(file.fileStatus).toBe('CREATED')
    expect(record.state).toBe('RETURN_LABEL_PENDING')
    const historyBeforeLabel = record.history.length
    await select('面单文件', file.fileId)
    await select('退回承运商', 'USPS')
    await wrapper.get('input[aria-label="退货跟踪号"]').setValue('TEST-RETURN-100')
    await click('确认内容'); await click('确认提交')
    expect(record.pendingRequest?.path).toMatch(/\/add_shipping_label$/)
    expect(record.pendingRequest?.body).toMatchObject({ labelAction: 'UPLOAD_LABEL', fileId: file.fileId, trackingNumber: 'TEST-RETURN-100', carrierEnum: 'USPS' })
    expect(file.fileStatus).toBe('CREATED')
    expect(record.history).toHaveLength(historyBeforeLabel)
    await refreshCurrent()
    expect(file.fileStatus).toBe('PUBLISHED')
    expect(record.state).toBe('ITEM_READY_TO_SHIP')
    expect(detail.sellerDue).toBeNull()
    expect(detail.buyerDue?.activity).toBe('BUYER_MARK_RETURN_SHIPPED')
    expect(record.actualRefund).toBeNull()
  })

  it('确认收到退货与退款分开，收到回执后才显示确认收货并开放退款', async () => {
    const record = session.records[11]!, detail = getReturnDetail(record)
    await open(record)
    await click('确认收到退货', '.return-operation')
    await click('确认内容'); await click('确认提交')
    expect(record.received).toBe(false)
    expect(record.pendingRequest?.path).toMatch(/\/mark_as_received$/)
    expect(record.actualRefund).toBeNull()
    await refreshCurrent()
    expect(record.received).toBe(true)
    expect(detail.shipments.every(shipment => shipment.markAsReceived)).toBe(true)
    expect(record.actualRefund).toBeNull()
    expect(button('发起退款', '.return-operation').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.return-shipping-panel').text()).toContain('已确认')
  })

  it('部分读取失败保留金额和完整刷新时间，不能把失败当新资格确认', async () => {
    const record = session.records[16]!, detail = getReturnDetail(record), lastComplete = record.lastSyncedAt
    await open(record)
    expect(wrapper.get('.refund-detail-panel').text()).toContain('USD 49.90')
    await refreshCurrent()
    expect(record.lastSyncedAt).toBe(lastComplete)
    expect(detail.readStatus.detail.status).toBe('failed')
    expect(wrapper.get('.return-source-status').text()).toContain('部分资料尚未完成刷新')
    expect(button('接受退货', '.return-operation').attributes('disabled')).toBeDefined()
    await click('发送消息', '.return-operation')
    await wrapper.get('textarea[aria-label="退货退款处理说明"]').setValue('Please confirm the return details.')
    await click('确认内容')
    expect(wrapper.find('[data-title="确认发送消息"]').exists()).toBe(false)
    expect(wrapper.get('.action-form .inline-error').text()).toContain('资料核验未完成')
    expect(record.pendingRequest).toBeUndefined()
  })

  it('无申请店铺仍可选择并同步新申请，关键词不会缩小店铺刷新范围', async () => {
    const shops = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '店铺')!
    expect(shops.props('options')).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'demo-new-us' })]))
    shops.vm.$emit('update:modelValue', ['demo-new-us'])
    await wrapper.get('input[aria-label="退货退款申请搜索内容"]').setValue('WILL-NOT-MATCH')
    await click('查询')
    expect(listRows()).toHaveLength(0)
    await click('刷新数据', '.returns-toolbar')
    expect(session.records.filter(row => row.shopId === 'demo-new-us')).toHaveLength(1)
    expect(listRows()).toHaveLength(0)
    await wrapper.get('input[aria-label="退货退款申请搜索内容"]').setValue('')
    await click('查询')
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]!.text()).toContain('DEMO-RT-NEW-001')
  })

  it('纠纷保留后台来源URL但不显示eBay后台办理入口', async () => {
    const record = session.records[5]!, detail = getReturnDetail(record)
    await open(record)
    expect(wrapper.get('.case-panel').find('a').exists()).toBe(false)
    detail.caseUrl = 'https://www.ebay.com.evil.example/case/123'
    await flushPromises()
    expect(wrapper.get('.case-panel').find('a').exists()).toBe(false)
    detail.caseUrl = 'https://www.ebay.com/return/DEMO?source=case'
    await flushPromises()
    expect(wrapper.get('.case-panel').find('a').exists()).toBe(false)
    expect(detail.caseUrl).toBe('https://www.ebay.com/return/DEMO?source=case')
  })
})
