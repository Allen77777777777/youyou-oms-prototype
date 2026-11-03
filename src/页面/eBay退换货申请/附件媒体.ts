import type { ReturnAttachment } from './接口契约'
import { safeMediaUrl } from './展示工具'

export const attachmentIsImage = (file: ReturnAttachment): boolean => /^(png|jpe?g|gif|bmp)$/i.test(file.fileFormat)
export const attachmentIsPdf = (file: ReturnAttachment): boolean => /^pdf$/i.test(file.fileFormat)

/** 缩略图只用于列表；原文件仅从原内容、来源原件地址或已知本地演示原图取得。 */
export function originalAttachmentUrl(file: ReturnAttachment): string {
  if (file.fileStatus === 'DELETED') return ''
  const source = safeMediaUrl(file.secureUrl)
  if (source) return source
  const format = file.fileFormat.toLowerCase().replace(/^jpg$/, 'jpeg')
  const mime = format === 'pdf' ? 'application/pdf' : /^(png|jpeg|gif|bmp)$/.test(format) ? `image/${format}` : ''
  if (mime && file.fileData) {
    const data = file.fileData.startsWith('data:') ? file.fileData : `data:${mime};base64,${file.fileData}`
    if (data.startsWith(`data:${mime};base64,`)) { const safe = safeMediaUrl(data); if (safe) return safe }
  }
  if (file.demo && file.previewUrl) {
    const names = ['demo-return-proof-1.png', 'demo-return-proof-2.png']
    if (names.some(name => [name, `/${name}`, `./${name}`, `${import.meta.env.BASE_URL}${name}`].includes(file.previewUrl!))) return file.previewUrl
  }
  return ''
}

export function thumbnailAttachmentUrl(file: ReturnAttachment): string {
  if (file.fileStatus === 'DELETED' || !attachmentIsImage(file)) return ''
  const preview = safeMediaUrl(file.previewUrl)
  if (preview) return preview
  if (file.resizedFileData) {
    const format = file.fileFormat.toLowerCase().replace(/^jpg$/, 'jpeg')
    const data = file.resizedFileData.startsWith('data:') ? file.resizedFileData : `data:image/${format};base64,${file.resizedFileData}`
    const safe = safeMediaUrl(data)
    if (safe) return safe
  }
  return originalAttachmentUrl(file)
}

export function attachmentDownloadName(file: ReturnAttachment): string {
  const name = file.fileName.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim() || '退货附件'
  const format = file.fileFormat.toLowerCase().replace(/^jpeg$/, 'jpg')
  if (!/^(png|jpg|gif|bmp|pdf)$/.test(format)) return name
  const suffix = format === 'jpg' ? /\.jpe?g$/i : new RegExp(`\\.${format}$`, 'i')
  return !suffix.test(name) ? `${name}.${format}` : name
}
