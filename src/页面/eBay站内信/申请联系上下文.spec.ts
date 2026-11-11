import { beforeEach, describe, expect, it } from 'vitest'
import { mailSession, resetMailSession } from './会话'
import { getApplicationMailBlockedReason, NEW_APPLICATION_MAIL, resolveApplicationMailContact, type ApplicationMailContext } from './申请联系上下文'
import { getContactBlockedReason } from './联系买家发送'

function application(): ApplicationMailContext {
  const order = mailSession.orders.find(row => row.id === 'order-01')!
  return {
    kind: 'return', applicationId: 'RETURN-TEST-1', shopId: order.shopId,
    shopName: order.shopName ?? order.shopId, buyerId: order.buyerId, orderNo: order.orderNo,
  }
}

beforeEach(resetMailSession)

describe('从申请定位站内信会话', () => {
  it('同店同订单的多个会话要显式选择，并拒绝跨店或其他买家的指定会话', () => {
    const ctx = application()
    const first = mailSession.conversations.find(c => c.id === 'conv-01')!
    const second = { ...first, id: 'second-thread', updatedAt: '2099-01-01T00:00:00Z' }
    const foreignShop = { ...first, id: 'foreign-shop-thread', shopId: 'other-shop' }
    const foreignBuyer = { ...first, id: 'foreign-buyer-thread', buyerId: 'other-buyer' }
    mailSession.conversations = [first, second, foreignShop, foreignBuyer]

    expect(typeof resolveApplicationMailContact(ctx)).toBe('string')
    for (const id of [first.id, second.id]) {
      expect(resolveApplicationMailContact(ctx, id)).toMatchObject({ conversation: { id } })
    }
    for (const id of [foreignShop.id, foreignBuyer.id]) {
      expect(typeof resolveApplicationMailContact(ctx, id)).toBe('string')
    }
  })

  it.each(['shopId', 'buyerId', 'applicationId'] as const)('缺少 %s 时，打开和提交均有明确的阻断原因', field => {
    const ctx = { ...application(), [field]: ' ' }
    expect(getApplicationMailBlockedReason(ctx)).toBeTruthy()
    expect(typeof resolveApplicationMailContact(ctx)).toBe('string')
  })

  it('只有一条历史咨询但订单不同，必须由客服选择续聊或另发', () => {
    const ctx = { ...application(), orderNo: 'another-order' }
    const thread = mailSession.conversations.find(c => c.id === 'conv-01')!
    mailSession.conversations = [thread]
    expect(typeof resolveApplicationMailContact(ctx)).toBe('string')
    expect(resolveApplicationMailContact(ctx, thread.id)).toMatchObject({ conversation: { id: thread.id } })
    const fresh = resolveApplicationMailContact(ctx, NEW_APPLICATION_MAIL)
    expect(typeof fresh).toBe('object')
    if (typeof fresh === 'object') expect(fresh.conversation).toBeUndefined()
  })

  it('同一申请的发送结果待核查时，换另一个关联会话也不能重发', () => {
    const ctx = application()
    const first = mailSession.conversations.find(c => c.id === 'conv-01')!
    const second = { ...first, id: 'other-related-thread', messages: [] }
    mailSession.conversations.push(second)
    first.messages.push({
      id: 'uncertain-submission', kind: 'outgoing', sender: '客服01', body: 'Shipment update.',
      at: '2026-11-05T03:00:00Z', delivery: 'unknown',
      originApplication: { kind: ctx.kind, shopId: ctx.shopId, applicationId: ctx.applicationId, orderNo: ctx.orderNo },
    })
    for (const id of [second.id, NEW_APPLICATION_MAIL]) {
      expect(getContactBlockedReason(resolveApplicationMailContact(ctx, id))).toContain('核查')
    }
  })
})
