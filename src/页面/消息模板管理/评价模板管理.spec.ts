import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElMessageBox, ElSelect } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import Page from './消息模板管理页面.vue'
import { feedbackTemplateSession, resetFeedbackTemplateSession } from './评价模板模型'
const Overlay = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' }
let wrapper: VueWrapper
async function click(text: string, scope: VueWrapper | ReturnType<VueWrapper['get']> = wrapper) {
  await scope.findAll('button').find(item => item.text().trim() === text)!.trigger('click'); await flushPromises()
}
const row = (name: string) => wrapper.findAll('.feedback-table .el-table__row').find(item => item.find('.feedback-name').text() === name)!
beforeEach(async () => {
  resetFeedbackTemplateSession()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  wrapper = mount(Page, { attachTo: document.body, global: { stubs: { ElDialog: Overlay }, directives: { prototype: {} } } })
  await click('评价模板')
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })
describe('消息模板管理评价页签', () => {
  it('单个新增页签容纳两类，类型和搜索查询后才应用，重置恢复', async () => {
    expect(wrapper.findAll('[role="tab"]').map(item => item.text())).toEqual(['站内信模板', '常用语', '评价模板'])
    expect(wrapper.findAll('.feedback-table .el-table__row')).toHaveLength(6)
    wrapper.findAllComponents(MultiFilter)[0]!.vm.$emit('update:modelValue', ['review-reply']); await flushPromises()
    expect(wrapper.findAll('.feedback-table .el-table__row')).toHaveLength(6)
    await click('查询'); expect(wrapper.findAll('.feedback-table .el-table__row')).toHaveLength(3)
    await wrapper.get('input[aria-label="评价模板搜索内容"]').setValue('感谢好评'); await click('查询')
    expect(wrapper.findAll('.feedback-table .el-table__row')).toHaveLength(1)
    await click('重置'); expect(wrapper.findAll('.feedback-table .el-table__row')).toHaveLength(6)
  })
  it('新增可选择类型，只维护名称和纯文本，超限阻断且取消不保存', async () => {
    await click('新增评价模板'); await click('保存')
    expect(wrapper.text()).not.toContain('保存后启用')
    expect(wrapper.get('[role="alert"]').text()).toContain('名称')
    const type = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '评价模板类型' || item.find('[aria-label="评价模板类型"]').exists())!
    type.vm.$emit('update:modelValue', 'review-reply'); await flushPromises()
    await wrapper.get('input[aria-label="评价模板名称"]').setValue('售后跟进回复')
    await wrapper.get('textarea[aria-label="评价模板正文"]').setValue('a'.repeat(501)); await click('保存')
    expect(wrapper.get('[role="alert"]').text()).toContain('500')
    await wrapper.get('textarea[aria-label="评价模板正文"]').setValue('Thank you for your feedback.'); await click('保存')
    const saved = feedbackTemplateSession.templates.find(item => item.name === '售后跟进回复')!
    expect(saved).toMatchObject({ type: 'review-reply', text: 'Thank you for your feedback.', enabled: true })
    await click('编辑', row(saved.name)); await wrapper.get('textarea[aria-label="评价模板正文"]').setValue('Unsaved'); await click('取消')
    expect(saved.text).toBe('Thank you for your feedback.')
    await click('站内信模板'); expect(wrapper.findAll('.template-table .el-table__row')).toHaveLength(5)
    await click('评价模板'); expect(row(saved.name).exists()).toBe(true)
  })
  it('复制停用、启停、预览及删除确认与取消均作用于准确模板', async () => {
    await click('复制', row('感谢购买'))
    const copy = feedbackTemplateSession.templates.find(item => item.name === '感谢购买（副本）')!
    expect(copy.enabled).toBe(false)
    await click('启用', row(copy.name)); expect(copy.enabled).toBe(true)
    await click('停用', row(copy.name)); expect(copy.enabled).toBe(false)
    await click('编辑', row(copy.name)); await click('保存'); expect(copy.enabled).toBe(true)
    await click('预览', row(copy.name)); expect(wrapper.get('.feedback-preview').text()).toBe(copy.text); await click('关闭')
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
    await click('删除', row(copy.name)); expect(row(copy.name).exists()).toBe(true)
    await click('删除', row(copy.name)); expect(feedbackTemplateSession.templates.some(item => item.id === copy.id)).toBe(false)
    expect(row('感谢购买').exists()).toBe(true)
  })
})
