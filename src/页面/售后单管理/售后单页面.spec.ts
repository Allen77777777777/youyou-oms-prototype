import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElMessage } from 'element-plus'
import Page from './售后单管理页面.vue'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords, type AfterSaleRecord } from './会话'
import { initializeAfterSaleDemo } from './演示数据'
import { 共享订单 } from '../订单处理/演示会话'
import { 手工订单路由 } from '../手工订单/模型'
import { 路由仓库键 } from '../订单处理/仓库物流选择模型'
import WarehouseFields from '../订单处理/仓库物流选择.vue'
import { returnSession } from '../eBay退换货申请/数据'
import { stateNames } from '../eBay退换货申请/模型'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { currentHandlerId } from '@/组件/客服处理人/处理人'

const path = '/oms/ebay-service/after-sale-orders'
const shell = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :aria-label="title"><slot /><footer><slot name="footer" /></footer></section>' }
const target = { template: '<div />' }
let wrapper: VueWrapper
let router: Router

async function settle() { await flushPromises(); await nextTick() }
const recordOf = (kind: AfterSaleRecord['kind']) => {
  const record = afterSaleRecords.value.find(row => row.kind === kind)
  if (!record) throw Error('未找到售后单样例：' + kind)
  return record
}
async function show(no: string) { await router.push({ path, query: { documentNo: no } }); await settle() }
function button(label: string) {
  const node = wrapper.findAll('button').find(item => item.text().trim() === label)
  if (!node) throw Error('未找到按钮：' + label)
  return node
}
beforeEach(async () => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  afterSaleRecords.value = []
  initializeAfterSaleDemo()
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path, component: Page },
    { path: '/oms/ebay-service/returns/:shopId/:returnId', name: 'oms-ebay-return-detail', component: target },
    { path: '/oms/self-fulfillment/processing', name: 'oms-order-processing', component: target },
    { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: target },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: shell, ElDrawer: shell } } })
  await settle()
})
afterEach(() => {
  wrapper?.unmount()
  ElMessage.closeAll()
  const generated = new Set(afterSaleRecords.value.map(row => row.manualOrderNo).filter(Boolean))
  共享订单.value = 共享订单.value.filter(order => !generated.has(order.systemOrderNo))
  activeAfterSaleActor.value = afterSaleActors[0]!
})

describe('售后单管理联动', () => {
  it('在待审核队列单选并直接审核，通过后移出队列，平台售后状态仍等于来源申请状态', async () => {
    const record = recordOf('重发')
    expect(wrapper.get('.table-area').text()).toContain('平台售后状态')
    expect(wrapper.get('.table-area').text()).toContain('等待重发审核')
    const tab = (label: string) => wrapper.findAll('[role="tab"]').find(node => node.text().startsWith(label))!
    await tab('待审核').trigger('click')
    expect(button('审核').attributes('disabled')).toBeDefined()
    const radio = () => wrapper.get<HTMLInputElement>('input[aria-label="选择审核 ' + record.no + '"]')
    await radio().setValue()
    await button('审核').trigger('click')
    expect(wrapper.find('.after-detail').exists()).toBe(false)
    expect(wrapper.get('[aria-label="审核重发"]').text()).toContain(record.no)
    await button('确认审核通过').trigger('click')
    await settle()
    expect(record.approval).toBe('已审核')
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(wrapper.findAll('.table-area input[type="radio"]')).toHaveLength(0)
    expect(button('审核').attributes('disabled')).toBeDefined()
    await tab('已审核').trigger('click')
    const row = wrapper.get('.table-area .el-table__row')
    expect(row.text()).toContain(record.no)
    expect(row.get('.platform-state').text()).toBe(stateNames.ITEM_DELIVERED)
    expect(row.get('.platform-state').attributes('title')).toContain('ITEM_DELIVERED')
  })

  it('切页或换队列清空勾选，撤销权限后不能沿用旧勾选和审核弹窗', async () => {
    const record = recordOf('重发')
    afterSaleRecords.value.push(...Array.from({ length: 21 }, (_, n) => ({ ...record, no: 'PENDING-' + n })))
    const tab = (label: string) => wrapper.findAll('[role="tab"]').find(node => node.text().startsWith(label))!
    await tab('待审核').trigger('click')
    const firstRadio = () => wrapper.get<HTMLInputElement>('.table-area input[type="radio"]')
    expect(wrapper.findAll('.table-area input[type="radio"]')).toHaveLength(20)
    await firstRadio().setValue()
    expect(button('审核').attributes('disabled')).toBeUndefined()
    await wrapper.get('.el-pagination .btn-next').trigger('click')
    await settle()
    expect(wrapper.findAll('.table-area input[type="radio"]')).toHaveLength(2)
    expect(button('审核').attributes('disabled')).toBeDefined()
    await firstRadio().setValue()
    await tab('全部').trigger('click')
    await tab('待审核').trigger('click')
    expect(button('审核').attributes('disabled')).toBeDefined()
    await firstRadio().setValue()
    await button('审核').trigger('click')
    activeAfterSaleActor.value = afterSaleActors[1]!
    await settle()
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(firstRadio().attributes('disabled')).toBeDefined()
    expect(button('审核').attributes('disabled')).toBeDefined()
    expect(record.approval).toBe('待审核')
  })
  it('从全局入口切客服身份立即清除列表审核确认，切回运营也不恢复旧选择', async () => {
    const record = recordOf('重发')
    await wrapper.findAll('[role="tab"]').find(node => node.text().startsWith('待审核'))!.trigger('click')
    const radio = () => wrapper.get<HTMLInputElement>('input[aria-label="选择审核 ' + record.no + '"]')
    await radio().setValue()
    await button('审核').trigger('click')
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(true)
    currentHandlerId.value = 'staff-03'
    await settle()
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(button('审核').attributes('disabled')).toBeDefined()
    currentHandlerId.value = 'ops-01'
    await settle()
    expect(radio().element.checked).toBe(false)
    expect(button('审核').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(record.approval).toBe('待审核')
  })
  it('直接办理的部分退款在无需审核队列显示报价，不显示审核动作或虚构的实际退款，按店铺打开原申请', async () => {
    const record = recordOf('部分退款')
    const queue = wrapper.findAll('[role="tab"]').find(item => item.text().includes('无需审核'))!
    await queue.trigger('click')
    const rows = wrapper.findAll('.table-area .el-table__row')
    expect(rows.some(row => row.text().includes(recordOf('重发').no))).toBe(false)
    await button(record.no).trigger('click')
    await settle()
    const detail = wrapper.get('.after-detail')
    expect(detail.text()).toContain('无需审核')
    expect(detail.text()).toContain('等待买家决定')
    expect(detail.text()).toContain('实际退款金额—')
    expect(detail.text()).not.toContain('审核重发')
    await detail.findAll('button').find(item => item.text() === record.returnId)!.trigger('click')
    await settle()
    expect(router.currentRoute.value.params).toEqual({ shopId: record.shopId, returnId: record.returnId })
  })

  it('同一运营可明确自审，仅确认后生成一张手工订单，并可打开 OMS 的待审核订单', async () => {
    const record = recordOf('重发')
    await show(record.no)
    expect(record.createdBy).toBe(activeAfterSaleActor.value.name)
    await button('审核重发').trigger('click')
    const review = wrapper.get('[aria-label="审核重发"]')
    expect(review.text()).toContain(record.items[0]!.sku)
    expect(record.manualOrderNo).toBeUndefined()
    await button('修改收件信息').trigger('click')
    const phone = review.get('input[aria-label="重发联系电话"]')
    await phone.setValue('')
    await button('确认审核通过').trigger('click')
    expect(record.approval).toBe('待审核')
    expect(record.manualOrderNo).toBeUndefined()
    expect(review.get('[role="alert"]').text()).toContain('联系电话')
    await phone.setValue('0000000000')
    for (const [label, value] of Object.entries({ 收件人: '演示收件人', '国家 / 地区代码': 'US', 城市: 'Example City', 详细地址: '10 Example Avenue', 邮编: '90000' })) {
      const field = review.get<HTMLInputElement>('input[aria-label="重发' + label + '"]')
      if (!field.element.value) await field.setValue(value)
    }
    const warehouse = wrapper.findComponent(WarehouseFields)
    if (warehouse.exists()) {
      const route = 手工订单路由.value[0]!
      warehouse.vm.$emit('update:warehouse', 路由仓库键(route))
      warehouse.vm.$emit('update:channel', route.shippingChannelCode)
      await settle()
    }
    await button('确认审核通过').trigger('click')
    await settle()
    expect(record.approval).toBe('已审核')
    expect(record.reviewedBy).toBe(record.createdBy)
    const detail = wrapper.get('.after-detail')
    expect(detail.text()).toContain('OMS 处理状态待审核')
    expect(detail.findAll('button').some(item => item.text() === '审核重发')).toBe(false)
    await button(record.manualOrderNo!).trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('oms-order-processing')
    expect(router.currentRoute.value.query.systemOrderNo).toBe(record.manualOrderNo)
  })

  it('展示查看权限与审核权限的区别，切换操作人后不会保留确认框或可见范围外的详情', async () => {
    const record = recordOf('重发')
    await show(record.no)
    await button('审核重发').trigger('click')
    activeAfterSaleActor.value = afterSaleActors[1]!
    await settle()
    expect(wrapper.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(button('审核重发').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.after-detail').text()).toContain('没有此单的重发审核权限')
    activeAfterSaleActor.value = { ...afterSaleActors[2]!, shopIds: [] }
    await settle()
    expect(wrapper.find('.after-detail').exists()).toBe(false)
    expect(wrapper.text()).toContain('未找到可查看的售后单')
    expect(record.approval).toBe('待审核')
  })
  it('同申请先退货再退款可按店铺定位两笔，平台状态同源更新，库存实收与单笔退款各有归属', async () => {
    const refund = afterSaleRecords.value.find(row => row.kind === '全额退款' && row.returnId === 'DEMO-RT-007')!
    const accepted = afterSaleRecords.value.find(row => row.kind === '退货' && row.shopId === refund.shopId && row.returnId === refund.returnId)!
    await wrapper.get('button[aria-label="查看 DEMO-RT-007 的全部处理记录"]').trigger('click')
    const rows = wrapper.findAll('.table-area .el-table__row')
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.text().includes(refund.returnId))).toBe(true)
    await button(refund.no).trigger('click')
    await settle()
    expect(wrapper.get('.case-history').text()).toContain('2 笔')
    const source = returnSession.records.find(row => row.shopId === refund.shopId && row.id === refund.returnId)!
    const state = source.state
    try {
      source.state = 'ITEM_SHIPPED'
      await settle()
      expect(wrapper.get('.case-metrics').text()).toContain(stateNames.ITEM_SHIPPED)
    } finally { source.state = state }
    expect(wrapper.get('.case-metrics').text()).toContain('本次仓库实收不适用')
    await wrapper.get('.case-history').findAll('button').find(link => link.text() === accepted.no)!.trigger('click')
    await settle()
    expect(router.currentRoute.value.query.documentNo).toBe(accepted.no)
    expect(wrapper.get('.case-metrics').text()).toContain('本次实际退款不适用')
    expect(wrapper.get('.case-metrics').text()).toContain('本次仓库实收' + accepted.warehouseReceipts![0]!.quantity + ' 件')
  })

  it('列表显示本笔失败、待核查与拒绝结果，结果筛选待查询才生效且不改审核队列', async () => {
    const record = recordOf('部分退款')
    const failure = { ...record, no: 'RESULT-FAILED', executionResult: '平台提交失败' }
    const unknown = { ...record, no: 'RESULT-UNKNOWN', executionResult: '平台结果待核实' }
    const declined = { ...record, no: 'RESULT-DECLINED', executionResult: '买家已拒绝报价' }
    afterSaleRecords.value.push(failure, unknown, declined)
    await settle()
    const list = () => wrapper.get('.table-area')
    expect(list().text()).toContain('平台提交失败')
    expect(list().text()).toContain('平台结果待核实')
    expect(list().text()).toContain('买家已拒绝报价')
    const resultFilter = wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '本次办理结果')!
    resultFilter.vm.$emit('update:modelValue', ['失败'])
    await settle()
    expect(list().text()).toContain(unknown.no)
    await button('查询').trigger('click')
    expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(1)
    expect(list().text()).toContain(failure.no)
    expect(list().text()).not.toContain(unknown.no)
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('全部')
    resultFilter.vm.$emit('update:modelValue', ['待核查', '买家拒绝'])
    await settle()
    await button('查询').trigger('click')
    expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(2)
    expect(list().text()).toContain(unknown.no)
    expect(list().text()).toContain(declined.no)
    await button('重置').trigger('click')
    expect(list().text()).toContain(failure.no)
  })

  it('按任一退回运单号精确或多值查询重发单，来源读取失败、冲突、隐藏或无权限时不命中', async () => {
    const record = recordOf('重发')
    const source = returnSession.records.find(row => row.shopId === record.shopId && row.id === record.returnId)!
    const detail = source.detail!
    const prior = { orderNo: source.orderNo, held: detail.contentOnHold, read: detail.readStatus.detail.status, trackingRead: detail.shipments[0]!.readStatus }
    const search = wrapper.findComponent(FieldSearch)
    async function findTracking(value: string) {
      search.vm.$emit('update:field', 'returnTracking')
      search.vm.$emit('update:mode', 'exact')
      search.vm.$emit('update:modelValue', value)
      await settle()
      await button('查询').trigger('click')
      await settle()
    }
    try {
      for (const shipment of detail.shipments) {
        await findTracking(shipment.trackingNumber)
        expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(1)
        expect(wrapper.get('.table-area').text()).toContain(record.no)
      }
      await findTracking(detail.shipments.map(shipment => shipment.trackingNumber).join('\n'))
      expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(1)
      detail.shipments[0]!.readStatus = 'failed'
      await findTracking(detail.shipments[0]!.trackingNumber)
      expect(wrapper.get('.table-area').text()).toContain(record.no)
      detail.readStatus.detail.status = 'failed'
      await settle()
      expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(0)
      detail.readStatus.detail.status = 'success'
      source.orderNo = 'DIFFERENT-ORDER'
      await settle()
      expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(0)
      source.orderNo = prior.orderNo
      detail.contentOnHold = true
      await settle()
      expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(0)
      detail.contentOnHold = false
      activeAfterSaleActor.value = { ...afterSaleActors[2]!, shopIds: [] }
      await settle()
      expect(wrapper.findAll('.table-area .el-table__row')).toHaveLength(0)
    } finally {
      source.orderNo = prior.orderNo
      detail.contentOnHold = prior.held
      detail.readStatus.detail.status = prior.read
      detail.shipments[0]!.readStatus = prior.trackingRead
      activeAfterSaleActor.value = afterSaleActors[0]!
    }
  })

  it('来源省略订单号仍展示买家，明确订单冲突或隐藏时不展示来源买家', async () => {
    const record = recordOf('重发')
    const source = returnSession.records.find(row => row.shopId === record.shopId && row.id === record.returnId)!
    const prior = { orderNo: source.orderNo, held: source.detail!.contentOnHold }
    const buyerSelector = '.table-area button[aria-label="查看买家 ' + source.buyerId + ' 的详情"]'
    try {
      source.orderNo = ''
      await settle()
      expect(wrapper.find(buyerSelector).exists()).toBe(true)
      source.orderNo = 'DIFFERENT-ORDER'
      await settle()
      expect(wrapper.find(buyerSelector).exists()).toBe(false)
      source.orderNo = prior.orderNo
      source.detail!.contentOnHold = true
      await settle()
      expect(wrapper.find(buyerSelector).exists()).toBe(false)
    } finally { source.orderNo = prior.orderNo; source.detail!.contentOnHold = prior.held }
  })
})
