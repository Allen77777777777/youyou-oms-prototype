import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Page from './eBay取消订单申请页面.vue'
import OutboundPage from '../仓配管理/三方仓出库单页面.vue'
import MailPage from '../eBay站内信/eBay站内信页面.vue'
import { cancellationSession } from './会话'
import { createCancellations } from './模型'
import { mailSession, requestBuyerMailNavigation, resetMailSession } from '../eBay站内信/会话'
import { getBuyerIncomingMail } from './关联站内信'

let wrapper: VueWrapper | undefined
const shell = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' }
const routes = [
  { path: '/oms/ebay-service/cancellations', component: Page },
  { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div>订单详情</div>' } },
  { path: '/oms/warehouse-delivery/outbound-orders', component: OutboundPage },
  { path: '/oms/ebay-service/messages', component: MailPage },
]
async function start(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path); await router.isReady()
  wrapper = mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: shell, ElDialog: shell } } })
  await flushPromises(); return router
}
async function click(text: string) { await wrapper!.findAll('button').find(button => button.text().trim() === text)!.trigger('click'); await flushPromises() }
beforeEach(() => { cancellationSession.records = createCancellations(); resetMailSession() })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; ElMessage.closeAll() })

describe('取消申请详情导航', () => {
  it('OMS订单号打开共享详情路由，仓单号直接打开同一出库对象详情', async () => {
    const router = await start('/oms/ebay-service/cancellations')
    await click('CXL-DEMO-0001'); await click('OMS-DEMO-CXL-0001')
    expect(router.currentRoute.value.params.systemOrderNo).toBe('OMS-DEMO-CXL-0001')
    await router.push('/oms/ebay-service/cancellations'); await flushPromises()
    await click('CXL-DEMO-0002'); await click('CK-DEMO-CXL-0002-B')
    expect(router.currentRoute.value.query.outboundId).toBe('shared-CK-DEMO-CXL-0002-B')
    expect(wrapper!.text()).toContain('CK-DEMO-CXL-0002-B')
    expect(wrapper!.find('[data-title="三方仓出库单详情"]').exists()).toBe(true)
  }, 20000)
  it('点击买家来信定位原消息，主动打开后沿用整会话已读', async () => {
    const router = await start('/oms/ebay-service/cancellations')
    const source = cancellationSession.records[0]!, message = getBuyerIncomingMail(mailSession.conversations, source.shopId, source.buyer)[0]!
    await click(source.cancelId)
    await wrapper!.get(`button[aria-label="查看站内信 ${message.messageId}"]`).trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/oms/ebay-service/messages')
    expect(mailSession.activeId).toBe(message.conversationId)
    expect(wrapper!.find(`[data-message-id="${message.messageId}"]`).exists()).toBe(true)
    expect(mailSession.conversations.find(c => c.id === message.conversationId)!.unread).toBe(false)
    expect(mailSession.navigationTarget).toBeUndefined()
  }, 20000)
  it('来信不接受跨店、缺失或重复消息身份', () => {
    const c = mailSession.conversations[0]!, m = c.messages.find(m => m.kind === 'incoming')!
    expect(requestBuyerMailNavigation('other-shop', c.buyerId, c.id, m.id)).toBe(false)
    expect(requestBuyerMailNavigation(c.shopId, c.buyerId, c.id, 'missing')).toBe(false)
    c.messages.push({ ...m })
    expect(requestBuyerMailNavigation(c.shopId, c.buyerId, c.id, m.id)).toBe(false)
    expect(mailSession.navigationTarget).toBeUndefined()
  })
  it('已打开邮箱时消费新定位目标，忽略会话仍定位所点来信', async () => {
    await start('/oms/ebay-service/messages')
    const c = mailSession.conversations.find(c => c.source === 'buyer' && c.messages.some(m => m.kind === 'incoming' && !m.notice))!
    c.status = 'ignored'; c.unread = true
    const message = c.messages.find(m => m.kind === 'incoming' && !m.notice)!
    expect(requestBuyerMailNavigation(c.shopId, c.buyerId, c.id, message.id)).toBe(true)
    await flushPromises()
    expect(mailSession.folder).toBe('ignored'); expect(mailSession.activeId).toBe(c.id)
    expect(wrapper!.find(`[data-message-id="${message.id}"]`).exists()).toBe(true)
    expect(c.unread).toBe(false); expect(mailSession.navigationTarget).toBeUndefined()
  }, 20000)
  it('关联冲突时保留原编号和复制，取消详情不提供空跳转', async () => {
    cancellationSession.records[0]!.buyer = 'unmatched-demo-buyer'
    await start('/oms/ebay-service/cancellations'); await click('CXL-DEMO-0001')
    const context = wrapper!.get('.order-context')
    expect(context.text()).toContain('OMS-DEMO-CXL-0001')
    expect(context.findAll('button.link')).toHaveLength(0)
    expect(context.find('button[aria-label="复制OMS订单号"]').exists()).toBe(true)
    expect(wrapper!.get('.outbound-panel').findAll('button.link')).toHaveLength(0)
  })
})
