<script setup lang="ts">
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, ref } from 'vue'
import { Calendar, Tickets, User } from '@element-plus/icons-vue'
import { ElButton, ElDatePicker, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import { actors, createTicket, currentActor, ticketPriorities, type Ticket, type TicketChecklistDraft, type TicketPriority, type TicketSource } from './会话'
import { removeFiles, storeFiles, type PendingFile } from './附件存储'
import AttachmentEditor from './附件编辑.vue'
import SourceSummary from './工单来源摘要.vue'
import ChecklistInput from './待办清单输入.vue'

const SourcePicker = defineAsyncComponent(() => import('./工单来源选择.vue'))
const props = defineProps<{ source?: TicketSource; manual?: boolean }>()
const emit = defineEmits<{ created: [ticket: Ticket]; close: [] }>()
const picker = ref<{ resolve: () => TicketSource | undefined | false }>()
const chosenSource = ref<TicketSource>()
const context = computed(() => props.source || chosenSource.value)
const title = computed(() => props.manual ? '新建工单' : '创建工单')
const draft = reactive({ title: '', description: '', owner: currentActor.value, priority: '普通' as TicketPriority, nextAt: '', dueAt: '' })
const names = { message: '跟进买家咨询', review: '核查评价中提到的问题', cancel: '核实取消申请的发货进展', return: '核实退件实收数量', dispute: '补齐纠纷处理凭证' }
const titleHint = computed(() => '例如：' + (context.value ? names[context.value.kind] : '整理晚班交接事项'))
const files = ref<PendingFile[]>([])
const checklist = ref<TicketChecklistDraft[]>([])
const saving = ref(false)
const error = ref('')
const titleInput = ref<InstanceType<typeof ElInput>>()
let active = true
onBeforeUnmount(() => { active = false })

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!draft.title.trim()) {
    error.value = '请填写工单事项'
    titleInput.value?.focus()
    return
  }
  if (props.manual && !picker.value) { error.value = '正在载入工单来源，请稍后提交'; return }
  const source = props.manual ? picker.value?.resolve() : props.source
  if (source === false || (!props.manual && !source)) { error.value = '请选择有效的来源单据'; return }
  const selectedFiles = [...files.value]
  const author = currentActor.value
  let stored = false
  saving.value = true
  try {
    if (selectedFiles.length) {
      await storeFiles(selectedFiles)
      stored = true
    }
    if (!active || author !== currentActor.value) return
    const item = createTicket(source, { ...draft, checklist: checklist.value, nextAt: draft.nextAt || '', dueAt: draft.dueAt || '' }, selectedFiles.map(item => item.attachment))
    if (!item) { error.value = '请核对工单事项和负责人'; return }
    stored = false
    ElMessage.success('工单 ' + item.id + ' 已创建')
    emit('created', item)
  } catch {
    error.value = '工单保存失败，请检查浏览器存储后重试。已填写的内容和附件已保留。'
  } finally {
    if (stored) {
      try { await removeFiles(selectedFiles) } catch { /* Retry uses the same attachment identifiers. */ }
    }
    saving.value = false
  }
}
const buyerPageActive = useBuyerPageActive()
</script>
<template>
  <ElDialog :model-value="buyerPageActive" :title="title" class="ticket-create-dialog" width="min(1040px, calc(100vw - 24px))"
    append-to-body align-center :show-close="!saving" :close-on-click-modal="false" :close-on-press-escape="!saving"
    @update:model-value="value => { if (buyerPageActive && !value && !saving) emit('close') }">
    <template #header="{ titleId, titleClass }">
      <div class="create-header"><span class="heading-icon"><ElIcon><Tickets /></ElIcon></span><h2 :id="titleId" :class="titleClass">{{ title }}</h2></div>
    </template>
    <ElForm class="create-form" label-position="top" :disabled="saving" @submit.prevent="submit">
      <div v-if="manual" class="source-picker"><SourcePicker ref="picker" @select="value => { chosenSource = value; error = '' }" /></div>
      <div v-if="context" class="source-wrap"><SourceSummary :source="context" /></div>
      <div class="create-columns">
        <section class="task-panel" aria-labelledby="ticket-task-section">
          <h3 id="ticket-task-section">事项内容</h3>
          <ElFormItem label="工单事项" required>
            <ElInput ref="titleInput" v-model="draft.title" aria-label="工单事项" maxlength="100" :placeholder="titleHint" @input="error = ''" />
          </ElFormItem>
          <ElFormItem label="事项说明" class="description-field">
            <AttachmentEditor v-model="files" input-label="选择建单附件" :disabled="saving" @change="error = ''">
              <ElInput v-model="draft.description" aria-label="事项说明" type="textarea" :rows="6" maxlength="2000" show-word-limit resize="vertical"
                placeholder="写明需要核查的问题，以及希望对方交回的结果。可直接粘贴截图。" />
              <ChecklistInput v-model="checklist" :disabled="saving" />
            </AttachmentEditor>
          </ElFormItem>
        </section>
        <section class="assignment-panel" aria-labelledby="ticket-assignment-section">
          <h3 id="ticket-assignment-section">办理安排</h3>
          <ElFormItem label="负责人" required>
            <ElSelect v-model="draft.owner" aria-label="负责人"><template #prefix><ElIcon><User /></ElIcon></template>
              <ElOption v-for="person in actors" :key="person" :label="person === currentActor ? person + '（我）' : person" :value="person" />
            </ElSelect>
          </ElFormItem>
          <fieldset class="priority-field"><legend>优先级</legend><div class="priorities">
            <label v-for="(level, index) in ticketPriorities" :key="level" class="priority-choice" :class="['level-' + index, { chosen: draft.priority === level }]">
              <input v-model="draft.priority" name="ticket-priority" type="radio" :value="level" :disabled="saving" /><i aria-hidden="true"></i>{{ level }}
            </label>
          </div></fieldset>
          <div class="schedule-fields">
            <ElFormItem label="下次跟进时间"><ElDatePicker v-model="draft.nextAt" type="datetime" value-format="YYYY-MM-DD HH:mm" format="YYYY-MM-DD HH:mm" placeholder="选择跟进时间" aria-label="下次跟进时间" :prefix-icon="Calendar" /></ElFormItem>
            <ElFormItem label="完成期限"><ElDatePicker v-model="draft.dueAt" type="datetime" value-format="YYYY-MM-DD HH:mm" format="YYYY-MM-DD HH:mm" placeholder="选择完成期限" aria-label="完成期限" :prefix-icon="Calendar" /></ElFormItem>
          </div>
        </section>
      </div>
    </ElForm>
    <template #footer>
      <div class="create-footer"><span v-if="!error" class="creator"><ElIcon><User /></ElIcon>发起人<span>{{ currentActor }}</span></span>
        <p v-else class="ticket-error" role="alert">{{ error }}</p>
        <div class="footer-actions"><ElButton :disabled="saving" @click="emit('close')">取消</ElButton><ElButton type="primary" :loading="saving" @click="submit">创建</ElButton></div>
      </div>
    </template>
  </ElDialog>
</template>
<style scoped>
:global(.el-dialog.ticket-create-dialog) { box-sizing:border-box; padding:0; border-radius:10px; overflow:hidden; margin:auto; display:flex; flex-direction:column; max-height:calc(100dvh - 40px); }
:global(.ticket-create-dialog .el-dialog__header) { padding:16px 22px; margin:0; border-bottom:1px solid #e7ebf0; flex:none; }
:global(.ticket-create-dialog .el-dialog__headerbtn) { right:10px; top:8px; }
:global(.ticket-create-dialog > .el-dialog__body) { padding:0; min-height:0; overflow:auto; overscroll-behavior:contain; }
:global(.ticket-create-dialog > .el-dialog__footer) { padding:0; flex:none; }
.create-header,.create-footer,.creator,.footer-actions,.priority-choice { display:flex; align-items:center; }
.create-header { gap:10px; }
.heading-icon { display:grid; place-items:center; width:32px; height:32px; border-radius:7px; font-size:19px; color:#2468b3; background:#eaf3ff; }
.create-header h2 { margin:0; color:var(--yy-text-heading); font-size:19px; font-weight:650; line-height:1.4; }
.create-form { padding:18px 22px; }
.source-wrap,.source-picker { margin-bottom:16px; }
.source-picker { display:grid; grid-template-columns:minmax(155px,1fr) minmax(0,2fr); gap:12px; }
.source-picker :deep(.el-form-item) { margin:0; }
.create-columns { display:grid; grid-template-columns:minmax(0,1.72fr) minmax(265px,1fr); border:1px solid #dee5ed; border-radius:7px; overflow:hidden; }
.task-panel,.assignment-panel { padding:16px 18px 18px; min-width:0; }
.assignment-panel { background:#f7f9fc; border-left:1px solid #dee5ed; }
h3 { color:var(--yy-text-heading); font-size:14px; font-weight:650; margin:0 0 14px; }
.create-form :deep(.el-form-item) { margin-bottom:14px; }
.create-form :deep(.el-form-item__label),.priority-field legend { padding:0; margin-bottom:5px; color:#414d5e; font-size:12px; font-weight:500; line-height:18px; }
.create-form :deep(.el-input__wrapper),.create-form :deep(.el-select__wrapper) { min-height:34px; }
.create-form :deep(.el-textarea__inner) { line-height:1.65; padding:9px 11px 18px; min-height:112px !important; }
.create-form :deep(.el-select),.create-form :deep(.el-date-editor.el-input) { width:100%; }
.create-form .description-field,.create-form .schedule-fields :deep(.el-form-item:last-child),.create-form .source-picker :deep(.el-form-item) { margin-bottom:0; }
.description-field :deep(.progress-editor) { gap:0; overflow:hidden; background:#fff; border:1px solid #d7dfe9; border-radius:5px; }
.description-field :deep(.progress-editor:focus-within) { border-color:var(--el-color-primary); }
.description-field :deep(.el-textarea__inner) { box-shadow:none; }
.description-field :deep(.attachment-toolbar) { padding:5px 8px; border-top:1px solid #e7ecf2; background:#f8fafc; line-height:1.5; }
.description-field :deep(.attachment-toolbar .el-button) { color:#356694; border-color:transparent; background:transparent; }
.description-field :deep(.attachment-toolbar .el-button:hover) { background:#e9f1fa; }
.description-field :deep(.pending-files) { box-sizing:border-box; padding:8px; }
.description-field :deep(.ticket-file) { line-height:1.45; }
.priority-field { margin:0 0 14px; border:0; padding:0; min-width:0; }
.priorities { display:flex; gap:5px; }
.priority-choice { position:relative; justify-content:center; flex:1; gap:6px; height:30px; background:#fff; border:1px solid #d9dfe7; border-radius:4px; font-size:12px; cursor:pointer; color:#566276; }
.priority-choice input { position:absolute; opacity:0; }
.priority-choice i { width:6px; height:6px; border-radius:50%; background:#8b9aae; }
.priority-choice.level-1 i { background:#bd8228; }.priority-choice.level-2 i { background:#c9504b; }
.priority-choice.chosen { color:#225c9d; border-color:#71a8df; background:#edf5ff; }
.priority-choice.level-1.chosen { color:#8c5714; border-color:#dca75d; background:#fff6e8; }
.priority-choice.level-2.chosen { color:#a23f3a; border-color:#df9894; background:#fff0ee; }
.priority-choice:has(input:focus-visible) { outline:2px solid var(--el-color-primary); outline-offset:1px; }
.create-footer { gap:12px; justify-content:space-between; padding:12px 22px; border-top:1px solid #e4e9ef; background:#fff; }
.creator { font-size:12px; gap:6px; color:#768395; }.creator span { color:#475569; }
.footer-actions { flex:none; }.footer-actions .el-button { min-width:68px; }
.ticket-error { margin:0; text-align:left; color:var(--el-color-danger); font-size:12px; }
@media (max-width: 900px) {
  .create-columns { grid-template-columns:1fr; }
  .assignment-panel { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:16px; border-left:0; border-top:1px solid #dee5ed; }
  .assignment-panel h3,.schedule-fields { grid-column:1/-1; }
  .schedule-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .schedule-fields :deep(.el-form-item) { margin-bottom:0; }
}
@media (max-width: 600px) {
  .create-form { padding:12px; }
  .task-panel,.assignment-panel { padding:14px; }
  .source-picker,.assignment-panel { grid-template-columns:1fr; }
  .schedule-fields { gap:10px; }
}
@media (max-width: 440px) {
  .schedule-fields { grid-template-columns:1fr; }
}
</style>
