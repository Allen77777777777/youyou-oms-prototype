<script setup lang="ts">
import BuyerLink from '@/组件/买家/买家链接.vue'
import { resolveTicketBuyer } from '@/页面/eBay买家详情/聚合'
import { computed, onBeforeUnmount, ref, toRefs, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElDatePicker, ElInput, ElMessage, ElOption, ElSelect, ElTag } from 'element-plus'
import { abandonTicket, actors, appendComment, appendProgress, changeTicketPriority, changeTicketSchedule, currentActor, finishTicket, isTicketClosed, reopenTicket, sourceLabels, sourceLocation, ticketPriorities, toggleTicketItem, transferTicket, type Ticket, type TicketChecklistItem, type TicketPriority } from './会话'
import { ticketAnnotations } from './标注'
import { storeFiles } from './附件存储'
import { getFollowupDraft, saveFollowupDraft } from './跟进草稿'
import Attachment from './跟进附件.vue'
import AttachmentEditor from './附件编辑.vue'
import ChecklistEditor from './待办清单输入.vue'

const props = defineProps<{ ticket: Ticket }>()
const router = useRouter()
const buyerIdentity = computed(() => props.ticket.source && resolveTicketBuyer(props.ticket.source))
const actor = currentActor.value
const draftEntry = getFollowupDraft(props.ticket.id, actor, props.ticket.nextAt, props.ticket.dueAt)
const draft = draftEntry.draft
const { note, result, transferNote, assignee, nextAt, dueAt, scheduleReason, abandonReason, reopenReason, incompleteReason, pending, newTasks } = toRefs(draft)
const error = ref('')
const draftError = ref('')
const draftNotice = ref(draftEntry.notice)
const checklist = computed(() => props.ticket.checklist || [])
const checkedCount = computed(() => checklist.value.filter(item => item.done).length)
const remainingCount = computed(() => checklist.value.length - checkedCount.value)
const checklistError = ref('')
const priorityError = ref('')
const saving = ref(false)
let active = true
const ready = ref(false)
let draftTimer: ReturnType<typeof setTimeout> | undefined
async function remember() {
  if (!ready.value) return
  try { await saveFollowupDraft(props.ticket.id, actor, draft, props.ticket.nextAt, props.ticket.dueAt); if (active) draftError.value = '' }
  catch { if (active) draftError.value = '草稿暂未保存到本机，请保留当前页面后重试。' }
}
void draftEntry.ready.catch((failure: Error) => { draftNotice.value = failure.message }).finally(() => { ready.value = true; if (!active) void remember() })
watch(draft, () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => { void remember() }, 180) }, { deep: true })
watch(() => props.ticket.nextAt, (value, old) => { if (nextAt.value === old) nextAt.value = value })
watch(() => props.ticket.dueAt, (value, old) => { if (dueAt.value === old) dueAt.value = value })
onBeforeUnmount(() => { active = false; clearTimeout(draftTimer); void remember() })
const closed = computed(() => isTicketClosed(props.ticket))
const editable = computed(() => props.ticket.owner === currentActor.value && !closed.value)
const mayComment = computed(() => !closed.value && props.ticket.creator === currentActor.value)
const mayReopen = computed(() => closed.value && props.ticket.owner === currentActor.value)
const modes = computed(() => editable.value ? ['记录跟进', '转交', '调整安排', '完成工单', '放弃工单'] : mayComment.value ? ['内部补充'] : mayReopen.value ? ['重新打开'] : [])
const mode = computed(() => modes.value.includes(draft.mode) ? draft.mode : modes.value[0] || '')
const submitLabel = computed(() => ({ '记录跟进': '保存跟进', '内部补充': '保存补充', '转交': '确认转交', '调整安排': '保存安排', '完成工单': '确认完成', '放弃工单': '确认放弃', '重新打开': '确认重新打开' } as Record<string, string>)[mode.value] || '保存')
const orderedLogs = computed(() => [...props.ticket.logs].reverse())

function switchMode(value: string) {
  if (saving.value) return
  draft.mode = value
  error.value = ''
}
function setPriority(event: Event) {
  const control = event.target as HTMLSelectElement
  priorityError.value = changeTicketPriority(props.ticket.id, control.value as TicketPriority)
  if (priorityError.value) control.value = props.ticket.priority || '普通'
}
function toggle(item: TicketChecklistItem, event: Event) {
  const control = event.target as HTMLInputElement
  checklistError.value = toggleTicketItem(props.ticket.id, item.id, control.checked)
  if (checklistError.value) control.checked = item.done
}
async function submit() {
  if (saving.value || !ready.value || !mode.value || actor !== currentActor.value) return
  const id = props.ticket.id
  const action = mode.value
  const files = [...pending.value]
  saving.value = true
  error.value = ''
  try {
    if (action === '记录跟进' || action === '内部补充') {
      if (files.length) await storeFiles(files)
      if (!active || actor !== currentActor.value || id !== props.ticket.id) return
      error.value = action === '记录跟进' ? appendProgress(id, note.value, nextAt.value || '', files.map(item => item.attachment), newTasks.value) : appendComment(id, note.value, files.map(item => item.attachment))
    } else if (action === '完成工单') {
      if (remainingCount.value && !incompleteReason.value.trim()) { error.value = '请说明剩余待办无需继续办理的原因'; return }
      const conclusion = result.value.trim()
      error.value = finishTicket(id, conclusion ? conclusion + (remainingCount.value ? '\n剩余 ' + remainingCount.value + ' 项未完成：' + incompleteReason.value.trim() : '') : '')
    } else if (action === '放弃工单') error.value = abandonTicket(id, abandonReason.value)
    else if (action === '重新打开') error.value = reopenTicket(id, reopenReason.value)
    else if (action === '调整安排') error.value = changeTicketSchedule(id, { nextAt: nextAt.value || '', dueAt: dueAt.value || '' }, scheduleReason.value)
    else error.value = transferTicket(id, assignee.value, transferNote.value)
    if (error.value) return
    ElMessage.success(({ '记录跟进': '跟进记录已保存', '内部补充': '内部补充已保存', '完成工单': '工单已完成', '放弃工单': '工单已放弃', '转交': '工单已转交', '调整安排': '办理安排已保存', '重新打开': '工单已重新打开' } as Record<string, string>)[action] || '已保存')
    if (action === '记录跟进' || action === '内部补充') {
      note.value = ''
      pending.value = []
      newTasks.value = []
      nextAt.value = props.ticket.nextAt
    } else if (action === '转交') {
      transferNote.value = ''
      assignee.value = ''
    } else if (action === '调整安排') scheduleReason.value = ''
    else if (action === '重新打开') reopenReason.value = ''
    else if (action === '完成工单') { result.value = ''; incompleteReason.value = '' }
    else if (action === '放弃工单') abandonReason.value = ''
    nextAt.value = props.ticket.nextAt
    dueAt.value = props.ticket.dueAt
    draft.mode = '记录跟进'
    await remember()
  } catch {
    error.value = '保存失败，请检查浏览器存储空间后重试。跟进草稿已保留。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <article v-prototype="ticketAnnotations.detail" class="ticket-detail" aria-label="工单内容">
    <header class="detail-top"><div class="detail-heading">
      <div><span class="ticket-id">{{ ticket.id }}</span><h2>{{ ticket.title }}</h2></div>
      <ElTag :type="ticket.status === '已完成' ? 'success' : ticket.status === '已放弃' ? 'warning' : ticket.status === '处理中' ? 'primary' : 'info'">{{ ticket.status }}</ElTag>
    </div>
    <p v-if="ticket.description" class="description">{{ ticket.description }}</p>
    <dl class="facts">
      <div><dt>优先级</dt><dd>
        <select v-if="editable" class="priority-control" :value="ticket.priority || '普通'" :data-priority="ticket.priority || '普通'" :disabled="saving" aria-label="工单优先级" @change="setPriority">
          <option v-for="level in ticketPriorities" :key="level" :value="level">{{ level }}</option>
        </select>
        <span v-else class="priority-value" :data-priority="ticket.priority || '普通'">{{ ticket.priority || '普通' }}</span>
        <p v-if="priorityError" class="error" role="alert">{{ priorityError }}</p>
      </dd></div>
      <div><dt>负责人</dt><dd>{{ ticket.owner }}</dd></div>
      <div><dt>发起人</dt><dd>{{ ticket.creator }}</dd></div>
      <div><dt>下次跟进</dt><dd>{{ ticket.nextAt || '—' }}</dd></div>
      <div><dt>完成期限</dt><dd>{{ ticket.dueAt || '—' }}</dd></div>
      <div><dt>创建时间</dt><dd>{{ ticket.createdAt }}</dd></div>
      <div><dt>最近更新</dt><dd>{{ ticket.updatedAt }}</dd></div>
    </dl></header>
    <div class="detail-workspace"><div class="record-pane">
    <section class="source-block" aria-label="来源单据">
      <div class="source-header"><h3>来源单据</h3><span>{{ ticket.source ? sourceLabels[ticket.source.kind] : '无来源' }}</span></div>
      <template v-if="ticket.source">
        <button type="button" class="source-link" @click="router.push(sourceLocation(ticket.source))">{{ ticket.source.id }}</button>
        <div class="source-shop">{{ ticket.source.shopName }}<template v-if="buyerIdentity"> · <BuyerLink :shop-id="buyerIdentity.shopId" :buyer-id="buyerIdentity.buyerId" /></template></div>
        <p v-if="ticket.source.summary" class="source-summary">{{ ticket.source.summary }}</p>
      </template>
    </section>
    <section v-if="closed" class="result" :class="{ abandoned: ticket.status === '已放弃' }">
      <h3>{{ ticket.status === '已放弃' ? '放弃原因' : '处理结果' }}</h3><p>{{ ticket.status === '已放弃' ? ticket.abandonReason : ticket.result }}</p>
      <span v-if="ticket.closedAt" class="closed-time">结束于 {{ ticket.closedAt }}</span>
    </section>
    <section class="history" aria-label="工单跟进记录">
      <h3>跟进记录 <span>{{ ticket.logs.length }}</span></h3>
      <ol><li v-for="(log, index) in orderedLogs" :key="ticket.logs.length - index">
        <div class="log-line"><strong>{{ log.action }}</strong><span>{{ log.actor }}</span><time>{{ log.time }}</time></div>
        <p v-if="log.note">{{ log.note }}</p>
        <div v-if="log.attachments?.length" class="saved-files" aria-label="跟进附件">
          <Attachment v-for="file in log.attachments" :key="file.id" :attachment="file" />
        </div>
      </li></ol>
    </section>
    </div><aside class="handling-pane" aria-label="工单办理">
    <section v-if="checklist.length" class="current-tasks" aria-label="当前待办清单">
      <div class="tasks-header"><h3>待办清单</h3><span>已完成 {{ checkedCount }} / {{ checklist.length }}</span></div>
      <ul>
        <li v-for="item in checklist" :key="item.id"><label :class="{ checked: item.done }">
          <input type="checkbox" :checked="item.done" :disabled="!editable || saving" @change="toggle(item, $event)" />
          <span>{{ item.text }}</span>
        </label></li>
      </ul>
      <p v-if="checklistError" class="error" role="alert">{{ checklistError }}</p>
    </section>
    <section v-if="modes.length" v-prototype="ticketAnnotations.closure" class="operation">
      <div v-if="editable" role="tablist" class="actions" aria-label="工单处理动作">
        <button v-for="option in modes" :key="option" type="button" role="tab" :disabled="saving" :aria-selected="mode === option" @click="switchMode(option)">{{ option }}</button>
      </div><h3 v-else>{{ mode }}</h3>
      <form @submit.prevent="submit">
        <template v-if="mode === '记录跟进' || mode === '内部补充'">
          <AttachmentEditor v-model="pending" :disabled="saving" @change="error = ''">
            <label>{{ mode === '内部补充' ? '补充内容' : '跟进内容' }}<ElInput v-model="note" :disabled="saving" type="textarea" :rows="6" resize="vertical" :aria-label="mode === '内部补充' ? '内部补充内容' : '跟进内容'" placeholder="记录进展或补充信息，可直接粘贴图片" /></label>
            <ChecklistEditor v-if="editable" v-model="newTasks" label="新增待办事项" :disabled="saving" />
          </AttachmentEditor>
          <label v-if="editable" class="date-control">下次跟进时间<ElDatePicker v-model="nextAt" :disabled="saving" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" placeholder="选择下次跟进时间" aria-label="下次跟进时间" /></label>
          <p v-else class="hint">补充信息将提醒当前负责人。</p>
        </template>
        <template v-else-if="mode === '转交'">
          <label>新负责人<ElSelect v-model="assignee" aria-label="新负责人" placeholder="选择接手人" style="max-width: 240px">
            <ElOption v-for="actor in actors.filter(value => value !== ticket.owner)" :key="actor" :label="actor" :value="actor" />
          </ElSelect></label>
          <label>交接说明<ElInput v-model="transferNote" type="textarea" :rows="2" aria-label="交接说明" placeholder="写明当前进展和交给对方的事项" /></label>
        </template>
        <template v-else-if="mode === '调整安排'">
          <label>下次跟进时间<ElDatePicker v-model="nextAt" :disabled="saving" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" placeholder="选择下次跟进时间" aria-label="下次跟进时间" /></label>
          <label>完成期限<ElDatePicker v-model="dueAt" :disabled="saving" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" placeholder="选择完成期限" aria-label="调整完成期限" /></label>
          <label>调整原因{{ dueAt !== ticket.dueAt ? '（必填）' : '（选填）' }}<ElInput v-model="scheduleReason" :disabled="saving" type="textarea" :rows="3" aria-label="调整安排原因" placeholder="修改完成期限时，请说明原因" /></label>
        </template>
        <template v-else-if="mode === '完成工单'">
          <label>处理结果<ElInput v-model="result" :disabled="saving" type="textarea" :rows="5" aria-label="处理结果" placeholder="填写这项任务的办理结果" /></label>
          <div v-if="remainingCount" class="completion-warning" role="note">还有 {{ remainingCount }} 项待办未完成。确认无需继续办理时，请说明原因。
            <ElInput v-model="incompleteReason" :disabled="saving" type="textarea" :rows="3" aria-label="未完成事项说明" placeholder="说明剩余待办无需继续办理的原因" />
          </div>
        </template>
        <template v-else-if="mode === '放弃工单'">
          <p class="hint">结束这项内部任务并保留全部记录，来源单据仍按各自流程办理。</p>
          <label>放弃原因<ElInput v-model="abandonReason" :disabled="saving" type="textarea" :rows="5" aria-label="放弃原因" placeholder="例如：重复建单、业务不再需要，请写明具体原因" /></label>
        </template>
        <template v-else-if="mode === '重新打开'">
          <p class="hint">重新打开后由 {{ ticket.owner }} 继续处理，原结论和历史记录仍可查阅。</p>
          <label>重新打开原因<ElInput v-model="reopenReason" :disabled="saving" type="textarea" :rows="4" aria-label="重新打开原因" placeholder="说明为什么需要继续办理" /></label>
        </template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="draftError" class="error" role="status">{{ draftError }}</p>
        <p v-if="draftNotice" class="hint" role="status">{{ draftNotice }}</p>
        <div class="submit-line"><ElButton :type="mode === '放弃工单' ? 'warning' : 'primary'" :disabled="!ready" :loading="saving" native-type="submit">{{ ready ? submitLabel : '正在恢复草稿' }}</ElButton></div>
      </form>
    </section>
    <p v-else class="hint">当前工单由 {{ ticket.owner }} 办理。</p>
    </aside></div>
  </article>
</template>

<style scoped>
.ticket-detail { display:flex; flex-direction:column; height:100%; min-height:0; color: #354356; font-size: 13px; }
.detail-top { flex:none; padding-bottom:12px; border-bottom:1px solid #e7ecf2; }
.detail-workspace { display:grid; grid-template-columns:minmax(0,1fr) 390px; gap:22px; flex:1; min-height:0; padding-top:16px; }
.record-pane,.handling-pane { min-width:0; overflow:auto; overscroll-behavior:contain; padding-right:5px; scrollbar-gutter:stable; }
.handling-pane { padding-left:18px; border-left:1px solid #e5eaf0; }
.detail-heading, .source-header, .actions, .log-line, .submit-line { display: flex; align-items: center; }
.detail-heading { justify-content: space-between; align-items: flex-start; gap: 14px; }
.ticket-id { display:block; font-size:24px; font-weight:650; line-height:1.25; color:var(--yy-text-heading); font-variant-numeric:tabular-nums; }
h2 { font-size: 19px; font-weight: 600; line-height: 1.4; margin: 4px 0; overflow-wrap: anywhere; color: var(--yy-text-heading); }
h3 { font-size: 14px; margin: 0; color: var(--yy-text-heading); font-weight: 600; }
.description, .source-summary, .result p, .history p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.description { margin: 8px 0; max-height:72px; overflow:auto; }
.facts { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 9px 14px; margin: 12px 0 0; font-size:12px; }
.facts div { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.facts dt { color: #6c7a8d; min-width: 58px; }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.priority-control { min-width:84px; height:27px; border:1px solid #d7dee7; border-radius:4px; padding:0 6px; background:#fff; font:inherit; cursor:pointer; }
.priority-control[data-priority="优先"], .priority-value[data-priority="优先"] { color:#99540b; }
.priority-control[data-priority="紧急"], .priority-value[data-priority="紧急"] { color:#b02e2b; }
.current-tasks { margin-bottom:16px; padding:12px; border:1px solid #dfe7ee; border-radius:5px; }
.tasks-header { display:flex; align-items:baseline; gap:9px; }
.tasks-header span { font-size:12px; color:#65758b; }
.current-tasks ul { margin:9px 0 0; padding:0; list-style:none; }
.current-tasks li + li { margin-top:5px; }
.current-tasks label { display:flex; gap:8px; align-items:flex-start; line-height:1.55; }
.current-tasks input { margin:3px 0 0; accent-color:#267be0; }
.current-tasks label span { overflow-wrap:anywhere; }
.current-tasks .checked span { color:#6d7c8b; text-decoration:line-through; }
.source-block, .result { padding: 13px 15px; border: 1px solid #dfe7ee; border-radius: 5px; background: #f8fafd; }
.source-header { gap: 8px; margin-bottom: 7px; }
.source-header span, .source-shop, .log-line span, .log-line time { font-size: 12px; color: #6b788b; }
.source-link { border: 0; background: transparent; padding: 0; font: inherit; font-weight: 600; color: #176dc9; cursor: pointer; overflow-wrap: anywhere; }
.source-link:hover { text-decoration: underline; }
.source-shop { display: inline; margin-left: 10px; }
.source-summary { margin: 5px 0 0; color: #526479; }
.history, .result { margin-top: 16px; }
.actions { flex-wrap:wrap; gap: 0 15px; border-bottom: 1px solid #e3e8ee; }
.actions button { padding: 6px 1px 9px; border: 0; border-bottom: 2px solid transparent; background: none; color: #607086; font: inherit; cursor: pointer; }
.actions button[aria-selected="true"] { border-color: #267be0; color: #1767be; font-weight: 600; }
form { display: grid; gap: 12px; padding-top: 13px; }
.saved-files { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(160px,100%),1fr)); gap:10px; margin-top:10px; }
form label { display: grid; gap: 6px; font-size: 12px; color: #536377; }
.date-control { min-width:0; }
form :deep(.el-date-editor.el-input) { width:100%; }
.hint { margin:0; color:#6b788b; font-size:12px; line-height:1.65; }
.completion-warning { display:grid; gap:9px; padding:12px; color:#865517; background:#fff9ed; border:1px solid #efdfba; border-radius:4px; font-size:12px; line-height:1.65; }
.closed-time { font-size:12px; color:#6b788b; }
.result.abandoned { background:#fffaf2; border-color:#ecdfc5; }
.submit-line { justify-content: flex-end; gap: 8px; }
.error { margin: 0 auto 0 0; color: #ad4438; font-size: 12px; }
.result { background: #f3f9f6; border-color: #d4e6db; }
.result p { margin: 6px 0 0; }
.history h3 span { border-radius: 9px; background: #eff2f6; padding: 1px 6px; color: #66778c; font-size: 11px; font-weight: 500; }
.history ol { padding: 2px 0 0 10px; margin: 12px 0 0 4px; list-style: none; }
.history li { position: relative; padding: 0 0 15px 13px; border-left: 1px solid #dce4ec; }
.history li::before { content: ''; position: absolute; top: 4px; left: -4px; width: 7px; height: 7px; border-radius: 50%; background: #aab9c9; }
.history li:first-child::before { background: #3982d6; }
.history li:last-child { border-color: transparent; }
.log-line { gap: 8px; flex-wrap: wrap; }
.log-line strong { font-size: 13px; font-weight: 600; }
.log-line time { margin-left: auto; }
.history p { color: #536377; margin: 5px 0 0; }
@media (max-width:900px) { .detail-workspace { display:flex; flex-direction:column; overflow:auto; } .record-pane,.handling-pane { overflow:visible; flex:none; padding:0; } .handling-pane { border-left:0; border-top:1px solid #e5eaf0; padding-top:16px; } .facts { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 540px) { .facts { grid-template-columns: 1fr; } }
</style>
