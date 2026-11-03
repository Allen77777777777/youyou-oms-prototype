import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ContactBuyer from './联系买家.vue'
import { resetReviewSession, reviewSession } from './会话'
import { draftKey, mailSession, resetMailSession } from '../eBay站内信/会话'
import { mailboxEntries } from '../eBay站内信/邮箱模型'
import { MAX_REPLY_BODY_LENGTH } from '../eBay站内信/模型'
import {
  discardReviewContactDraft, getReviewContactBlockedReason, getReviewContactConversation, getReviewContactDraft, getReviewContactEditorConversation, getReviewContactIdentity,
  isReviewContactSending, resetReviewContactSession, sendReviewContact,
} from './联系买家模型'

const existingId = 'REV-DEMO-01'
const getNewReview = () => reviewSession.reviews.find(r => r.id !== existingId && !r.orderId && !r.conversationId)!
function prepare(id = existingId, body = 'We are checking your shipment and will update you shortly.') {
  const draft = getReviewContactDraft(id)!
  draft.body = body
  return draft
}
async function finish(id = existingId, outcome?: 'success' | 'failed' | 'unknown') {
  const pending = sendReviewContact(id, getReviewContactIdentity(id), { outcome })
  await vi.advanceTimersByTimeAsync(300)
  return pending
}

beforeEach(() => { vi.useFakeTimers(); resetReviewSession(); resetMailSession(); resetReviewContactSession() })
const contactWrappers: VueWrapper[] = []
afterEach(() => { contactWrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks() })

describe('评价联系买家与邮箱共享发送记录', () => {
  it('精确关联会话发送一次，进入发件箱且不改评价、处理状态、买家好评和邮箱草稿', async () => {
    const c = getReviewContactConversation(existingId)!, draft = prepare()
    const reviewsBefore = JSON.stringify(reviewSession)
    const before = { subject: c.subject, status: c.status, unread: c.unread, assignee: c.assignee, incoming: c.messages.filter(m => m.kind === 'incoming').length }
    mailSession.drafts[draftKey(c.id, 'reply')] = { subject: 'Mailbox draft', body: 'Keep this separate.', attachments: [] }
    const mailboxDraft = JSON.stringify(mailSession.drafts), initialCount = mailSession.conversations.length
    const result = await finish()
    expect(result).toMatchObject({ ok: true, delivery: 'success', conversationId: 'conv-01' })
    expect(c.messages[c.messages.length - 1]).toMatchObject({ kind: 'outgoing', body: 'We are checking your shipment and will update you shortly.', delivery: 'success', markProcessedOnSuccess: false })
    expect(c.messages[c.messages.length - 1]).not.toHaveProperty('subject')
    expect(mailboxEntries(mailSession.conversations, 'outbox').some(entry => entry.message?.id === result.messageId)).toBe(true)
    expect({ subject: c.subject, status: c.status, unread: c.unread, assignee: c.assignee, incoming: c.messages.filter(m => m.kind === 'incoming').length }).toEqual(before)
    expect(mailSession.conversations).toHaveLength(initialCount)
    expect(JSON.stringify(reviewSession)).toBe(reviewsBefore)
    expect(JSON.stringify(mailSession.drafts)).toBe(mailboxDraft)
    expect(draft).toEqual({ body: '', attachments: [] })
  })

  it('没有会话也可首发，仅创建外发记录，不编造买家来信或 OMS 关联', async () => {
    const r = getNewReview(), initialCount = mailSession.conversations.length
    prepare(r.id)
    const result = await finish(r.id)
    const c = getReviewContactConversation(r.id)!
    expect(result.ok).toBe(true)
    expect(mailSession.conversations).toHaveLength(initialCount + 1)
    expect(c).toMatchObject({ subject: `关于订单 ${r.orderNo || r.orderLineItemId}`, shopId: r.shopId, buyerId: r.buyerId, association: 'none', relatedOrderIds: [], unread: false })
    expect(c.messages).toHaveLength(1)
    expect(c.messages[0]?.kind).toBe('outgoing')
    expect(c.messages[0]).not.toHaveProperty('subject')
    expect(c.messages[0]?.body).toBe('We are checking your shipment and will update you shortly.')
    expect(mailboxEntries([c], 'inbox')).toHaveLength(0)
    expect(mailboxEntries([c], 'outbox')).toHaveLength(1)
    prepare(r.id, 'A second update.')
    expect((await finish(r.id)).conversationId).toBe(c.id)
    expect(mailSession.conversations).toHaveLength(initialCount + 1)
  })

  it('有可信订单但没有会话时只关联该订单', async () => {
    mailSession.conversations = mailSession.conversations.filter(c => c.id !== 'conv-01')
    delete reviewSession.reviews.find(r => r.id === existingId)!.conversationId
    prepare()
    expect((await finish()).ok).toBe(true)
    expect(getReviewContactConversation(existingId)).toMatchObject({ association: 'confirmed', relatedOrderIds: ['order-01'] })
  })

  it('双击只产生一条待发送记录，发送完成不会重复提交', async () => {
    const c = getReviewContactConversation(existingId)!, count = c.messages.length
    prepare()
    const identity = getReviewContactIdentity(existingId), first = sendReviewContact(existingId, identity)
    expect(isReviewContactSending(existingId)).toBe(true)
    expect((await sendReviewContact(existingId, identity)).message).toContain('正在发送')
    expect(c.messages).toHaveLength(count + 1)
    await vi.advanceTimersByTimeAsync(300)
    expect((await first).ok).toBe(true)
    expect(isReviewContactSending(existingId)).toBe(false)
    expect((await sendReviewContact(existingId, identity)).ok).toBe(false)
    expect(c.messages).toHaveLength(count + 1)
  })
})

describe('身份和发送资格复核', () => {
  it.each(['shopId', 'buyerId', 'orderLineItemId', 'listingId'] as const)('%s 缺失不能发送或创建会话', async field => {
    const r = getNewReview(), count = mailSession.conversations.length
    r[field] = ' '
    expect(getReviewContactBlockedReason(r.id)).toContain('不完整')
    expect((await sendReviewContact(r.id, '')).ok).toBe(false)
    expect(mailSession.conversations).toHaveLength(count)
  })

  it('重复评价 ID、同店交易行及重复会话均阻断，不任取首条', () => {
    const r = reviewSession.reviews.find(item => item.id === existingId)!
    reviewSession.reviews.push({ ...r })
    expect(getReviewContactBlockedReason(r.id)).toContain('标识重复')
    reviewSession.reviews[reviewSession.reviews.length - 1]!.id = 'duplicate-line'
    expect(getReviewContactBlockedReason(r.id)).toContain('交易行关联不唯一')
    reviewSession.reviews.pop()
    mailSession.conversations.push({ ...mailSession.conversations.find(c => c.id === 'conv-01')! })
    expect(getReviewContactBlockedReason(r.id)).toContain('不唯一')
  })

  it.each(['shopId', 'buyerId'] as const)('已有会话 %s 冲突不退化为新建外发', async field => {
    const c = getReviewContactConversation(existingId)!, count = mailSession.conversations.length
    c[field] = 'mismatched'
    expect(getReviewContactBlockedReason(existingId)).toContain('身份不一致')
    expect((await sendReviewContact(existingId, '')).ok).toBe(false)
    expect(mailSession.conversations).toHaveLength(count)
  })

  it('明确会话关联缺失、订单不属于买家及多会话订单关联都阻断', () => {
    const r = reviewSession.reviews.find(item => item.id === existingId)!, c = getReviewContactConversation(existingId)!
    c.relatedOrderIds = []
    expect(getReviewContactBlockedReason(r.id)).toContain('未确认关联')
    c.relatedOrderIds = [r.orderId!]
    mailSession.orders.find(order => order.id === r.orderId)!.buyerId = 'different'
    expect(getReviewContactBlockedReason(r.id)).toContain('关联订单')
    mailSession.orders.find(order => order.id === r.orderId)!.buyerId = r.buyerId
    delete r.conversationId
    mailSession.conversations.push({ ...c, id: 'extra-confirmed-conversation' })
    expect(getReviewContactBlockedReason(r.id)).toContain('不唯一')
  })

  it('打开后收件身份变化，使用旧身份提交会被阻断', async () => {
    const r = getNewReview(), identity = getReviewContactIdentity(r.id), count = mailSession.conversations.length
    prepare(r.id); r.buyerId = 'new-buyer'
    expect((await sendReviewContact(r.id, identity)).message).toContain('资料已变化')
    expect(mailSession.conversations).toHaveLength(count)
  })

  it('会话不支持发送或已忽略时显示具体原因', () => {
    const c = getReviewContactConversation(existingId)!
    c.canReply = false
    expect(getReviewContactBlockedReason(existingId)).toContain('不支持发送')
    c.canReply = true; c.status = 'ignored'
    expect(getReviewContactBlockedReason(existingId)).toContain('已忽略')
  })

  it.each([{ body: '  ' }, { body: '{{buyerId}} Hello' }, { body: 'x'.repeat(MAX_REPLY_BODY_LENGTH + 1) }])('无效正文不会创建发送记录', async patch => {
    const r = getNewReview(), count = mailSession.conversations.length
    Object.assign(prepare(r.id), patch)
    expect((await sendReviewContact(r.id, getReviewContactIdentity(r.id))).ok).toBe(false)
    expect(mailSession.conversations).toHaveLength(count)
  })

  it('正文允许共享外发上限2000，发送不带自定义标题', async () => {
    const r = getNewReview()
    prepare(r.id, 'x'.repeat(MAX_REPLY_BODY_LENGTH))
    expect(MAX_REPLY_BODY_LENGTH).toBe(2000)
    expect((await finish(r.id)).ok).toBe(true)
    const message = getReviewContactConversation(r.id)!.messages[0]!
    expect(message.body).toHaveLength(MAX_REPLY_BODY_LENGTH)
    expect(message).not.toHaveProperty('subject')
    expect(message.body).toBe('x'.repeat(MAX_REPLY_BODY_LENGTH))
    expect(getReviewContactConversation(r.id)?.subject).toBe(`关于订单 ${r.orderNo || r.orderLineItemId}`)
  })

  it('2001字符含首尾空白仍超限，阻止发送并保留草稿', async () => {
    const r = getNewReview(), draft = prepare(r.id, `${'x'.repeat(MAX_REPLY_BODY_LENGTH)} `), original = { ...draft }
    const result = await sendReviewContact(r.id, getReviewContactIdentity(r.id))
    expect(result).toMatchObject({ ok: false, message: `站内信正文不能超过 ${MAX_REPLY_BODY_LENGTH} 个字符` })
    expect(draft).toEqual(original)
    expect(getReviewContactConversation(r.id)).toBeUndefined()
  })

  it('编辑器遗留的内部标题不参与外发，不发送参考翻译', async () => {
    const r = getNewReview(), draft = prepare(r.id)
    draft.subject = 'Internal only'; draft.translation = '仅供客服参考'
    expect((await finish(r.id)).ok).toBe(true)
    const message = getReviewContactConversation(r.id)!.messages[0]!
    expect(message).not.toHaveProperty('subject')
    expect(message).not.toHaveProperty('translation')
    expect(draft).toEqual({ body: '', attachments: [] })
  })
})

describe('发送异常与异步草稿隔离', () => {
  it('明确失败保留独立草稿，可核对内容后再发', async () => {
    const draft = prepare(), snapshot = { ...draft }
    expect((await finish(existingId, 'failed')).delivery).toBe('failed')
    expect(draft).toEqual(snapshot)
    expect(getReviewContactBlockedReason(existingId)).toBeUndefined()
    draft.body = 'Corrected message.'
    expect((await finish(existingId, 'success')).ok).toBe(true)
  })

  it('结果未知保留正文并阻止重复，记录进入失败待核查列表', async () => {
    const draft = prepare(), snapshot = { ...draft }
    const result = await finish(existingId, 'unknown')
    expect(result.delivery).toBe('unknown')
    expect(draft).toEqual(snapshot)
    expect(getReviewContactBlockedReason(existingId)).toContain('待核查')
    expect((await sendReviewContact(existingId, getReviewContactIdentity(existingId))).ok).toBe(false)
    expect(mailboxEntries(mailSession.conversations, 'failed').some(entry => entry.message?.id === result.messageId)).toBe(true)
  })

  it('等待期间更改草稿或切换买家，不被原发送结果清空', async () => {
    const draft = prepare(), r = getNewReview(), otherDraft = prepare(r.id, 'Another buyer draft.')
    const pending = sendReviewContact(existingId, getReviewContactIdentity(existingId))
    draft.body = 'A newly edited draft.'
    await vi.advanceTimersByTimeAsync(300)
    expect((await pending).ok).toBe(true)
    expect(draft.body).toBe('A newly edited draft.')
    expect(otherDraft.body).toBe('Another buyer draft.')
  })

  it('发送中评价身份改变，结果仍只归发送时的原会话', async () => {
    const r = reviewSession.reviews.find(item => item.id === existingId)!, c = getReviewContactConversation(existingId)!
    prepare()
    const pending = sendReviewContact(existingId, getReviewContactIdentity(existingId))
    r.buyerId = 'changed-after-send'
    await vi.advanceTimersByTimeAsync(300)
    expect((await pending).ok).toBe(true)
    expect(c.buyerId).toBe('buyer_demo_01')
    expect(c.messages[c.messages.length - 1]?.delivery).toBe('success')
    expect(getReviewContactBlockedReason(existingId)).toBeTruthy()
  })

  it('发送中会话身份改变，保留待核查记录且不冒充成功', async () => {
    const c = getReviewContactConversation(existingId)!, draft = prepare()
    const pending = sendReviewContact(existingId, getReviewContactIdentity(existingId))
    c.buyerId = 'changed-after-send'
    await vi.advanceTimersByTimeAsync(300)
    expect(await pending).toMatchObject({ ok: false, delivery: 'unknown' })
    expect(c.messages[c.messages.length - 1]?.delivery).toBe('unknown')
    expect(draft.body).not.toBe('')
  })

  it('邮箱重置后旧回调不写入新会话，重置草稿支持测试隔离', async () => {
    prepare()
    const pending = sendReviewContact(existingId, getReviewContactIdentity(existingId))
    resetMailSession()
    const mailbox = JSON.stringify(mailSession)
    await vi.advanceTimersByTimeAsync(300)
    expect((await pending).ok).toBe(false)
    expect(JSON.stringify(mailSession)).toBe(mailbox)
    resetReviewContactSession()
    expect(getReviewContactDraft(existingId)).toEqual({ body: '', attachments: [] })
    expect(isReviewContactSending(existingId)).toBe(false)
  })
})

describe('嵌入回复编辑器的上下文、富文本和临时草稿', () => {
  it('首次联系只构造上下文，打开编辑器不会创建会话和来信', () => {
    const r = getNewReview(), snapshot = JSON.stringify(mailSession)
    const context = getReviewContactEditorConversation(r.id)!
    expect(context).toMatchObject({ shopId: r.shopId, buyerId: r.buyerId, messages: [], relatedOrderIds: [], association: 'none' })
    expect(JSON.stringify(mailSession)).toBe(snapshot)
    expect(getReviewContactConversation(r.id)).toBeUndefined()
  })

  it('历史富文本转为纯文本与附件按提交快照进入共享发件箱，关闭不改写在途发送内容', async () => {
    const r = getNewReview(), draft = prepare(r.id, 'Hello buyer')
    draft.bodyHtml = '<p><strong>Hello</strong> buyer</p>'
    const attachment = { id: 'pdf', name: 'guide.pdf', type: 'application/pdf', size: 100, source: 'local' as const }
    draft.attachments.push(attachment)
    const pending = sendReviewContact(r.id, getReviewContactIdentity(r.id))
    attachment.name = 'Changed after submit.pdf'
    discardReviewContactDraft(draft)
    expect(draft).toEqual({ body: '', attachments: [] })
    const reopened = getReviewContactDraft(r.id)!
    reopened.body = 'A different new window'
    await vi.advanceTimersByTimeAsync(300)
    const result = await pending
    expect(result.ok).toBe(true)
    const entry = mailboxEntries(mailSession.conversations, 'outbox').find(item => item.message?.id === result.messageId)!
    expect(entry.message).toMatchObject({ body: 'Hello buyer', attachments: [{ name: 'guide.pdf' }] })
    expect(entry.message).not.toHaveProperty('bodyHtml')
    expect(reopened.body).toBe('A different new window')
  })

  it('新正文保留实际空格和换行，历史列表编号进入文字并按最终长度校验', async () => {
    const r = getNewReview(), draft = prepare(r.id, '  First line\nSecond line  ')
    const result = await finish(r.id, 'success')
    const sent = getReviewContactConversation(r.id)!.messages.find(item => item.id === result.messageId)!
    expect(sent.body).toBe('  First line\nSecond line  ')
    expect(sent).not.toHaveProperty('bodyHtml')
    draft.body = 'x'.repeat(1998); draft.bodyHtml = `<ol><li>${draft.body}</li></ol>`
    const count = getReviewContactConversation(r.id)!.messages.length
    expect((await sendReviewContact(r.id, getReviewContactIdentity(r.id))).message).toContain('2000')
    expect(getReviewContactConversation(r.id)!.messages).toHaveLength(count)
    draft.body = 'First\nSecond'; draft.bodyHtml = '<ol><li>First</li><li>Second</li></ol>'
    const listResult = await finish(r.id, 'success')
    expect(getReviewContactConversation(r.id)!.messages.find(item => item.id === listResult.messageId)?.body).toBe('1. First\n2. Second')
  })

  it('富文本不一致和不合格附件在创建会话前被阻止', async () => {
    const r = getNewReview(), draft = prepare(r.id, 'Plain body')
    draft.bodyHtml = '<p>Different body</p>'
    expect((await sendReviewContact(r.id, getReviewContactIdentity(r.id))).message).toContain('不一致')
    delete draft.bodyHtml
    draft.attachments.push({ id: 'unsafe', name: 'image.jpg', size: 0, type: 'image/jpeg', source: 'url', url: 'http://127.0.0.1/image.jpg' })
    expect((await sendReviewContact(r.id, getReviewContactIdentity(r.id))).ok).toBe(false)
    expect(getReviewContactConversation(r.id)).toBeUndefined()
  })

  it('失败内容在窗口内保留，关闭时正文、格式、附件、翻译和旧标题全部丢弃', async () => {
    const draft = prepare(existingId, 'Keep while open')
    draft.bodyHtml = '<p>Keep while open</p>'
    draft.attachments = [{ id: 'keep', name: 'guide.pdf', size: 20, type: 'application/pdf' }]
    draft.translation = '参考'; draft.subject = '旧内部标题'; draft.savedAt = '2026-10-29T10:00:00Z'
    const snapshot = JSON.stringify(draft)
    expect((await finish(existingId, 'failed')).ok).toBe(false)
    expect(JSON.stringify(draft)).toBe(snapshot)
    discardReviewContactDraft(draft)
    expect(draft).toEqual({ body: '', attachments: [] })
    expect(getReviewContactDraft(existingId)).toEqual({ body: '', attachments: [] })
    expect(getReviewContactDraft(existingId)).not.toBe(draft)
  })
})

const ContactDialogShell = {
  props: ['modelValue', 'title'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" role="dialog" :aria-label="title" tabindex="0" @keydown.esc="$emit(\'update:modelValue\', false)"><button aria-label="关闭弹窗" @click="$emit(\'update:modelValue\', false)">×</button><slot /><footer><slot name="footer" /></footer></section>',
}
function contactWindow(reviewId = existingId) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/oms/ebay-service/messages', component: { template: '<div />' } }] })
  let wrapper: VueWrapper
  wrapper = mount(ContactBuyer, {
    props: { reviewId, modelValue: true, 'onUpdate:modelValue': (value: boolean) => { void wrapper.setProps({ modelValue: value }) } },
    attachTo: document.body,
    global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: ContactDialogShell } },
  })
  contactWrappers.push(wrapper)
  return wrapper
}
function contactButton(wrapper: VueWrapper, label: string) { return wrapper.findAll('button').find(button => button.text().trim() === label)! }
function fillContactDraft(id = existingId) {
  const draft = getReviewContactDraft(id)!
  Object.assign(draft, { body: 'Unsubmitted contact text', bodyHtml: '<p><strong>Unsubmitted</strong> contact text</p>', attachments: [{ id: 'draft-file', name: 'guide.pdf', size: 20, type: 'application/pdf' }], translation: '未提交参考' })
  return draft
}

describe('联系窗口生命周期保护', () => {
  it.each(['底部关闭', 'X关闭', 'Esc关闭', 'props关闭'] as const)('%s 立即丢弃全文、富文本和附件，重开为空且邮箱草稿不变', async action => {
    const wrapper = contactWindow(), draft = fillContactDraft()
    mailSession.drafts[draftKey('conv-01', 'reply')] = { body: 'Mailbox owned draft', attachments: [] }
    const mailboxDrafts = JSON.stringify(mailSession.drafts)
    await flushPromises()
    if (action === '底部关闭') await contactButton(wrapper, '关闭').trigger('click')
    if (action === 'X关闭') await wrapper.get('[aria-label="关闭弹窗"]').trigger('click')
    if (action === 'Esc关闭') await wrapper.get('[role="dialog"][aria-label="联系买家"]').trigger('keydown', { key: 'Escape' })
    if (action === 'props关闭') await wrapper.setProps({ modelValue: false })
    await flushPromises()
    expect(draft).toEqual({ body: '', attachments: [] })
    expect(wrapper.find('[aria-label="联系买家站内信正文"]').exists()).toBe(false)
    await wrapper.setProps({ modelValue: true })
    expect(getReviewContactDraft(existingId)).toEqual({ body: '', attachments: [] })
    expect((wrapper.get('textarea[aria-label="联系买家站内信正文"]').element as HTMLTextAreaElement).value).toBe('')
    expect(JSON.stringify(mailSession.drafts)).toBe(mailboxDrafts)
  })

  it('切换评价清除旧对象内容，卸载同样清除当前对象且不创建新会话', async () => {
    const r = getNewReview(), count = mailSession.conversations.length
    const wrapper = contactWindow(), first = fillContactDraft()
    await wrapper.setProps({ reviewId: r.id })
    expect(first).toEqual({ body: '', attachments: [] })
    expect(getReviewContactDraft(r.id)).toEqual({ body: '', attachments: [] })
    const second = fillContactDraft(r.id)
    wrapper.unmount(); contactWrappers.splice(contactWrappers.indexOf(wrapper), 1)
    expect(second).toEqual({ body: '', attachments: [] })
    expect(getReviewContactDraft(r.id)).toEqual({ body: '', attachments: [] })
    expect(mailSession.conversations).toHaveLength(count)
  })

  it('实际纯文本编辑器单步发送，在途关闭重开不会恢复旧成功提示或清掉新内容', async () => {
    const wrapper = contactWindow(), c = getReviewContactConversation(existingId)!
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    const editor = wrapper.get('textarea[aria-label="联系买家站内信正文"]')
    await editor.setValue('Sent from embedded plain text editor')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('内部参考标题')
    await contactButton(wrapper, '发送站内信').trigger('click')
    expect(c.messages[c.messages.length - 1]?.delivery).toBe('sending')
    await contactButton(wrapper, '关闭').trigger('click'); await flushPromises()
    await wrapper.setProps({ modelValue: true })
    const fresh = getReviewContactDraft(existingId)!
    fresh.body = 'New window content'
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(c.messages[c.messages.length - 1]).toMatchObject({ body: 'Sent from embedded plain text editor', delivery: 'success' })
    expect(c.messages[c.messages.length - 1]?.bodyHtml).toBeUndefined()
    expect(fresh.body).toBe('New window content')
    expect(wrapper.find('.review-contact-success').exists()).toBe(false)
    expect(wrapper.emitted('sent')).toBeUndefined()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
