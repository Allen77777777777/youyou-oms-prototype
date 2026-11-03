import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ReviewPage from './eBay评价页面.vue'
import ContactBuyer from './联系买家.vue'
import { reviewSession, resetReviewSession } from './会话'
import { awaitingReviewSession, resetAwaitingReviewSession } from './未收到评价会话'
import type { AwaitingReviewOrder } from './未收到评价模型'
import { mailSession, resetMailSession } from '../eBay站内信/会话'
import { discardReviewContactDraft, getReviewContactBlockedReason, getReviewContactConversation, getReviewContactDraft, getReviewContactIdentity, getReviewContactRecord, resetReviewContactSession, sendReviewContact } from './联系买家模型'

const targetId = 'awaiting:AWAIT-CONTACT-TEST'
const fixture = (): AwaitingReviewOrder => ({
  id: 'AWAIT-CONTACT-TEST', omsOrderNo: 'OMS-AWAIT-CONTACT', shopId: 'shop-us', shopName: '演示店铺-US', buyerId: 'await_contact_demo', orderNo: 'DEMO-AWAIT-CONTACT',
  platform: 'eBay', processingStatus: '已发货', shippedAt: '2026-10-20T10:00:00+08:00', outboundStatuses: ['已出库'], trackingNumbers: ['DEMO-AWAIT-CONTACT-TRACK'], coverage: 'complete', association: 'confirmed', notes: [],
  lines: [{ id: 'AWAIT-CONTACT-L1', orderLineItemId: 'AWAIT-CONTACT-FL1', listingId: 'AWAIT-CONTACT-ITEM', title: '折叠收纳盒', sku: 'DEMO-STORAGE', platformSku: 'EBAY-STORAGE', quantity: 1, association: 'confirmed' }],
})
let wrapper: VueWrapper | undefined
beforeEach(() => {
  resetReviewSession(); resetAwaitingReviewSession(); resetMailSession(); resetReviewContactSession()
  awaitingReviewSession.orders = [fixture()]
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks() })
const body = 'Thank you for your purchase. Please contact us if you need any assistance.'
const FloatingShell = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="测试浮层" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' }

describe('未收到评价订单联系接入', () => {
  it('按独立订单目标首发进入共享站内信，不创建评价、来信或伪造OMS关联', async () => {
    vi.useFakeTimers()
    const reviews = JSON.stringify(reviewSession), orders = JSON.stringify(awaitingReviewSession.orders)
    const count = mailSession.conversations.length
    expect(getReviewContactRecord(targetId)).toMatchObject({ buyerId: 'await_contact_demo', title: '折叠收纳盒', orderLineItemId: '' })
    expect(getReviewContactRecord(targetId)).not.toHaveProperty('orderId')
    getReviewContactDraft(targetId)!.body = body
    const pending = sendReviewContact(targetId, getReviewContactIdentity(targetId))
    await vi.advanceTimersByTimeAsync(300)
    expect(await pending).toMatchObject({ ok: true, delivery: 'success' })
    const conversation = getReviewContactConversation(targetId)!
    expect(mailSession.conversations).toHaveLength(count + 1)
    expect(conversation).toMatchObject({ shopId: 'shop-us', buyerId: 'await_contact_demo', association: 'none', relatedOrderIds: [] })
    expect(conversation.messages).toHaveLength(1)
    expect(conversation.messages[0]).toMatchObject({ kind: 'outgoing', body, delivery: 'success', markProcessedOnSuccess: false })
    expect(JSON.stringify(reviewSession)).toBe(reviews)
    expect(JSON.stringify(awaitingReviewSession.orders)).toBe(orders)
  })

  it('采集不完整、身份重复和发货资格变化均阻断联系', () => {
    awaitingReviewSession.orders[0]!.coverage = 'incomplete'
    expect(getReviewContactBlockedReason(targetId)).toContain('采集')
    awaitingReviewSession.orders[0]!.coverage = 'complete'
    awaitingReviewSession.orders.push(fixture())
    expect(getReviewContactIdentity(targetId)).toBe('')
    awaitingReviewSession.orders = [fixture()]
    awaitingReviewSession.orders[0]!.processingStatus = '待发货'
    expect(getReviewContactBlockedReason(targetId)).toBeTruthy()
  })

  it('打开后新增买家评价会阻断旧身份提交，而不受隐藏评价有效统计口径影响', async () => {
    const identity = getReviewContactIdentity(targetId)
    getReviewContactDraft(targetId)!.body = body
    reviewSession.reviews.push({ ...reviewSession.reviews[0]!, id: 'AWAIT-NEW-BUYER-FEEDBACK', shopId: 'shop-us', buyerId: 'await_contact_demo', orderLineItemId: 'AWAIT-CONTACT-FL1', listingId: 'AWAIT-CONTACT-ITEM', automated: false, platformState: 'HIDDEN' })
    expect((await sendReviewContact(targetId, identity)).ok).toBe(false)
    expect(getReviewContactIdentity(targetId)).toBe('')
    expect(mailSession.conversations.some(c => c.buyerId === 'await_contact_demo')).toBe(false)
  })

  it('未评价商品范围变化后必须重新打开，不能沿用旧窗口身份', async () => {
    const identity = getReviewContactIdentity(targetId)
    getReviewContactDraft(targetId)!.body = body
    awaitingReviewSession.orders[0]!.lines.push({ ...fixture().lines[0]!, id: 'AWAIT-CONTACT-L2', orderLineItemId: 'AWAIT-CONTACT-FL2' })
    expect(getReviewContactBlockedReason(targetId, identity)).toContain('变化')
    expect((await sendReviewContact(targetId, identity)).ok).toBe(false)
  })

  it('结果待核查阻断重复发送，关闭按对象清空草稿', async () => {
    vi.useFakeTimers()
    const draft = getReviewContactDraft(targetId)!
    draft.body = body
    const pending = sendReviewContact(targetId, getReviewContactIdentity(targetId), { outcome: 'unknown' })
    expect((await sendReviewContact(targetId, getReviewContactIdentity(targetId))).ok).toBe(false)
    await vi.advanceTimersByTimeAsync(300)
    expect(await pending).toMatchObject({ ok: false, delivery: 'unknown' })
    expect(getReviewContactBlockedReason(targetId)).toContain('待核查')
    discardReviewContactDraft(draft)
    expect(draft).toEqual({ body: '', attachments: [] })
    expect(getReviewContactConversation(targetId)!.messages).toHaveLength(1)
  })

  it.each(['received', 'awaiting'])('从%s入口发信后，另一入口复用同一交易的待核查门禁', async first => {
    vi.useFakeTimers()
    const auto = reviewSession.reviews.find(review => review.automated)!
    const order = fixture()
    Object.assign(order, { shopId: auto.shopId, shopName: auto.shopName, buyerId: auto.buyerId, orderNo: auto.orderNo })
    Object.assign(order.lines[0]!, { orderLineItemId: auto.orderLineItemId, listingId: auto.listingId })
    awaitingReviewSession.orders = [order]
    const firstId = first === 'received' ? auto.id : targetId
    const secondId = first === 'received' ? targetId : auto.id
    getReviewContactDraft(firstId)!.body = body
    const pending = sendReviewContact(firstId, getReviewContactIdentity(firstId), { outcome: 'unknown' })
    expect(getReviewContactBlockedReason(secondId)).toContain('发送')
    await vi.advanceTimersByTimeAsync(300)
    expect(await pending).toMatchObject({ delivery: 'unknown' })
    expect(getReviewContactConversation(secondId)).toBe(getReviewContactConversation(firstId))
    expect(getReviewContactBlockedReason(secondId)).toContain('待核查')
    getReviewContactDraft(secondId)!.body = body
    expect((await sendReviewContact(secondId, getReviewContactIdentity(secondId))).ok).toBe(false)
    expect(getReviewContactConversation(firstId)!.messages).toHaveLength(1)
  })

  it('父工作台可切换新页签并打开真实联系组件，切走关闭且不生成评价', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/ebay-service/reviews', component: ReviewPage }] })
    await router.push('/oms/ebay-service/reviews'); await router.isReady()
    wrapper = mount(ReviewPage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: FloatingShell, ElDrawer: FloatingShell } } })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(tab => tab.text())).toEqual(['收到的评价', '未收到买家评价', '给买家好评'])
    await tabs[1]!.trigger('click'); await flushPromises()
    const row = wrapper.findAll('.awaiting-review-table .el-table__row').find(row => row.text().includes('DEMO-AWAIT-CONTACT'))!
    await row.findAll('button').find(button => button.text() === '联系买家')!.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ContactBuyer).props()).toMatchObject({ modelValue: true, reviewId: targetId })
    expect(wrapper.get('[data-title="联系买家"]').text()).toContain('await_contact_demo')
    getReviewContactDraft(targetId)!.body = 'Unsaved contact draft'
    await tabs[2]!.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ContactBuyer).props('modelValue')).toBe(false)
    expect(getReviewContactDraft(targetId)!.body).toBe('')
    expect(reviewSession.reviews.some(review => review.id === targetId)).toBe(false)
  }, 15000)
})
