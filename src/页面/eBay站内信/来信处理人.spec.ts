import { beforeEach, describe, expect, it } from 'vitest'
import { createEditor, resetServiceRules, saveEditor, serviceRules } from '../自动客服规则/规则模型'
import { applyManualHandlers, getConversationHandlerIds } from './会话处理人'
import { collectNextMail, receiveNewMail } from './收取来信'
import { filterConversations } from './模型'
import type { Conversation, MailFilters } from './类型'

const filters: MailFilters = { shopIds: [], assignees: [], field: 'buyerId', mode: 'contains', query: '', onlyUnread: false, onlyFlagged: false }
function configure(assign: boolean, name = '美国来信办理') {
  const editor = createEditor('assignment', 'new')
  editor.draft.name = name
  editor.draft.enabled = true
  editor.draft.conditions = [{ field: 'shop', operator: 'eq', values: ['shop-us'] }]
  editor.draft.assignment = { ...editor.draft.assignment, assign, assignee: '客服03', tag: true, tagIds: ['return'] }
  expect(saveEditor(editor)).toBeUndefined()
}

describe('本地新来信与有效处理人', () => {
  beforeEach(resetServiceRules)
  it('不为启用或查看规则改历史；成员各看到同一会话，真实指派优先，旧消息重放无动作', () => {
    const threads: Conversation[] = []
    const c = collectNextMail(threads)!
    expect(getConversationHandlerIds(c)).toEqual(['staff-01', 'staff-02'])
    for (const id of ['staff-01', 'staff-02']) expect(filterConversations(threads, 'buyer', 'all', { ...filters, assignees: [id] })).toEqual([c])
    configure(true)
    expect(getConversationHandlerIds(c)).toEqual(['staff-01', 'staff-02'])
    collectNextMail(threads)
    expect(getConversationHandlerIds(c)).toEqual(['staff-03'])
    expect(c.operationLogs?.slice(-2)[0]?.content).toContain('客服01、客服02 → 客服03')
    const count = c.operationLogs?.length
    expect(receiveNewMail(threads, { shopId: c.shopId, shopName: c.shopName, conversationId: c.id, buyerId: c.buyerId, subject: c.subject, message: c.messages[1]!, facts: {} })).toBeUndefined()
    expect(c.operationLogs).toHaveLength(count!)
    expect(c.lastHandledBy).toBeUndefined()
  })
  it('仅标签规则保留 SKU 人员；人工覆盖期间的新指派不代替人工办理，恢复自动取该次规则结果', () => {
    configure(false)
    const threads: Conversation[] = []
    const c = collectNextMail(threads)!
    expect(c.tags).toContain('return')
    expect(getConversationHandlerIds(c)).toEqual(['staff-01', 'staff-02'])
    serviceRules.value.find(rule => rule.name === '美国来信办理')!.enabled = false
    applyManualHandlers(c, ['staff-02'], '客服01')
    configure(true, '第二轮来信')
    collectNextMail(threads)
    expect(getConversationHandlerIds(c)).toEqual(['staff-02'])
    expect(c.operationLogs?.slice(-1)[0]?.action).toBe('保留人工指派')
    applyManualHandlers(c, null, '客服01')
    expect(getConversationHandlerIds(c)).toEqual(['staff-03'])
  })
  it('多规则冲突不强行指派，未知条件不按否定放行，提交来源仍为买家及所属店铺', () => {
    configure(true)
    configure(true, '同店规则')
    const threads: Conversation[] = []
    const c = collectNextMail(threads)!
    expect(getConversationHandlerIds(c)).toEqual(['staff-01', 'staff-02'])
    expect(c.operationLogs?.slice(-1)[0]?.result).toBe('待核对')
    const rule = serviceRules.value.find(rule => rule.name === '美国来信办理')!
    rule.conditions = [{ field: 'fulfillmentMode', operator: 'neq', values: ['平台履约'] }]
    serviceRules.value.find(rule => rule.name === '同店规则')!.enabled = false
    collectNextMail(threads)
    expect(getConversationHandlerIds(c)).toEqual(['staff-01', 'staff-02'])
    expect(receiveNewMail(threads, { shopId: 'shop-uk', shopName: '英国', conversationId: c.id, buyerId: c.buyerId, subject: c.subject,
      message: { ...c.messages[0]!, id: 'cross-shop' }, facts: {} })).toBeUndefined()
  })
  it('双 SKU 正向条件须对应同一行，后来核实的新商品替换本次范围，缺资料及迟到来信保留归属', () => {
    configure(true)
    const rule = serviceRules.value.find(rule => rule.name === '美国来信办理')!
    rule.conditions = [
      { field: 'systemSku', operator: 'eq', values: ['DEMO-BP-01'] },
      { field: 'platformSku', operator: 'eq', values: ['EBAY-DEMO-DH-02'] },
    ]
    const rows: Conversation[] = [], thread = collectNextMail(rows)!
    expect(getConversationHandlerIds(thread)).toEqual(['staff-01', 'staff-02'])
    const next = (id: string, seconds: number, lines?: Array<{ systemSku?: string; platformSku?: string }>) => receiveNewMail(rows, {
      shopId: thread.shopId, shopName: thread.shopName, buyerId: thread.buyerId, conversationId: thread.id, subject: thread.subject,
      message: { ...thread.messages[0]!, id, at: new Date(Date.parse(thread.messages[0]!.at) + seconds * 1000).toISOString() }, facts: { lines },
    })
    next('verified', 3, [{ systemSku: 'DEMO-DH-02', platformSku: 'EBAY-DEMO-DH-02' }])
    expect(getConversationHandlerIds(thread)).toEqual(['staff-02'])
    next('no-context', 5)
    next('late', 1, [{ systemSku: 'DEMO-BP-01', platformSku: 'EBAY-DEMO-BP-01' }])
    expect(getConversationHandlerIds(thread)).toEqual(['staff-02'])
    expect(thread.operationLogs?.filter(log => log.action === '匹配处理人')).toHaveLength(2)
  })

  it('可信新增重开已处理并保护旧发送回执，忽略期间仅收信且暂停会话规则', () => {
    const rows: Conversation[] = [], c = collectNextMail(rows)!
    c.status = 'processed'
    const revision = c.statusRevision ?? 0
    collectNextMail(rows)
    expect(c.status).toBe('pending')
    expect(c.statusRevision).toBeGreaterThan(revision)
    configure(true)
    c.status = 'ignored'
    const people = [...getConversationHandlerIds(c)], logs = c.operationLogs?.length ?? 0
    collectNextMail(rows)
    expect(c.status).toBe('ignored')
    expect(c.unread).toBe(true)
    expect(getConversationHandlerIds(c)).toEqual(people)
    expect(c.operationLogs?.length ?? 0).toBe(logs)
    expect(c.tags ?? []).not.toContain('return')
  })

  it('历史首次采集须有可信迁移状态，历史补页和晚到消息不重开现有状态', () => {
    const rows: Conversation[] = [], c = collectNextMail(rows)!
    c.status = 'processed'
    const revision = c.statusRevision
    const receipt = {
      shopId: c.shopId, shopName: c.shopName, conversationId: c.id, buyerId: c.buyerId, subject: c.subject,
      message: { ...c.messages[0]!, id: 'old-page', at: '2026-09-01T00:00:00Z' }, facts: {}, historical: true,
    }
    receiveNewMail(rows, receipt)
    expect(c.status).toBe('processed')
    expect(c.statusRevision).toBe(revision)
    expect(receiveNewMail([], { ...receipt, conversationId: 'old-unclassified' })).toBeUndefined()
    const history: Conversation[] = []
    receiveNewMail(history, { ...receipt, conversationId: 'old-confirmed', historicalStatus: 'processed' })
    expect(history[0]?.status).toBe('processed')
  })
})
