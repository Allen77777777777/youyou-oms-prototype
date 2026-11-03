import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { ElMessage, ElOption, ElSelect } from 'element-plus'
import ReturnData from './退货资料.vue'
import ReturnActionForm from './处理表单.vue'
import AttachmentUpload from './附件上传.vue'
import { createReturnData } from './数据'
import { buildReturnRequest, createReturnActionDraft, getReturnDetail, type ReturnAction, type ReturnRecord } from './模型'

const wrappers: VueWrapper[] = []
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII='), value => value.charCodeAt(0))
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); ElMessage.closeAll(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function form(row: ReturnRecord, action: ReturnAction) {
  const draft = reactive(createReturnActionDraft(row, action))
  const wrapper = mount(ReturnActionForm, { props: { row, action, draft, error: '' } }); wrappers.push(wrapper)
  return { wrapper, draft }
}
async function choose(wrapper: VueWrapper, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}

describe('办理区内上传退货附件', () => {
  it('资料区只读，移除独立上传和平台后台办理入口', () => {
    const row = createReturnData()[0]!
    row.detail!.availableActions = [{ actionType: 'SELLER_SEND_MESSAGE', actionURL: 'https://www.ebay.com/return/123' }]
    const wrapper = mount(ReturnData, { props: { row, area: 'aside' }, global: { directives: { prototype: {} } } }); wrappers.push(wrapper)
    expect(wrapper.get('.attachments-panel').text()).toContain('买家附件')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(wrapper.find('.platform-links').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('去 eBay 处理')
    expect(row.detail!.availableActions[0]!.actionURL).toBe('https://www.ebay.com/return/123')
  })

  it('沟通附件独立上传，不发送留言或捏造message附件参数', async () => {
    const row = reactive(createReturnData()[0]!), detail = getReturnDetail(row)
    const { wrapper, draft } = form(row, 'message')
    draft.text = 'Please see the item photo.'
    const purposes = wrapper.findComponent(ElSelect)
    expect(purposes.props('modelValue')).toBe('ITEM_RELATED')
    expect(wrapper.findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['ITEM_RELATED', 'REFUND_RELATED'])
    expect(wrapper.find('input[aria-label="选择沟通附件"]').exists()).toBe(true)
    await choose(wrapper, new File([png], '沟通图片.png', { type: 'image/png' }))
    await vi.waitFor(() => expect(detail.files.some(file => file.fileName === '沟通图片.png')).toBe(true))
    await flushPromises()
    expect(wrapper.get('.upload-result').text()).toContain('已上传，待关联')
    detail.files.find(file => file.fileName === '沟通图片.png')!.fileStatus = 'UNKNOWN'
    await flushPromises()
    expect(wrapper.get('.upload-result').text()).toContain('状态待核实')
    expect(wrapper.get('.upload-result').text()).not.toContain('待关联')
    expect(row.pendingAction).toBeNull()
    expect(row.outcome).toBe('idle')
    expect(row.history).toHaveLength(1)
    expect(buildReturnRequest(row, 'message', draft).request!.body).toEqual({ message: { content: 'Please see the item photo.' } })
    expect(wrapper.text()).toContain('分别提交')
  })

  it('面单在办理表单上传并自动选中，关联仍由面单请求及回执完成', async () => {
    const row = reactive(createReturnData()[10]!), detail = getReturnDetail(row)
    const { wrapper, draft } = form(row, 'label')
    await choose(wrapper, new File(['%PDF-1.4 test'], '退货面单.pdf', { type: 'application/pdf' }))
    await vi.waitFor(() => expect(draft.label.fileId).not.toBe(''))
    const uploaded = detail.files.find(file => file.fileId === draft.label.fileId)!
    expect(uploaded.filePurpose).toBe('LABEL_RELATED')
    expect(uploaded.fileStatus).toBe('CREATED')
    expect(row.state).toBe('RETURN_LABEL_PENDING')
    expect(row.pendingRequest).toBeUndefined()
    expect(buildReturnRequest(row, 'label', draft).request!.body).toEqual({ labelAction: 'UPLOAD_LABEL', fileId: uploaded.fileId })
    draft.label.labelAction = 'NO_LABEL'
    await flushPromises()
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    draft.label.noLabelReason = 'WORK_WITH_BUYER'
    expect(buildReturnRequest(row, 'label', draft).request!.body).toEqual({ labelAction: 'NO_LABEL', noLabelReason: 'WORK_WITH_BUYER' })
  })

  it.each(['pending', 'unknown', 'closed', 'case', 'caseClosed', 'hidden', 'ineligible', 'unknownState', 'readFailed'] as const)('%s时关闭上传入口', async condition => {
    const row = reactive(createReturnData()[0]!), detail = getReturnDetail(row)
    if (condition === 'pending' || condition === 'unknown') row.outcome = condition
    if (condition === 'closed') row.status = 'CLOSED'
    if (condition === 'case') row.caseId = 'DEMO-CASE'
    if (condition === 'caseClosed') detail.caseClosed = true
    if (condition === 'hidden') detail.contentOnHold = true
    if (condition === 'ineligible') row.options = []
    if (condition === 'unknownState') row.state = 'FUTURE'
    if (condition === 'readFailed') detail.readStatus.summary.status = 'failed'
    const { wrapper } = form(row, 'message')
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined()
    const before = detail.files.length
    await choose(wrapper, new File([png], '不能上传.png', { type: 'image/png' }))
    await flushPromises()
    expect(detail.files).toHaveLength(before)
  })

  it('沟通拒绝PDF，面单拒绝超过5MiB文件', async () => {
    const row = reactive(createReturnData()[0]!), before = row.detail!.files.length
    const { wrapper } = form(row, 'message')
    await choose(wrapper, new File(['%PDF-1.4'], '不适用.pdf', { type: 'application/pdf' }))
    expect(row.detail!.files).toHaveLength(before)
    const label = reactive(createReturnData()[10]!), labelBefore = label.detail!.files.length
    const labelForm = form(label, 'label').wrapper
    await choose(labelForm, new File([new Uint8Array(5 * 1024 * 1024 + 1)], '太大.pdf', { type: 'application/pdf' }))
    expect(label.detail!.files).toHaveLength(labelBefore)
  })

  it('读取过程中切换申请或操作离开后，不把附件写入其他申请', async () => {
    let finish: (() => void) | undefined
    class DelayedReader {
      result = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII='
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() { finish = () => this.onload?.() }
    }
    vi.stubGlobal('FileReader', DelayedReader)
    const row = reactive(createReturnData()[0]!), other = reactive(createReturnData()[1]!)
    const wrapper = mount(AttachmentUpload, { props: { row, mode: 'message' } }); wrappers.push(wrapper)
    const before = row.detail!.files.length, otherBefore = other.detail!.files.length
    await choose(wrapper, new File([png], '不能串单.png', { type: 'image/png' }))
    await wrapper.setProps({ row: other })
    finish?.(); await flushPromises()
    expect(row.detail!.files).toHaveLength(before)
    expect(other.detail!.files).toHaveLength(otherBefore)
    await choose(wrapper, new File([png], '离开不上传.png', { type: 'image/png' }))
    wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1)
    finish?.(); await flushPromises()
    expect(other.detail!.files).toHaveLength(otherBefore)
  })
})
