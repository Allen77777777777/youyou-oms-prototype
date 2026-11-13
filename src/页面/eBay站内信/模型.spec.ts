import { beforeEach, describe, expect, it } from 'vitest'
import { createConversations, createRelatedOrders } from './数据'
import { draftKey, mailSession, resetMailSession } from './会话'
import { filterConversations, formatMailTime, getBuyerHistory, getContextCount, getPreview, getRelatedOrders, validateDraft } from './模型'
import type { MailFilters, ReplyDraft } from './类型'

const filters = (patch: Partial<MailFilters> = {}): MailFilters => ({ shopIds: [], assignees: [], field: 'buyerId', mode: 'contains', query: '', onlyUnread: false, onlyFlagged: false, ...patch })
const draft = (body = 'Thank you.'): ReplyDraft => ({ body, attachments: [] })

describe('站内信关联资料', () => {
  it('只接受确认关联、正确店铺与买家，不按关联 ID 越过隔离', () => {
    const conversation = createConversations()[0]!, orders = createRelatedOrders()
    conversation.relatedOrderIds.push('order-02', 'order-10')
    expect(getRelatedOrders(conversation, orders).map(order => order.id)).toEqual(['order-01'])
    conversation.association = 'pending'
    expect(getRelatedOrders(conversation, orders)).toEqual([])
  })
  it('买家历史包含已核验身份的有权店铺，并排除当前已确认订单', () => {
    const conversations = createConversations(), orders = createRelatedOrders()
    expect(getBuyerHistory(conversations[0]!, orders).map(order => order.id)).toEqual(['order-04', 'order-10'])
    expect(getBuyerHistory(conversations.find(item => item.source === 'ebay')!, orders)).toEqual([])
  })
  it('跨店必须同时具备可信买家键和店铺范围，不用同名买家或其他命名空间兜底', () => {
    const conversation = createConversations()[0]!, orders = createRelatedOrders()
    const otherShop = orders.find(order => order.id === 'order-10')!
    const ids = () => getBuyerHistory(conversation, orders).map(order => order.id)
    otherShop.buyerKey = 'another-namespace:buyer_demo_01'
    expect(ids()).toEqual(['order-04'])
    otherShop.buyerKey = conversation.buyerDataScope!.buyerKey
    otherShop.buyerId = 'different-display-name'
    expect(ids()).toEqual(['order-04', 'order-10'])
    conversation.buyerDataScope!.shopIds = ['shop-us']
    expect(ids()).toEqual(['order-04'])
    conversation.buyerDataScope!.shopIds = []
    expect(ids()).toEqual([])
    delete conversation.buyerDataScope
    otherShop.buyerId = conversation.buyerId
    expect(ids()).toEqual(['order-04'])
  })
  it('未同步、失败、无权限与真正的零记录有不同结果', () => {
    expect(getContextCount({ state: 'ready', records: [] })).toBe(0)
    for (const state of ['not_synced', 'failed', 'forbidden'] as const) expect(getContextCount({ state, records: [] })).toBeNull()
    expect(getContextCount(undefined)).toBeNull()
  })
  it('候选订单不作为当前订单；同买家历史仍可辅助核对', () => {
    const pending = createConversations().find(item => item.id === 'conv-05')!, orders = createRelatedOrders()
    expect(getRelatedOrders(pending, orders)).toEqual([])
    expect(getBuyerHistory(pending, orders).map(order => order.id)).toEqual(['order-05', 'order-06'])
  })
})

describe('站内信查询范围', () => {
  it('消息来源、队列、店铺、负责人和未读取交集', () => {
    const result = filterConversations(createConversations().slice(0, 8), 'buyer', 'pending', filters({ shopIds: ['shop-us'], assignees: ['客服01'], onlyUnread: true }))
    expect(result.map(item => item.id)).toEqual(['conv-01', 'conv-05'])
  })
  it('指定买家字段的多行精确搜索，不同时搜索主题', () => {
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ mode: 'exact', query: 'buyer_demo_01\nbuyer_demo_02' })).map(item => item.id)).toEqual(['conv-message-orders', 'conv-01', 'conv-02'])
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'buyerId', query: '物流' }))).toEqual([])
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'subject', query: '物流' })).map(item => item.id)).toEqual(['conv-02', 'conv-08'])
  })
  it('按订单号只检索确认关联，不借候选或买家历史命中', () => {
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'orderNo', query: 'DEMO-1001', mode: 'exact' })).map(item => item.id)).toEqual(['conv-message-orders', 'conv-01'])
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'orderNo', query: 'DEMO-1004', mode: 'exact' })).map(item => item.id)).toEqual(['conv-message-orders'])
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'orderNo', query: 'DEMO-1005', mode: 'exact' }))).toEqual([])
  })
  it('主题预筛选包含具体公开消息标题，内部备注标题不参与搜索', () => {
    const conversation = createConversations()[0]!
    conversation.messages.push({ id: 'new-subject', kind: 'outgoing', sender: '客服01', subject: 'Unique shipment update', body: 'Public reply', at: conversation.updatedAt, delivery: 'success' })
    conversation.messages.push({ id: 'private-subject', kind: 'note', sender: '客服01', subject: 'PRIVATE investigation title', body: 'PRIVATE note', at: conversation.updatedAt })
    expect(filterConversations([conversation], 'buyer', 'all', filters({ field: 'subject', query: 'Unique shipment update', mode: 'exact' }))).toEqual([conversation])
    expect(filterConversations([conversation], 'buyer', 'all', filters({ field: 'subject', query: 'PRIVATE' }))).toEqual([])
    expect(filterConversations([conversation], 'buyer', 'all', filters({ field: 'body', query: 'PRIVATE' }))).toEqual([])
  })
  it('平台通知按已读和未读分别查询，不复用待回复队列', () => {
    const items = createConversations()
    expect(filterConversations(items, 'ebay', 'unread', filters())).toHaveLength(6)
    expect(filterConversations(items, 'ebay', 'read', filters())).toHaveLength(6)
    expect(filterConversations(items, 'ebay', 'pending', filters())).toEqual([])
  })
  it('无效精确输入或未知字段不退化为无条件查询', () => {
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ mode: 'exact', query: Array.from({ length: 1001 }, (_, i) => `id-${i}`).join('\n') }))).toEqual([])
    expect(filterConversations(createConversations(), 'buyer', 'all', filters({ field: 'unknown' }))).toEqual([])
  })
})

describe('回复草稿与时间', () => {
  beforeEach(resetMailSession)
  it('空白正文不可发送；外发正文允许2000并拒绝2001字符', () => {
    expect(validateDraft(draft(' \n\t'))).toBe('请输入回复内容')
    expect(validateDraft(draft('a'.repeat(1999)))).toBeUndefined()
    expect(validateDraft(draft('a'.repeat(2000)))).toBeUndefined()
    expect(validateDraft(draft('a'.repeat(2001)))).toContain('2000')
  })
  it('内部备注保留5000字符本地上限，不沿用外发限制', () => {
    expect(validateDraft(draft('a'.repeat(5000)), 'note')).toBeUndefined()
    expect(validateDraft(draft('a'.repeat(5001)), 'note')).toContain('5000')
    expect(validateDraft(draft('a'.repeat(2001)), 'reply')).toContain('2000')
  })
  it('校验附件类型、大小与数量', () => {
    const file = { id: 'attachment-demo', name: '演示照片.png', size: 5 * 1024 * 1024, type: 'image/png' }
    expect(validateDraft({ ...draft(), attachments: [file] })).toBeUndefined()
    expect(validateDraft({ ...draft(), attachments: [{ ...file, size: file.size + 1 }] })).toContain('5 MB')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, size: 0 }] })).toContain('大于 0')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, type: 'text/html' }] })).toContain('PNG')
    expect(validateDraft({ ...draft(), attachments: Array.from({ length: 5 }, (_, i) => ({ ...file, id: `file-${i}` })) })).toBeUndefined()
    expect(validateDraft({ ...draft(), attachments: Array.from({ length: 6 }, (_, i) => ({ ...file, id: `file-${i}` })) })).toContain('5')
  })
  it('未获取的公网链接附件允许未知大小，仍校验链接、类型与已知超限大小', () => {
    const file = { id: 'url-demo', name: 'fitment.pdf', type: 'application/pdf', source: 'url' as const, url: 'https://assets.example.com/fitment.pdf', size: 0 }
    expect(validateDraft({ ...draft(), attachments: [file] })).toBeUndefined()
    expect(validateDraft({ ...draft(), attachments: [{ ...file, url: 'http://127.0.0.1/fitment.pdf' }] })).toContain('公网')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, url: undefined }] })).toContain('链接')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, size: -1 }] })).toContain('5 MB')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, size: Number.NaN }] })).toContain('5 MB')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, size: 5 * 1024 * 1024 + 1 }] })).toContain('5 MB')
    expect(validateDraft({ ...draft(), attachments: [{ ...file, type: 'text/html' }] })).toContain('PNG')
  })
  it('旧草稿标题不参与外发校验，富文本与纯文本不一致时拒绝发送', () => {
    expect(validateDraft({ body: 'Hello', bodyHtml: '<p><strong>Hello</strong></p>', attachments: [] })).toBeUndefined()
    expect(validateDraft({ body: 'Hello', subject: 'x'.repeat(201), attachments: [] })).toBeUndefined()
    expect(validateDraft({ body: 'Hello', subject: 'First\nSecond', attachments: [] })).toBeUndefined()
    expect(validateDraft({ body: 'Old text', bodyHtml: '<p>New text</p>', attachments: [] })).toContain('不一致')
    expect(validateDraft({ body: 'Safe', bodyHtml: '<p>Safe<script>bad()</script></p>', attachments: [] })).toBeUndefined()
  })
  it('回复和内部备注按会话及模式独立保存，重置清空内存', () => {
    const reply = draftKey('conv-01', 'reply'), note = draftKey('conv-01', 'note'), other = draftKey('conv-02', 'reply')
    mailSession.drafts[reply] = draft('Reply one')
    mailSession.drafts[note] = draft('Internal only')
    expect(mailSession.drafts[other]).toBeUndefined()
    expect(mailSession.drafts[reply]?.body).toBe('Reply one')
    expect(mailSession.drafts[note]?.body).toBe('Internal only')
    resetMailSession()
    expect(mailSession.drafts).toEqual({})
    expect(mailSession.activeId).toBe('conv-01')
    expect(mailSession).toMatchObject({ folder: 'inbox', onlyPendingFolders: false, autoNext: false, pageSize: 20, foldersCollapsed: false })
  })
  it('时间固定北京时间，不读取主机时区；非法无时区日期不猜测', () => {
    expect(formatMailTime('2026-10-27T02:10:00Z')).toBe('10-27 10:10')
    expect(formatMailTime('2026-10-27T00:05:00+08:00')).toBe('10-27 00:05')
    expect(formatMailTime('2026-10-27 10:10:00')).toBe('—')
    expect(formatMailTime('invalid')).toBe('—')
  })
  it('内部备注不替代往来消息列表摘要', () => {
    const conversation = createConversations().find(item => item.id === 'conv-03')!
    expect(getPreview(conversation)).toBe('Thank you. The installation instructions are clear.')
  })
  it('创建数据互不共享可变对象，通知与业务对象保持独立', () => {
    const first = createConversations(), second = createConversations()
    first[0]!.messages[0]!.body = 'changed'
    expect(second[0]!.messages[0]!.body).not.toBe('changed')
    expect(first.filter(item => item.source === 'buyer')).toHaveLength(31)
    expect(first.filter(item => item.source === 'ebay')).toHaveLength(12)
    expect(first.filter(item => item.source === 'ebay').every(item => !item.canReply && item.relatedOrderIds.length === 0)).toBe(true)
  })
  it('分页样例各有独立虚构身份，新增售前会话不复制其他买家的订单关系', () => {
    const conversations = createConversations(), buyers = conversations.filter(item => item.source === 'buyer')
    expect(new Set(conversations.map(item => item.id)).size).toBe(conversations.length)
    expect(new Set(buyers.map(item => `${item.shopId}:${item.buyerId}`)).size).toBe(30)
    expect(buyers.filter(item => item.buyerId === 'buyer_demo_01').map(item => item.id)).toEqual(['conv-01', 'conv-message-orders'])
    const presales = buyers.filter(item => /^conv-(09|1\d|2[0-8])$/.test(item.id))
    expect(presales).toHaveLength(20)
    expect(presales.every(item => item.association === 'none' && item.relatedOrderIds.length === 0)).toBe(true)
    expect(presales.flatMap(item => getRelatedOrders(item, createRelatedOrders()))).toEqual([])
    expect(conversations.every(item => Number.isFinite(Date.parse(item.updatedAt)) && /(?:Z|\+08:00)$/.test(item.updatedAt))).toBe(true)
    expect(conversations.find(item => item.id === 'conv-12')).toMatchObject({ assignee: '客服02', lastHandledBy: '客服01', lastHandledAction: '回复成功' })
  })
})
