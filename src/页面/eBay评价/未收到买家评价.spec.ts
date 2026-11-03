import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import AwaitingReviews from './未收到买家评价.vue'
import { resetReviewSession, reviewSession } from './会话'
import type { AwaitingReviewOrder, AwaitingReviewRow } from './未收到评价模型'
import * as model from './未收到评价模型'
import type { ReviewRecord } from './类型'

const { push, source } = vi.hoisted(() => ({ push: vi.fn(), source: { orders: [] as AwaitingReviewOrder[] } }))
vi.mock('vue-router', async importOriginal => ({ ...await importOriginal<typeof import('vue-router')>(), useRouter: () => ({ push }) }))
vi.mock('./未收到评价会话', () => ({ getAwaitingReviewOrders: () => source.orders }))
vi.mock('./联系买家模型', () => ({ getReviewContactBlockedReason: () => undefined }))

const FloatingShell = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="测试浮层" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' }
let wrapper: VueWrapper
const fixture = (id: string, patch: Partial<AwaitingReviewOrder> = {}): AwaitingReviewOrder => ({
  id, omsOrderNo: `OMS-${id}`, shopId: 'shop-us', shopName: '跨类目演示店', buyerId: `buyer_${id}`, orderNo: `ORDER-${id}`,
  platform: 'eBay', processingStatus: '已发货', shippedAt: '2026-10-20T10:00:00+08:00', outboundStatuses: ['已出库'], trackingNumbers: [`TRACK-${id}`], coverage: 'complete', association: 'confirmed', notes: [],
  lines: [{ id: `${id}-L1`, orderLineItemId: `${id}-FL1`, listingId: `ITEM-${id}`, title: `收纳盒-${id}`, sku: `SKU-${id}`, platformSku: `EB-${id}`, quantity: 1, association: 'confirmed' }], ...patch,
})
function listRow(orderNo: string): DOMWrapper<Element> {
  const row = wrapper.findAll('.awaiting-review-table .el-table__body-wrapper .el-table__row').find(item => item.text().includes(orderNo))
  if (!row) throw new Error(`未找到订单 ${orderNo}`)
  return row
}
async function click(label: string, scope?: DOMWrapper<Element>) {
  const button = (scope ?? wrapper).findAll('button').find(item => item.text().trim() === label)
  if (!button) throw new Error(`未找到按钮 ${label}`)
  await button.trigger('click'); await flushPromises()
}
const queue = (label: string) => wrapper.findAll('.review-queues button').find(button => button.text().startsWith(label))!
beforeEach(() => {
  resetReviewSession(); push.mockReset(); reviewSession.reviews = []; reviewSession.buyerFeedback = []
  source.orders = reactive([fixture('A'), fixture('B', { coverage: 'incomplete' })])
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  wrapper = mount(AwaitingReviews, { attachTo: document.body, global: { directives: { prototype: {} }, stubs: { ElDialog: FloatingShell, ElDrawer: FloatingShell } } })
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('未收到买家评价订单页签', () => {
  it('出库状态独立展示，物流轨迹只占位且不提供轨迹状态筛选', async () => {
    await flushPromises()
    expect(wrapper.text()).toContain('出库状态')
    expect(wrapper.text()).toContain('物流轨迹')
    expect(listRow('ORDER-A').text()).toContain('已出库')
    expect(listRow('ORDER-A').text()).toContain('待接入')
    expect(wrapper.text()).not.toMatch(/运输中|已签收/)
    expect(wrapper.findAllComponents({ name: '多选筛选' }).some(component => component.props('placeholder') === '物流状态')).toBe(false)
    expect(wrapper.findAllComponents({ name: '多选筛选' }).some(component => component.props('placeholder') === '出库状态')).toBe(true)
    await click('查看订单信息', listRow('ORDER-A'))
    const detail = wrapper.get('[data-title="订单与评价跟踪"]').text()
    expect(detail).toContain('出库状态'); expect(detail).toContain('已出库')
    expect(detail).toContain('物流轨迹状态'); expect(detail).toContain('待接入')
    expect(detail).not.toMatch(/运输中|已签收/)
  })
  it('默认只显示已确认未评价订单；待核对独立且禁止联系，不提供回复评价', async () => {
    await flushPromises()
    expect(listRow('ORDER-A').text()).toContain('暂无评价')
    expect(wrapper.text()).not.toContain('ORDER-B')
    expect(wrapper.text()).not.toContain('回复评价')
    await queue('待核对').trigger('click'); await flushPromises()
    const row = listRow('ORDER-B')
    expect(row.text()).toContain('待核对')
    expect(row.findAll('button').find(button => button.text().trim() === '联系买家')!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('ORDER-A')
  })

  it('同订单只展示尚未评价商品，隐藏评价仍证明曾经评价', async () => {
    const order = source.orders[0]!
    order.lines.push({ ...order.lines[0]!, id: 'A-L2', orderLineItemId: 'A-FL2', title: '已评价台灯', sku: 'REVIEWED-SKU' })
    const base = (await import('./数据')).createReviews()[0]!
    reviewSession.reviews.push({ ...base, id: 'BUYER-RECEIVED', shopId: order.shopId, buyerId: order.buyerId, orderLineItemId: 'A-FL2', listingId: order.lines[1]!.listingId, automated: false, platformState: 'HIDDEN' } as ReviewRecord)
    await flushPromises()
    const row = listRow('ORDER-A')
    expect(row.text()).toContain('未评价 1 / 2 项')
    expect(row.text()).not.toContain('已评价台灯')
    await row.get('.el-table__expand-icon').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('未收到买家评价的商品')
    expect(wrapper.text()).not.toContain('REVIEWED-SKU')
  })

  it('队列切换不应用未查询草稿，查询后按已应用条件过滤且可重置', async () => {
    await flushPromises()
    await wrapper.get('input[aria-label="未收到评价搜索内容"]').setValue('不存在的订单')
    await queue('待核对').trigger('click'); await flushPromises()
    expect(listRow('ORDER-B').exists()).toBe(true)
    await queue('未收到买家评价').trigger('click'); await flushPromises()
    expect(listRow('ORDER-A').exists()).toBe(true)
    await click('查询')
    expect(wrapper.text()).toContain('没有符合条件的未评价订单')
    await click('重置')
    expect(listRow('ORDER-A').exists()).toBe(true)
  })

  it('商品搜索只展示匹配的待评价商品，保留整单剩余未评数量', async () => {
    source.orders[0]!.lines.push({ ...source.orders[0]!.lines[0]!, id: 'A-L2', orderLineItemId: 'A-FL2', title: '未命中台灯', sku: 'OTHER-SKU' })
    await flushPromises()
    wrapper.findComponent({ name: '字段搜索' }).vm.$emit('update:field', 'sku'); await flushPromises()
    await wrapper.get('input[aria-label="未收到评价搜索内容"]').setValue('SKU-A')
    await click('查询')
    const row = listRow('ORDER-A')
    expect(row.text()).toContain('匹配 1 项 · 2 项未评价')
    await row.get('.el-table__expand-icon').trigger('click'); await flushPromises()
    expect(wrapper.text()).not.toContain('未命中台灯')
    expect(wrapper.text()).not.toContain('OTHER-SKU')
  })

  it('发货天数非法时不应用查询，合法范围以北京时间自然日差筛选', async () => {
    await flushPromises()
    await wrapper.get('input[aria-label="发货最少天数"]').setValue('10')
    await wrapper.get('input[aria-label="发货最多天数"]').setValue('2')
    await click('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('最小发货天数不能大于最大天数')
    expect(listRow('ORDER-A').text()).toContain('已发货 9 天')
    await wrapper.get('input[aria-label="发货最多天数"]').setValue('20')
    await click('查询')
    expect(wrapper.text()).toContain('没有符合条件的未评价订单')
  })

  it('联系买家只发出独立订单目标，不伪造收到评价', async () => {
    await flushPromises()
    await click('联系买家', listRow('ORDER-A'))
    expect(wrapper.emitted('contact')).toEqual([['awaiting:A']])
    expect(reviewSession.reviews).toHaveLength(0)
    expect(source.orders[0]!.notes).toHaveLength(0)
  })

  it('添加备注保留操作者时间，关闭后重新打开为空且订单状态不变', async () => {
    await flushPromises()
    await click('添加备注', listRow('ORDER-A'))
    await wrapper.get('textarea[aria-label="未评价订单内部备注"]').setValue('已完成配送回访，等待买家反馈。')
    await click('保存备注')
    expect(source.orders[0]!.notes).toEqual([expect.objectContaining({ text: '已完成配送回访，等待买家反馈。', by: '客服01', at: expect.any(String) })])
    expect(listRow('ORDER-A').text()).toContain('已完成配送回访')
    await click('添加备注', listRow('ORDER-A'))
    expect((wrapper.get('textarea[aria-label="未评价订单内部备注"]').element as HTMLTextAreaElement).value).toBe('')
    expect(source.orders[0]!.processingStatus).toBe('已发货')
    expect(reviewSession.reviews).toHaveLength(0)
  })

  it('无可靠共享订单关联时打开只读上下文，不跳转空详情', async () => {
    await flushPromises()
    await click('查看订单信息', listRow('ORDER-A'))
    expect(wrapper.get('[data-title="订单与评价跟踪"]').text()).toContain('收纳盒-A')
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('回复评价')
  })

  it('导出所选主行，查询后清除勾选并恢复导出当前结果', async () => {
    source.orders.push(fixture('C')); await flushPromises()
    const exported = vi.spyOn(model, 'exportAwaitingReviewCsv').mockReturnValue('csv')
    const createObjectURL = vi.fn(() => 'blob:awaiting-test'), revokeObjectURL = vi.fn()
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'), revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      const row = model.projectAwaitingReviewOrders(source.orders, reviewSession.reviews, reviewSession.buyerFeedback).find(item => item.id === 'A')!
      const component = wrapper.findComponent({ name: 'ElTable' })
      component.vm.$emit('selection-change', [row]); await flushPromises()
      await click('导出所选')
      expect((exported.mock.calls[0]![0] as AwaitingReviewRow[]).map(item => item.id)).toEqual(['A'])
      await click('查询'); await click('导出')
      expect((exported.mock.calls[1]![0] as AwaitingReviewRow[]).map(item => item.id)).toEqual(['A', 'C'])
    } finally {
      if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor); else delete (URL as Partial<typeof URL>).createObjectURL
      if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor); else delete (URL as Partial<typeof URL>).revokeObjectURL
    }
  })
})
