import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick, reactive } from 'vue'
import Detail from './售后单详情.vue'
import Shipping from './退回物流.vue'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords } from './会话'
import { initializeAfterSaleDemo } from './演示数据'
import { createReturnData, returnSession } from '../eBay退换货申请/数据'

let wrapper: VueWrapper
beforeEach(() => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  returnSession.records = createReturnData()
  afterSaleRecords.value = []
  initializeAfterSaleDemo()
})
afterEach(() => wrapper?.unmount())
async function detail(kind: '重发' | '退货' | '全额退款' | '部分退款' = '重发') {
  const record = afterSaleRecords.value.find(value => value.kind === kind)!
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(Detail, { props: { record }, global: { plugins: [router], directives: { prototype: {} } } })
  await flushPromises()
  return record
}

describe('售后单详情办理闭环', () => {
  it('重发单同时展示来源两条退回运单，送达不变为本单仓库实收', async () => {
    await detail()
    const shipping = wrapper.get('[aria-label="来源申请的退回物流"]')
    expect(shipping.text()).toContain('DEMO-RETURN-003')
    expect(shipping.text()).toContain('DEMO-RETURN-003-B')
    expect(shipping.findAll('.el-table__body .el-table__row')).toHaveLength(2)
    expect(wrapper.get('.case-metrics').text()).toContain('本次仓库实收不适用')
    expect(shipping.text()).toContain('未按本次处理商品分摊')
    await shipping.find('.el-table__expand-icon').trigger('click')
    await nextTick()
    expect(shipping.text()).toContain('卖家确认收货')
    expect(shipping.text()).toContain('查看退回轨迹')
    expect(shipping.text()).toContain('承运商已送达退回地址')
  })

  it.each(['退货', '全额退款', '部分退款'] as const)('%s单均保留来源物流区域', async kind => {
    await detail(kind)
    expect(wrapper.find('[aria-label="来源申请的退回物流"]').exists()).toBe(true)
  })

  it('SUMMARY省略订单号不丢买家、物流与退款提示，已知冲突则阻断', async () => {
    const record = await detail()
    const row = returnSession.records.find(value => value.id === record.returnId && value.shopId === record.shopId)!
    row.orderNo = ''
    row.detail!.refund.buyerActual = { value: '5.00', currency: 'USD' }
    row.pendingAction = 'refund'; row.outcome = 'unknown'; row.pendingAmount = 10
    await nextTick()
    expect(wrapper.text()).toContain('5.00 USD')
    expect(wrapper.text()).toContain('未确认退款')
    expect(wrapper.find('[aria-label="查看买家 ' + row.buyerId + ' 的详情"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('DEMO-RETURN-003-B')
    row.orderNo = 'CONFLICT-ORDER'
    await nextTick()
    expect(wrapper.text()).not.toContain('DEMO-RETURN-003-B')
    expect(wrapper.text()).not.toContain('5.00 USD')
  })

  it('详情重复刷新留两次主动核查记录，不新增售后或重发订单', async () => {
    const record = await detail()
    const count = afterSaleRecords.value.length
    const refresh = () => wrapper.findAll('button').find(node => node.text() === '刷新办理结果')!
    await refresh().trigger('click'); await flushPromises()
    await refresh().trigger('click'); await flushPromises()
    expect(afterSaleRecords.value).toHaveLength(count)
    expect(record.approval).toBe('待审核')
    expect(record.manualOrderNo).toBeUndefined()
    expect(record.resultCheck?.operator).toBe(activeAfterSaleActor.value.name)
    expect(record.logs?.filter(log => log.action === '刷新办理结果')).toHaveLength(2)
    expect(wrapper.get('[aria-label="办理结果查询"]').text()).not.toContain('尚未查询')
  })

  it('重发手工单错链时不展示另一订单的包裹或提供跳转', async () => {
    const record = await detail()
    record.approval = '已审核'
    record.manualOrderNo = record.systemOrderNo
    await nextTick(); await flushPromises()
    expect(wrapper.text()).toContain('重发订单关联待核查')
    expect(wrapper.find('.dispatch-table').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('DEMO-ORIGINAL-SHIP-3')
    const labels = wrapper.findAll('button').filter(node => node.text() === record.manualOrderNo)
    // 原系统订单入口仍存在，但没有额外的错链“重发手工订单”跳转。
    expect(labels).toHaveLength(1)
  })

  it('来源隐藏不暴露运单或旧面单，失败旧资料显示成功读取时间', async () => {
    const row = reactive(createReturnData()[2]!)
    wrapper = mount(Shipping, { props: { row }, global: { directives: { prototype: {} } } })
    row.detail!.readStatus.detail = { status: 'failed', attemptedAt: '2026-11-13T09:00:00Z', succeededAt: '2026-11-12T01:00:00Z', error: '申请详情读取失败' }
    await wrapper.setProps({ row: { ...row } })
    await flushPromises()
    expect(wrapper.text()).toContain('2026-11-12 09:00:00')
    expect(wrapper.text()).toContain('上次资料')
    expect(wrapper.text()).toContain('DEMO-RETURN-003-B')
    expect(wrapper.find('.label-response').exists()).toBe(false)
    row.detail!.contentOnHold = true
    await wrapper.setProps({ row: { ...row } })
    await flushPromises()
    expect(wrapper.text()).toContain('平台已隐藏')
    expect(wrapper.text()).not.toContain('DEMO-RETURN-003')
  })
})
