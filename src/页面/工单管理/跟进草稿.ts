import { reactive } from 'vue'
import type { TicketChecklistDraft, TicketAttachment } from './会话'
import { readFile, storeFiles, type PendingFile } from './附件存储'

export interface FollowupDraft {
  mode: string
  note: string
  result: string
  transferNote: string
  assignee: string
  nextAt: string
  dueAt: string
  scheduleReason: string
  abandonReason: string
  reopenReason: string
  incompleteReason: string
  newTasks: TicketChecklistDraft[]
  pending: PendingFile[]
}
interface Entry { draft: FollowupDraft; ready: Promise<void>; revision: number; baseNextAt: string; baseDueAt: string; notice: string }
const cache = new Map<string, Entry>()
const prefix = 'youyou.ticket-followup-draft.v1.'
export function ticketDraftKey(id: string, actor: string) { return prefix + encodeURIComponent(actor) + '.' + encodeURIComponent(id) }

export function getFollowupDraft(id: string, actor: string, nextAt: string, dueAt: string): Entry {
  const key = ticketDraftKey(id, actor)
  const existing = cache.get(key)
  if (existing) {
    existing.notice = ''
    if (existing.draft.nextAt === existing.baseNextAt) existing.draft.nextAt = nextAt
    else if (existing.baseNextAt !== nextAt) existing.notice = '下次跟进时间已有更新，请核对草稿中的安排。'
    if (existing.draft.dueAt === existing.baseDueAt) existing.draft.dueAt = dueAt
    else if (existing.baseDueAt !== dueAt) existing.notice = '完成期限已有更新，请核对草稿中的安排。'
    existing.baseNextAt = nextAt; existing.baseDueAt = dueAt
    return existing
  }
  const defaults: FollowupDraft = { mode: '记录跟进', note: '', result: '', transferNote: '', assignee: '', nextAt, dueAt,
    scheduleReason: '', abandonReason: '', reopenReason: '', incompleteReason: '', newTasks: [], pending: [] }
  let attachments: TicketAttachment[] = []
  let notice = ''
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (saved) {
      for (const name of Object.keys(defaults) as (keyof FollowupDraft)[]) {
        if (typeof defaults[name] === 'string' && typeof saved[name] === 'string') Object.assign(defaults, { [name]: saved[name] })
      }
      if (Array.isArray(saved.newTasks)) defaults.newTasks = saved.newTasks.filter((item: TicketChecklistDraft) => typeof item.text === 'string' && typeof item.done === 'boolean')
      if (Array.isArray(saved.attachments)) attachments = saved.attachments
      if (typeof saved.baseNextAt === 'string' && defaults.nextAt === saved.baseNextAt) defaults.nextAt = nextAt
      else if (saved.baseNextAt !== undefined && saved.baseNextAt !== nextAt) notice = '下次跟进时间已有更新，请核对草稿中的安排。'
      if (typeof saved.baseDueAt === 'string' && defaults.dueAt === saved.baseDueAt) defaults.dueAt = dueAt
      else if (saved.baseDueAt !== undefined && saved.baseDueAt !== dueAt) notice = '完成期限已有更新，请核对草稿中的安排。'
    }
  } catch { /* 无可恢复草稿时仍可正常办理。 */ }
  const draft = reactive(defaults)
  const entry: Entry = { draft, ready: Promise.resolve(), revision: 0, baseNextAt: nextAt, baseDueAt: dueAt, notice }
  cache.set(key, entry)
  entry.ready = Promise.allSettled(attachments.map(async attachment => {
    const blob = await readFile(attachment.id)
    return { attachment, file: new File([blob], attachment.name, { type: attachment.type }) }
  })).then(results => {
    const files = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    const ids = new Set(draft.pending.map(item => item.attachment.id))
    draft.pending = [...files.filter(item => !ids.has(item.attachment.id)), ...draft.pending]
    const missing = results.flatMap((result, index) => result.status === 'rejected' ? [attachments[index]!.name] : [])
    if (missing.length) throw Error('草稿附件无法恢复：' + missing.join('、') + '。请重新选择这些文件。')
  })
  return entry
}

/** 文件先入本地存储，再记录引用；失效的较早保存不会覆盖新草稿。 */
export async function saveFollowupDraft(id: string, actor: string, draft: FollowupDraft, currentNextAt?: string, currentDueAt?: string) {
  const key = ticketDraftKey(id, actor)
  const entry = cache.get(key)
  if (!entry) return
  if (currentNextAt !== undefined) entry.baseNextAt = currentNextAt
  if (currentDueAt !== undefined) entry.baseDueAt = currentDueAt
  const revision = ++entry.revision
  const { pending, ...fields } = draft
  const files = [...pending]
  const json = JSON.stringify({ ...fields, baseNextAt: entry.baseNextAt, baseDueAt: entry.baseDueAt, attachments: files.map(item => item.attachment) })
  if (files.length) await storeFiles(files)
  if (entry.revision === revision) sessionStorage.setItem(key, json)
}

export function clearFollowupDraft(id: string, actor: string) {
  const entry = cache.get(ticketDraftKey(id, actor))
  if (entry) entry.revision++
  cache.delete(ticketDraftKey(id, actor))
  sessionStorage.removeItem(ticketDraftKey(id, actor))
}
