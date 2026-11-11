import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Detail from './工单详情.vue'
import { createTicket, currentActor, tickets, type Ticket } from './会话'
import { readFile, removeFiles, storeFiles } from './附件存储'
import { clearFollowupDraft } from './跟进草稿'

vi.mock('./附件存储', async original => ({
  ...await original<typeof import('./附件存储')>(),
  readFile: vi.fn(), storeFiles: vi.fn(), removeFiles: vi.fn(),
}))

let wrapper: VueWrapper
let ticket: Ticket
const originalTickets = JSON.stringify(tickets.value)
const originalActor = currentActor.value
const picture = () => new File(['image bytes'], '签收图.png', { type: 'image/png' })
const documentFile = () => new File(['parcel count: 2'], '核查结果.txt', { type: 'text/plain' })
const stored = new Map<string, File>()
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  wrapper = mount(Detail, { props: { ticket }, global: { plugins: [router], directives: { prototype: {} } } })
}
async function paste(file: File) {
  await wrapper.get('textarea[aria-label="跟进内容"]').trigger('paste', {
    clipboardData: { files: [], items: [{ type: file.type, kind: 'file', getAsFile: () => file }], getData: () => '' },
  })
}
async function select(file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}
beforeEach(async () => {
  clearFollowupDraft('GD-1001', '客服小林')
  clearFollowupDraft('GD-1001', '跟单员小周')
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:ticket-file')
    static revokeObjectURL = vi.fn()
  })
  stored.clear()
  vi.mocked(storeFiles).mockReset().mockImplementation(async files => {
    for (const item of files) stored.set(item.attachment.id, item.file)
  })
  vi.mocked(readFile).mockReset().mockImplementation(async id => {
    const file = stored.get(id)
    if (!file) throw Error('缺少文件')
    return file
  })
  vi.mocked(removeFiles).mockReset().mockImplementation(async files => { for (const item of files) stored.delete(item.attachment.id) })
  tickets.value = []
  currentActor.value = '客服小林'
  createTicket(undefined, { title: '退货进度', description: '', owner: '客服小林', nextAt: '', dueAt: '' })
  ticket = tickets.value[0]!
  await render()
})
afterEach(() => {
  wrapper.unmount()
  ElMessage.closeAll()
  vi.unstubAllGlobals()
  tickets.value = JSON.parse(originalTickets)
  currentActor.value = originalActor
})

describe('工单跟进材料', () => {
  it('粘贴截图、移除误选文件，附件单独保存；再次打开详情可预览和下载', async () => {
    expect(wrapper.get('[aria-label="来源单据"]').text()).toContain('无来源')
    expect(wrapper.find('.source-link').exists()).toBe(false)
    await paste(picture())
    await select(documentFile())
    expect(wrapper.findAll('.pending-files .ticket-file')).toHaveLength(2)
    await wrapper.get('button[aria-label="移除 核查结果.txt"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ticket.logs[ticket.logs.length - 1]?.attachments?.map(file => file.name)).toEqual(['签收图.png'])
    expect(wrapper.find('.pending-files').exists()).toBe(false)
    wrapper.unmount()
    await render()
    await flushPromises()
    expect(wrapper.find('.history [aria-label="预览 签收图.png"]').exists()).toBe(true)
    expect(wrapper.get('.history a[download="签收图.png"]').attributes('href')).toMatch(/^blob:/)
  })
  it('附件写入失败保留文字与原文件，重试成功后呈现附件；原件读取失败可以再取', async () => {
    await wrapper.get('textarea').setValue('核对清单见附件')
    await select(documentFile())
    vi.mocked(storeFiles).mockRejectedValueOnce(Error('quota'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('已保留')
    expect(wrapper.get('textarea').element.value).toBe('核对清单见附件')
    expect(wrapper.get('.pending-files').text()).toContain('核查结果.txt')
    expect(ticket.logs).toHaveLength(1)
    vi.mocked(readFile).mockRejectedValueOnce(Error('temporarily unavailable'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ticket.logs).toHaveLength(2)
    expect(wrapper.get('.history .file-error').text()).toContain('读取失败')
    await wrapper.get('.history .file-error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.history a[download="核查结果.txt"]').exists()).toBe(true)
  })
  it('调整优先级、勾选与取消已有事项时，保留正在写的文字、清单和附件；提交后一并保存', async () => {
    ticket.checklist = [{ id: 'old-item', text: '取得凭证', done: false }]
    await flushPromises()
    await wrapper.get('textarea[aria-label="跟进内容"]').setValue('请见实收照片')
    await wrapper.get('.checklist-add').trigger('click')
    await wrapper.get('.checklist-text').setValue('通知晚班客服')
    await wrapper.get('.checklist-text').trigger('paste', { clipboardData: { files: [picture()], items: [], getData: () => '' } })
    await wrapper.get('select[aria-label="工单优先级"]').setValue('紧急')
    const toggle = wrapper.get<HTMLInputElement>('.current-tasks input')
    await toggle.setValue(true)
    expect(wrapper.get('.tasks-header').text()).toContain('1 / 1')
    expect(ticket.status).not.toBe('已完成')
    await toggle.setValue(false)
    expect(ticket.priority).toBe('紧急')
    expect(wrapper.get('textarea').element.value).toBe('请见实收照片')
    expect(wrapper.get<HTMLInputElement>('.checklist-text').element.value).toBe('通知晚班客服')
    expect(wrapper.get('.pending-files').text()).toContain('签收图.png')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ticket.checklist?.map(item => [item.text, item.done])).toEqual([['取得凭证', false], ['通知晚班客服', false]])
    expect(ticket.logs[ticket.logs.length - 1]?.attachments?.[0]?.name).toBe('签收图.png')
    expect(wrapper.find('.checklist-text').exists()).toBe(false)
    expect(wrapper.get('.history').text()).toContain('紧急')
  })
  it('可以单独提交待办事项，已完成工单与其他人负责的工单都以只读方式查看清单和优先级', async () => {
    await wrapper.get('.checklist-add').trigger('click')
    await wrapper.get('.checklist-text').setValue('查看仓库收货记录')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.current-tasks').text()).toContain('查看仓库收货记录')
    currentActor.value = '跟单员小周'
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.current-tasks input').element.disabled).toBe(true)
    expect(wrapper.find('select[aria-label="工单优先级"]').exists()).toBe(false)
    currentActor.value = ticket.owner
    ticket.status = '已完成'
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.current-tasks input').element.disabled).toBe(true)
    expect(wrapper.find('select[aria-label="工单优先级"]').exists()).toBe(false)
  })
})
