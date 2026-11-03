import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import MailPage from './eBay站内信页面.vue'
import ReplyEditor from './回复编辑器.vue'
import { createConversations } from './数据'
import { resetMailSession } from './会话'
import { resetTemplateSession } from '../消息模板管理/模型'
import { 原型标注指令 } from '@/原型标注/原型标注指令'
import { 标注状态 } from '@/原型标注/标注状态'
import type { ReplyDraft } from './类型'

const wrappers: VueWrapper[] = []
beforeEach(() => { resetMailSession(); resetTemplateSession() })
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function registered(id: string) {
  const item = 标注状态.注册项.value.find(entry => entry.标注.id === `oms.ebay.messages.${id}` && entry.元素.isConnected)
  expect(item, `${id}应通过真实指令注册到已挂载元素`).toBeDefined()
  expect(item!.元素.dataset.prototypeId).toBe(`oms.ebay.messages.${id}`)
  return item!
}

describe('站内信实际DOM标注锚点', () => {
  it('真实菜单、发送按钮与弹窗body注册read/send/batchReply/forward，不把指令挂在非元素组件root', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 保留真实ElDropdownItem与ElDialog：壳组件stub会掩盖非元素root导致指令失效的问题。
    const wrapper = mount(MailPage, { attachTo: document.body, global: { directives: { prototype: 原型标注指令 } } })
    wrappers.push(wrapper)
    await nextTick(); await flushPromises()

    const send = registered('send')
    expect(send.元素.tagName).toBe('SPAN')
    expect(send.元素.querySelector('button')?.textContent?.trim()).toBe('发送')
    expect(send.标注.数据来源?.join('')).toContain('M03')

    await wrapper.get('[aria-label="当前信件更多操作"]').trigger('click')
    await flushPromises(); await nextTick()
    const read = registered('read')
    expect(read.元素.tagName).toBe('SPAN')
    expect(read.元素.closest('li')?.classList.contains('el-dropdown-menu__item')).toBe(true)
    expect(read.标注.数据来源?.join('')).toContain('M04')

    await wrapper.get('.mail-list-row input[type="checkbox"]').setValue(true)
    await wrapper.findAll('button').find(button => button.text().trim() === '批量回复')!.trigger('click')
    await flushPromises(); await nextTick()
    const batch = registered('batchReply')
    expect(batch.元素.classList.contains('mail-batch-dialog-body')).toBe(true)
    expect(batch.元素.closest('.el-dialog')).not.toBeNull()
    expect(batch.元素.textContent).toContain('正文中的变量分别按每位买家的资料替换')
    expect(batch.标注.数据来源?.join('')).toContain('没有平台批量发送端点')

    const cancel = Array.from(batch.元素.closest('.el-dialog')!.querySelectorAll('button')).find(button => button.textContent?.trim() === '取消')!
    cancel.click(); await flushPromises(); await nextTick()
    const forwardItem = Array.from(read.元素.closest('ul')!.querySelectorAll('li')).find(item => item.textContent?.trim() === '转发站内信')!
    forwardItem.click(); await flushPromises(); await nextTick()
    const forward = registered('forward')
    expect(forward.元素.classList.contains('mail-forward-dialog-body')).toBe(true)
    expect(forward.元素.closest('.el-dialog')).not.toBeNull()
    expect(warnings.mock.calls.flat().map(String).filter(message => /Runtime directive used on component with non-element root/.test(message))).toEqual([])
  })

  it('评价联系买家分支保留contactSend，不额外挂载站内信工作台send锚点', async () => {
    const draft = reactive<ReplyDraft>({ body: 'Hello buyer', attachments: [] })
    const wrapper = mount(ReplyEditor, {
      props: { conversation: createConversations()[0]!, draft, mode: 'reply', sending: false, uncertain: false, purpose: 'review-contact' },
      attachTo: document.body,
      global: { directives: { prototype: 原型标注指令 } },
    })
    wrappers.push(wrapper)
    await nextTick()
    expect(wrapper.get('.reply-footer').attributes('data-prototype-id')).toBe('oms.ebay-reviews.contactSend')
    expect(wrapper.find('[data-prototype-id="oms.ebay.messages.send"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some(button => button.text().trim() === '发送站内信')).toBe(true)
  })
})
