import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Preview from './工单来源摘要.vue'
import type { TicketSource } from './会话'
import { mailSession, resetMailSession } from '../eBay站内信/会话'
import { getMessageBodyText } from '../eBay站内信/邮箱模型'
import { reviewSession, resetReviewSession } from '../eBay评价/会话'
import { disputeRecords } from '../eBay纠纷/模型'
import { returnSession } from '../eBay退换货申请/数据'
import { cancellationSession } from '../eBay取消订单申请/会话'
import { cancelReasonLabel } from '../eBay取消订单申请/原因映射'

let wrapper: VueWrapper | undefined
const request = (source: Partial<TicketSource> = {}): TicketSource =>
  ({ kind: 'message', shopId: 'shop-us', contextId: 'conv-01', id: 'msg-01-1', shopName: '错误店名', summary: '过期摘要勿展示', ...source })
function open(source: TicketSource) { wrapper = mount(Preview, { props: { source } }); return wrapper }
afterEach(() => { wrapper?.unmount(); resetMailSession(); resetReviewSession() })

describe('建单来源预览', () => {
  it('按精确消息展示原文，区分买家来信、已发消息与平台通知', async () => {
    const panel = open(request())
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    const incoming = conversation.messages[0]!, outgoing = conversation.messages[1]!
    expect(panel.text()).toContain(conversation.shopName)
    expect(panel.text()).toContain('买家 ' + conversation.buyerId)
    expect(panel.text()).toContain(incoming.id)
    expect(panel.get('.source-original').text()).toBe(incoming.body)
    await panel.setProps({ source: request({ id: outgoing.id }) })
    expect(panel.text()).toContain('收件买家 ' + conversation.buyerId)
    expect(panel.get('.source-original').text()).toBe(outgoing.body)
    const notice = mailSession.conversations.find(row => row.source === 'ebay')!, message = notice.messages[0]!
    await panel.setProps({ source: request({ contextId: notice.id, shopId: notice.shopId, id: message.id }) })
    expect(panel.text()).toContain('eBay 平台通知')
    expect(panel.get('.source-original').text()).toContain(message.notice!.heading)
  })

  it('长正文可展开，切换来源后恢复摘要，富文本只输出安全可见文字', async () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    const message = conversation.messages[0]!
    message.bodyHtml = '<p><strong>原文</strong>' + '商品名称 '.repeat(62) + '末句。</p><script>隐藏脚本</script>'
    const panel = open(request())
    expect(panel.get('.source-original').text()).not.toContain('末句。')
    await panel.get('button[aria-expanded]').trigger('click')
    expect(panel.get('.source-original').text()).toBe(getMessageBodyText(message).trim())
    expect(panel.text()).not.toContain('隐藏脚本')
    expect(panel.find('.source-original strong').exists()).toBe(false)
    await panel.setProps({ source: request({ id: conversation.messages[1]!.id }) })
    await panel.setProps({ source: request() })
    expect(panel.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false')
  })

  it('来源跨店、身份重复、备注和失败外发均不展示正文或历史摘要', async () => {
    const panel = open(request({ shopId: 'shop-uk' }))
    expect(panel.text()).toContain('当前无法查看这条来源记录')
    expect(panel.find('.source-original').exists()).toBe(false)
    const c = mailSession.conversations.find(row => row.id === 'conv-01')!
    c.messages.push({ ...c.messages[0]! })
    const good = c.messages[1]!
    c.messages.push({ ...good, id: 'note', kind: 'note' }, { ...good, id: 'failed', delivery: 'failed' })
    for (const id of ['msg-01-1', 'note', 'failed']) {
      await panel.setProps({ source: request({ id }) })
      expect(panel.text()).toContain('当前无法查看这条来源记录')
      expect(panel.text()).not.toContain('过期摘要勿展示')
      expect(panel.find('.source-original').exists()).toBe(false)
    }
  })

  it('评价沿用隐藏规则，退货、取消与纠纷展示原记录的原因', async () => {
    const hidden = reviewSession.reviews.find(item => item.platformState === 'HIDDEN')!
    hidden.content = '禁止显示的买家原文'
    const panel = open(request({ kind: 'review', id: hidden.id, shopId: hidden.shopId }))
    expect(panel.text()).toContain('该评价内容已被平台隐藏')
    expect(panel.text()).not.toContain(hidden.content)
    const returned = returnSession.records[0]!, cancel = cancellationSession.records[0]!, dispute = disputeRecords.value.find(row => row.kind === 'EBAY_CASE')!
    await panel.setProps({ source: request({ kind: 'return', shopId: returned.shopId, id: returned.id }) })
    expect(panel.text()).toContain(returned.title); expect(panel.text()).toContain(returned.reason)
    await panel.setProps({ source: request({ kind: 'cancel', shopId: cancel.shopId, id: cancel.cancelId }) })
    expect(panel.text()).toContain(cancel.orderId); expect(panel.text()).toContain(cancelReasonLabel(cancel.reasonCode))
    await panel.setProps({ source: request({ kind: 'dispute', shopId: dispute.shopId, contextId: undefined, id: dispute.id }) })
    expect(panel.text()).toContain(dispute.statusText); expect(panel.text()).toContain(dispute.reason)
    await panel.setProps({ source: request({ kind: 'dispute', shopId: dispute.shopId, contextId: 'INTENTIONALLY_INVALID', id: dispute.id }) })
    expect(panel.text()).toContain('当前无法查看这条来源记录')
  })
})
