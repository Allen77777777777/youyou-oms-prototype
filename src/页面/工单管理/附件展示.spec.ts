import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Attachment from './跟进附件.vue'
import Editor from './附件编辑.vue'
import { prepareFile, readFile } from './附件存储'

vi.mock('./附件存储', async original => ({ ...await original<typeof import('./附件存储')>(), readFile: vi.fn() }))
const wrappers: VueWrapper[] = []
const dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue"><h3>{{ title }}</h3><slot /><slot name="footer" /></section>' }
function render(file: File) {
  const pending = prepareFile(file)
  const wrapper = mount(Attachment, { props: { attachment: pending.attachment, pendingFile: file }, global: { stubs: { ElDialog: dialog } } })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks() })
function mockUrl() {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:attachment-preview')
    static revokeObjectURL = vi.fn()
  })
}

describe('工单附件展示', () => {
  it('图片呈现等比预览入口，打开大图后仍可下载原件', async () => {
    mockUrl()
    const wrapper = render(new File(['portrait'], '仓库实收照片.png', { type: 'image/png' }))
    await flushPromises()
    expect(wrapper.classes()).toContain('is-image')
    expect(wrapper.get('button[aria-label="预览 仓库实收照片.png"] img').attributes('alt')).toBe('仓库实收照片.png')
    await wrapper.get('.thumbnail').trigger('click')
    expect(wrapper.get('.full-image').attributes('src')).toBe('blob:attachment-preview')
    expect(wrapper.findAll('a[download="仓库实收照片.png"]')).toHaveLength(2)
  })
  it('长名称普通附件保留完整名称和大小，和图片混合时均可下载并独立移除', async () => {
    mockUrl()
    const image = prepareFile(new File(['image'], '截图.png', { type: 'image/png' }))
    const filename = '仓库退件核对清单-需要保留完整名称及原始文件内容-2026年11月.csv'
    const csv = prepareFile(new File(['sku,quantity\nDEMO-SKU,2\n'], filename, { type: 'text/csv' }))
    const wrapper = mount(Editor, { props: { modelValue: [image, csv] } })
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.findAll('.pending-files .ticket-file')).toHaveLength(2)
    expect(wrapper.findAll('.pending-files .is-image')).toHaveLength(1)
    const fileCard = wrapper.get('.ticket-file:not(.is-image)')
    expect(fileCard.get('.file-name').text()).toBe(filename)
    expect(fileCard.get('.file-info small').text()).toMatch(/ B$/)
    expect(fileCard.get('a[download]').attributes('download')).toBe(filename)
    await fileCard.get('button[aria-label^="移除 "]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([image])
  })
  it('图片解码失败后保留原文件下载，读取失败提供重试', async () => {
    mockUrl()
    const wrapper = render(new File(['bad-image'], '无法解码.png', { type: 'image/png' }))
    await flushPromises()
    await wrapper.get('.thumbnail img').trigger('error')
    expect(wrapper.find('.thumbnail').exists()).toBe(false)
    expect(wrapper.text()).toContain('图片无法预览')
    expect(wrapper.get('a[download="无法解码.png"]').attributes('href')).toBe('blob:attachment-preview')
    vi.mocked(readFile).mockRejectedValueOnce(Error('missing')).mockResolvedValueOnce(new Blob(['recovered']))
    const saved = mount(Attachment, { props: { attachment: { id: 'saved-file', name: '仓库回函.txt', type: 'text/plain', size: 9 } } })
    wrappers.push(saved)
    await flushPromises()
    expect(saved.get('[role="status"]').text()).toContain('读取失败')
    await saved.get('.file-error button').trigger('click')
    await flushPromises()
    expect(saved.get('a[download="仓库回函.txt"]').attributes('href')).toBe('blob:attachment-preview')
  })
})
