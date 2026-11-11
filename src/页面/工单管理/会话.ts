import { ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { additionalTickets } from './新增演示工单'
import { builtinAcceptanceTickets, matchesLegacyAcceptanceTicket } from './内置验收工单'
import { isTicketViewTime, restoreTicketTimes, serializeTicketTimes } from './时间存储'

export const sourceLabels = { message: '站内信', review: '评价', cancel: '取消订单申请', return: '退货退款申请', dispute: '纠纷' } as const
export type TicketKind = keyof typeof sourceLabels
export interface TicketSource {
  kind: TicketKind
  id: string
  shopId: string
  shopName: string
  summary: string
  contextId?: string
}
export interface TicketAttachment { id: string; name: string; type: string; size: number }
export interface TicketChecklistDraft { text: string; done: boolean }
export interface TicketChecklistItem extends TicketChecklistDraft { id: string }
export interface TicketLog { time: string; actor: string; action: string; note: string; attachments?: TicketAttachment[] }
export const ticketPriorities = ['普通', '优先', '紧急'] as const
export type TicketPriority = typeof ticketPriorities[number]
export type TicketStatus = '待处理' | '处理中' | '已完成' | '已放弃'
export type TicketNotificationKind = '指派' | '转交' | '跟进' | '内部补充' | '完成' | '放弃' | '跟进到时'
export interface TicketNotification {
  id: string
  ticketId: string
  recipient: string
  kind: TicketNotificationKind
  title: string
  time: string
  readAt?: string
  appointmentKey?: string
}
export interface Ticket {
  id: string
  title: string
  description: string
  creator: string
  owner: string
  priority?: TicketPriority
  checklist?: TicketChecklistItem[]
  status: TicketStatus
  source?: TicketSource
  nextAt: string
  dueAt: string
  createdAt: string
  updatedAt: string
  logs: TicketLog[]
  result: string
  abandonReason?: string
  closedAt?: string
  followupRevision?: number
  demoKey?: string
}
export function isTicketClosed(ticket: Pick<Ticket, 'status'>) {
  return ticket.status === '已完成' || ticket.status === '已放弃'
}
export const actors = ['客服小林', '跟单员小周']
const [customerService, coordinator] = actors as [string, string]
const storeKey = 'youyou.ticket-prototype.v1'
const demoRevision = 4

export function ticketNow(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

export function sourceLocation(source: TicketSource): RouteLocationRaw {
  const { kind, shopId, id, contextId } = source
  switch (kind) {
    case 'message': return { name: 'oms-ebay-messages', query: { shopId, conversationId: contextId, messageId: id } }
    case 'review': return { name: 'oms-ebay-reviews', query: { shopId, reviewId: id } }
    case 'cancel': return { name: 'oms-ebay-cancellations', query: { shopId, cancelId: id } }
    case 'return': return { name: 'oms-ebay-return-detail', params: { shopId, returnId: id } }
    case 'dispute':
      return contextId
        ? { name: 'oms-ebay-dispute-detail', params: { shopId, kind: contextId, recordId: id } }
        : { name: 'oms-ebay-disputes', query: { shopId, caseId: id } }
  }
}

export const disputeSample: TicketSource = {
  kind: 'dispute', shopId: 'shop-us', shopName: '演示店铺-US', id: 'CASE-DEMO-001', summary: '买家反馈包裹未收到',
}
function relativeTime(offset: number, hour: string) {
  return ticketNow(new Date(Date.now() + offset * 86400000)).slice(0, 10) + ' ' + hour
}
function seedTickets(): Ticket[] {
  const shop = { shopId: 'shop-us', shopName: '演示店铺-US' }
  const opened = relativeTime(-2, '10:00')
  function seed(id: string, source: TicketSource | undefined, title: string, description: string, owner: string, nextAt: string, dueAt: string): Ticket {
    return { id, source, title, description, creator: customerService, owner, nextAt, dueAt, status: '待处理',
      createdAt: opened, updatedAt: opened, result: '', logs: [{ actor: customerService, time: opened, action: '创建工单', note: '负责人：' + owner }] }
  }
  const message = seed('GD-1001', { ...shop, kind: 'message', id: 'msg-01-3', contextId: 'conv-01', summary: '买家询问退货申请处理进度' },
    '回访买家，告知退货进展', '查阅最新退货进度后，在原会话回复买家。', customerService, relativeTime(0, '17:30'), relativeTime(1, '17:00'))
  const review = seed('GD-1002', { ...shop, kind: 'review', id: 'REV-DEMO-01', summary: '中评 · 刹车片套装' },
    '核对商品适配说明', '结合买家评价核对商品适配说明，并记录核对结果。', customerService, relativeTime(-1, '15:00'), relativeTime(0, '17:30'))
  const returned = seed('GD-1003', { ...shop, kind: 'return', id: 'DEMO-RT-012', summary: '厨房收纳篮退货申请' },
    '向海外仓核实退件实收数量', '请核对退件实收数量，并反馈收货凭证编号。', coordinator, relativeTime(0, '11:00'), relativeTime(2, '17:00'))
  returned.status = '处理中'
  returned.updatedAt = relativeTime(-1, '16:00')
  returned.logs.push({ actor: coordinator, time: returned.updatedAt, action: '记录跟进', note: '仓库已收到查询请求，等待收货记录。' })
  const dispute = seed('GD-1004', { ...disputeSample }, '向承运商索取签收凭证', '取得签收凭证后，将查询结果交回客服。', coordinator, relativeTime(1, '10:00'), relativeTime(2, '15:00'))
  const cancel = seed('GD-1005', { kind: 'cancel', id: 'CXL-DEMO-0002', shopId: 'shop-demo-2', shopName: 'DEMO 英国二店', summary: '轻量户外折叠椅' },
    '核实取消申请涉及的仓库执行', '联系仓库核实出库进展，把结果反馈给客服。', coordinator, relativeTime(0, '15:00'), relativeTime(1, '12:00'))
  const personal = seed('GD-1006', undefined, '整理晚班交接清单', '汇总今天仍需跟进的事项，交给晚班同事。', customerService, relativeTime(0, '17:00'), '')
  return [message, review, returned, dispute, cancel, personal]
}

function nextNumber(items: Ticket[]) {
  return items.reduce((highest, item) => Math.max(highest, Number(item.id.slice(3)) || 0), 1000) + 1
}
function checklistItems(drafts: TicketChecklistDraft[], offset: number): TicketChecklistItem[] {
  return drafts.filter(entry => entry.text.trim()).map((entry, i) => ({
    id: 'item-' + (offset + i + 1), text: entry.text.trim(), done: entry.done,
  }))
}
function checklistNote(items: TicketChecklistItem[]) {
  return items.map(entry => (entry.done ? '☑ ' : '☐ ') + entry.text).join('\n')
}
interface TicketSession { actor: string; items: Ticket[]; demoRevision?: number; notifications?: TicketNotification[]; timeEncoding?: string }
let timeRestoreError = ''
function restore(): TicketSession {
  let session: TicketSession
  try {
    const saved = JSON.parse(sessionStorage.getItem(storeKey) || 'null')
    session = saved && actors.includes(saved.actor) && Array.isArray(saved.items)
      ? saved : { actor: customerService, items: seedTickets() }
    if (session === saved) {
      try {
        const projected = restoreTicketTimes(saved)
        session = projected
        if (projected.timeRestoreIssue) {
          timeRestoreError = projected.timeRestoreIssue
          return session
        }
      }
      catch {
        // 非时间字段的结构也损坏时隔离此会话，原 DTO 留在存储供核查，禁止覆盖。
        timeRestoreError = '工单时间资料待核实，原记录已保留'
        return { ...session, items: [], notifications: [] }
      }
    }
  } catch { session = { actor: customerService, items: seedTickets() } }
  // Earlier sessions contain only tickets. Their history and identifiers stay intact.
  session.notifications = Array.isArray(session.notifications) ? session.notifications : []
  const previousRevision = session.demoRevision ?? 0
  if (previousRevision < demoRevision) {
    // This identifying source and original history distinguish the demo from user-created tickets with the same number.
    if (previousRevision < 3) {
      const examples = additionalTickets(nextNumber(session.items), customerService, coordinator, relativeTime, ticketNow())
      if (previousRevision < 2) session.items = [...session.items, ...examples]
      else {
        const example = examples[0]!
        const source = example.source!
        const original = session.items.find(item => item.title === example.title && item.source?.kind === 'message'
          && item.source.shopId === source.shopId && item.source.contextId === source.contextId && item.source.id === source.id
          && item.creator === example.creator && item.owner === example.owner && item.status === example.status && !item.checklist
          && item.logs.length === example.logs.length && item.logs.every((log, i) => log.action === example.logs[i]?.action && log.note === example.logs[i]?.note))
        if (original) original.checklist = example.checklist
      }
    }
    for (const example of builtinAcceptanceTickets(nextNumber(session.items), customerService, coordinator, relativeTime)) {
      const existing = session.items.find(item => item.demoKey === example.demoKey || matchesLegacyAcceptanceTicket(item, example))
      if (existing) existing.demoKey = example.demoKey
      else session.items.push({ ...example, id: 'GD-' + nextNumber(session.items) })
    }
    session.demoRevision = demoRevision
  }
  // 旧本地资料的已知北京墙钟只转换存储表达，不改工单、历史文字或预约去重身份。
  try { sessionStorage.setItem(storeKey, JSON.stringify(serializeTicketTimes(session))) }
  catch { /* Storage-restricted browsers can still inspect the samples in memory. */ }
  return session
}
const restored = restore()
export const ticketTimeRestoreIssue = timeRestoreError
export const currentActor = ref(restored.actor)
export const tickets = ref<Ticket[]>(restored.items)
export const ticketNotifications = ref<TicketNotification[]>(restored.notifications || [])
function persist(items: Ticket[], notifications = ticketNotifications.value) {
  if (timeRestoreError) throw new Error(timeRestoreError)
  sessionStorage.setItem(storeKey, JSON.stringify(serializeTicketTimes({ actor: currentActor.value, items, demoRevision, notifications })))
}
watch(currentActor, () => {
  try { persist(tickets.value) } catch { /* The next submission reports storage errors and keeps the draft. */ }
})

export function relatedTickets(source: TicketSource) {
  return tickets.value.filter(({ source: item }) => item?.kind === source.kind && item.shopId === source.shopId && item.id === source.id && item.contextId === source.contextId)
}
function addNotification(notifications: TicketNotification[], ticket: Ticket, kind: TicketNotificationKind, recipient: string, time: string, appointmentKey?: string) {
  const nextId = notifications.reduce((highest, item) => Math.max(highest, Number(item.id.replace(/^TN-/, '')) || 0), 0) + 1
  return [...notifications, {
    id: 'TN-' + nextId, ticketId: ticket.id, recipient, kind,
    title: (kind === '跟进到时' ? '跟进时间已到' : kind === '指派' ? '收到新工单' : kind === '转交' ? '工单转交给你' : kind === '跟进' ? '工单有新进展' : kind === '内部补充' ? '工单有内部补充' : kind === '完成' ? '工单已完成' : '工单已放弃') + '：' + ticket.title,
    time, ...(appointmentKey ? { appointmentKey } : {}),
  }]
}
export function markNotificationRead(id: string) {
  const notice = ticketNotifications.value.find(item => item.id === id)
  if (!notice) return '找不到该提醒'
  if (notice.recipient !== currentActor.value) return '只能处理自己的提醒'
  if (notice.readAt) return ''
  const updated = ticketNotifications.value.map(item => item.id === id ? { ...item, readAt: ticketNow() } : item)
  try { persist(tickets.value, updated) } catch { return '提醒保存失败，请重试' }
  ticketNotifications.value = updated
  return ''
}
export function checkFollowupReminders(now = ticketNow()) {
  if (timeRestoreError || !isTicketViewTime(now)) return ''
  let updated = ticketNotifications.value
  for (const item of tickets.value) {
    if (isTicketClosed(item) || !isTicketViewTime(item.nextAt) || item.nextAt > now) continue
    const key = item.id + ':' + (item.followupRevision || 0) + ':' + item.nextAt
    if (updated.some(notice => notice.appointmentKey === key)) continue
    updated = addNotification(updated, item, '跟进到时', item.owner, now, key)
  }
  if (updated === ticketNotifications.value) return ''
  try { persist(tickets.value, updated) } catch { return '跟进提醒保存失败，请重试' }
  ticketNotifications.value = updated
  return ''
}
type Draft = Pick<Ticket, 'title' | 'description' | 'owner' | 'priority' | 'nextAt' | 'dueAt'> & { checklist?: TicketChecklistDraft[] }
export function createTicket(source: TicketSource | undefined, draft: Draft, attachments: TicketAttachment[] = []): Ticket | undefined {
  const priority = draft.priority ?? '普通'
  if ((source && (!source.id || !source.shopId)) || !draft.title.trim() || !actors.includes(draft.owner) || !ticketPriorities.includes(priority)) return
  const nextId = nextNumber(tickets.value)
  const now = ticketNow()
  const { checklist: drafts = [], ...fields } = draft
  const checklist = checklistItems(drafts, 0)
  const item: Ticket = {
    ...fields, priority, title: draft.title.trim(), description: draft.description.trim(),
    source: source && { ...source }, creator: currentActor.value, status: '待处理', id: 'GD-' + nextId,
    createdAt: now, updatedAt: now, result: '',
    logs: [{ time: now, actor: currentActor.value, action: '创建工单', note: '负责人：' + draft.owner }],
  }
  if (checklist.length) {
    item.checklist = checklist
    item.logs[0]!.note += '\n' + checklistNote(checklist)
  }
  if (attachments.length) item.logs[0]!.attachments = attachments.map(file => ({ ...file }))
  const notifications = item.owner === currentActor.value ? ticketNotifications.value
    : addNotification(ticketNotifications.value, item, '指派', item.owner, now)
  persist([item, ...tickets.value], notifications)
  tickets.value.unshift(item)
  ticketNotifications.value = notifications
  return item
}

interface ChangeOptions {
  allowCreator?: boolean
  closedOnly?: boolean
  notify?: (item: Ticket) => { recipient: string; kind: TicketNotificationKind }
}
function changeTicket(id: string, action: string, note: string, apply: (item: Ticket) => void | false, attachments?: TicketAttachment[], options: ChangeOptions = {}) {
  const item = tickets.value.find(ticket => ticket.id === id)
  if (!item) return '找不到该工单'
  if (options.closedOnly ? !isTicketClosed(item) : isTicketClosed(item)) return options.closedOnly ? '只有已结束工单可以重新打开' : '该工单已结束'
  if (item.owner !== currentActor.value && !(options.allowCreator && item.creator === currentActor.value)) return options.allowCreator ? '仅发起人或当前负责人可补充' : '请由当前负责人办理'
  const updatedAt = ticketNow()
  const entry: TicketLog = { time: updatedAt, actor: currentActor.value, action, note }
  if (attachments?.length) entry.attachments = attachments.map(file => ({ ...file }))
  const updated = { ...item, updatedAt, logs: [...item.logs, entry] }
  if (apply(updated) === false) return ''
  let notifications = ticketNotifications.value
  const notification = options.notify?.(updated)
  if (notification && notification.recipient !== currentActor.value) notifications = addNotification(notifications, updated, notification.kind, notification.recipient, updatedAt)
  try {
    persist(tickets.value.map(row => row.id === id ? updated : row), notifications)
  } catch { return '工单保存失败，请检查浏览器存储后重试' }
  Object.assign(item, updated)
  ticketNotifications.value = notifications
  return ''
}
function setFollowup(item: Ticket, nextAt: string) {
  if (item.nextAt !== nextAt) item.followupRevision = (item.followupRevision || 0) + 1
  item.nextAt = nextAt
}
export function appendProgress(id: string, note: string, nextAt: string, attachments: TicketAttachment[] = [], drafts: TicketChecklistDraft[] = []) {
  const existing = tickets.value.find(item => item.id === id)?.checklist || []
  const added = checklistItems(drafts, existing.length)
  if (!note.trim() && !attachments.length && !added.length) return '请填写跟进记录、待办项或添加附件'
  const content = [note.trim(), checklistNote(added)].filter(Boolean).join('\n')
  return changeTicket(id, '记录跟进', content + (nextAt ? '（下次跟进：' + nextAt + '）' : ''), item => {
    if (added.length) item.checklist = [...existing, ...added]
    item.status = '处理中'
    setFollowup(item, nextAt)
  }, attachments, { notify: item => ({ recipient: item.creator, kind: '跟进' }) })
}
export function appendComment(id: string, note: string, attachments: TicketAttachment[] = []) {
  if (!note.trim() && !attachments.length) return '请填写内部补充或添加附件'
  return changeTicket(id, '内部补充', note.trim(), () => {}, attachments, {
    allowCreator: true,
    notify: item => ({ recipient: currentActor.value === item.owner ? item.creator : item.owner, kind: '内部补充' }),
  })
}
export function changeTicketSchedule(id: string, schedule: Pick<Ticket, 'nextAt' | 'dueAt'>, reason = '') {
  const previous = tickets.value.find(item => item.id === id)
  if (!previous) return '找不到该工单'
  const nextAt = schedule.nextAt || ''
  const dueAt = schedule.dueAt || ''
  if (previous.dueAt !== dueAt && !reason.trim()) return '调整完成期限时请填写原因'
  const changes = [
    ...(previous.nextAt !== nextAt ? ['下次跟进：' + (previous.nextAt || '未安排') + ' → ' + (nextAt || '未安排')] : []),
    ...(previous.dueAt !== dueAt ? ['完成期限：' + (previous.dueAt || '未设置') + ' → ' + (dueAt || '未设置')] : []),
    ...(reason.trim() ? ['调整原因：' + reason.trim()] : []),
  ]
  return changeTicket(id, '调整办理安排', changes.join('\n'), item => {
    if (previous.nextAt === nextAt && previous.dueAt === dueAt) return false
    setFollowup(item, nextAt)
    item.dueAt = dueAt
  })
}
export function changeTicketPriority(id: string, priority: TicketPriority) {
  if (!ticketPriorities.includes(priority)) return '请选择有效的优先级'
  const previous = tickets.value.find(item => item.id === id)?.priority ?? '普通'
  return changeTicket(id, '调整优先级', '优先级：' + previous + ' → ' + priority, item => {
    if (previous === priority) return false
    item.priority = priority
  })
}
export function toggleTicketItem(id: string, itemId: string, done: boolean) {
  const entries = tickets.value.find(item => item.id === id)?.checklist || []
  const entry = entries.find(item => item.id === itemId)
  if (!entry) return '该待办项不存在'
  return changeTicket(id, '更新待办清单', (done ? '已勾选：' : '已取消勾选：') + entry.text, item => {
    if (entry.done === done) return false
    item.checklist = entries.map(row => row.id === itemId ? { ...row, done } : row)
  })
}
export function transferTicket(id: string, owner: string, note: string) {
  if (!actors.includes(owner) || owner === currentActor.value) return '请选择其他负责人'
  return changeTicket(id, '转交工单', '转交给' + owner + (note.trim() ? '。' + note.trim() : ''), item => { item.owner = owner }, undefined, {
    notify: item => ({ recipient: item.owner, kind: '转交' }),
  })
}
export function finishTicket(id: string, result: string) {
  if (!result.trim()) return '请填写完成结果'
  return changeTicket(id, '完成工单', result.trim(), item => {
    item.status = '已完成'
    item.result = result.trim()
    item.closedAt = item.updatedAt
    setFollowup(item, '')
  }, undefined, { notify: item => ({ recipient: item.creator, kind: '完成' }) })
}
export function abandonTicket(id: string, reason: string) {
  if (!reason.trim()) return '请填写放弃原因'
  return changeTicket(id, '放弃工单', reason.trim(), item => {
    item.status = '已放弃'
    item.abandonReason = reason.trim()
    item.closedAt = item.updatedAt
    setFollowup(item, '')
  }, undefined, { notify: item => ({ recipient: item.creator, kind: '放弃' }) })
}
export function reopenTicket(id: string, reason: string) {
  if (!reason.trim()) return '请填写重新打开的原因'
  return changeTicket(id, '重新打开工单', reason.trim(), item => {
    item.status = '处理中'
    item.closedAt = undefined
  }, undefined, { closedOnly: true })
}
const businessActions = new Set(['记录跟进', '内部补充', '转交工单', '完成工单', '放弃工单', '重新打开工单'])
export function latestBusinessLog(ticket: Ticket): TicketLog | undefined {
  return [...ticket.logs].reverse().find(log => businessActions.has(log.action))
}
export function latestBusinessProgress(ticket: Ticket) {
  const log = latestBusinessLog(ticket)
  return log?.note || (log?.attachments?.length ? '附件（' + log.attachments.length + '）' : '—')
}
