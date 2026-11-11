import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, storeFiles } from './附件存储'
import { clearFollowupDraft, getFollowupDraft, saveFollowupDraft, ticketDraftKey } from './跟进草稿'
vi.mock('./附件存储', () => ({ readFile: vi.fn(), storeFiles: vi.fn() }))
const id = 'GD-DRAFT-TEST'
const actor = '客服小林'
beforeEach(() => {
  clearFollowupDraft(id, actor)
  vi.mocked(storeFiles).mockResolvedValue(undefined)
  vi.mocked(readFile).mockReset()
})
describe('跟进草稿恢复', () => {
  it('再次接手时未编辑的预约跟随最新安排，手动改过的预约保留并提示核对', async () => {
    const entry = getFollowupDraft(id, actor, '2026-11-06 09:00', '')
    await entry.ready
    entry.draft.note = '已有核查进展'
    expect(getFollowupDraft(id, actor, '2026-11-07 10:00', '').draft.nextAt).toBe('2026-11-07 10:00')
    entry.draft.nextAt = '2026-11-08 10:00'
    const restored = getFollowupDraft(id, actor, '2026-11-09 10:00', '')
    expect(restored.draft.nextAt).toBe('2026-11-08 10:00')
    expect(restored.notice).toContain('已有更新')
    expect(restored.draft.note).toBe('已有核查进展')
  })
  it('单份原件缺失时保留其他可恢复附件并指出缺失文件', async () => {
    const attachment = (name: string) => ({ id: name, name, size: 4, type: 'text/plain' })
    sessionStorage.setItem(ticketDraftKey(id, actor), JSON.stringify({ note: '核查草稿', attachments: [attachment('可读取.txt'), attachment('缺失.txt')] }))
    vi.mocked(readFile).mockImplementation(async name => { if (name === '缺失.txt') throw Error('missing'); return new Blob(['demo']) })
    const entry = getFollowupDraft(id, actor, '', '')
    await expect(entry.ready).rejects.toThrow('缺失.txt')
    expect(entry.draft.pending.map(item => item.attachment.name)).toEqual(['可读取.txt'])
    expect(entry.draft.note).toBe('核查草稿')
  })
  it('文件写入失败时不保存无效引用，后续重试保留同一份材料', async () => {
    const entry = getFollowupDraft(id, actor, '', '')
    await entry.ready
    const file = new File(['demo'], '凭证.txt', { type: 'text/plain' })
    entry.draft.pending = [{ attachment: { id: 'draft-file', name: file.name, size: file.size, type: file.type }, file }]
    vi.mocked(storeFiles).mockRejectedValueOnce(Error('quota'))
    await expect(saveFollowupDraft(id, actor, entry.draft)).rejects.toThrow('quota')
    expect(sessionStorage.getItem(ticketDraftKey(id, actor))).toBeNull()
    await saveFollowupDraft(id, actor, entry.draft)
    expect(JSON.parse(sessionStorage.getItem(ticketDraftKey(id, actor))!).attachments[0].id).toBe('draft-file')
    expect(entry.draft.pending[0]!.file).toBe(file)
  })
})
