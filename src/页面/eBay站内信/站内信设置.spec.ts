import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import Settings from './站内信设置.vue'
import { mailSession, resetMailSession } from './会话'
import { countMailTagReferences, mailTagDefinitions, resetMailTagDefinitions } from './设置模型'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { mailAccessProfiles, resetMailAccessProfiles } from './权限与协作'

const wrappers: VueWrapper[] = []
const DialogShell = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" role="dialog" :aria-label="title"><slot /><footer><slot name="footer" /></footer></section>' }
function settings() {
  const wrapper = mount(Settings, { props: { modelValue: true }, attachTo: document.body, global: { stubs: { ElDialog: DialogShell } } })
  wrappers.push(wrapper)
  return wrapper
}
function button(wrapper: VueWrapper, label: string) {
  const result = wrapper.findAll('button').find(item => item.text().trim() === label)
  if (!result) throw new Error(`找不到 ${label}`)
  return result
}
beforeEach(() => { currentHandlerId.value = 'staff-01'; resetMailAccessProfiles(); resetMailSession(); resetMailTagDefinitions() })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('站内信设置弹窗', () => {
  it('无字典维护权显示只读，删除确认期间撤权后仍保留字典和引用', async () => {
    const wrapper = settings(), affected = countMailTagReferences('logistics')
    let approve!: () => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementationOnce(() => new Promise(resolve => { approve = () => resolve('confirm' as never) }))
    await wrapper.get('[aria-label="删除标签 物流查询"]').trigger('click')
    mailAccessProfiles['staff-01']!.actions = mailAccessProfiles['staff-01']!.actions.filter(action => action !== 'tagsAdmin')
    approve()
    await flushPromises()
    expect(mailTagDefinitions.some(tag => tag.id === 'logistics')).toBe(true)
    expect(countMailTagReferences('logistics')).toBe(affected)
    expect(button(wrapper, '新增标签').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="删除标签 物流查询"]').attributes('disabled')).toBeDefined()
  })

  it('编辑和自定义颜色先写草稿，取消不改变共享标签，确认后稳定ID更新', async () => {
    const wrapper = settings(), original = { ...mailTagDefinitions[0]! }
    await wrapper.get('[aria-label="编辑标签 物流查询"]').trigger('click')
    await wrapper.get('[aria-label="标签名称"]').setValue('物流跟进')
    await wrapper.get('[aria-label="自定义标签颜色"]').setValue('#112233')
    expect(mailTagDefinitions[0]).toMatchObject(original)
    await button(wrapper, '取消编辑').trigger('click')
    expect(mailTagDefinitions[0]).toMatchObject(original)
    await wrapper.get('[aria-label="编辑标签 物流查询"]').trigger('click')
    await wrapper.get('[aria-label="标签名称"]').setValue(' 物流跟进 ')
    await wrapper.get('[aria-label="自定义标签颜色"]').setValue('#112233')
    await button(wrapper, '保存标签').trigger('click')
    expect(mailTagDefinitions[0]).toMatchObject({ id: original.id, label: '物流跟进', color: '#112233' })
    expect(wrapper.emitted('send')).toBeUndefined()
  })
  it('新增校验重名，关闭后重新打开不提交未保存输入', async () => {
    const wrapper = settings()
    await button(wrapper, '新增标签').trigger('click')
    await wrapper.get('[aria-label="标签名称"]').setValue('物流查询')
    await button(wrapper, '保存标签').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('已存在')
    expect(mailTagDefinitions).toHaveLength(6)
    await wrapper.get('[aria-label="标签名称"]').setValue('未保存标签')
    await button(wrapper, '关闭').trigger('click')
    const changes = wrapper.emitted('update:modelValue')
    expect(changes?.[changes.length - 1]).toEqual([false])
    await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true })
    expect(wrapper.find('[aria-label="标签名称"]').exists()).toBe(false)
    expect(mailTagDefinitions).toHaveLength(6)
  })
  it('删除提示准确影响数量，取消保留引用，确认清理会话标签且不外发', async () => {
    const wrapper = settings(), affected = countMailTagReferences('logistics')
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    const messagesBefore = mailSession.conversations.map(conversation => conversation.messages.length)
    await wrapper.get('[aria-label="删除标签 物流查询"]').trigger('click'); await flushPromises()
    expect(String(confirm.mock.calls[0]?.[0])).toContain(`${affected} 个会话`)
    expect(countMailTagReferences('logistics')).toBe(affected)
    expect(mailTagDefinitions.some(tag => tag.id === 'logistics')).toBe(true)
    // 这里只验证确认 Promise 已解决；业务不读取 MessageBox 的返回载荷。
    confirm.mockResolvedValueOnce(undefined as never)
    await wrapper.get('[aria-label="删除标签 物流查询"]').trigger('click'); await flushPromises()
    expect(countMailTagReferences('logistics')).toBe(0)
    expect(mailTagDefinitions.some(tag => tag.id === 'logistics')).toBe(false)
    expect(mailSession.conversations.map(conversation => conversation.messages.length)).toEqual(messagesBefore)
  })
})
