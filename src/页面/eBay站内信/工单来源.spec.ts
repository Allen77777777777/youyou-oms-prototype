import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MailPage from './eBay站内信页面.vue'
import SourceActions from '../工单管理/来源工单操作.vue'
import { tickets } from '../工单管理/会话'
import { draftKey, mailSession, resetMailSession } from './会话'

const path = '/oms/ebay-service/messages'
const initialTickets = tickets.value.slice()
let wrapper: VueWrapper | undefined

async function openMail(query: Record<string, string>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: MailPage }] })
  await router.push({ path, query })
  await router.isReady()
  const dialog = { props: ['modelValue'], template: '<aside v-if="modelValue" role="dialog"><slot/><slot name="footer"/></aside>' }
  wrapper = mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: dialog } } })
  await flushPromises()
  return router
}

beforeEach(resetMailSession)
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; tickets.value = initialTickets.slice() })

describe('站内信工单来源', { timeout: 20000 }, () => {
  it('从指定来信建单后仅该信显示新增关联，保留会话指派、处理状态及原信', async () => {
    const conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    await openMail({ shopId: 'shop-us', conversationId: 'conv-01', messageId: 'msg-01-1' })
    const workflow = { status: conversation.status, assignee: conversation.assignee, messageCount: conversation.messages.length }
    const source = wrapper!.get('.mail-message[data-message-id="msg-01-1"]')
    const other = wrapper!.get('.mail-message[data-message-id="msg-01-3"]')
    const otherLinks = other.get('.ticket-source-actions').text()
    await source.get('.ticket-source-actions button').trigger('click')
    const form = source.get('[role="dialog"]')
    await form.get('input[aria-label="工单事项"]').setValue('请核实此款商品的尺寸')
    await form.findAll('button').find(button => button.text() === '创建')!.trigger('click')
    await flushPromises()
    expect(source.get('.ticket-source-actions').text()).toContain('关联工单（1）')
    expect(other.get('.ticket-source-actions').text()).toBe(otherLinks)
    expect(tickets.value[0]).toMatchObject({ title: '请核实此款商品的尺寸', source: { id: 'msg-01-1', contextId: 'conv-01', shopId: 'shop-us' } })
    expect({ status: conversation.status, assignee: conversation.assignee, messageCount: conversation.messages.length }).toEqual(workflow)
  })
  it('每封买家来信带出各自身份，回看原消息保留会话原处理状态', async () => {
    const conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    conversation.status = 'processed'
    const originalMessageCount = conversation.messages.length
    const router = await openMail({ shopId: 'shop-us', conversationId: 'conv-01', messageId: 'msg-01-1' })
    expect(wrapper!.get('.is-target-message').attributes('data-message-id')).toBe('msg-01-1')
    const actions = wrapper!.get('.mail-thread').findAllComponents(SourceActions)
    expect(actions.map((component: VueWrapper<InstanceType<typeof SourceActions>>) => component.props('source')?.id)).toEqual(['msg-01-1', 'msg-01-2', 'msg-01-3'])
    expect(actions[0]!.props('source')).toMatchObject({ kind: 'message', shopId: 'shop-us', contextId: 'conv-01' })
    await router.push({ path, query: { shopId: 'shop-us', conversationId: 'conv-01', messageId: 'msg-01-3' } })
    await flushPromises()
    expect(wrapper!.get('.is-target-message').attributes('data-message-id')).toBe('msg-01-3')
    expect(conversation.status).toBe('processed')
    expect(conversation.messages).toHaveLength(originalMessageCount)
  })

  it('跨店、缺失和重复的来源身份均不展示相近会话', async () => {
    const conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    const router = await openMail({ shopId: 'shop-uk', conversationId: 'conv-01', messageId: 'msg-01-1' })
    expect(wrapper!.get('.mail-empty-reader').text()).toContain('该来源消息无法定位')
    await router.push({ path, query: { shopId: 'shop-us', conversationId: 'conv-01', messageId: 'missing' } })
    await flushPromises()
    expect(wrapper!.find('.mail-reader').exists()).toBe(false)
    conversation.messages.push({ ...conversation.messages[0]! })
    await router.push({ path, query: { shopId: 'shop-us', conversationId: 'conv-01', messageId: 'msg-01-1' } })
    await flushPromises()
    expect(wrapper!.get('.mail-empty-reader').text()).toContain('该来源消息无法定位')
    expect(conversation.unread).toBe(true)
  })

  it.each([
    { title: '成功发信', folder: 'outbox', conversationId: 'conv-01', messageId: 'msg-01-2', selector: '.mail-message.is-target-message' },
    { title: '平台通知', folder: 'ebay', conversationId: 'notice-01', messageId: 'notice-msg-1', selector: '.mail-notice-document' },
  ])('$title可精确打开原文并建单', async ({ title, folder, conversationId, messageId, selector }) => {
    await openMail({ shopId: 'shop-us', conversationId, messageId })
    expect(mailSession.folder).toBe(folder)
    expect(wrapper!.get(selector).attributes('data-message-id')).toBe(messageId)
    const actions = wrapper!.get('.mail-reader-actions').getComponent(SourceActions)
    expect(actions.props('source')?.id).toBe(messageId)
    await actions.get('button').trigger('click')
    const form = actions.get('[role="dialog"]')
    await form.get('input[aria-label="工单事项"]').setValue('跟进' + title)
    await form.findAll('button').find(button => button.text() === '创建')!.trigger('click')
    await flushPromises()
    expect(tickets.value[0]!.source).toMatchObject({ kind: 'message', id: messageId, contextId: conversationId })
    const linksScope = folder === 'outbox' ? wrapper!.get(selector) : wrapper!.get('.mail-reader-actions')
    expect(linksScope.text()).toContain('关联工单（1）')
  })

  it('常规收件箱选定不同来信时，读信区顶部直接打开该信工单表单', async () => {
    await openMail({})
    for (const id of ['msg-01-1', 'msg-01-3']) {
      await wrapper!.get('.mail-list-row[data-message-id="' + id + '"] .mail-row-content').trigger('click')
      const entry = wrapper!.get('.mail-reader-actions').getComponent(SourceActions)
      await entry.get('button').trigger('click')
      expect(entry.get('[role="dialog"]').text()).toContain(id)
      await entry.get('[role="dialog"]').findAll('button').find(button => button.text() === '取消')!.trigger('click')
    }
    expect(wrapper!.get('.mail-inbox').findComponent(SourceActions).exists()).toBe(false)
  })

  it('聚合会话先选来源，草稿箱不把内容自动绑到某封消息', async () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    c.flagged = true
    mailSession.drafts[draftKey(c.id, 'reply')] = { body: '尚未发送', attachments: [] }
    mailSession.folder = 'starred'
    await openMail({})
    const header = wrapper!.get('.mail-reader-actions')
    const choose = header.findAll('button').find(button => button.text() === '创建工单')!
    await choose.trigger('click'); await flushPromises()
    const options = Array.from(document.body.querySelectorAll('.mail-ticket-select-list li'))
    expect(options).toHaveLength(3)
    const row = options.find(item => item.textContent?.includes('Could you share your vehicle model'))!
    row.querySelector('button')!.click()
    await flushPromises()
    expect(row.querySelector('[role="dialog"]')?.textContent).toContain('msg-01-2')
    await wrapper!.get('button[aria-label="文件夹：草稿箱"]').trigger('click')
    expect(wrapper!.get('.mail-reader-actions').findComponent(SourceActions).exists()).toBe(false)
  })

  it('备注及未确认发送的消息没有工单入口，直达链接也不可用', async () => {
    const conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    const denied = ['note', 'sending', 'unknown', 'failed'] as const
    for (const kind of denied) {
      conversation.messages.push({ id: kind, sender: '客服01', body: kind, at: conversation.updatedAt,
        kind: kind === 'note' ? 'note' : 'outgoing', delivery: kind === 'note' ? undefined : kind })
    }
    const router = await openMail({ shopId: 'shop-us', conversationId: 'conv-01', messageId: 'msg-01-1' })
    for (const kind of denied) expect(wrapper!.get('.mail-message[data-message-id="' + kind + '"]').findComponent(SourceActions).exists()).toBe(false)
    for (const messageId of denied) {
      await router.push({ path, query: { shopId: 'shop-us', conversationId: 'conv-01', messageId } })
      await flushPromises()
      expect(wrapper!.get('.mail-empty-reader').text()).toContain('该来源消息无法定位')
    }
  })
})
