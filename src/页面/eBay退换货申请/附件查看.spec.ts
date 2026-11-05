import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import ReturnAttachments from './申请附件.vue'
import { createReturnData } from './数据'
import type { ReturnAttachment } from './接口契约'
import { attachmentDownloadName, originalAttachmentUrl, thumbnailAttachmentUrl } from './附件媒体'

const wrappers: VueWrapper[] = []
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII='
const dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" class="preview-dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>' }
const objectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (objectUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', objectUrlDescriptor); else Reflect.deleteProperty(URL, 'createObjectURL')
  if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor); else Reflect.deleteProperty(URL, 'revokeObjectURL')
})
const file = (patch: Partial<ReturnAttachment> = {}): ReturnAttachment => ({ fileId: 'PROOF', fileName: '商品凭证.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED', fileStatus: 'PUBLISHED', submitter: 'BUYER', creationDate: '2026-10-28T03:21:00Z', fileData: png, ...patch })
function setup(files: ReturnAttachment[]) {
  const row = reactive(createReturnData()[0]!); row.detail!.files = files
  const wrapper = mount(ReturnAttachments, { props: { row }, global: { directives: { prototype: {} }, stubs: { ElDialog: dialog } } }); wrappers.push(wrapper)
  return { row, wrapper }
}
const button = (wrapper: VueWrapper, name: string) => wrapper.findAll('button').find(item => item.text().trim() === name)!

describe('附件原件与缩略资料隔离', () => {
  it('原件不能从resizedFileData或previewUrl推定，已知本地演示原图可使用', () => {
    const image = file({ fileData: undefined, resizedFileData: png, previewUrl: 'https://i.ebayimg.com/thumbnail.png' })
    expect(originalAttachmentUrl(image)).toBe('')
    expect(thumbnailAttachmentUrl(image)).toBe('https://i.ebayimg.com/thumbnail.png')
    expect(originalAttachmentUrl(file({ fileData: undefined, previewUrl: '/demo-return-proof-1.png', demo: true }))).toBe('/demo-return-proof-1.png')
    expect(originalAttachmentUrl(file({ fileData: undefined, previewUrl: 'https://evil.example/demo-return-proof-1.png', demo: true }))).toBe('')
    expect(originalAttachmentUrl(file({ fileData: undefined, secureUrl: 'http://i.ebayimg.com/original.png' }))).toBe('')
    expect(originalAttachmentUrl(file({ fileData: undefined, secureUrl: 'https://name:pass@i.ebayimg.com/original.png' }))).toBe('')
  })
  it('下载名清理路径字符并使已知格式扩展名匹配，不执行未知格式正则', () => {
    expect(attachmentDownloadName(file({ fileName: '../凭证:1.html' }))).toBe('.._凭证_1.html.png')
    expect(attachmentDownloadName(file({ fileName: '面单.pdf', fileFormat: 'PDF' }))).toBe('面单.pdf')
    expect(attachmentDownloadName(file({ fileFormat: '[' }))).toBe('商品凭证.png')
  })
})

describe('单击预览及真实原件下载', () => {
  it('缩略图和文件名均可单击进入原图预览，时间与来源独立展示', async () => {
    const original = 'https://i.ebayimg.com/original.png', thumb = 'https://i.ebayimg.com/thumb.png'
    const { wrapper } = setup([file({ secureUrl: original, previewUrl: thumb })])
    expect(wrapper.get('.file-thumbnail img').attributes('src')).toBe(thumb)
    expect(wrapper.get('.file-thumbnail').element.tagName).toBe('BUTTON')
    expect(wrapper.get('.file-name').element.tagName).toBe('BUTTON')
    expect(wrapper.get('.file-time').text()).toBe('2026-10-28 11:21:00')
    expect(wrapper.get('.file-source').text()).toBe('买家 · 商品凭证')
    await wrapper.get('.file-thumbnail').trigger('click')
    expect(wrapper.get('.preview-image img').attributes('src')).toBe(original)
    await button(wrapper, '关闭').trigger('click')
    await wrapper.get('.file-name').trigger('click')
    expect(wrapper.get('.preview-image img').attributes('src')).toBe(original)
  })

  it('PDF可单击预览且提供不支持嵌入时的原文件降级，未知格式不嵌入', async () => {
    const pdf = file({ fileName: '退货面单.pdf', fileFormat: 'PDF', filePurpose: 'LABEL_RELATED', secureUrl: 'https://i.ebayimg.com/label.pdf', fileData: undefined })
    const { wrapper } = setup([pdf, file({ fileId: 'OTHER', fileFormat: 'FUTURE', fileName: '未知格式', fileData: undefined, secureUrl: 'https://i.ebayimg.com/other' })])
    await wrapper.get('[data-file-id="PROOF"] .file-name').trigger('click')
    expect(wrapper.get('.preview-pdf').attributes('sandbox')).toBe('')
    expect(wrapper.get('.preview-pdf').attributes('src')).toBe(pdf.secureUrl)
    expect(wrapper.get('.preview-dialog').text()).toContain('可下载原文件后查看')
    expect(wrapper.get('.preview-dialog .original-link').attributes('href')).toBe(pdf.secureUrl)
    expect(wrapper.get('[data-file-id="OTHER"] .file-thumbnail').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-file-id="OTHER"] a').text()).toBe('打开原文件')
  })

  it('下载获取原文件blob，不对跨域来源URL直接伪装download属性', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['original binary'], { type: 'image/png' }) })
    vi.stubGlobal('fetch', fetcher)
    const objectUrl = vi.fn().mockReturnValue('blob:original-download')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: objectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    let clicked: { href: string; name: string } | undefined
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { clicked = { href: this.getAttribute('href')!, name: this.download } })
    const original = 'https://i.ebayimg.com/original.png'
    const { wrapper } = setup([file({ secureUrl: original, resizedFileData: 'THUMBNAIL' })])
    await button(wrapper, '下载').trigger('click'); await flushPromises()
    expect(fetcher).toHaveBeenCalledWith(original, expect.objectContaining({ credentials: 'omit', redirect: 'error', mode: 'cors' }))
    expect(objectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(clicked).toEqual({ href: 'blob:original-download', name: '商品凭证.png' })
    expect(wrapper.text()).not.toContain('下载成功')
  })

  it('跨域或获取失败展示失败原因和安全来源链接，不启动伪造下载', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const original = 'https://i.ebayimg.com/original.png'
    const { wrapper } = setup([file({ secureUrl: original })])
    await button(wrapper, '下载').trigger('click'); await flushPromises()
    expect(wrapper.get('.file-error').text()).toContain('原文件下载失败')
    expect(wrapper.get('.file-actions a').attributes('href')).toBe(original)
    expect(click).not.toHaveBeenCalled()
  })

  it.each(['deleted', 'unknown', 'held', 'failed', 'thumbnailOnly'] as const)('%s时不提供可用原件预览和下载', async condition => {
    const { wrapper, row } = setup([file()])
    if (condition === 'deleted') row.detail!.files[0]!.fileStatus = 'DELETED'
    if (condition === 'unknown') row.detail!.files[0]!.fileStatus = 'UNKNOWN'
    if (condition === 'held') row.detail!.contentOnHold = true
    if (condition === 'failed') row.detail!.readStatus.files.status = 'failed'
    if (condition === 'thumbnailOnly') { row.detail!.files[0]!.fileData = undefined; row.detail!.files[0]!.resizedFileData = png }
    await flushPromises()
    expect(button(wrapper, '下载')).toBeUndefined()
    expect(button(wrapper, '预览')).toBeUndefined()
    expect(wrapper.get('.file-thumbnail').attributes('disabled')).toBeDefined()
    expect(wrapper.find('a').exists()).toBe(false)
    if (condition === 'held') { expect(wrapper.text()).not.toContain('商品凭证.png'); expect(wrapper.find('img').exists()).toBe(false) }
  })

  it('查看中隐藏内容立即关闭预览；下载期间隐藏后不触发保存', async () => {
    let resolve: ((value: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise(done => { resolve = done })))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { wrapper, row } = setup([file()])
    await wrapper.get('.file-name').trigger('click')
    expect(wrapper.find('.preview-dialog').exists()).toBe(true)
    await button(wrapper, '下载').trigger('click')
    row.detail!.contentOnHold = true
    await flushPromises()
    expect(wrapper.find('.preview-dialog').exists()).toBe(false)
    resolve?.({ ok: true, blob: async () => new Blob(['original']) }); await flushPromises()
    expect(click).not.toHaveBeenCalled()
  })
})
