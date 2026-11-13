import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { mailSession, resetMailSession } from './会话'
import { resetMailAccessProfiles } from './权限与协作'
import { applyManualHandlers } from './会话处理人'
import { getContactBlockedReason, getContactDraft, resetContactSession, sendBuyerContact, type BuyerContactTarget } from './联系买家发送'
import { resetMailVerification } from './发送核查'

beforeEach(() => {
  currentHandlerId.value = 'staff-01'
  resetMailAccessProfiles(); resetMailSession(); resetContactSession(); resetMailVerification()
})
afterEach(() => { currentHandlerId.value = 'staff-01'; vi.useRealTimers() })

describe('跨业务联系买家协作', () => {
  it('同一来源的个人草稿按用户隔离，旧成功只清原提交人的版本', async () => {
    vi.useFakeTimers()
    const c = mailSession.conversations[0]!
    applyManualHandlers(c, ['staff-01', 'staff-02'], '客服01')
    const target: BuyerContactTarget = { record: { shopId: c.shopId, shopName: c.shopName, buyerId: c.buyerId, orderNo: 'DEMO-ORDER' }, key: 'same-source', identity: 'verified-source', newConversationId: '', conversation: c }
    const first = getContactDraft(target)!
    first.body = 'Same text from staff01'
    const pending = sendBuyerContact(target, target.identity)
    currentHandlerId.value = 'staff-02'
    const second = getContactDraft(target)!
    expect(second).not.toBe(first)
    second.body = 'Same text from staff01'
    await vi.advanceTimersByTimeAsync(350)
    expect((await pending).ok).toBe(true)
    expect(first.body).toBe('')
    expect(second.body).toBe('Same text from staff01')
    expect(c.lastHandledBy).toBe('客服01')
  })

  it('新会话结果未知时，其他来源改选同店同买家已有会话也被拦截', async () => {
    vi.useFakeTimers()
    const original = mailSession.conversations[0]!
    const source = { shopId: original.shopId, shopName: original.shopName, buyerId: original.buyerId, orderNo: 'DEMO-ORDER' }
    const first: BuyerContactTarget = { record: source, key: 'new-source', identity: 'source-one', newConversationId: 'new-contact-under-check' }
    getContactDraft(first)!.body = 'A new conversation'
    const pending = sendBuyerContact(first, first.identity, { outcome: 'unknown' })
    await vi.advanceTimersByTimeAsync(350)
    expect((await pending).delivery).toBe('unknown')
    const second: BuyerContactTarget = { record: source, key: 'other-business', identity: 'source-two', newConversationId: '', conversation: original }
    expect(getContactBlockedReason(second, second.identity)).toContain('待核查')
  })
})
