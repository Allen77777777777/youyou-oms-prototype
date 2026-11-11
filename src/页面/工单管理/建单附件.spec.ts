import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreateDialog from './建单弹窗.vue'
import Detail from './工单详情.vue'
import { currentActor, disputeSample, tickets } from './会话'
import { readFile, storeFiles } from './附件存储'

vi.mock('./附件存储', async original => ({
  ...await original<typeof import('./附件存储')>(),
  readFile: vi.fn(), storeFiles: vi.fn(), removeFiles: vi.fn(),
}))

const shell = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
const originalTickets = JSON.stringify(tickets.value)
const originalActor = currentActor.value
let wrapper: VueWrapper
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
  ElMessage.closeAll()
  tickets.value = JSON.parse(originalTickets)
  currentActor.value = originalActor
})

describe('建单材料', () => {
  it('从来源新建，截图和文件随首条记录保存；一次磁盘失败后可原样重试', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:create-file')
      static revokeObjectURL = vi.fn()
    })
    const stored = new Map<string, File>()
    vi.mocked(storeFiles).mockRejectedValueOnce(Error('写入失败')).mockImplementation(async files => {
      for (const item of files) stored.set(item.attachment.id, item.file)
    })
    vi.mocked(readFile).mockImplementation(async id => {
      const file = stored.get(id)
      if (!file) throw Error('原件缺失')
      return file
    })
    tickets.value = []
    currentActor.value = '客服小林'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    const global = { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: shell } }
    wrapper = mount(CreateDialog, { props: { source: disputeSample }, global })
    await wrapper.get('input[aria-label="工单事项"]').setValue('核对签收证明')
    const description = wrapper.get('textarea[aria-label="事项说明"]')
    await description.setValue('请核实截图和附件中的包裹号')
    const photo = new File(['image'], '签收图.png', { type: 'image/png' })
    await description.trigger('paste', { clipboardData: { files: [photo], items: [], getData: () => '' } })
    const input = wrapper.get('input[aria-label="选择建单附件"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['parcel'], '清单.csv', { type: 'text/csv' })] })
    await input.trigger('change')
    const submit = wrapper.findAll('button').find(node => node.text() === '创建')!
    await submit.trigger('click')
    await flushPromises()
    expect(tickets.value).toHaveLength(0)
    expect(wrapper.get('textarea').element.value).toBe('请核实截图和附件中的包裹号')
    expect(wrapper.findAll('.pending-files .ticket-file')).toHaveLength(2)
    expect(wrapper.emitted('created')).toBeUndefined()
    await submit.trigger('click')
    await flushPromises()
    expect(tickets.value).toHaveLength(1)
    expect(wrapper.emitted('created')).toHaveLength(1)
    const record = tickets.value[0]!
    expect(record.logs).toHaveLength(1)
    expect(record.logs[0]!.attachments?.map(file => file.name)).toEqual(['签收图.png', '清单.csv'])
    expect(record.source?.id).toBe(disputeSample.id)
    wrapper.unmount()
    wrapper = mount(Detail, { props: { ticket: record }, global })
    await flushPromises()
    expect(wrapper.find('.history [aria-label="预览 签收图.png"]').exists()).toBe(true)
    expect(wrapper.get('.history a[download="清单.csv"]').attributes('href')).toMatch(/^blob:/)
  })
})
