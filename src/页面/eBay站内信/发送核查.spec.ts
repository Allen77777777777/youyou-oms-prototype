import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { mailSession, resetMailSession } from './会话'
import { resetMailAccessProfiles } from './权限与协作'
import {
  acceptMailVerification, addMailReviewWorkingHours, applyLateMailEvidence, confirmMailVerification,
  ensureMailVerification, getMailBlockingReason, queryMailVerification, registerMailAttempt,
  resetMailVerification, restartMailAttempt, setMockVerificationEvidence,
} from './发送核查'
import type { Conversation, MailMessage } from './类型'

beforeEach(() => {
  currentHandlerId.value = 'staff-01'
  resetMailAccessProfiles()
  resetMailSession()
  resetMailVerification()
})
afterEach(() => { currentHandlerId.value = 'staff-01'; vi.useRealTimers() })

function attempt(options: { provisional?: boolean } = {}) {
  const conversation = mailSession.conversations[0]!
  conversation.status = 'pending'
  conversation.messages.push({ id: 'attempt-under-check', kind: 'outgoing', sender: '客服01', body: 'Original outgoing body', at: '2026-11-11T02:00:00Z', delivery: 'unknown', markProcessedOnSuccess: true })
  const message = conversation.messages[conversation.messages.length - 1]!
  registerMailAttempt(conversation, message, { operatorId: 'staff-01', incomingMessageIds: conversation.messages.filter(m => m.kind === 'incoming').map(m => m.id), ...options })
  return { conversation, message }
}
function successEvidence(message: MailMessage) {
  return { id: 'EVIDENCE-SUCCESS', kind: 'success' as const, description: '原尝试的可信外发回执', platformMessageId: 'EBAY-MESSAGE-01', attemptMessageId: message.id }
}
function otherConversation(source: Conversation, id = 'other-thread') {
  const item = { ...source, id, messages: [], operationLogs: [] }
  mailSession.conversations.push(item)
  return mailSession.conversations[mailSession.conversations.length - 1]!
}

describe('发送结果待核查', () => {
  it('只读回查和确认结论分别鉴权，确认成功保留原发起人并幂等归并', () => {
    const { conversation, message } = attempt()
    conversation.messages.push({ id: 'historical-backfill', kind: 'incoming', sender: conversation.buyerId, body: 'Older message', at: '2026-11-10T02:00:00Z', historical: true })
    setMockVerificationEvidence(message.id, successEvidence(message))
    currentHandlerId.value = 'staff-02'
    expect(queryMailVerification(conversation, message).ok).toBe(true)
    expect(message.delivery).toBe('unknown')
    expect(confirmMailVerification(conversation, message).ok).toBe(false)
    currentHandlerId.value = 'staff-03'
    expect(confirmMailVerification(conversation, message).ok).toBe(true)
    expect(message.delivery).toBe('success')
    expect(conversation.status).toBe('processed')
    expect(conversation.lastHandledBy).toBe('客服01')
    const confirmation = conversation.operationLogs?.filter(log => log.action === '确认发送核查结论') ?? []
    expect(confirmation).toHaveLength(1)
    expect(confirmation[0]?.operator).toBe('客服03')
    expect(confirmMailVerification(conversation, message).ok).toBe(true)
    expect(conversation.operationLogs?.filter(log => log.action === '确认发送核查结论')).toHaveLength(1)
  })

  it('原发送之后的新来信和人工处理都受保护，核查成功不覆盖新版状态或实际处理记录', () => {
    const { conversation, message } = attempt()
    conversation.messages.push({ id: 'new-question', kind: 'incoming', sender: conversation.buyerId, body: 'A new question', at: '2026-11-11T02:01:00Z' })
    conversation.lastHandledBy = '客服02'
    setMockVerificationEvidence(message.id, successEvidence(message))
    queryMailVerification(conversation, message)
    confirmMailVerification(conversation, message)
    expect(message.delivery).toBe('success')
    expect(conversation.status).toBe('pending')
    expect(conversation.lastHandledBy).toBe('客服02')

    const second = attempt()
    second.conversation.statusRevision = (second.conversation.statusRevision ?? 0) + 1
    second.conversation.status = 'ignored'
    setMockVerificationEvidence(second.message.id, successEvidence(second.message))
    queryMailVerification(second.conversation, second.message)
    confirmMailVerification(second.conversation, second.message)
    expect(second.conversation.status).toBe('ignored')
  })

  it('只有明确未受理的证据才解除原待核查，原记录保留且需要人工发起后续尝试', () => {
    const { conversation, message } = attempt()
    expect(getMailBlockingReason({ conversation, shopId: conversation.shopId, buyerId: conversation.buyerId })).toContain('待核查')
    setMockVerificationEvidence(message.id, { id: 'REJECTED', kind: 'not_accepted', description: '原请求明确未受理', attemptMessageId: message.id })
    queryMailVerification(conversation, message)
    expect(confirmMailVerification(conversation, message).ok).toBe(true)
    expect(message.delivery).toBe('failed')
    expect(getMailBlockingReason({ conversation, shopId: conversation.shopId, buyerId: conversation.buyerId })).toBeUndefined()
    expect(conversation.messages.filter(m => m.id === message.id)).toHaveLength(1)
  })

  it('仍未知立即交接，按客服工作小时计算期限，超时仍阻断且有权人员可接手复核', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-11-13T09:30:00Z') // 北京周五17:30。
    const { conversation, message } = attempt()
    expect(queryMailVerification(conversation, message).ok).toBe(true)
    const record = ensureMailVerification(conversation, message)
    expect(record.reviewerId).toBe('staff-03')
    expect(record.reviewDueAt).toBeUndefined()
    expect(confirmMailVerification(conversation, message).ok).toBe(false)
    currentHandlerId.value = 'staff-03'
    expect(acceptMailVerification(conversation, message).ok).toBe(true)
    expect(record.reviewDueAt).toBe('2026-11-16T02:30:00.000Z')
    vi.setSystemTime('2026-11-16T03:00:00Z')
    expect(getMailBlockingReason({ conversation, shopId: conversation.shopId, buyerId: conversation.buyerId })).toContain('待核查')
    queryMailVerification(conversation, message)
    expect(record.firstReviewedAt).toBe('2026-11-16T03:00:00.000Z')
    expect(message.delivery).toBe('unknown')
    expect(addMailReviewWorkingHours('2026-11-11T00:00:00Z')).toBe('2026-11-11T03:00:00.000Z')
  })

  it('跨业务入口与无会话身份的同店同买家保护，不影响其他店铺或买家', () => {
    const { conversation, message } = attempt({ provisional: true })
    message.originApplication = { kind: 'return', applicationId: 'RETURN-1', shopId: conversation.shopId, orderNo: 'ORDER-1' }
    const another = otherConversation(conversation)
    expect(getMailBlockingReason({ conversation: another, shopId: conversation.shopId, buyerId: conversation.buyerId })).toContain('待核查')
    expect(getMailBlockingReason({ shopId: 'another-shop', buyerId: conversation.buyerId })).toBeUndefined()
    expect(getMailBlockingReason({ shopId: conversation.shopId, buyerId: 'another-buyer' })).toBeUndefined()
    expect(getMailBlockingReason({ conversation: another, shopId: conversation.shopId, buyerId: conversation.buyerId, originApplication: { ...message.originApplication } })).toContain('待核查')
    const originalShop = conversation.shopId, originalBuyer = conversation.buyerId
    conversation.shopId = 'changed-shop'
    conversation.buyerId = 'changed-buyer'
    expect(getMailBlockingReason({ shopId: originalShop, buyerId: originalBuyer })).toContain('待核查')
  })

  it('已知会话只按会话与原业务阻断，其他独立会话可办理；来源业务身份不会随消息改写而丢失', () => {
    const { conversation, message } = attempt()
    const origin = { kind: 'return' as const, applicationId: 'RETURN-2', shopId: conversation.shopId, orderNo: 'ORDER-2' }
    // 本地已登记的尝试将业务身份作为提交快照保存。
    resetMailVerification()
    message.originApplication = origin
    registerMailAttempt(conversation, message)
    const another = otherConversation(conversation)
    expect(getMailBlockingReason({ conversation: another, shopId: conversation.shopId, buyerId: conversation.buyerId })).toBeUndefined()
    message.originApplication = undefined
    expect(getMailBlockingReason({ conversation: another, shopId: conversation.shopId, buyerId: conversation.buyerId, originApplication: origin })).toContain('待核查')
  })

  it('迟到回执按原尝试归并一次，冲突证据完整保留并阻断后续发信', () => {
    const { conversation, message } = attempt()
    expect(applyLateMailEvidence(conversation, message, successEvidence(message)).ok).toBe(true)
    const count = conversation.operationLogs?.length
    applyLateMailEvidence(conversation, message, successEvidence(message))
    expect(conversation.operationLogs).toHaveLength(count!)
    const rejection = { id: 'LATE-REJECTION', kind: 'not_accepted' as const, description: '冲突的未受理结果', attemptMessageId: message.id }
    expect(applyLateMailEvidence(conversation, message, rejection).ok).toBe(false)
    const record = ensureMailVerification(conversation, message)
    expect(record.conflict).toBe(true)
    expect(record.evidenceHistory.map(evidence => evidence.id)).toEqual(['EVIDENCE-SUCCESS', 'LATE-REJECTION'])
    expect(message.delivery).toBe('success')
    expect(getMailBlockingReason({ conversation, shopId: conversation.shopId, buyerId: conversation.buyerId })).toContain('证据')
  })

  it('缺少稳定平台消息身份、错店或错买家的回查凭证不能用来认定成功', () => {
    const { conversation, message } = attempt()
    setMockVerificationEvidence(message.id, { ...successEvidence(message), shopId: 'another-shop' })
    queryMailVerification(conversation, message)
    expect(confirmMailVerification(conversation, message).ok).toBe(false)
    expect(message.delivery).toBe('unknown')
    expect(applyLateMailEvidence(conversation, message, { ...successEvidence(message), platformMessageId: '' }).ok).toBe(false)
  })

  it('重试建立新尝试，保留旧证据，新回查不沿用旧结论，历史成功回执触发冲突保护', () => {
    const { conversation, message } = attempt()
    const previousId = ensureMailVerification(conversation, message).attemptId
    setMockVerificationEvidence(message.id, { id: 'REFUSED-FIRST', kind: 'not_accepted', description: '首次尝试明确未受理', attemptMessageId: message.id })
    queryMailVerification(conversation, message)
    confirmMailVerification(conversation, message)
    conversation.messages.push({ id: 'new-since-first-attempt', kind: 'incoming', sender: conversation.buyerId, body: 'Later question', at: '2026-11-11T02:01:00Z' })
    const next = restartMailAttempt(conversation, message)!
    expect(next.attemptId).not.toBe(previousId)
    expect(next.history[0]?.evidenceHistory[0]?.id).toBe('REFUSED-FIRST')
    expect(next.incomingMessageIds).not.toContain('new-since-first-attempt')
    message.delivery = 'unknown'
    queryMailVerification(conversation, message)
    expect(next.evidence?.kind).toBe('unresolved')
    expect(confirmMailVerification(conversation, message).ok).toBe(false)
    const late = { ...successEvidence(message), attemptId: previousId }
    expect(applyLateMailEvidence(conversation, message, late).ok).toBe(false)
    expect(next.conflict).toBe(true)
    expect(message.delivery).toBe('unknown')
    expect(getMailBlockingReason({ conversation, shopId: conversation.shopId, buyerId: conversation.buyerId })).toContain('证据')
  })

  it('旧待核查消息缺少原回复范围时，只补记发送结果，不能借当前来信覆盖范围自动标已处理', () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-08')!
    const message = c.messages.find(item => item.id === 'msg-08-2')!
    delete message.incomingMessageIds
    c.status = 'pending'
    c.messages.push({ id: 'later-incoming', kind: 'incoming', sender: c.buyerId, body: 'A new question', at: '2026-11-11T02:00:00Z' })
    currentHandlerId.value = 'staff-03'
    queryMailVerification(c, message)
    const record = ensureMailVerification(c, message)
    expect(record.incomingMessageIds).toEqual([])
    expect(record.hasReplyCoverage).toBe(false)
    expect(record.operator).toBe('客服02')
    expect(record.operatorId).toBe('staff-02')
    expect(confirmMailVerification(c, message).ok).toBe(true)
    expect(message.delivery).toBe('success')
    expect(c.status).toBe('pending')
    expect(c.lastHandledBy).not.toBe('客服03')
  })
})
