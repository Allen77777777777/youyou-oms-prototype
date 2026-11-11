import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mailSession, resetMailSession } from './会话'
import { changeMailProperty } from './操作日志'
import { getContactDraft, resetContactSession, sendBuyerContact, type BuyerContactTarget } from './联系买家发送'
import { deleteMailTag, mailTagDefinitions, mailTagOperationLogs, resetMailTagDefinitions, saveMailTag } from './设置模型'

beforeEach(() => { resetMailSession(); resetMailTagDefinitions(); resetContactSession() })
afterEach(() => { vi.useRealTimers() })

describe('会话日志与共享发送留痕', () => {
  it('默认优先级及标签顺序不构成变化，实际改动不影响其他会话', () => {
    const c = mailSession.conversations[0]!, other = mailSession.conversations[1]!
    c.priority = undefined; c.tags = ['first', 'second']
    expect(changeMailProperty(c, 'priority', 'normal', '客服01', '设置优先级', '无变化')).toBe(false)
    expect(changeMailProperty(c, 'tags', ['second', 'first'], '客服01', '设置标签', '无变化')).toBe(false)
    expect(c.operationLogs ?? []).toHaveLength(0)
    expect(changeMailProperty(c, 'assignee', '客服03', '客服02', '指派客服', '改由客服03跟进')).toBe(true)
    expect(c.operationLogs?.[0]).toMatchObject({ operator: '客服02', action: '指派客服', result: '已完成' })
    expect(other.operationLogs ?? []).toHaveLength(0)
  })
  it('标签维护保留实际变更，重复保存不记；删除只为受影响会话记录引用移除', () => {
    const c = mailSession.conversations[0]!, tag = mailTagDefinitions[0]!
    const before = JSON.stringify(tag)
    expect(saveMailTag({ label: tag.label, color: tag.color }, tag.id).ok).toBe(true)
    expect(mailTagOperationLogs).toHaveLength(0)
    expect(JSON.stringify(tag)).toBe(before)
    expect(saveMailTag({ label: '更新后的业务标签', color: tag.color }, tag.id).ok).toBe(true)
    c.tags = [tag.id]
    const targets = mailSession.conversations.filter(item => item.tags?.includes(tag.id))
    expect(deleteMailTag(tag.id, targets.length).ok).toBe(true)
    expect(mailTagOperationLogs.map(log => log.action)).toEqual(['编辑业务标签', '删除业务标签'])
    expect(targets.every(item => item.operationLogs?.some(log => log.action === '移除已删除业务标签'))).toBe(true)
    expect(mailSession.conversations.filter(item => !targets.includes(item)).every(item => !item.operationLogs?.length)).toBe(true)
  })
  it('共享联系买家按本次执行人记录提交和回执，日志不复制正文、附件或地址', async () => {
    vi.useFakeTimers()
    const c = mailSession.conversations[0]!
    const target: BuyerContactTarget = { record: { shopId: c.shopId, shopName: c.shopName, buyerId: c.buyerId, orderNo: 'ORDER-DEMO' }, key: 'contact-log', identity: 'verified-demo', newConversationId: 'new-contact', conversation: c }
    const draft = getContactDraft(target)!
    draft.body = 'PRIVATE-CONTACT-BODY'
    draft.attachments = [{ id: 'file', name: 'PRIVATE-FILE.png', size: 30, type: 'image/png', source: 'url', url: 'https://example.com/PRIVATE-ADDRESS.png' }]
    const request = sendBuyerContact(target, target.identity, { by: '客服02', outcome: 'unknown' })
    expect(c.operationLogs?.[0]).toMatchObject({ operator: '客服02', result: '发送中' })
    c.assignee = '客服03'
    await vi.advanceTimersByTimeAsync(350)
    const result = await request
    expect(result.delivery).toBe('unknown')
    expect(c.operationLogs?.map(log => [log.operator, log.result])).toEqual([['客服02', '发送中'], ['客服02', '结果待核查']])
    expect(c.operationLogs?.every(log => log.content.includes(result.messageId!))).toBe(true)
    expect(JSON.stringify(c.operationLogs)).not.toContain('PRIVATE-')
  })
})
