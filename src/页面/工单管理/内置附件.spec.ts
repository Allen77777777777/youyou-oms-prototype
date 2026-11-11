import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTicketAttachments, resolveBuiltinTicketAttachment } from './演示附件'
import { readFile } from './附件存储'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixtureBytes(name: string) {
  return readFileSync(fileURLToPath(new URL('./演示素材/' + name, import.meta.url)))
}
function mockDatabase(files: Map<string, Blob>) {
  const get = vi.fn((id: string) => {
    const request = { result: files.get(id), onsuccess: undefined as (() => void) | undefined }
    queueMicrotask(() => { request.onsuccess?.(); queueMicrotask(() => transaction.oncomplete?.()) })
    return request
  })
  const transaction = { oncomplete: undefined as (() => void) | undefined, objectStore: () => ({ get }) }
  const db = { transaction: () => transaction, close: vi.fn() }
  const open = vi.fn(() => {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined }
    queueMicrotask(() => request.onsuccess?.())
    return request
  })
  vi.stubGlobal('indexedDB', { open })
  return { open, get }
}

describe('工单内置附件', () => {
  it('只解析四个稳定白名单标识，元数据和复制原件字节及SHA256一致', () => {
    expect(builtinTicketAttachments).toHaveLength(4)
    expect(new Set(builtinTicketAttachments.map(item => item.id)).size).toBe(4)
    for (const attachment of builtinTicketAttachments) {
      expect(attachment.id).toMatch(/^demo-ticket-/)
      expect(resolveBuiltinTicketAttachment(attachment.id)).toEqual(expect.any(String))
      const bundled = fixtureBytes(attachment.name)
      const original = readFileSync(fileURLToPath(new URL('../../../验收素材/工单管理2026-11-05/' + attachment.name, import.meta.url)))
      expect(bundled.byteLength).toBe(attachment.size)
      expect(createHash('sha256').update(bundled).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'))
    }
    for (const id of ['demo-ticket-unknown', '../../仓库回函.txt', '__proto__', 'constructor', 'user-upload-id']) expect(resolveBuiltinTicketAttachment(id)).toBeUndefined()
  })
  it('内置附件直接从打包URL读取，不依赖当前浏览器的IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const fetchMock = vi.fn(async (url: string) => {
      const attachment = builtinTicketAttachments.find(item => resolveBuiltinTicketAttachment(item.id) === url)!
      return { ok: true, blob: async () => new Blob([fixtureBytes(attachment.name)]) }
    })
    vi.stubGlobal('fetch', fetchMock)
    for (const attachment of builtinTicketAttachments) {
      const blob = await readFile(attachment.id)
      expect(blob.size).toBe(attachment.size)
      expect(blob.type).toBe(attachment.type)
      expect(fetchMock).toHaveBeenLastCalledWith(resolveBuiltinTicketAttachment(attachment.id))
    }
  })
  it('资源缺失、网络失败或SPA错误回退均明确失败，不从用户文件兜底', async () => {
    const { open } = mockDatabase(new Map())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const id = builtinTicketAttachments[0]!.id
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(readFile(id)).rejects.toThrow('未能读取内置附件原文件')
    fetchMock.mockRejectedValueOnce(Error('offline'))
    await expect(readFile(id)).rejects.toThrow('未能读取内置附件原文件')
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['<html>index</html>'], { type: 'text/html' }) })
    await expect(readFile(id)).rejects.toThrow('未能读取内置附件原文件')
    expect(open).not.toHaveBeenCalled()
  })
  it('普通用户附件及未登记的demo前缀走原IndexedDB路径，缺失时不套用演示文件', async () => {
    const original = new Blob(['user original'], { type: 'text/plain' })
    const { get } = mockDatabase(new Map([['user-file', original]]))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await readFile('user-file')).toBe(original)
    expect(get).toHaveBeenCalledWith('user-file')
    await expect(readFile('missing-user-file')).rejects.toThrow('未找到附件原文件')
    await expect(readFile('demo-ticket-unregistered')).rejects.toThrow('未找到附件原文件')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
