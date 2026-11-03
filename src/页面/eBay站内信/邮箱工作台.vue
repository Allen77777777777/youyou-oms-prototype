<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Document, Link, Lock, Message, MoreFilled, Star, StarFilled, User, FolderOpened, Promotion, EditPen, Warning, Hide, Bell, CollectionTag, Setting } from '@element-plus/icons-vue'
import { ElButton, ElCheckbox, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElIcon, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElTag, ElTooltip, ElPagination } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 校验字段搜索, type 搜索字段 } from '@/组件/筛选/筛选工具'
import RelatedPanel from './相关资料栏.vue'
import ReplyEditor from './回复编辑器.vue'
import PanelToggle from './面板切换.vue'
import MailSettings from './站内信设置.vue'
import { tagStyle } from './设置模型'
import { mailSession as session, draftKey } from './会话'
import { templateSession, renderReplyTemplate, type TemplateContext } from '../消息模板管理/模型'
import { richHtmlToSendText, sanitizeRichHtml } from '../消息模板管理/富文本'
import { filterConversations, formatMailTime, getContextCount, getPreview, getRelatedOrders, validateDraft, MAX_REPLY_BODY_LENGTH } from './模型'
import { mailboxFolders, mailboxEntries, matchesEntryTextSearch, getMessageBodyText, isEntryUnread, setConversationUnread, isEntryPending, priorityOptions, tagOptions, type MailboxEntry } from './邮箱模型'
import { mailAnnotation as annotation } from './站内信标注'
import type { ContextTab, Conversation, MailFilters, MailMessage, MessageAttachment, ReplyDraft, WorkStatus } from './类型'
import './站内信样式.css'
import './邮箱工作台样式.css'

const me = '客服01'
const settingsOpen = ref(false)
const replyTemplates = computed(() => templateSession.templates.filter(t => t.enabled && t.kind === 'message'))
const panelCount = computed(() => Number(session.listOpen) + Number(session.readerOpen) + Number(session.contextOpen))
function togglePanel(panel: 'listOpen' | 'readerOpen' | 'contextOpen') {
  if (session[panel] && panelCount.value === 1) return
  session[panel] = !session[panel]
}
function closeContext() { if (panelCount.value === 1) session.readerOpen = true; session.contextOpen = false }
const workspaceStyle = computed(() => {
  const columns: string[] = []
  if (session.listOpen) columns.push(session.foldersCollapsed ? '54px' : 'var(--mail-folder-width)', session.readerOpen ? 'var(--mail-list-width)' : 'minmax(0,1fr)')
  if (session.readerOpen) columns.push('minmax(0,1fr)')
  if (session.contextOpen) columns.push(session.readerOpen ? 'var(--mail-context-width)' : 'minmax(0,1fr)')
  return { gridTemplateColumns: columns.join(' ') }
})
let interactionRevision = 0
const noteInteraction = () => { interactionRevision += 1 }
onMounted(() => { for (const event of ['click', 'input', 'keydown']) document.addEventListener(event, noteInteraction, true) })
onBeforeUnmount(() => { for (const event of ['click', 'input', 'keydown']) document.removeEventListener(event, noteInteraction, true) })
const defaults = (): MailFilters => ({ shopIds: [], assignees: [], field: 'buyerId', mode: 'contains', query: '', onlyUnread: false, onlyFlagged: false })
const filters = reactive(defaults()), applied = reactive(defaults())
const fields: 搜索字段[] = [{ value: 'buyerId', label: '买家ID' }, { value: 'subject', label: '消息主题', kind: 'text' }, { value: 'body', label: '消息内容', kind: 'text' }, { value: 'orderNo', label: '关联订单号' }]
const shops = computed(() => [...new Map(session.conversations.map(c => [c.shopId, { value: c.shopId, label: c.shopName }])).values()])
const assignees = [{ value: me, label: `${me}（我）` }, { value: '客服02', label: '客服02' }, { value: '客服03', label: '客服03' }, { value: '', label: '未指派' }]
const queue = ref('all'), page = ref(1), selected = ref<string[]>([]), filterError = ref('')
const processingFilter = ref<'all' | 'pending' | 'processed'>('all')
const priorities = ref<string[]>([]), appliedPriorities = ref<string[]>([]), tagsFilter = ref<string[]>([]), appliedTags = ref<string[]>([]), sorting = ref('recent')
const activeEntryId = ref(''), targetMessageId = ref('')
const showReadQueues = computed(() => !['outbox', 'automated', 'failed'].includes(session.folder))
const showProcessingFilters = computed(() => !['ebay', 'ignored'].includes(session.folder))
const isNoticeScope = computed(() => session.folder === 'ebay')
const baseResults = computed(() => (['buyer', 'ebay'] as const).flatMap(source => filterConversations(session.conversations, source, 'all', applied, session.orders)).filter(c => (!appliedPriorities.value.length || appliedPriorities.value.includes(c.priority ?? 'normal')) && (!appliedTags.value.length || c.tags?.some(t => appliedTags.value.includes(t)))))
function entriesForFolder(folder: string) {
  return mailboxEntries(baseResults.value, folder, session.drafts).filter(entry => matchesEntryTextSearch(entry, applied))
}
const results = computed(() => {
  const rows = entriesForFolder(session.folder)
    .filter(entry => !showReadQueues.value || queue.value === 'all' || (queue.value === 'unread' ? isEntryUnread(entry) : !isEntryUnread(entry)))
    .filter(entry => !showProcessingFilters.value || processingFilter.value === 'all' || (entry.conversation.source === 'buyer' && entry.conversation.status === processingFilter.value))
  const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  return rows.sort((a, b) => (sorting.value === 'priority' ? (rank[a.conversation.priority ?? 'normal'] ?? 2) - (rank[b.conversation.priority ?? 'normal'] ?? 2) : 0)
    || Date.parse(b.message?.at ?? b.conversation.updatedAt) - Date.parse(a.message?.at ?? a.conversation.updatedAt) || a.id.localeCompare(b.id))
})
const pageRows = computed(() => results.value.slice((page.value - 1) * session.pageSize, page.value * session.pageSize))
const selectedEntries = computed(() => pageRows.value.filter(entry => selected.value.includes(entry.id)))
const currentSelected = computed(() => [...new Set(selectedEntries.value.map(entry => entry.conversation.id))])
const totalPages = computed(() => Math.max(1, Math.ceil(results.value.length / session.pageSize)))
const current = computed(() => session.conversations.find(c => c.id === session.activeId))
const currentEntry = computed<MailboxEntry | undefined>(() => current.value ? { id: activeEntryId.value, conversation: current.value, message: current.value.messages.find(m => m.id === targetMessageId.value) } : undefined)
const readingTitle = computed(() => currentEntry.value?.message?.subject?.trim() || current.value?.subject || '')
const currentNoticeMessage = computed(() => targetMessageId.value ? currentEntry.value?.message : current.value?.messages.filter(m => m.kind === 'incoming').slice(-1)[0])
const currentNotice = computed(() => currentNoticeMessage.value?.notice)
function entrySubject(entry: MailboxEntry) { return entry.message?.subject?.trim() || entry.conversation.subject }
function automationLabel(message?: MailMessage) { return message?.sendSource === 'automation' ? `自动客服规则：${message.automationRuleName?.trim() || '规则名称未提供'}` : '' }
const related = computed(() => current.value ? getRelatedOrders(current.value, session.orders) : [])
const order = computed(() => related.value.find(o => o.id === session.selectedOrderId) ?? (related.value.length === 1 ? related.value[0] : undefined))
function templateContextFor(c: Conversation, allowSelected = false): TemplateContext {
  const matches = getRelatedOrders(c, session.orders)
  const selectedOrder = allowSelected ? matches.find(o => o.id === session.selectedOrderId) : undefined
  const linked = selectedOrder ?? (matches.length === 1 ? matches[0] : undefined)
  const packages = linked?.logistics.state === 'ready' ? linked.logistics.records : []
  const tracking = packages.length && packages.every(item => item.trackingNumber?.trim()) ? [...new Set(packages.map(item => item.trackingNumber!.trim()))] : []
  return { buyerId: c.buyerId || undefined, orderNo: linked?.orderNo, productName: linked?.product.title, trackingNumber: tracking.length ? tracking.join(' / ') : undefined, platformProductName: linked?.platformProduct?.title, platformSku: linked?.platformProduct?.sku }
}
const templateContext = computed(() => current.value ? templateContextFor(current.value, true) : {})
const associationLabel = computed(() => related.value.length > 1 ? '多笔关联订单，请选择后查看' : current.value?.association === 'pending' ? '订单关联待确认' : current.value?.association === 'confirmed' ? '关联资料待核实' : '未关联订单')
const allSelected = computed(() => pageRows.value.length > 0 && pageRows.value.every(c => selected.value.includes(c.id)))
const partlySelected = computed(() => selected.value.length > 0 && !allSelected.value)
const outsideResults = computed(() => current.value && !results.value.some(entry => entry.id === activeEntryId.value))
const handlerSummary = computed(() => current.value?.lastHandledBy ? `${current.value.lastHandledBy} · ${current.value.lastHandledAction || '回复'} · ${current.value.lastHandledAt ? formatMailTime(current.value.lastHandledAt) : ''}` : '—')
const folderIcons: Record<string, typeof Message> = { inbox: Message, starred: Star, drafts: EditPen, outbox: Promotion, automated: Setting, failed: Warning, ebay: Bell, ignored: Hide }
const folderRows = computed(() => mailboxFolders.map(f => { const entries = entriesForFolder(f.id); return { ...f, count: entries.length, pending: entries.filter(isEntryPending).length } }).filter(f => !session.onlyPendingFolders || f.pending > 0 || f.id === session.folder))
const thread = ref<HTMLElement>(), translations = ref<string[]>([]), notesOnly = ref(false)
const notes = computed(() => current.value?.messages.filter(m => m.kind === 'note') ?? [])
const latestNote = computed(() => notes.value[notes.value.length - 1])
const emptyDraft: ReplyDraft = { body: '', attachments: [] }
const composer = computed<ReplyDraft>(() => { if (!current.value) return emptyDraft; const key = draftKey(current.value.id, session.composeMode); return session.drafts[key] ?? (session.drafts[key] = { body: '', attachments: [] }) })
const sending = computed(() => current.value?.messages.some(m => m.delivery === 'sending') ?? false)
const uncertain = computed(() => current.value?.messages.some(m => m.delivery === 'unknown') ?? false)
const now = () => new Date().toISOString()
const id = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`
function copyDraft(d: ReplyDraft): ReplyDraft { return { body: d.body, bodyHtml: d.bodyHtml, attachments: d.attachments.map(a => ({ ...a })) } }
function signature(d: ReplyDraft) { return JSON.stringify([d.body, d.bodyHtml ?? '', d.attachments]) }
function draftPresent(c: Conversation) { return ['reply', 'note'].some(m => { const d = session.drafts[draftKey(c.id, m as 'reply' | 'note')]; return !!d && (!!d.body.trim() || d.attachments.length > 0) }) }
function priorityLabel(c: Conversation) { return priorityOptions.find(p => p.value === (c.priority ?? 'normal'))?.label ?? '普通' }
function tagLabel(t: string) { return tagOptions.find(o => o.value === t)?.label ?? t }
function selectEntry(entry: MailboxEntry, markRead = true) {
  const c = entry.conversation
  session.activeId = c.id; session.activeSource = c.source; activeEntryId.value = entry.id; targetMessageId.value = entry.message?.id ?? ''
  if (markRead) setConversationUnread(c, false)
  session.selectedOrderId = ''; translations.value = []; notesOnly.value = false
  if (session.folder === 'drafts') { const d = session.drafts[draftKey(c.id, 'reply')]; session.composeMode = d && (d.body.trim() || d.attachments.length) ? 'reply' : 'note' }
  scrollToTarget()
}
function ensureSelection() { const first = results.value[0]; if (!results.value.some(entry => entry.id === activeEntryId.value)) { if (first) selectEntry(first, false); else { session.activeId = ''; activeEntryId.value = ''; targetMessageId.value = '' } } }
function changeFolder(value: string) { session.folder = value; queue.value = 'all'; processingFilter.value = 'all'; page.value = 1; selected.value = []; ensureSelection() }
function changeQueue(value: string) { queue.value = value; page.value = 1; selected.value = []; ensureSelection() }
function changeProcessingFilter(value: 'all' | 'pending' | 'processed') { processingFilter.value = value; page.value = 1; selected.value = []; ensureSelection() }
function applyFilters() {
  filterError.value = 校验字段搜索(filters.query, filters.mode, fields.find(f => f.value === filters.field)?.kind) ?? (fields.some(f => f.value === filters.field) ? '' : '请选择搜索字段')
  if (filterError.value) return
  Object.assign(applied, { ...filters, shopIds: [...filters.shopIds], assignees: [...filters.assignees] }); appliedPriorities.value = [...priorities.value]; appliedTags.value = [...tagsFilter.value]; page.value = 1; selected.value = []; ensureSelection()
}
function resetFilters() { Object.assign(filters, defaults()); priorities.value = []; tagsFilter.value = []; queue.value = 'all'; processingFilter.value = 'all'; applyFilters() }
function showMine() { filters.assignees = [me]; applyFilters() }
function setSelected(entry: MailboxEntry, value: boolean) { selected.value = value ? [...new Set([...selected.value, entry.id])] : selected.value.filter(v => v !== entry.id) }
function selectPage(value: boolean) { selected.value = value ? pageRows.value.map(c => c.id) : [] }
function changePage(value: number) { page.value = Math.min(totalPages.value, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1)); selected.value = [] }
function changePageSize() { page.value = 1; selected.value = [] }
function openContext(tab: ContextTab = 'overview') { session.contextTab = tab; session.contextOpen = true }
function countLabel(value: ReturnType<typeof getContextCount>) { return value === null ? '待核实' : String(value) }
function scrollToTarget() { void nextTick(() => {
  const container = thread.value; if (!container) return
  const target = [...container.querySelectorAll<HTMLElement>('[data-message-id]')].find(element => element.dataset.messageId === targetMessageId.value)
  if (target) { const bounds = target.getBoundingClientRect(), area = container.getBoundingClientRect(); container.scrollTop = Math.max(0, container.scrollTop + bounds.top - area.top - Math.max(0, (container.clientHeight - bounds.height) / 2)) }
  else container.scrollTop = container.scrollHeight
}) }
watch(() => session.activeId, () => { session.selectedOrderId = ''; notesOnly.value = false; scrollToTarget() })
watch([() => current.value?.messages.length, () => session.readerOpen, notesOnly], scrollToTarget)
watch(() => results.value.length, () => { page.value = Math.min(page.value, totalPages.value) })
watch(sorting, () => { page.value = 1; selected.value = [] }, { flush: 'sync' })
watch(() => pageRows.value.map(c => c.id).join('|'), () => { selected.value = selected.value.filter(id => pageRows.value.some(entry => entry.id === id)) }, { flush: 'sync' })
watch(() => tagOptions.map(t => t.value).join('|'), () => {
  const valid = (id: string) => tagOptions.some(t => t.value === id)
  tagsFilter.value = tagsFilter.value.filter(valid); appliedTags.value = appliedTags.value.filter(valid); tagDraft.value = tagDraft.value.filter(valid)
})
const initialEntry = results.value.find(entry => entry.conversation.id === session.activeId) ?? results.value[0]
if (initialEntry) selectEntry(initialEntry, false)
watch(() => session.navigationTarget, target => {
  if (!target) return
  const matches = session.conversations.filter(c => c.id === target.conversationId)
  const c = matches.length === 1 ? matches[0] : undefined
  if (!c || c.source !== 'buyer' || c.shopId !== target.shopId || c.buyerId !== target.buyerId || c.messages.filter(m => m.id === target.messageId && m.kind === 'incoming' && !m.notice).length !== 1) {
    delete session.navigationTarget; ElMessage.warning('来信关联已变化，请核对来源消息'); return
  }
  session.folder = c.status === 'ignored' ? 'ignored' : 'inbox'; session.activeSource = 'buyer'
  session.onlyPendingFolders = false; session.listOpen = true; session.readerOpen = true
  resetFilters()
  const entry = results.value.find(item => item.conversation.id === c.id && (!item.message || item.message.id === target.messageId))
  if (entry) { page.value = Math.floor(results.value.indexOf(entry) / session.pageSize) + 1; selectEntry({ ...entry, message: c.messages.find(message => message.id === target.messageId)! }) }
  else ElMessage.warning('当前来信不可查看，请核对来源消息')
  delete session.navigationTarget
}, { immediate: true })
function recordHandler(c: Conversation, action: string) { c.lastHandledBy = me; c.lastHandledAt = now(); c.lastHandledAction = action }
function statusActionLabel(status: WorkStatus) { return status === 'ignored' ? '忽略会话' : status === 'processed' ? '标注已处理' : '标注待处理' }
function setStatus(c: Conversation, status: WorkStatus) {
  if (c.status === status || (status !== 'ignored' && (c.source !== 'buyer' || c.status === 'ignored'))) return false
  c.status = status; c.statusRevision = (c.statusRevision ?? 0) + 1; recordHandler(c, statusActionLabel(status)); return true
}
function markCurrentStatus() {
  const c = current.value; if (!c || c.source !== 'buyer' || c.status === 'ignored') return
  const status = c.status === 'processed' ? 'pending' : 'processed'
  if (setStatus(c, status)) ElMessage.success(`已完成“${statusActionLabel(status)}”`)
}
function restoreConversation(c: Conversation) { if (c.status !== 'ignored') return; c.status = c.source === 'ebay' ? 'processed' : 'pending'; c.statusRevision = (c.statusRevision ?? 0) + 1; recordHandler(c, '取消忽略') }
async function markBatch(action: string) {
  const entries = [...selectedEntries.value], ids = [...currentSelected.value]; if (!ids.length) return
  const labels: Record<string, string> = { read: '标记已读', unread: '标记未读', flag: '加星关注', unflag: '取消星标', processed: '标注已处理', pending: '标注待处理', ignored: '忽略会话', restore: '取消忽略' }
  const statusAction = ['processed', 'pending', 'ignored'].includes(action)
  const buyerOnlyAction = ['processed', 'pending'].includes(action)
  const chosen = session.conversations.filter(c => ids.includes(c.id))
  const targets = chosen.filter(c => (!buyerOnlyAction || (c.source === 'buyer' && c.status !== 'ignored' && c.status !== action)) && (action !== 'restore' || c.status === 'ignored'))
  const skipped = ids.length - targets.length
  const skipReasons = buyerOnlyAction ? [
    [chosen.filter(c => c.source !== 'buyer').length, '个 eBay 通知会话'],
    [chosen.filter(c => c.source === 'buyer' && c.status === 'ignored').length, '个已忽略会话'],
    [chosen.filter(c => c.source === 'buyer' && c.status === action).length, `个已处于“${action === 'pending' ? '待处理' : '已处理'}”状态的会话`],
  ].filter(([count]) => Number(count) > 0).map(([count, reason]) => `${count} ${reason}`).join('、') : skipped ? `${skipped} 个未忽略会话` : ''
  if (!targets.length) return void ElMessage.info(buyerOnlyAction ? `无需执行“${labels[action]}”：${skipReasons}。${chosen.some(c => c.source === 'buyer' && c.status === 'ignored') ? '已忽略会话需先取消忽略。' : ''}` : '所选记录没有可执行此操作的会话')
  const skippedText = skipped ? `仅更新 ${targets.length} 个${buyerOnlyAction ? '买家' : ''}会话，跳过 ${skipReasons}。` : ''
  try { await ElMessageBox.confirm(`对本页已勾选的 ${entries.length} 条记录（${ids.length} 个会话）执行“${labels[action]}”？${skippedText}${action === 'ignored' ? '忽略保留收发记录和草稿，不发送消息。' : ''}`, '批量操作', { confirmButtonText: '确定', cancelButtonText: '取消' }) } catch { return }
  if (action === 'read' || action === 'unread') targets.forEach(c => setConversationUnread(c, action === 'unread'))
  let changed = 0
  for (const c of targets) { if (action === 'flag' || action === 'unflag') c.flagged = action === 'flag'; if (statusAction && setStatus(c, action as WorkStatus)) changed += 1; if (action === 'restore') restoreConversation(c) }
  selected.value = []; ElMessage.success(action === 'read' || action === 'unread' ? `已更新 ${targets.length} 个会话的阅读状态` : buyerOnlyAction ? `已对 ${changed} 个会话执行“${labels[action]}”${skipped ? `，跳过 ${skipReasons}` : ''}` : `已更新 ${targets.length} 个会话${skipped ? `，跳过 ${skipReasons}` : ''}`)
}
async function ignoreCurrent() { if (!current.value) return; const c = current.value; if (c.status === 'ignored') return restoreConversation(c); try { await ElMessageBox.confirm('忽略后可在“已忽略”查看，收发记录与草稿保留，不发送消息，可取消忽略。', '忽略会话', { confirmButtonText: '忽略', cancelButtonText: '取消' }) } catch { return }; setStatus(c, 'ignored') }
async function allRead() {
  const conversations = filterConversations(session.conversations, 'ebay', 'all', { ...applied, onlyUnread: false }, session.orders).filter(c => (!appliedPriorities.value.length || appliedPriorities.value.includes(c.priority ?? 'normal')) && (!appliedTags.value.length || c.tags?.some(t => appliedTags.value.includes(t))))
  const scope = mailboxEntries(conversations, 'ebay').filter(entry => isEntryUnread(entry) && matchesEntryTextSearch(entry, applied))
  if (!scope.length) return void ElMessage.info('当前查询范围没有未读的 eBay 来信')
  const targets = [...new Map(scope.map(entry => [entry.conversation.id, entry.conversation])).values()]
  try { await ElMessageBox.confirm(`将当前店铺、指派客服及搜索条件范围内的 ${targets.length} 个 eBay 通知会话全部标记已读？包含其他分页，同会话全部来信一并更新，不限当前文件夹和已读/未读页签。`, '所有标记为已读', { confirmButtonText: '全部标记已读', cancelButtonText: '取消' }) } catch { return }
  targets.forEach(c => setConversationUnread(c, false)); ElMessage.success(`已将 ${targets.length} 个会话标记已读`)
}
const assignmentOpen = ref(false), assignmentIds = ref<string[]>([]), assignmentValue = ref(me)
function openAssignment(ids: string[]) { assignmentIds.value = [...ids]; assignmentValue.value = current.value?.assignee || me; assignmentOpen.value = true }
function saveAssignment() { session.conversations.filter(c => assignmentIds.value.includes(c.id)).forEach(c => { c.assignee = assignmentValue.value }); assignmentOpen.value = false; selected.value = []; ElMessage.success('指派客服已更新，实际处理记录保持不变') }
function assignMe() { if (current.value) { current.value.assignee = me; ElMessage.success('已指派给我') } }
const tagDialog = ref(false), tagIds = ref<string[]>([]), tagDraft = ref<string[]>([])
function editTags(ids: string[]) { tagIds.value = [...ids]; tagDraft.value = ids.length === 1 ? [...(session.conversations.find(c => c.id === ids[0])?.tags ?? [])] : []; tagDialog.value = true }
function saveTags() { session.conversations.filter(c => tagIds.value.includes(c.id)).forEach(c => { c.tags = tagDraft.value.filter(id => tagOptions.some(t => t.value === id)) }); tagDialog.value = false; ElMessage.success('业务标签已更新') }
function batchPriority(value: string) { const ids = [...currentSelected.value]; session.conversations.filter(c => ids.includes(c.id)).forEach(c => { c.priority = value as Conversation['priority'] }); ElMessage.success('已更新所选会话优先级') }
function saveDraft() { if (!current.value) return; composer.value.savedAt = now(); ElMessage.success('草稿已保留在本次会话中') }
function attachmentInfo(a: MessageAttachment) { ElMessage.info(`${a.name} · ${a.source === 'url' ? '链接附件待获取' : `${(a.size / 1024).toFixed(0)} KB`}`) }
function toggleTranslation(m: MailMessage) { if (!m.translation) return void ElMessage.info('此条消息暂无译文'); translations.value = translations.value.includes(m.id) ? translations.value.filter(v => v !== m.id) : [...translations.value, m.id] }
function translateAll() { const ids = current.value?.messages.filter(m => m.kind === 'incoming' && m.translation).map(m => m.id) ?? []; translations.value = ids.every(x => translations.value.includes(x)) ? [] : ids }
interface SendSnapshot { conversationId: string; buyerId: string; shopName: string; draft: ReplyDraft; draftSignature: string; markProcessedOnSend: boolean; statusRevision: number; nextIds?: string[]; viewKey?: string; autoNext?: boolean; interactionRevision?: number }
function viewKey() { return JSON.stringify([session.folder, queue.value, processingFilter.value, applied, appliedPriorities.value, appliedTags.value, sorting.value]) }
function prepareSend() {
  if (!current.value) return
  const error = validateDraft(composer.value, session.composeMode); if (error) return void ElMessage.warning(error)
  if (session.composeMode === 'note') { current.value.messages.push({ ...copyDraft(composer.value), id: id(), kind: 'note', sender: me, body: composer.value.body.trim(), at: now() }); recordHandler(current.value, '添加内部备注'); session.drafts[draftKey(current.value.id, 'note')] = { body: '', attachments: [] }; ElMessage.success('内部备注已添加，不发送给买家'); return }
  const reason = ineligible(current.value); if (reason) return void ElMessage.warning(reason)
  if (/{{|}}/.test(composer.value.body)) return void ElMessage.warning('正文还有未填写的变量，请补齐后再发送')
  const at = results.value.findIndex(entry => entry.id === activeEntryId.value), nextIds = [...new Set([...results.value.slice(at + 1), ...results.value.slice(0, Math.max(at, 0))].filter(entry => entry.conversation.id !== current.value!.id).map(entry => entry.conversation.id))]
  const snapshot: SendSnapshot = { conversationId: current.value.id, buyerId: current.value.buyerId, shopName: current.value.shopName, draft: { body: composer.value.body, attachments: composer.value.attachments.map(a => ({ ...a })) }, draftSignature: signature(composer.value), markProcessedOnSend: session.markProcessedOnSend, statusRevision: current.value.statusRevision ?? 0, nextIds, viewKey: viewKey(), autoNext: session.autoNext, interactionRevision }
  const c = current.value, messageId = id()
  c.messages.push({ ...snapshot.draft, id: messageId, kind: 'outgoing', sendSource: 'manual', markProcessedOnSuccess: snapshot.markProcessedOnSend, sender: me, body: snapshot.draft.body, at: now(), delivery: 'sending' }); c.updatedAt = now(); targetMessageId.value = messageId
  void finishDelivery(c, messageId, c.sendScenario, snapshot)
}
async function finishDelivery(c: Conversation, messageId: string, outcome: Conversation['sendScenario'], snapshot?: SendSnapshot) {
  const statusRevision = snapshot?.statusRevision ?? c.statusRevision ?? 0
  const markProcessedOnSuccess = snapshot?.markProcessedOnSend ?? c.messages.find(m => m.id === messageId)?.markProcessedOnSuccess ?? true
  await new Promise(resolve => setTimeout(resolve, 900))
  const stored = session.conversations.find(v => v.id === c.id), message = stored?.messages.find(m => m.id === messageId)
  if (!stored || !message || message.delivery !== 'sending') return
  message.delivery = outcome
  if (outcome === 'success') {
    if ((stored.statusRevision ?? 0) === statusRevision) {
      if (markProcessedOnSuccess && stored.status !== 'ignored') stored.status = 'processed'
      recordHandler(stored, '回复成功')
    }
    if (snapshot && signature(session.drafts[draftKey(c.id, 'reply')] ?? emptyDraft) === snapshot.draftSignature) session.drafts[draftKey(c.id, 'reply')] = { body: '', attachments: [] }
    if (snapshot?.autoNext && session.autoNext && session.activeId === c.id && snapshot.viewKey === viewKey() && snapshot.interactionRevision === interactionRevision) {
      const next = snapshot.nextIds?.map(nextId => results.value.find(v => v.conversation.id === nextId)).find(entry => { const c = entry?.conversation; return c && c.source === 'buyer' && c.canReply && c.status === 'pending' && !c.messages.some(m => m.delivery === 'sending' || m.delivery === 'unknown') })
      if (next) { selectEntry(next, false); const index = results.value.findIndex(v => v.id === next.id); page.value = Math.floor(Math.max(0, index) / session.pageSize) + 1 } else ElMessage.info('当前范围没有下一封待处理信件')
    }
    ElMessage.success('发送成功')
  } else message.failureReason = outcome === 'unknown' ? '提交结果待核查，禁止重复发送；请先核对平台记录。' : '发送失败，内容未发送，可重试。'
}
async function retryMessage(c: Conversation, m: MailMessage) {
  if (m.kind !== 'outgoing' || m.delivery !== 'failed' || ineligible(c)) return
  const retryBody = m.bodyHtml ? richHtmlToSendText(m.bodyHtml) : m.body
  const error = validateDraft({ body: retryBody, attachments: m.attachments ?? [] }); if (error) return void ElMessage.warning(error)
  if (/{{|}}/.test(retryBody)) return void ElMessage.warning('正文还有未填写的变量，请补齐后再发送')
  m.body = retryBody; delete m.bodyHtml
  m.delivery = 'sending'; m.failureReason = undefined
  const d = session.drafts[draftKey(c.id, 'reply')], same = d && signature({ ...d, body: d.body.trim() }) === signature({ body: m.body, bodyHtml: m.bodyHtml, attachments: m.attachments ?? [] })
  const snapshot = same ? { conversationId: c.id, buyerId: c.buyerId, shopName: c.shopName, draft: copyDraft(d), draftSignature: signature(d), markProcessedOnSend: m.markProcessedOnSuccess ?? true, statusRevision: c.statusRevision ?? 0 } : undefined
  void finishDelivery(c, m.id, 'success', snapshot)
}
const deliveryText = { sending: '发送中', success: '已发送', failed: '发信失败', unknown: '发信失败 · 待核查' }

const batchDialog = ref(false), batchIds = ref<string[]>([]), batchBody = ref(''), batchTemplate = ref(''), batchStage = ref<'edit' | 'result'>('edit'), batchRunning = ref(false)
const batchAttachments = ref<MessageAttachment[]>([])
const batchRows = computed(() => batchIds.value.map(i => session.conversations.find(c => c.id === i)).filter((c): c is Conversation => !!c))
const batchResults = ref<Record<string, string>>({})
const batchEligibleCount = computed(() => batchRows.value.filter(c => !batchIssue(c)).length)
const batchResultCounts = computed(() => {
  const values = Object.values(batchResults.value)
  return {
    success: values.filter(value => value === '已发送').length,
    failed: values.filter(value => value === '发信失败，可单条重试').length,
    unknown: values.filter(value => value === '发信失败 · 待核查').length,
    skipped: values.filter(value => value.startsWith('未发送：')).length,
    sending: values.filter(value => value === '发送中').length,
  }
})
const batchSentDrafts = ref<Record<string, ReplyDraft>>({}), batchTemplateSnapshot = ref('')
const batchTemplateStale = computed(() => batchTemplate.value && !replyTemplates.value.some(t => t.id === batchTemplate.value && JSON.stringify(t) === batchTemplateSnapshot.value))
function renderBatch(c: Conversation) { return renderReplyTemplate({ kind: 'message', body: batchBody.value, attachments: batchAttachments.value }, templateContextFor(c)) }
function batchDraft(): ReplyDraft { return { body: batchBody.value, attachments: batchAttachments.value } }
function batchIssue(c: Conversation) {
  if (ineligible(c)) return ineligible(c)
  if (batchTemplateStale.value) return '模板已变更或停用，请重新选择'
  const result = renderBatch(c)
  if (result.unknown.length) return `变量无效：${result.unknown.join('、')}`
  if (result.missing.length) return `待补齐关联资料：${result.missing.map(v => v.label).join('、')}`
  if (/{{|}}/.test(result.body)) return '变量值中含未解析占位符'
  return validateDraft(result) ?? ''
}
function ineligible(c: Conversation) { return c.source !== 'buyer' || !c.canReply ? '不支持回复' : !c.shopId?.trim() || !c.buyerId?.trim() ? '店铺或买家资料缺失，无法发送' : c.messages.some(m => m.delivery === 'unknown') ? '结果待核查，禁止重复发送' : c.messages.some(m => m.delivery === 'sending') ? '正在发送' : c.status === 'ignored' ? '已忽略，请先取消忽略' : '' }
function openBatchReply() { batchIds.value = [...currentSelected.value]; batchBody.value = ''; batchAttachments.value = []; batchTemplate.value = ''; batchResults.value = {}; batchSentDrafts.value = {}; batchTemplateSnapshot.value = ''; batchStage.value = 'edit'; batchDialog.value = true }
async function applyBatchTemplate(value: string) {
  const template = replyTemplates.value.find(t => t.id === value); if (!template) return
  const snapshot = JSON.stringify(template), before = signature(batchDraft())
  if (batchBody.value.trim() || batchAttachments.value.length) {
    try { await ElMessageBox.confirm('使用此模板将替换批量回复中已填写的正文，并合并附件。', '替换回复内容', { confirmButtonText: '替换正文', cancelButtonText: '保留原文' }) } catch { batchTemplate.value = ''; return }
  }
  if (!batchDialog.value || batchStage.value !== 'edit' || signature(batchDraft()) !== before || !replyTemplates.value.some(t => JSON.stringify(t) === snapshot)) { batchTemplate.value = ''; return }
  const merged = new Map<string, MessageAttachment>()
  for (const a of [...batchAttachments.value, ...(template.attachments ?? [])]) { const key = a.source === 'url' && a.url ? a.url : a.id ? `id:${a.id}` : JSON.stringify([a.name, a.size, a.type, a.source]); if (!merged.has(key)) merged.set(key, { ...a }) }
  const proposal: ReplyDraft = { body: template.bodyHtml ? richHtmlToSendText(template.bodyHtml) : template.body, attachments: [...merged.values()] }
  const error = validateDraft(proposal); if (error) { batchTemplate.value = ''; return void ElMessage.warning(`无法采用模板：${error}`) }
  batchBody.value = proposal.body; batchAttachments.value = proposal.attachments; batchTemplateSnapshot.value = snapshot
}
async function confirmBatch() {
  if (batchRunning.value || batchStage.value !== 'edit') return
  const error = validateDraft(batchDraft()); if (error) return void ElMessage.warning(error)
  if (batchTemplateStale.value) return void ElMessage.warning('模板已变更或停用，请重新选择')
  batchRunning.value = true; batchStage.value = 'result'
  batchSentDrafts.value = Object.fromEntries(batchRows.value.map(c => [c.id, { body: renderBatch(c).body, attachments: renderBatch(c).attachments.map(a => ({ ...a })) }]))
  const jobs = batchRows.value.map(async c => {
    const reason = batchIssue(c); if (reason) { batchResults.value[c.id] = `未发送：${reason}`; return }
    const draft = batchSentDrafts.value[c.id]; if (!draft?.body.trim()) { batchResults.value[c.id] = '未发送：请填写正文'; return }
    const messageId = id(); c.messages.push({ ...draft, id: messageId, kind: 'outgoing', sendSource: 'manual', markProcessedOnSuccess: true, sender: me, body: draft.body, at: now(), delivery: 'sending' }); c.updatedAt = now(); batchResults.value[c.id] = '发送中'
    const outcome = c.sendScenario
    await finishDelivery(c, messageId, outcome); batchResults.value[c.id] = outcome === 'success' ? '已发送' : outcome === 'failed' ? '发信失败，可单条重试' : '发信失败 · 待核查'
  })
  await Promise.all(jobs); batchRunning.value = false; selected.value = []
}
const forwardOpen = ref(false), forwardId = ref(''), forwardEmail = ref(''), forwardComment = ref(''), forwardReview = ref(false), forwardError = ref('')
const forwardConversation = computed(() => session.conversations.find(c => c.id === forwardId.value))
const forwardBody = computed(() => {
  const c = forwardConversation.value
  return c?.messages.filter(m => m.kind === 'incoming' || (m.kind === 'outgoing' && m.delivery === 'success')).map(m => `${m.sender} · ${formatMailTime(m.at)}\n${getMessageBodyText(m)}`).join('\n\n') ?? ''
})
function openForward() { if (!current.value) return; forwardId.value = current.value.id; forwardEmail.value = ''; forwardComment.value = ''; forwardReview.value = false; forwardError.value = ''; forwardOpen.value = true }
function reviewForward() { forwardError.value = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(forwardEmail.value.trim()) ? '' : '请输入一个有效的收件邮箱'; if (!forwardError.value) forwardReview.value = true }
function confirmForward() { const c = forwardConversation.value; if (!c || !forwardReview.value) return; c.messages.push({ id: id(), kind: 'note', sender: me, at: now(), body: `转发记录\n收件人：${forwardEmail.value.trim()}\n${forwardComment.value.trim() || '未添加附言'}\n仅转发公开会话文字，不包含内部备注、附件文件与关联订单资料。`, forwardedTo: forwardEmail.value.trim() }); recordHandler(c, '转发'); forwardOpen.value = false; ElMessage.success('转发完成') }
</script>

<template>
  <section class="ebay-mail mail-v2" v-prototype="annotation('overview', 'eBay站内信工作台')">
    <header class="mail-toolbar" aria-label="站内信筛选" v-prototype="annotation('filters', '站内信筛选')">
      <div class="mail-filter-controls">
        <MultiFilter v-model="filters.shopIds" :options="shops" placeholder="全部店铺" :width="132" />
        <MultiFilter v-model="filters.assignees" :options="assignees" placeholder="指派客服" :width="136" />
        <ElButton :class="{ 'is-applied': applied.assignees.length === 1 && applied.assignees[0] === me }" @click="showMine">只看我的</ElButton>
        <MultiFilter v-model="priorities" :options="priorityOptions" placeholder="全部优先级" :width="132" />
        <MultiFilter v-model="tagsFilter" :options="tagOptions" placeholder="全部标签" :width="132" />
        <ElCheckbox v-model="filters.onlyFlagged">仅星标</ElCheckbox>
        <div class="mail-search-actions"><FieldSearch v-model="filters.query" v-model:field="filters.field" v-model:mode="filters.mode" :fields="fields" aria-prefix="站内信" :width="365" @search="applyFilters" /><ElButton type="primary" @click="applyFilters">查询</ElButton><ElButton @click="resetFilters">重置</ElButton></div>
      </div>
      <div class="mail-toolbar-actions">
        <ElButton class="mail-settings-trigger" v-prototype="annotation('settings', '站内信设置')" @click="settingsOpen = true"><ElIcon><Setting /></ElIcon>站内信设置</ElButton>
        <div class="mail-panel-switches" role="group" aria-label="窗口布局" v-prototype="annotation('layout', '窗口组合布局')">
          <PanelToggle label="信件列表" side="left" :active="session.listOpen" :disabled="session.listOpen && panelCount === 1" @toggle="togglePanel('listOpen')" />
          <PanelToggle label="对话区" side="middle" :active="session.readerOpen" :disabled="session.readerOpen && panelCount === 1" @toggle="togglePanel('readerOpen')" />
          <PanelToggle label="资料栏" side="right" :active="session.contextOpen" :disabled="session.contextOpen && panelCount === 1" @toggle="togglePanel('contextOpen')" />
        </div>
      </div>
    </header>
    <p v-if="filterError" class="mail-error" role="alert">{{ filterError }}</p>
    <div class="mail-workspace" :style="workspaceStyle" :class="{ 'has-context': session.contextOpen, 'folders-collapsed': session.foldersCollapsed, 'list-hidden': !session.listOpen, 'reader-hidden': !session.readerOpen }">
      <nav v-if="session.listOpen" class="mail-folders" aria-label="邮箱文件夹" v-prototype="annotation('folders', '邮箱文件夹与待处理计数')">
        <div class="mail-folder-heading"><span>eBay站内信</span><ElTooltip :content="session.foldersCollapsed ? '展开文件夹' : '收起文件夹'" placement="right"><ElButton text :aria-label="session.foldersCollapsed ? '展开文件夹' : '收起文件夹'" :aria-expanded="!session.foldersCollapsed" @click="session.foldersCollapsed = !session.foldersCollapsed"><ElIcon><component :is="session.foldersCollapsed ? ArrowRight : ArrowLeft" /></ElIcon></ElButton></ElTooltip></div>
        <ElTooltip v-for="f in folderRows" :key="f.id" :content="`${f.label} · ${f.count} 条记录 · 待处理 ${f.pending}`" placement="right" :disabled="!session.foldersCollapsed"><button class="mail-folder" :class="{ active: session.folder === f.id }" :aria-label="`文件夹：${f.label}`" :aria-current="session.folder === f.id ? 'page' : undefined" @click="changeFolder(f.id)"><ElIcon><component :is="folderIcons[f.id] || FolderOpened" /></ElIcon><span>{{ f.label }}</span><b>{{ f.count }}</b></button></ElTooltip>
        <div class="mail-folder-options"><ElCheckbox v-model="session.onlyPendingFolders" aria-label="只显示有待处理的文件夹" title="买家按待处理状态，eBay通知按未读；只控制文件夹显示"><span>只显示有待处理<br />的文件夹</span></ElCheckbox><p v-if="session.onlyPendingFolders">当前文件夹始终保留</p></div>
        <div class="mail-folder-legend"><span>星标 · 个人关注</span><span>标签 · 业务分类</span><span>优先级 · 处理顺序</span></div>
      </nav>
      <aside v-if="session.listOpen" class="mail-inbox" aria-label="信件列表" v-prototype="annotation('list', '信件与会话列表')">
        <div class="mail-list-filters" v-prototype="annotation('sources', '文件夹消息来源')">
          <div v-if="showReadQueues" class="mail-queues mail-reading-filters" role="group" aria-label="阅读状态筛选" v-prototype="annotation('queue', '阅读筛选与处理状态区别')"><span class="mail-filter-group-label">阅读</span><button v-for="q in [{ id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'read', label: '已读' }]" :key="q.id" :class="{ active: queue === q.id }" :aria-pressed="queue === q.id" @click="changeQueue(q.id)">{{ q.label }}</button><select v-model="sorting" class="mail-sort-select" aria-label="会话排序"><option value="recent">时间倒序</option><option value="priority">优先级优先</option></select></div>
          <div v-if="showProcessingFilters" class="mail-queues mail-processing-filters" role="group" aria-label="处理状态筛选" v-prototype="annotation('processing', '处理状态筛选与标注')"><span class="mail-filter-group-label">处理</span><button v-for="q in [{ id: 'all', label: '全部' }, { id: 'pending', label: '待处理' }, { id: 'processed', label: '已处理' }] as const" :key="q.id" :class="{ active: processingFilter === q.id }" :aria-pressed="processingFilter === q.id" @click="changeProcessingFilter(q.id)">{{ q.label }}</button><select v-if="!showReadQueues" v-model="sorting" class="mail-sort-select" aria-label="会话排序"><option value="recent">时间倒序</option><option value="priority">优先级优先</option></select></div>
        </div>
        <div class="mail-batch" v-prototype="annotation('assignment', '批量操作与指派')">
          <ElCheckbox :model-value="allSelected" :indeterminate="partlySelected" aria-label="勾选本页信件" @change="selectPage($event === true)" /><span v-if="selected.length" class="mail-selected-count">{{ selected.length }}</span>
          <ElButton link :disabled="!selected.length" @click="openAssignment(currentSelected)">指派</ElButton><ElButton v-if="!isNoticeScope" link :disabled="!selected.length" @click="openBatchReply">批量回复</ElButton>
          <ElButton link :disabled="!selected.length" @click="editTags(currentSelected)">标签</ElButton><ElDropdown :disabled="!selected.length" trigger="click" @command="batchPriority"><ElButton link :disabled="!selected.length">优先级</ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="p in priorityOptions" :key="p.value" :command="p.value">{{ p.label }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
          <ElButton v-if="isNoticeScope" class="mail-all-read" link v-prototype="annotation('allRead', '通知全部标已读的范围')" @click="allRead">所有标记已读</ElButton>
          <ElDropdown class="mail-batch-more" :disabled="!selected.length" trigger="click" @command="markBatch"><ElButton link :disabled="!selected.length" aria-label="批量更多操作">更多<ElIcon><MoreFilled /></ElIcon></ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem v-if="showReadQueues" command="read">标记已读</ElDropdownItem><ElDropdownItem v-if="showReadQueues" command="unread">标记未读</ElDropdownItem><ElDropdownItem command="flag" divided>加星关注</ElDropdownItem><ElDropdownItem command="unflag">取消星标</ElDropdownItem><ElDropdownItem command="ignored" divided>批量忽略</ElDropdownItem><ElDropdownItem v-if="session.folder === 'ignored'" command="restore">取消忽略</ElDropdownItem><ElDropdownItem v-if="!isNoticeScope" command="pending">标注待处理</ElDropdownItem><ElDropdownItem v-if="!isNoticeScope" command="processed">标注已处理</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
        </div>
        <div class="mail-list-scroll"><ElEmpty v-if="!pageRows.length" description="没有匹配的信件" :image-size="62"><ElButton text type="primary" @click="resetFilters">重置筛选</ElButton></ElEmpty>
          <article v-for="entry in pageRows" :key="entry.id" class="mail-list-row" :data-entry-id="entry.id" :data-message-id="entry.message?.id" :class="{ selected: activeEntryId === entry.id, unread: isEntryUnread(entry) }">
            <div class="mail-row-select"><ElCheckbox :model-value="selected.includes(entry.id)" :aria-label="`勾选${entrySubject(entry)} ${entry.conversation.buyerId || 'eBay'}`" @change="setSelected(entry, $event === true)" /><button class="mail-star" :class="{ active: entry.conversation.flagged }" :aria-label="`${entry.conversation.flagged ? '取消星标' : '加星关注'} ${entry.conversation.buyerId || entry.conversation.subject}`" @click="entry.conversation.flagged = !entry.conversation.flagged"><ElIcon><component :is="entry.conversation.flagged ? StarFilled : Star" /></ElIcon></button></div>
            <button class="mail-row-content" :aria-label="`打开${entrySubject(entry)} ${entry.conversation.buyerId || 'eBay'}`" :aria-pressed="activeEntryId === entry.id" @click="selectEntry(entry)">
              <span class="mail-row-top"><span class="mail-row-name"><i v-if="isEntryUnread(entry)" class="mail-unread-dot" />{{ entry.conversation.source === 'ebay' ? 'eBay' : entry.conversation.buyerId }}</span><time>{{ formatMailTime(entry.message?.at ?? entry.conversation.updatedAt) }}</time></span>
              <span class="mail-row-subject-line"><strong class="mail-row-subject" :title="entrySubject(entry)"><i v-if="entry.conversation.priority === 'urgent' || entry.conversation.priority === 'high'" class="mail-priority-dot" :class="entry.conversation.priority" :title="priorityLabel(entry.conversation)" />{{ entrySubject(entry) }}</strong><span v-if="entry.conversation.source === 'buyer'" class="mail-row-status" :class="`status-${entry.conversation.status}`">{{ entry.conversation.status === 'processed' ? '已处理' : entry.conversation.status === 'ignored' ? '已忽略' : '待处理' }}</span></span><span class="mail-row-preview">{{ entry.message ? getMessageBodyText(entry.message) : getPreview(entry.conversation) }}</span>
              <span v-if="entry.message?.delivery || entry.conversation.tags?.length || entry.conversation.messages.some(m => m.kind === 'note')" class="mail-row-badges"><em v-if="entry.message?.delivery" :class="{ 'mail-failed-badge': ['failed', 'unknown'].includes(entry.message.delivery) }">{{ deliveryText[entry.message.delivery] }}</em><em v-if="entry.message?.sendSource === 'automation'" class="mail-automation-badge">自动发送</em><em v-for="t in entry.conversation.tags?.slice(0, 2)" :key="t" :style="tagStyle(t)">{{ tagLabel(t) }}</em><em v-if="entry.conversation.messages.some(m => m.kind === 'note')" class="mail-note-badge">备注 {{ entry.conversation.messages.filter(m => m.kind === 'note').length }}</em></span>
              <span v-if="automationLabel(entry.message)" class="mail-automation-rule" :title="automationLabel(entry.message)">{{ automationLabel(entry.message) }}</span>
              <span class="mail-row-bottom"><span>{{ entry.conversation.shopName }}</span><span v-if="draftPresent(entry.conversation)" class="mail-draft-tag">草稿</span><span v-if="entry.conversation.source === 'buyer'">{{ entry.conversation.assignee || '未指派' }}</span></span>
            </button>
          </article>
        </div>
        <footer class="mail-list-footer" v-prototype="annotation('pagination', '分页与每页条数')"><div class="mail-page-size"><span>共 {{ results.length }} 条记录</span><label>每页 <select v-model.number="session.pageSize" aria-label="每页条数" @change="changePageSize"><option :value="20">20 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label></div><div class="mail-page-navigation"><button :disabled="page === 1" aria-label="首页" @click="changePage(1)">«</button><button :disabled="page === 1" aria-label="上一页" @click="changePage(page - 1)">‹</button><span>第 <input :value="page" aria-label="跳转页码" inputmode="numeric" type="number" min="1" :max="totalPages" @change="changePage(Number(($event.target as HTMLInputElement).value) || 1)" @keydown.enter="changePage(Number(($event.target as HTMLInputElement).value) || 1)" /> / {{ totalPages }} 页</span><button :disabled="page >= totalPages" aria-label="下一页" @click="changePage(page + 1)">›</button><button :disabled="page >= totalPages" aria-label="末页" @click="changePage(totalPages)">»</button></div></footer>
      </aside>

      <main v-if="current && session.readerOpen" class="mail-reader" :class="{ 'is-notice': current.source === 'ebay' }">
        <header class="mail-reader-header mail-reader-heading" v-prototype="annotation('header', '信件标题与会话信息')">
          <h2 class="mail-reading-subject" :title="readingTitle">{{ readingTitle }}</h2>
          <div class="mail-header-primary">
            <div class="mail-reader-identity">
              <span class="mail-person-icon"><ElIcon><component :is="current.source === 'ebay' ? Message : User" /></ElIcon></span>
              <span class="mail-reader-party" :title="current.source === 'ebay' ? 'eBay' : current.buyerId">{{ current.source === 'ebay' ? 'eBay' : current.buyerId }}</span>
              <ElTag v-if="current.source === 'buyer'" size="small" :type="current.status === 'processed' ? 'success' : current.status === 'ignored' ? 'info' : 'warning'" effect="plain">{{ current.status === 'processed' ? '已处理' : current.status === 'ignored' ? '已忽略' : '待处理' }}</ElTag>
              <ElTag v-else-if="current.status === 'ignored'" size="small" type="info" effect="plain">已忽略</ElTag>
              <span class="mail-header-context" :title="current.shopName">{{ current.shopName }}<template v-if="current.source === 'ebay'"> · {{ formatMailTime(current.updatedAt) }}</template></span>
            </div>
            <div class="mail-reader-actions">
              <ElButton v-if="current.source === 'buyer' && current.status !== 'ignored'" class="mail-process-action" v-prototype="annotation('queue', '本地待处理与已处理')" type="primary" plain size="small" @click="markCurrentStatus">{{ current.status === 'processed' ? '标注待处理' : '标注已处理' }}</ElButton>
              <ElButton class="mail-inline-action" link v-prototype="annotation('ignore', '忽略与恢复')" @click="ignoreCurrent">{{ current.status === 'ignored' ? '取消忽略' : '忽略' }}</ElButton>
              <ElTooltip :content="current.flagged ? '取消星标' : '加星关注'"><ElButton text :aria-label="current.flagged ? '取消当前星标' : '关注当前信件'" :class="{ 'is-flagged': current.flagged }" @click="current.flagged = !current.flagged"><ElIcon><component :is="current.flagged ? StarFilled : Star" /></ElIcon></ElButton></ElTooltip>
              <ElDropdown trigger="click"><ElButton text aria-label="当前信件更多操作"><ElIcon><MoreFilled /></ElIcon></ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem v-if="currentEntry" @click="setConversationUnread(current, !current.unread)"><span v-prototype="annotation('read', '整会话已读未读同步')">{{ current.unread ? '标记已读' : '标记未读' }}</span></ElDropdownItem><ElDropdownItem @click="openAssignment([current.id])">指派客服</ElDropdownItem><ElDropdownItem @click="openForward">转发站内信</ElDropdownItem><ElDropdownItem @click="ignoreCurrent">{{ current.status === 'ignored' ? '取消忽略' : '忽略会话' }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
            </div>
          </div>
          <div class="mail-header-secondary">
            <div class="mail-classification" v-prototype="annotation('priority', '优先级与业务标签')"><label>优先级 <select v-model="current.priority" aria-label="当前会话优先级"><option v-for="p in priorityOptions" :key="p.value" :value="p.value">{{ p.label }}</option></select></label><button class="mail-tag-editor" v-prototype="annotation('tags', '个人星标与业务标签')" :title="current.tags?.length ? current.tags.map(tagLabel).join(' / ') : '添加标签'" @click="editTags([current.id])"><ElIcon><CollectionTag /></ElIcon><span class="mail-active-tags"><i v-for="t in current.tags" :key="t" :style="tagStyle(t)">{{ tagLabel(t) }}</i><span v-if="!current.tags?.length">添加标签</span></span></button></div>
            <div v-if="current.source === 'buyer'" class="mail-ownership" v-prototype="annotation('assignment', '指派客服与实际处理人')"><span class="mail-assignment-controls">指派客服 <button @click="openAssignment([current.id])">{{ current.assignee || '未指派' }}</button><button v-if="current.assignee !== me" class="mail-claim" @click="assignMe">指派给我</button></span><ElTooltip :content="`最近处理：${handlerSummary}`" placement="bottom"><span class="mail-last-handler" tabindex="0">最近处理：{{ handlerSummary }}</span></ElTooltip></div>
          </div>
        </header>
        <div v-if="outsideResults" class="mail-outside-note">当前信件已不在筛选结果中，内容保留供查看。</div>
        <div v-if="current.source === 'buyer'" class="mail-context-summary" v-prototype="annotation('association', '当前订单与关联记录')"><template v-if="order"><button @click="openContext('order')">当前订单 <b>{{ order.orderNo }}</b></button><span class="mail-summary-divider" /><button @click="openContext('afterSales')">售后 <b>{{ countLabel(getContextCount(order.afterSales)) }}</b></button><button @click="openContext('disputes')">纠纷 <b>{{ countLabel(getContextCount(order.disputes)) }}</b></button><button @click="openContext('reviews')">评价 <b>{{ countLabel(getContextCount(order.reviews)) }}</b></button></template><template v-else><span>{{ associationLabel }}</span><button v-if="current.product || related.length" @click="openContext('order')">查看相关资料</button></template></div>
        <button v-if="latestNote" class="mail-note-summary" @click="notesOnly = !notesOnly" v-prototype="annotation('notes', '内部备注展示')"><ElIcon><Lock /></ElIcon><b>内部备注 {{ notes.length }}</b><span>{{ latestNote.body }}</span><em>{{ notesOnly ? '显示全部往来' : '查看备注' }}</em></button>
        <div v-if="current.source === 'ebay' && currentNotice && !notesOnly" ref="thread" class="mail-notice-scroll" v-prototype="annotation('notice', '平台通知原文阅读')"><article class="mail-notice-document" :data-message-id="currentNoticeMessage?.id"><div class="mail-notice-wordmark" aria-label="eBay"><span>e</span><span>b</span><span>a</span><span>y</span></div><div class="mail-notice-rule" /><h2>{{ currentNotice.heading }}</h2><p v-for="(p, n) in currentNotice.paragraphs" :key="n">{{ p }}</p><section v-for="(s, n) in currentNotice.sections" :key="n"><h3>{{ s.title }}</h3><p>{{ s.content }}</p></section><footer>{{ currentNotice.footer }}</footer></article></div>
        <template v-else><div v-if="current.source === 'buyer'" class="mail-thread-controls"><button v-prototype="annotation('translation', '翻译参考与原文')" @click="translateAll">{{ translations.length ? '收起中文' : '全文翻译为中文' }}</button><ElCheckbox v-model="session.autoNext" v-prototype="annotation('autoNext', '回复成功自动下一封')">自动下一封</ElCheckbox></div><div ref="thread" class="mail-thread" aria-label="消息往来" v-prototype="annotation('conversation', '消息往来与内部记录')"><div class="mail-thread-date"><span>{{ notesOnly ? '仅内部备注 · 买家不可见' : '消息往来 · 北京时间' }}</span></div><article v-for="m in current.messages.filter(m => !notesOnly || m.kind === 'note')" :key="m.id" class="mail-message" :data-message-id="m.id" :class="[`mail-message-${m.kind}`, { 'is-target-message': targetMessageId === m.id }]"><div class="mail-message-meta"><span><ElIcon v-if="m.kind === 'note'"><Lock /></ElIcon>{{ m.kind === 'note' ? '内部备注 · ' : '' }}{{ m.sender }}<em v-if="automationLabel(m)" class="mail-automation-origin" :title="automationLabel(m)">{{ automationLabel(m) }}</em></span><time>{{ formatMailTime(m.at) }}</time></div><div class="mail-message-body"><strong v-if="m.subject" class="mail-message-subject">{{ m.subject }}</strong><div v-if="m.bodyHtml" class="mail-rich-body" v-html="sanitizeRichHtml(m.bodyHtml)" /><span v-else>{{ getMessageBodyText(m) }}</span><div v-if="translations.includes(m.id)" class="mail-translation">中文参考：{{ m.translation }}</div><button v-for="a in m.attachments" :key="a.id" class="mail-message-attachment" @click="attachmentInfo(a)"><ElIcon><Document /></ElIcon>{{ a.name }}</button></div><button v-if="m.kind === 'incoming' && m.translation" class="mail-translate-button" @click="toggleTranslation(m)">{{ translations.includes(m.id) ? '收起译文' : '翻译为中文' }}</button><div v-if="m.delivery" class="mail-delivery" :class="`delivery-${m.delivery}`"><span>{{ deliveryText[m.delivery] }}</span><button v-if="m.delivery === 'failed'" v-prototype="annotation('send', '失败重试与待核查')" :disabled="!!ineligible(current)" @click="retryMessage(current, m)">重试</button></div><p v-if="m.failureReason" class="mail-failure-reason">{{ m.failureReason }}</p></article></div></template>
        <ReplyEditor v-if="current.source === 'buyer' && current.canReply" :conversation="current" :draft="composer" v-model:mode="session.composeMode" v-model:mark-processed-on-send="session.markProcessedOnSend" :sending="sending" :uncertain="uncertain" :template-context="templateContext" @send="prepareSend" @save="saveDraft" />
        <div v-else-if="current.source === 'buyer'" class="mail-reply-unavailable">该消息暂不支持回复，可查看已有往来及关联资料。</div>
      </main>
      <main v-else-if="session.readerOpen" class="mail-empty-reader"><ElEmpty description="选择一封信件开始处理" :image-size="90" /></main>
      <RelatedPanel v-if="session.contextOpen && current?.source === 'buyer'" :conversation="current" :orders="session.orders" :show-identity="!session.readerOpen" v-model:active-tab="session.contextTab" v-model:selected-order-id="session.selectedOrderId" @close="closeContext" />
      <aside v-else-if="session.contextOpen" class="mail-context-placeholder"><ElEmpty :description="current?.source === 'ebay' ? '平台通知没有关联买家资料' : '选择一封买家来信查看资料'" :image-size="70" /></aside>
    </div>
    <MailSettings v-model="settingsOpen" />
    <ElDialog v-model="assignmentOpen" title="指派客服" width="440px" destroy-on-close><p>将 {{ assignmentIds.length }} 条记录指派给：</p><ElSelect v-model="assignmentValue" aria-label="指派客服选择"><ElOption v-for="a in assignees" :key="a.value" :label="a.label" :value="a.value" /></ElSelect><p class="mail-help">指派代表当前负责人，不改写实际处理人。</p><template #footer><ElButton @click="assignmentValue = me">指派给我</ElButton><ElButton @click="assignmentOpen = false">取消</ElButton><ElButton type="primary" @click="saveAssignment">确定指派</ElButton></template></ElDialog>
    <ElDialog v-model="tagDialog" title="业务标签" width="460px"><p>{{ tagIds.length > 1 ? `为 ${tagIds.length} 个会话统一设置以下标签，将替换原标签。` : '可选择多个业务标签，取消勾选即可移除。' }}</p><div class="mail-tag-options"><ElCheckbox v-for="t in tagOptions" :key="t.value" :model-value="tagDraft.includes(t.value)" @change="v => tagDraft = v ? [...tagDraft, t.value] : tagDraft.filter(x => x !== t.value)"><span class="mail-tag-choice" :style="tagStyle(t.value)">{{ t.label }}</span></ElCheckbox></div><template #footer><ElButton @click="tagDialog = false">取消</ElButton><ElButton type="primary" @click="saveTags">保存标签</ElButton></template></ElDialog>
    <ElDialog v-model="batchDialog" title="批量回复站内信" width="760px" :close-on-click-modal="false" :show-close="!batchRunning" :close-on-press-escape="!batchRunning"><div class="mail-batch-dialog-body" v-prototype="annotation('batchReply', '批量回复资格与逐条结果')">
      <p class="mail-help">正文中的变量分别按每位买家的资料替换，各会话原有草稿会保留。</p>
      <template v-if="batchStage === 'edit'">
        <label class="mail-form-label">使用模板</label><ElSelect v-model="batchTemplate" placeholder="选择站内信模板" aria-label="批量回复模板" @change="applyBatchTemplate"><ElOption v-for="t in replyTemplates" :key="t.id" :value="t.id" :label="t.title" /></ElSelect>
        <label class="mail-form-label">回复正文</label><ElInput v-model="batchBody" type="textarea" :rows="5" aria-label="批量回复正文" placeholder="填写发送给买家的正文" /><p class="mail-batch-count" :class="{ 'mail-error': batchBody.length > MAX_REPLY_BODY_LENGTH }">{{ batchBody.length }} / {{ MAX_REPLY_BODY_LENGTH }}</p><p v-for="a in batchAttachments" :key="a.id">附件：{{ a.name }} <ElButton text :aria-label="`移除批量附件 ${a.name}`" @click="batchAttachments = batchAttachments.filter(item => item !== a)">移除</ElButton></p>
      </template>
      <p v-if="batchStage === 'edit' && batchTemplateStale" class="mail-error">模板已变更或停用，请重新选择。<ElButton v-if="replyTemplates.some(t => t.id === batchTemplate)" link type="primary" @click="applyBatchTemplate(batchTemplate)">重新采用模板</ElButton></p>
      <h4>{{ batchStage === 'result' ? '发送结果' : '收件人' }} · {{ batchRows.length }} 个会话</h4>
      <p v-if="batchStage === 'edit'" class="mail-batch-summary" aria-label="批量回复资格统计">可发送 {{ batchEligibleCount }} · 排除 {{ batchRows.length - batchEligibleCount }}</p>
      <p v-else class="mail-batch-summary" aria-label="批量回复结果统计">成功 {{ batchResultCounts.success }} · 失败 {{ batchResultCounts.failed }} · 待核查 {{ batchResultCounts.unknown }} · 未发送 {{ batchResultCounts.skipped }} · 发送中 {{ batchResultCounts.sending }}</p>
      <div class="mail-batch-review"><div v-for="c in batchRows" :key="c.id">
        <span><b>{{ c.buyerId || 'eBay' }}</b><small>{{ c.shopName }} · {{ c.assignee || '未指派' }}</small></span>
        <em :class="{ blocked: batchIssue(c) || batchResults[c.id]?.includes('失败') }">{{ batchStage === 'result' ? batchResults[c.id] : batchIssue(c) || '可回复' }}</em>
        <details v-if="batchBody.trim()" class="mail-batch-recipient-body"><summary>查看该买家的正文</summary><div class="mail-batch-body-preview">{{ batchStage === 'result' ? batchSentDrafts[c.id]?.body : renderBatch(c).body }}</div><p v-for="a in (batchStage === 'result' ? batchSentDrafts[c.id]?.attachments : batchAttachments)" :key="a.id">附件：{{ a.name }}</p></details>
      </div></div>
      </div><template #footer><ElButton :disabled="batchRunning" @click="batchDialog = false">{{ batchStage === 'result' ? '完成' : '取消' }}</ElButton><ElButton v-if="batchStage === 'edit'" type="primary" :disabled="!batchRows.some(c => !batchIssue(c))" @click="confirmBatch">批量发送</ElButton></template>
    </ElDialog>
    <ElDialog v-model="forwardOpen" title="转发站内信" width="650px" :close-on-click-modal="false"><div class="mail-forward-dialog-body" v-prototype="annotation('forward', '转发内容与收件范围')"><template v-if="!forwardReview"><label class="mail-form-label">收件邮箱</label><ElInput v-model="forwardEmail" placeholder="colleague@example.com" aria-label="转发收件邮箱" /><label class="mail-form-label">附言</label><ElInput v-model="forwardComment" type="textarea" :rows="3" maxlength="1000" aria-label="转发附言" /><p v-if="forwardError" class="mail-error">{{ forwardError }}</p></template><template v-else><p>收件邮箱：<strong>{{ forwardEmail }}</strong></p><p>{{ forwardComment }}</p></template><h4>{{ forwardConversation?.subject }}</h4><div class="mail-send-preview">{{ forwardBody }}</div></div><template #footer><ElButton @click="forwardOpen = false">取消</ElButton><ElButton v-if="!forwardReview" type="primary" @click="reviewForward">预览转发</ElButton><ElButton v-else @click="forwardReview = false">返回编辑</ElButton><ElButton v-if="forwardReview" type="primary" @click="confirmForward">确认转发</ElButton></template></ElDialog>
  </section>
</template>





<style scoped>
.mail-message-subject{display:block;color:var(--yy-text-heading);margin-bottom:8px}.mail-rich-body{white-space:normal;overflow-wrap:anywhere}.mail-rich-body :deep(p){margin:0 0 8px}.mail-rich-body :deep(ul),.mail-rich-body :deep(ol){padding-left:24px}.mail-rich-body :deep(h1){font-size:24px}.mail-rich-body :deep(h2){font-size:20px}.mail-rich-body :deep(h3){font-size:18px}
</style>
