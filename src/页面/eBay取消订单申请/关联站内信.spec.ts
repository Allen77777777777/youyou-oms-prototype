import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createConversations } from '../eBay站内信/数据'
import type { Conversation } from '../eBay站内信/类型'
import { formatBuyerMailTime, getBuyerIncomingMail } from './关联站内信'
import { mailSession, resetMailSession } from '../eBay站内信/会话'
import BuyerMail from './买家站内信.vue'

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return { ...createConversations()[0]!, messages: [{ id: 'message-1', kind: 'incoming', sender: 'buyer_demo_01', body: 'Hello from buyer', at: '2026-10-29T00:00:00Z' }], ...patch }
}

describe('取消申请关联买家站内信', () => {
  it('严格限定同店铺同买家，不采用跨店buyerDataScope或名称兜底', () => {
    const data = [conversation(), conversation({ id: 'other-shop', shopId: 'shop-uk' }), conversation({ id: 'other-buyer', buyerId: 'buyer_demo_02' })]
    expect(getBuyerIncomingMail(data, 'shop-us', 'buyer_demo_01').map(item => item.conversationId)).toEqual(['conv-01'])
    expect(getBuyerIncomingMail(data, 'SHOP-US', 'buyer_demo_01')).toEqual([])
  })
  it('仅买家来信，排除外发、内部备注及eBay通知', () => {
    const row = conversation()
    row.messages.push({ id: 'outgoing', kind: 'outgoing', sender: '客服01', body: 'Sent body', at: '2026-10-29T00:00:00Z' }, { id: 'note', kind: 'note', sender: '客服01', body: 'Internal note', at: '2026-10-29T00:00:00Z' }, { id: 'notice', kind: 'incoming', sender: 'eBay', body: 'Notice', notice: { heading: 'Notice', paragraphs: [], sections: [], footer: '' }, at: '2026-10-29T00:00:00Z' })
    expect(getBuyerIncomingMail([row, conversation({ id: 'platform', source: 'ebay' })], 'shop-us', 'buyer_demo_01').map(item => item.messageId)).toEqual(['message-1'])
  })
  it('同买家其他订单及未关联订单会话都包含，不需要取消订单关联', () => {
    const rows = [conversation({ id: 'c-1', relatedOrderIds: ['order-1'], association: 'confirmed' }), conversation({ id: 'c-2', relatedOrderIds: ['order-2'], association: 'confirmed' }), conversation({ id: 'c-3', relatedOrderIds: [], association: 'none' })]
    expect(getBuyerIncomingMail(rows, 'shop-us', 'buyer_demo_01')).toHaveLength(3)
  })
  it.each([['', 'buyer_demo_01'], ['shop-us', ''], ['   ', 'buyer_demo_01'], ['shop-us', '   ']])('空来源身份拒绝关联 %s %s', (shopId, buyerId) => {
    expect(getBuyerIncomingMail([conversation()], shopId, buyerId)).toEqual([])
  })
  it('保留原始消息时间，最新在前，无offset时间不猜测时区', () => {
    const row = conversation()
    row.messages.push({ id: 'newest', kind: 'incoming', sender: row.buyerId, body: 'Later', at: '2026-10-29T04:00:00+00:00' }, { id: 'uncertain', kind: 'incoming', sender: row.buyerId, body: 'Unknown clock', at: '2026-10-29 09:00:00' })
    const output = getBuyerIncomingMail([row], 'shop-us', row.buyerId)
    expect(output.map(item => item.messageId)).toEqual(['newest', 'message-1', 'uncertain'])
    expect(output[0]!.at).toBe('2026-10-29T04:00:00+00:00')
    expect(formatBuyerMailTime(output[2]!.at)).toBe('时间待核实')
  })
  it('正文安全提取纯文本，附件仅暴露名称，不触发已读或其他源数据变更', () => {
    const row = conversation()
    row.messages[0]!.bodyHtml = '<p>Safe <strong>message</strong></p><script>alert(1)</script><img src="https://invalid.example/tracker"><iframe>hidden</iframe>'
    row.messages[0]!.attachments = [{ id: 'attachment', name: 'parcel.jpg', size: 100, type: 'image/jpeg', source: 'url', url: 'https://invalid.example/secret' }]
    const before = JSON.stringify(row)
    const output = getBuyerIncomingMail([row], row.shopId, row.buyerId)[0]!
    expect(output.bodyText).toBe('Safe message')
    expect(output.attachmentNames).toEqual(['parcel.jpg'])
    expect(JSON.stringify(output)).not.toContain('invalid.example')
    expect(JSON.stringify(row)).toBe(before)
  })
  it('统一北京时间，明确偏移转换到同一时刻，缺失或无偏移不猜', () => {
    expect(formatBuyerMailTime('2026-10-29T00:00:00Z')).toBe('2026-10-29 08:00:00')
    expect(formatBuyerMailTime('2026-10-28T17:00:00-07:00')).toBe('2026-10-29 08:00:00')
    expect(formatBuyerMailTime('')).toBe('—')
    expect(formatBuyerMailTime('2026-10-29T00:00:00')).toBe('时间待核实')
  })
})

describe('取消申请买家来信组件', () => {
  afterEach(() => resetMailSession())
  it('默认最近3封，可展开全部、长正文展开及切买家重置', async () => {
    const row = conversation()
    row.messages = Array.from({ length: 5 }, (_, index) => ({ id: `incoming-${index}`, kind: 'incoming' as const, sender: row.buyerId, body: index === 4 ? 'Long buyer message '.repeat(30) : `message-${index}`, at: `2026-10-29T0${index}:00:00Z` }))
    mailSession.conversations = [row]
    const wrapper = mount(BuyerMail, { props: { shopId: row.shopId, buyerId: row.buyerId } })
    expect(wrapper.findAll('.buyer-mail-card')).toHaveLength(3)
    expect(wrapper.get('.buyer-mail-card time').text()).toBe('2026-10-29 12:00:00')
    expect(wrapper.get('.buyer-mail-card time').attributes('title')).toBeUndefined()
    expect(wrapper.get('.buyer-mail-body').classes()).toContain('collapsed')
    await wrapper.findAll('.buyer-mail-link').find(button => button.text() === '展开正文')!.trigger('click')
    expect(wrapper.get('.buyer-mail-body').classes()).not.toContain('collapsed')
    await wrapper.get('.buyer-mail-toggle').trigger('click')
    expect(wrapper.findAll('.buyer-mail-card')).toHaveLength(5)
    await wrapper.setProps({ buyerId: 'different-buyer' })
    expect(wrapper.get('.buyer-mail-empty').text()).toBe('暂无该买家在本店的站内信')
    await wrapper.setProps({ buyerId: row.buyerId })
    expect(wrapper.findAll('.buyer-mail-card')).toHaveLength(3)
    expect(wrapper.get('.buyer-mail-body').classes()).toContain('collapsed')
    wrapper.unmount()
  })
  it('纯文本内容不执行HTML或附件请求，不改变会话已读', () => {
    const row = conversation()
    row.messages[0]!.body = '<img src="https://invalid.example/image" onerror="alert(1)">'
    row.messages[0]!.attachments = [{ id: 'file', name: '说明.pdf', size: 1, type: 'application/pdf', source: 'url', url: 'https://invalid.example/file' }]
    mailSession.conversations = [row]
    const before = JSON.stringify(mailSession.conversations)
    const wrapper = mount(BuyerMail, { props: { shopId: row.shopId, buyerId: row.buyerId } })
    expect(wrapper.findAll('img,a,iframe')).toHaveLength(0)
    expect(wrapper.get('.buyer-mail-body').text()).toContain('<img')
    expect(wrapper.get('.buyer-mail-attachment').text()).toBe('说明.pdf')
    expect(JSON.stringify(mailSession.conversations)).toBe(before)
    wrapper.unmount()
  })
})
