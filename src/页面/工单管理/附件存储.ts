import type { TicketAttachment } from './会话'
import { builtinTicketAttachments, resolveBuiltinTicketAttachment } from './演示附件'

export interface PendingFile { attachment: TicketAttachment; file: File }

export function prepareFile(file: File): PendingFile {
  const id = [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8, '0')).join('')
  const name = file.name || (isRasterImage(file.type) ? '粘贴图片.' + file.type.split('/')[1] : '附件')
  return { attachment: { id, name, type: file.type, size: file.size }, file }
}

export function isRasterImage(type: string) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'].includes(type.toLowerCase())
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw Error('当前浏览器无法访问附件存储')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('youyou-ticket-attachments', 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onblocked = () => { blocked = true; reject(Error('附件存储正在被其他页面占用')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
  })
}

async function transact(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', mode)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error || Error('附件处理已中断'))
      try { run(transaction.objectStore('files')) }
      catch (error) { transaction.abort(); reject(error) }
    })
  } finally { db.close() }
}

/** 一条记录的全部文件在同一笔事务中成功后才保存日志。 */
export function storeFiles(files: PendingFile[]) {
  return transact('readwrite', store => { for (const { attachment, file } of files) store.put(file, attachment.id) })
}

export function removeFiles(files: PendingFile[]) {
  return transact('readwrite', store => { for (const { attachment } of files) store.delete(attachment.id) })
}

export async function readFile(id: string): Promise<Blob> {
  const builtinUrl = resolveBuiltinTicketAttachment(id)
  if (builtinUrl) {
    const attachment = builtinTicketAttachments.find(item => item.id === id)!
    try {
      const response = await fetch(builtinUrl)
      if (!response.ok) throw Error('附件响应失败')
      const blob = await response.blob()
      // 防止部署资源丢失时，SPA回退的HTML被当作成功附件交给用户。
      if (blob.size !== attachment.size) throw Error('附件内容不完整')
      return blob.slice(0, blob.size, attachment.type)
    } catch { throw Error('未能读取内置附件原文件，请刷新后重试') }
  }
  let blob: Blob | undefined
  await transact('readonly', store => {
    const request = store.get(id)
    request.onsuccess = () => { blob = request.result }
  })
  if (!(blob instanceof Blob)) throw Error('未找到附件原文件')
  return blob
}
