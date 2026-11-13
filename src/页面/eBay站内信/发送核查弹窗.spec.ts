import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { mailSession, resetMailSession } from './会话'
import { resetMailAccessProfiles } from './权限与协作'
import { resetMailVerification } from './发送核查'
import VerificationDialog from './发送核查弹窗.vue'

let wrapper: VueWrapper
const DialogShell = { props: ['modelValue'], emits: ['update:modelValue'], template: '<section v-if="modelValue"><slot /><footer><slot name="footer" /></footer></section>' }
beforeEach(() => {
  currentHandlerId.value = 'staff-01'
  resetMailAccessProfiles()
  resetMailSession()
  resetMailVerification()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); currentHandlerId.value = 'staff-01' })
function open() {
  const conversation = mailSession.conversations.find(c => c.id === 'conv-08')!
  const message = conversation.messages.find(m => m.id === 'msg-08-2')!
  wrapper = mount(VerificationDialog, { props: { modelValue: true, conversation, message }, global: { directives: { prototype: {} }, stubs: { ElDialog: DialogShell } } })
  return message
}
function button(text: string) { return wrapper.findAll('button').find(item => item.text() === text)! }

describe('发送核查弹窗', () => {
  it('只能先取得证据再确认，业务弹窗不提供任意选择发送结果的控件', async () => {
    const message = open()
    expect(button('按证据确认').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input,select,textarea').exists()).toBe(false)
    await button('回查发送结果').trigger('click')
    expect(wrapper.get('[aria-label="核查证据"]').text()).toContain('EBAY-DEMO-MSG-08')
    expect(button('按证据确认').attributes('disabled')).toBeUndefined()
    await button('按证据确认').trigger('click')
    expect(message.delivery).toBe('success')
    expect(wrapper.emitted('resolved')).toHaveLength(1)
  })
  it('仅有只读回查权的客服看得到证据，确认按钮保持禁用', async () => {
    currentHandlerId.value = 'staff-02'
    const message = open()
    await button('回查发送结果').trigger('click')
    expect(button('按证据确认').attributes('disabled')).toBeDefined()
    expect(message.delivery).toBe('unknown')
    expect(wrapper.text()).toContain('平台已收件')
  })
})
