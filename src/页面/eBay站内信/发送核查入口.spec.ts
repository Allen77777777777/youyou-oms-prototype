import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import BuyerMail from '../eBay取消订单申请/买家站内信.vue'
import ContactBuyer from '../eBay评价/联系买家.vue'
import { resetReviewSession } from '../eBay评价/会话'
import { mailSession, resetMailSession } from './会话'
import { demoMailRecipient } from './申请收件身份'
import { resetMailAccessProfiles } from './权限与协作'
import { getVisibleBlockingMailVerifications, registerMailAttempt, resetMailVerification } from './发送核查'

let wrapper: VueWrapper
const DialogShell = {
  props: ['title', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>',
}
beforeEach(() => {
  currentHandlerId.value = 'staff-01'
  resetMailAccessProfiles(); resetMailSession(); resetReviewSession(); resetMailVerification()
})
afterEach(() => { wrapper?.unmount(); currentHandlerId.value = 'staff-01' })

async function settings() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  return { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: DialogShell, ReplyEditor: true } }
}

describe('来源业务页查看发送核查', () => {
  it('来源卡片即使发信被阻断，也能重新打开精确原尝试', async () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    const application = { kind: 'cancel' as const, applicationId: 'CANCEL-CHECK-1', shopId: c.shopId, shopName: c.shopName, orderNo: 'DEMO-1001' }
    c.messages.push({ id: 'source-original-attempt', kind: 'outgoing', sender: '客服01', at: '2026-11-11T02:00:00Z', body: 'Original send', delivery: 'unknown', originApplication: application })
    registerMailAttempt(c, c.messages[c.messages.length - 1]!)
    wrapper = mount(BuyerMail, {
      props: { shopId: c.shopId, buyerId: c.buyerId, application: { ...application, recipient: demoMailRecipient(c.shopId, c.buyerId) } },
      global: await settings(),
    })
    expect(wrapper.get('button.buyer-mail-compose').attributes('disabled')).toBeDefined()
    const link = wrapper.get('button[title="查看核查 source-original-attempt"]')
    await link.trigger('click')
    expect(wrapper.get('[data-title="发送结果核查"]').text()).toContain('source-original-attempt')
    await wrapper.get('[data-title="发送结果核查"] footer button').trigger('click')
    expect(wrapper.find('[data-title="发送结果核查"]').exists()).toBe(false)
    await link.trigger('click')
    expect(wrapper.get('[data-title="发送结果核查"]').text()).toContain('source-original-attempt')
  })

  it('联系弹窗的最近发送记录打开同一条待核查结果', async () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    c.messages.push({ id: 'review-original-attempt', kind: 'outgoing', sender: '客服01', at: '2026-11-11T02:00:00Z', body: 'Review contact', delivery: 'unknown' })
    wrapper = mount(ContactBuyer, { props: { modelValue: true, reviewId: 'REV-DEMO-01' }, global: await settings() })
    expect(wrapper.get('.review-contact-history').attributes('open')).toBeDefined()
    await wrapper.get('.review-contact-history button[title="查看核查 review-original-attempt"]').trigger('click')
    expect(wrapper.get('[data-title="发送结果核查"]').text()).toContain('review-original-attempt')
  })

  it('跨来源防重在当前用户无原店铺查看权时不返回核查目标', () => {
    const c = mailSession.conversations.find(item => item.shopId === 'shop-uk' && item.source === 'buyer')!
    c.messages.push({ id: 'restricted-provisional', kind: 'outgoing', sender: '客服01', at: '2026-11-11T02:00:00Z', body: 'Restricted send', delivery: 'unknown' })
    registerMailAttempt(c, c.messages[c.messages.length - 1]!, { provisional: true })
    const target = { shopId: c.shopId, buyerId: c.buyerId }
    expect(getVisibleBlockingMailVerifications(target).map(item => item.message.id)).toContain('restricted-provisional')
    currentHandlerId.value = 'staff-03'
    expect(getVisibleBlockingMailVerifications(target)).toEqual([])
  })
})
